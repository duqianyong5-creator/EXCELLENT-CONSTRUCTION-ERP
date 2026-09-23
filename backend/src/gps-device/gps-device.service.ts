import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GpsDevice } from './gps-device.entity';
import { Task, TaskStatus } from '../tasks/task.entity';
import { GpsService } from '../gps/gps.service';
import { RucService } from '../ruc/ruc.service';
import { DeviceAlarmService } from './device-alarm.service';
import { haversineKm } from '../gps/geo.util';
import { normalizeDeviceNo, Position } from './jt808.codec';
import { ErrorCode } from '../common/i18n/messages';
import { normalizePlate } from './plate.util';

// 老的 import 路径继续可用（这个函数原本就定义在这里）
export { normalizePlate };

export type IngestResult = 'unknown' | 'disabled' | 'no_fix' | 'no_task' | 'stored';

interface TaskTarget { taskId: string; driverId: string }

const DEVICE_CACHE_MS = 30_000;
const TASK_CACHE_MS = 15_000;
const MAX_DEVICE_CACHE_ENTRIES = 1000; // 设备号来自报文、可被伪造，缓存必须有上限
/** 终端时钟明显不对（未同步）时，用服务器时间入库 */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
/** 盲区补报允许是几天前的点；实时上报只允许几分钟的偏差，
 *  否则设备时钟/时区配错时点会落在在线窗口之外，车在跑却永远不出现在地图上。 */
const MAX_PAST_SKEW_BATCH_MS = 7 * 24 * 3600 * 1000;
const MAX_PAST_SKEW_LIVE_MS = 5 * 60 * 1000;


function numberOrNull(v: unknown): number | null {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
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
    private ruc: RucService,
    private alarms: DeviceAlarmService,
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
    if (plate.length > 32) throw new BadRequestException(ErrorCode.DEVICE_PLATE_TOO_LONG);
    return plate;
  }

  private cleanName(value: string | undefined | null): string | null {
    const name = String(value ?? '').trim();
    if (!name) return null;
    if (name.length > 128) throw new BadRequestException(ErrorCode.DEVICE_NAME_TOO_LONG);
    return name;
  }

  async create(dto: { deviceNo: string; vehiclePlate?: string; name?: string; enabled?: boolean }): Promise<GpsDevice> {
    const deviceNo = normalizeDeviceNo(dto.deviceNo);
    // 机身标签上常同时印 15 位 IMEI 和 11 位设备号，填错了在这里直接说清楚
    if (/^\d{15}$/.test(deviceNo)) {
      throw new BadRequestException('这是 15 位 IMEI，请填设备号（11 位）/ That is an IMEI, enter the 11-digit device number');
    }
    if (!/^\d{5,20}$/.test(deviceNo)) throw new BadRequestException(ErrorCode.DEVICE_NO_INVALID);
    const exists = await this.repo.findOne({ where: { deviceNo } });
    if (exists) throw new BadRequestException(ErrorCode.DEVICE_NO_EXISTS);
    const device = this.repo.create({
      deviceNo,
      vehiclePlate: this.cleanPlate(dto.vehiclePlate),
      name: this.cleanName(dto.name),
      enabled: dto.enabled === undefined ? true : !!dto.enabled,
    });
    const saved = await this.repo.save(device);
    this.invalidate(deviceNo);
    return saved;
  }

  async update(id: string, dto: { vehiclePlate?: string; name?: string; enabled?: boolean }): Promise<GpsDevice> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException(ErrorCode.DEVICE_NOT_FOUND);
    if (dto.vehiclePlate !== undefined) device.vehiclePlate = this.cleanPlate(dto.vehiclePlate);
    if (dto.name !== undefined) device.name = this.cleanName(dto.name);
    if (dto.enabled !== undefined) device.enabled = !!dto.enabled;
    const saved = await this.repo.save(device);
    this.invalidate(device.deviceNo);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException(ErrorCode.DEVICE_NOT_FOUND);
    await this.repo.delete(id);
    this.invalidate(device.deviceNo);
  }

  async findById(id: string): Promise<GpsDevice> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException(ErrorCode.DEVICE_NOT_FOUND);
    return device;
  }

  // ---------- 网关侧 ----------

  invalidate(deviceNo: string): void {
    this.deviceCache.delete(normalizeDeviceNo(deviceNo));
    this.taskCache.clear();
    // 车牌改了以后该车要比的围栏就变了，停用/删除同理：内存里的报警与围栏状态必须一起清掉，
    // 否则拿旧状态做边沿判定会把下一次真报警当成「早就在报了」吞掉。
    this.alarms.forget(normalizeDeviceNo(deviceNo));
  }

  async findByDeviceNo(rawNo: string): Promise<GpsDevice | null> {
    const deviceNo = normalizeDeviceNo(rawNo);
    const hit = this.deviceCache.get(deviceNo);
    if (hit && Date.now() - hit.at < DEVICE_CACHE_MS) return hit.device;
    const device = await this.repo.findOne({ where: { deviceNo } });
    // 设备号来自报文，可被任意伪造：缓存必须有上限，否则连上来乱发不同设备号就能把内存撑爆
    if (this.deviceCache.size >= MAX_DEVICE_CACHE_ENTRIES) this.deviceCache.clear();
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
    const matches = tasks.filter((t) => t.driverId && normalizePlate(t.vehiclePlate) === key);
    // 同一车牌同时挂着多个进行中任务：可能是司机输错车牌，也可能是有人蹭别人的车。
    // 猜错会把 A 车的位置画到 B 的任务上（客户还能看到），所以宁可不归属，让它在设备页显示「无进行中任务」。
    if (matches.length > 1) {
      this.logger.warn(`plate ${key} is claimed by ${matches.length} in-progress tasks — not attaching device points`);
    }
    const match = matches.length === 1 ? matches[0] : null;
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
  async ingest(rawNo: string, pos: Position, opts: { batch?: boolean; blindZone?: boolean } = {}): Promise<IngestResult> {
    const device = await this.findByDeviceNo(rawNo);
    if (!device) return 'unknown';
    if (!device.enabled) return 'disabled';

    const now = Date.now();
    // 只有设备自己标了「盲区补报」的批量包才允许是几天前的点；
    // 普通上报一律按实时对待，避免用批量消息绕开时间校验、把点写到过去（会绕过静止报警、把地图钉死）
    const maxPast = opts.batch && opts.blindZone ? MAX_PAST_SKEW_BATCH_MS : MAX_PAST_SKEW_LIVE_MS;
    let pointTime = pos.time;
    if (!(pointTime instanceof Date) || Number.isNaN(pointTime.getTime())
      || pointTime.getTime() - now > MAX_FUTURE_SKEW_MS
      || now - pointTime.getTime() > maxPast) {
      const offBy = pointTime instanceof Date && !Number.isNaN(pointTime.getTime())
        ? Math.round((now - pointTime.getTime()) / 60000)
        : null;
      // 时钟/时区配错是最难查的故障之一：点会静默地落在在线窗口外，看起来就是"设备没上报"
      this.logger.warn(
        `${device.deviceNo} clock off by ${offBy ?? '?'} min (JT808_DEVICE_TZ_OFFSET_HOURS or device timezone), using server time`,
      );
      pointTime = new Date(now);
    }
    const hasFix = pos.fixed && !(pos.latitude === 0 && pos.longitude === 0)
      && Math.abs(pos.latitude) <= 90 && Math.abs(pos.longitude) <= 180;

    const patch: Partial<GpsDevice> = { lastSeenAt: new Date(now) };
    if (pos.extras.batteryPercent !== undefined) patch.batteryPercent = pos.extras.batteryPercent;
    if (pos.extras.externalPower !== undefined) patch.externalPower = pos.extras.externalPower;
    if (pos.extras.signalPercent !== undefined) patch.signalPercent = pos.extras.signalPercent;
    if (hasFix) {
      // 累计车辆里程（RUC 路税按里程买，提醒全靠这条数据）。
      // 优先用定位器自己的里程计，没有就用与上一个点的直线距离兜底。
      if (device.vehiclePlate) {
        const deviceOdoKm = pos.extras.mileageKm;
        const previousLat = numberOrNull(device.lastLatitude);
        const previousLng = numberOrNull(device.lastLongitude);
        const gpsKm = deviceOdoKm == null && previousLat != null && previousLng != null
          ? haversineKm(previousLat, previousLng, pos.latitude, pos.longitude)
          : undefined;
        try {
          await this.ruc.addDistance(device.vehiclePlate, { deviceOdoKm, gpsKm });
        } catch (e: any) {
          // 里程累计失败不能影响定位入库
          this.logger.warn(`mileage update for ${device.vehiclePlate} failed: ${e?.message || e}`);
        }
      }

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
        patch.lastTaskId = null; // 任务结束后别一直指着旧任务
      } else {
        await this.gpsService.upload(target.driverId, target.taskId, {
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: pos.speedKmh,
          heading: pos.heading,
          timestamp: pointTime,
          source: 'device',
          silent: !!opts.batch, // 盲区补报不实时广播
        });
        patch.lastTaskId = target.taskId;
        result = 'stored';
      }
    }

    // 报警判定（震动/断电/电子围栏）。
    // 只看实时上报：盲区补报是一次性倒出来的几百个历史点，拿它们做「状态变化」判定会把
    // 早就过去的报警重放一遍，还会让围栏进出在同一毫秒里反复触发。设备若仍在报警，
    // 紧随其后的实时 0x0200 会把标志再带上来，不会漏。
    // handle() 自己吞掉所有异常：这条路径跑在 TCP 网关上，抛出去会连 HTTP API 一起带走。
    if (!opts.batch) {
      await this.alarms.handle(device, pos, { hasFix, target, pointTime });
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
