import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GpsDevice } from './gps-device.entity';
import { Task, TaskStatus } from '../tasks/task.entity';
import { GpsService } from '../gps/gps.service';
import { normalizeDeviceNo, Position } from './jt808.codec';

export type IngestResult = 'unknown' | 'disabled' | 'no_fix' | 'no_task' | 'stored';

interface TaskTarget { taskId: string; driverId: string }

const DEVICE_CACHE_MS = 30_000;
const TASK_CACHE_MS = 15_000;
/** 终端时钟明显不对（未同步）时，用服务器时间入库 */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_PAST_SKEW_MS = 7 * 24 * 3600 * 1000;

/** 车牌归一化：大写、去空格/连字符/中点，便于设备登记的车牌与司机接单时输入的车牌匹配 */
export function normalizePlate(plate: string | null | undefined): string {
  return String(plate ?? '').toUpperCase().replace(/[\s\-·•.]/g, '');
}

@Injectable()
export class GpsDeviceService {
  private readonly logger = new Logger('GpsDevice');
  private deviceCache = new Map<string, { device: GpsDevice | null; at: number }>();
  private taskCache = new Map<string, { target: TaskTarget | null; at: number }>();

  constructor(
    @InjectRepository(GpsDevice) private repo: Repository<GpsDevice>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    private gpsService: GpsService,
  ) {}

  // ---------- 管理 CRUD ----------

  list(): Promise<GpsDevice[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  /**
   * 设备列表 + 每台设备当前挂在哪个进行中任务上。
   * 车牌打错时表现为「设备在线、却没有任务」，调度看一眼就知道要核对车牌。
   */
  async listWithTasks(): Promise<Array<GpsDevice & { currentTask: { id: string; title: string; driverName: string } | null }>> {
    const [devices, tasks] = await Promise.all([
      this.list(),
      this.taskRepo.find({ where: { status: TaskStatus.IN_PROGRESS }, relations: ['driver'], order: { updatedAt: 'DESC' } }),
    ]);
    const byPlate = new Map<string, Task>();
    for (const t of tasks) {
      const key = normalizePlate(t.vehiclePlate);
      if (key && t.driverId && !byPlate.has(key)) byPlate.set(key, t);
    }
    return devices.map((d) => {
      const task = byPlate.get(normalizePlate(d.vehiclePlate));
      return Object.assign({}, d, {
        currentTask: task
          ? { id: task.id, title: task.title, driverName: task.driver?.fullName || task.driver?.username || '司机' }
          : null,
      });
    });
  }

  /** 司机端车牌快选：已启用且绑定了车牌的设备 */
  async plates(): Promise<Array<{ plate: string; name: string | null }>> {
    const devices = await this.repo.find({ where: { enabled: true }, order: { createdAt: 'ASC' } });
    const seen = new Set<string>();
    const out: Array<{ plate: string; name: string | null }> = [];
    for (const d of devices) {
      const plate = (d.vehiclePlate || '').trim();
      if (!plate) continue;
      const key = normalizePlate(plate);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ plate, name: d.name || null });
    }
    return out;
  }

  private cleanPlate(value: string | undefined | null): string | null {
    const plate = String(value ?? '').trim();
    if (!plate) return null;
    if (plate.length > 32) throw new BadRequestException('车牌过长 / Plate too long (max 32)');
    return plate;
  }

  private cleanName(value: string | undefined | null): string | null {
    const name = String(value ?? '').trim();
    if (!name) return null;
    if (name.length > 128) throw new BadRequestException('名称过长 / Name too long (max 128)');
    return name;
  }

  async create(dto: { deviceNo: string; vehiclePlate?: string; name?: string; enabled?: boolean }): Promise<GpsDevice> {
    const deviceNo = normalizeDeviceNo(dto.deviceNo);
    // 机身标签上常同时印 15 位 IMEI 和 11 位设备号，填错了在这里直接说清楚
    if (/^\d{15}$/.test(deviceNo)) {
      throw new BadRequestException('这是 15 位 IMEI，请填设备号（11 位）/ That is an IMEI, enter the 11-digit device number');
    }
    if (!/^\d{5,20}$/.test(deviceNo)) throw new BadRequestException('设备号须为 5~20 位数字 / Device number must be 5-20 digits');
    const exists = await this.repo.findOne({ where: { deviceNo } });
    if (exists) throw new BadRequestException('该设备号已登记 / Device number already registered');
    const device = this.repo.create({
      deviceNo,
      vehiclePlate: this.cleanPlate(dto.vehiclePlate),
      name: this.cleanName(dto.name),
      enabled: dto.enabled ?? true,
    });
    const saved = await this.repo.save(device);
    this.invalidate(deviceNo);
    return saved;
  }

  async update(id: string, dto: { vehiclePlate?: string; name?: string; enabled?: boolean }): Promise<GpsDevice> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('设备不存在 / Device not found');
    if (dto.vehiclePlate !== undefined) device.vehiclePlate = this.cleanPlate(dto.vehiclePlate);
    if (dto.name !== undefined) device.name = this.cleanName(dto.name);
    if (dto.enabled !== undefined) device.enabled = !!dto.enabled;
    const saved = await this.repo.save(device);
    this.invalidate(device.deviceNo);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('设备不存在 / Device not found');
    await this.repo.delete(id);
    this.invalidate(device.deviceNo);
  }

  async findById(id: string): Promise<GpsDevice> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('设备不存在 / Device not found');
    return device;
  }

  // ---------- 网关侧 ----------

  invalidate(deviceNo: string): void {
    this.deviceCache.delete(normalizeDeviceNo(deviceNo));
    this.taskCache.clear();
  }

  async findByDeviceNo(rawNo: string): Promise<GpsDevice | null> {
    const deviceNo = normalizeDeviceNo(rawNo);
    const hit = this.deviceCache.get(deviceNo);
    if (hit && Date.now() - hit.at < DEVICE_CACHE_MS) return hit.device;
    const device = await this.repo.findOne({ where: { deviceNo } });
    this.deviceCache.set(deviceNo, { device, at: Date.now() });
    return device;
  }

  /** 车牌 -> 进行中任务（同车牌多任务时取最近更新的一条） */
  async resolveTarget(plate: string | null | undefined): Promise<TaskTarget | null> {
    const key = normalizePlate(plate);
    if (!key) return null;
    const hit = this.taskCache.get(key);
    if (hit && Date.now() - hit.at < TASK_CACHE_MS) return hit.target;
    const tasks = await this.taskRepo.find({
      where: { status: TaskStatus.IN_PROGRESS },
      select: ['id', 'driverId', 'vehiclePlate', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
    const match = tasks.find((t) => t.driverId && normalizePlate(t.vehiclePlate) === key);
    const target = match ? { taskId: match.id, driverId: match.driverId } : null;
    this.taskCache.set(key, { target, at: Date.now() });
    return target;
  }

  /** 心跳 / 电量等非定位消息：只刷新在线时间与电量 */
  async touch(rawNo: string, patch: Partial<Pick<GpsDevice, 'batteryPercent' | 'externalPower' | 'signalPercent'>> = {}): Promise<void> {
    const device = await this.findByDeviceNo(rawNo);
    if (!device) return;
    try {
      await this.repo.update(device.id, { lastSeenAt: new Date(), ...patch });
    } catch (e: any) {
      this.logger.warn(`touch ${device.deviceNo} failed: ${e?.message || e}`);
    }
  }

  /** 一条定位：更新设备最后状态；有定位且能匹配到进行中任务时写入 gps_logs（归属该司机/任务） */
  async ingest(rawNo: string, pos: Position, opts: { batch?: boolean } = {}): Promise<IngestResult> {
    const device = await this.findByDeviceNo(rawNo);
    if (!device) return 'unknown';
    if (!device.enabled) return 'disabled';

    const now = Date.now();
    let pointTime = pos.time;
    if (!(pointTime instanceof Date) || Number.isNaN(pointTime.getTime())
      || pointTime.getTime() - now > MAX_FUTURE_SKEW_MS
      || now - pointTime.getTime() > MAX_PAST_SKEW_MS) {
      pointTime = new Date(now);
    }
    const hasFix = pos.fixed && !(pos.latitude === 0 && pos.longitude === 0)
      && Math.abs(pos.latitude) <= 90 && Math.abs(pos.longitude) <= 180;

    const patch: Partial<GpsDevice> = { lastSeenAt: new Date(now) };
    if (pos.extras.batteryPercent !== undefined) patch.batteryPercent = pos.extras.batteryPercent;
    if (pos.extras.externalPower !== undefined) patch.externalPower = pos.extras.externalPower;
    if (pos.extras.signalPercent !== undefined) patch.signalPercent = pos.extras.signalPercent;
    if (hasFix) {
      patch.lastLatitude = pos.latitude;
      patch.lastLongitude = pos.longitude;
      patch.lastSpeed = pos.speedKmh;
      patch.lastFixAt = pointTime;
    }

    let result: IngestResult = 'no_fix';
    let target: TaskTarget | null = null;
    if (hasFix) {
      target = await this.resolveTarget(device.vehiclePlate);
      if (!target) {
        result = 'no_task';
      } else {
        await this.gpsService.upload(target.driverId, target.taskId, {
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: pos.speedKmh,
          heading: pos.heading,
          timestamp: pointTime,
          source: 'device',
        });
        patch.lastTaskId = target.taskId;
        result = 'stored';
      }
    }

    try {
      await this.repo.update(device.id, patch);
    } catch (e: any) {
      this.logger.warn(`update device ${device.deviceNo} failed: ${e?.message || e}`);
    }
    if (!opts.batch) {
      this.logger.debug(`${device.deviceNo} ${result}${target ? ` task=${target.taskId}` : ''} ${pos.latitude},${pos.longitude} ${pos.speedKmh}km/h`);
    }
    return result;
  }
}
