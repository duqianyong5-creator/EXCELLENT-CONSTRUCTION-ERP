import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GpsAnomaly, AnomalyType } from '../gps/gps-anomaly.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { GeofenceService, isInsideGeofence } from './geofence.service';
import { Geofence } from './geofence.entity';
import type { GpsDevice } from './gps-device.entity';
import type { AlarmKind, Position } from './jt808.codec';

/** 定位器报警 -> 异常类型。只有 owner 点名要的两类会落库报警。 */
const ALARM_TO_ANOMALY: Partial<Record<AlarmKind, AnomalyType>> = {
  shock: AnomalyType.SHOCK,
  power_cut: AnomalyType.POWER_CUT,
};

/** 中文说明，落在异常记录和通知里 */
const ALARM_LABEL: Record<string, string> = {
  [AnomalyType.SHOCK]: '震动报警',
  [AnomalyType.POWER_CUT]: '断电报警（主电源掉电 / 防拆）',
  [AnomalyType.GEOFENCE_ENTER]: '驶入电子围栏',
  [AnomalyType.GEOFENCE_LEAVE]: '驶离电子围栏',
};

/** 设备侧持续型报警：置位后一直保持，撤销时自动结案 */
const LEVEL_ALARMS: AnomalyType[] = [AnomalyType.SHOCK, AnomalyType.POWER_CUT];

/**
 * 同一台车同一个围栏，两次进出事件之间的最小间隔。
 * 迟滞已经挡掉了原地漂移，这一条是兜底：真沿着边界开的车（比如绕场一周）也不该每个点报一次。
 */
const GEOFENCE_MIN_EVENT_MS = 60_000;

/** 内存状态上限。设备号虽然来自已登记设备、数量有限，但不设上限就是一个慢性泄漏。 */
const MAX_TRACKED_DEVICES = 1000;

export interface AlarmTarget {
  taskId: string;
  driverId: string;
}

/**
 * 车载定位器报警：震动 / 断电 / 电子围栏。
 *
 * 去重是这个服务存在的主要理由。终端把「还在报警」这件事写在每一条定位里，
 * 实时模式 10 秒一个点 = 一分钟 6 条通知；所以这里按**状态变化**触发，
 * 而不是按报文触发：一台设备一类报警在结案之前只有一条未处理记录、只通知一次。
 *
 * 记录与通知的写法沿用 gps.service.ts / gps-alarm.service.ts 那一套（gps_anomalies + notifyAdmins），
 * 没有另起一套机制。
 */
@Injectable()
export class DeviceAlarmService {
  private readonly logger = new Logger('DeviceAlarm');

  /** deviceNo -> 上一次见到的持续型报警集合（边沿触发） */
  private active = new Map<string, Set<AnomalyType>>();
  /** deviceNo -> (fenceId -> 上一次在不在圈内)。undefined = 还没见过，第一帧只记录不报警 */
  private inside = new Map<string, Map<string, boolean>>();
  /** `deviceNo|fenceId` -> 上次进出事件时间 */
  private lastFenceEventAt = new Map<string, number>();

  constructor(
    @InjectRepository(GpsAnomaly) private anomalyRepo: Repository<GpsAnomaly>,
    private geofences: GeofenceService,
    private notifService: NotificationsService,
  ) {}

  /** 设备下线/删除时清掉内存状态，避免下次上线拿着过期的「已在报警」把首次报警吞掉 */
  forget(deviceNo: string): void {
    this.active.delete(deviceNo);
    this.inside.delete(deviceNo);
    for (const key of [...this.lastFenceEventAt.keys()]) {
      if (key.startsWith(`${deviceNo}|`)) this.lastFenceEventAt.delete(key);
    }
  }

  /**
   * 处理一条定位带来的报警。
   *
   * **这个方法绝不抛错**：它跑在 TCP 网关线程上，和 HTTP API 共用一个进程，
   * 一次未捕获的 throw 会把整个后端带走。报警写不进去是可以忍的，API 挂掉不行。
   */
  async handle(
    device: GpsDevice,
    pos: Position,
    opts: { hasFix: boolean; target: AlarmTarget | null; pointTime: Date },
  ): Promise<void> {
    try {
      await this.evaluate(device, pos, opts);
    } catch (e: any) {
      this.logger.warn(`alarm handling failed for ${device.deviceNo}: ${e?.message || e}`);
    }
  }

  private async evaluate(
    device: GpsDevice,
    pos: Position,
    opts: { hasFix: boolean; target: AlarmTarget | null; pointTime: Date },
  ): Promise<void> {
    const kinds: AlarmKind[] = Array.isArray(pos.alarms) ? pos.alarms : [];
    this.logUnhandled(device, kinds);
    await this.syncLevelAlarms(device, kinds, pos, opts);
    if (opts.hasFix) await this.checkGeofences(device, pos, opts);
  }

  /**
   * 其余报警位（SOS、超速、低电、非法位移…）暂时不落库，但至少要在日志里留痕：
   * 这次修的就是「解出来了却没人看」，不能再悄悄丢一批。
   */
  private logUnhandled(device: GpsDevice, kinds: AlarmKind[]): void {
    const others = kinds.filter((k) => !ALARM_TO_ANOMALY[k]);
    if (others.length) {
      this.logger.warn(`device ${device.deviceNo} reports unhandled alarm(s): ${others.join(', ')}`);
    }
  }

  /** 震动 / 断电：按状态变化开案与结案 */
  private async syncLevelAlarms(
    device: GpsDevice,
    kinds: AlarmKind[],
    pos: Position,
    opts: { target: AlarmTarget | null; pointTime: Date },
  ): Promise<void> {
    const now = new Set<AnomalyType>();
    for (const kind of kinds) {
      const type = ALARM_TO_ANOMALY[kind];
      if (type) now.add(type);
    }

    const before = this.active.get(device.deviceNo);
    for (const type of LEVEL_ALARMS) {
      const isActive = now.has(type);
      const wasActive = !!before?.has(type);
      if (isActive && !wasActive) {
        await this.raise(device, type, pos, opts, { dedupe: true, description: this.describe(device, type, pos) });
      } else if (!isActive && wasActive) {
        await this.resolveOpen(device, type);
      }
    }

    if (now.size === 0) {
      this.active.delete(device.deviceNo);
    } else {
      if (this.active.size >= MAX_TRACKED_DEVICES && !this.active.has(device.deviceNo)) this.active.clear();
      this.active.set(device.deviceNo, now);
    }
  }

  /** 围栏进出：平台侧判定，边沿触发 */
  private async checkGeofences(
    device: GpsDevice,
    pos: Position,
    opts: { target: AlarmTarget | null; pointTime: Date },
  ): Promise<void> {
    const fences = await this.geofences.fencesFor(device.vehiclePlate);
    if (fences.length === 0) {
      this.inside.delete(device.deviceNo);
      return;
    }

    if (this.inside.size >= MAX_TRACKED_DEVICES && !this.inside.has(device.deviceNo)) this.inside.clear();
    let state = this.inside.get(device.deviceNo);
    if (!state) { state = new Map<string, boolean>(); this.inside.set(device.deviceNo, state); }

    const liveIds = new Set(fences.map((f) => f.id));
    for (const id of [...state.keys()]) if (!liveIds.has(id)) state.delete(id);

    for (const fence of fences) {
      const was = state.get(fence.id);
      const nowInside = isInsideGeofence(fence, pos.latitude, pos.longitude, was ?? false);

      // 第一次见到这个「设备 × 围栏」组合：只记状态。
      // 否则每次重启、每次新建围栏，停在场内的车都会被当成「刚刚驶入」报一遍。
      if (was === undefined) { state.set(fence.id, nowInside); continue; }
      if (was === nowInside) continue;

      const type = nowInside ? AnomalyType.GEOFENCE_ENTER : AnomalyType.GEOFENCE_LEAVE;
      // 这个方向不报警时状态照样要翻，否则下一次真正要报的那个方向会判断成「没变化」
      if (nowInside ? !fence.alertOnEnter : !fence.alertOnLeave) { state.set(fence.id, nowInside); continue; }

      const key = `${device.deviceNo}|${fence.id}`;
      if (Date.now() - (this.lastFenceEventAt.get(key) ?? 0) < GEOFENCE_MIN_EVENT_MS) {
        // 间隔太近：**不翻状态**就跳过。翻了的话这次穿越就永远丢了（下一帧会被当成「没变化」）。
        // 抖动会自己回到原状态、什么都不报；真的穿越则在间隔过去后的下一帧补报出来。
        continue;
      }
      state.set(fence.id, nowInside);
      this.lastFenceEventAt.set(key, Date.now());

      // 进出是「事件」不是「状态」：不做未结案去重，否则进了 A 围栏就再也报不出 B 围栏。
      // 防重复靠的是边沿触发 + 迟滞 + 上面的最小间隔。
      await this.raise(device, type, pos, opts, {
        dedupe: false,
        description: this.describeFence(device, type, fence),
        geofenceId: fence.id,
      });
    }
  }

  private async raise(
    device: GpsDevice,
    type: AnomalyType,
    pos: Position,
    opts: { target: AlarmTarget | null; pointTime: Date },
    extra: { dedupe: boolean; description: string; geofenceId?: string },
  ): Promise<void> {
    if (extra.dedupe) {
      // 进程重启后内存状态是空的，会把「一直在报警」当成刚发生。
      // 数据库才是去重的准绳：已经有未结案的同类记录就什么都不做，不再通知一次。
      const open = await this.anomalyRepo.findOne({
        where: { deviceNo: device.deviceNo, anomalyType: type, resolved: false },
        order: { detectedAt: 'DESC' },
      });
      if (open) return;
    }

    const row = this.anomalyRepo.create({
      driverId: opts.target?.driverId ?? null,
      taskId: opts.target?.taskId ?? null,
      anomalyType: type,
      description: extra.description,
      latitude: Number.isFinite(pos.latitude) ? pos.latitude : null,
      longitude: Number.isFinite(pos.longitude) ? pos.longitude : null,
      speed: Number.isFinite(pos.speedKmh) ? pos.speedKmh : null,
      deviceNo: device.deviceNo,
      vehiclePlate: device.vehiclePlate ?? null,
      geofenceId: extra.geofenceId ?? null,
      alarmCount: 1,
    } as any);

    let anomalyId: string | null = null;
    try {
      const saved = await this.anomalyRepo.save(row);
      anomalyId = (saved as any)?.id ?? null;
    } catch (e: any) {
      // 记录写不进去也要把通知发出去：报警本身比归档更要紧
      this.logger.error(`failed to record ${type} for ${device.deviceNo}: ${e?.message || e}`);
    }

    const who = device.vehiclePlate || device.name || device.deviceNo;
    await this.notifService.create(null, {
      title: `🚨 ${ALARM_LABEL[type] ?? type}`,
      content: extra.description,
      type: `gps_${type}`,
      meta: {
        sound: true,
        anomalyId,
        deviceNo: device.deviceNo,
        vehiclePlate: device.vehiclePlate ?? null,
        geofenceId: extra.geofenceId ?? null,
        driverId: opts.target?.driverId ?? null,
        taskId: opts.target?.taskId ?? null,
        latitude: pos.latitude,
        longitude: pos.longitude,
      },
      notifyAdmins: true,
    });
    this.logger.warn(`${type} raised for ${who} (device ${device.deviceNo})`);
  }

  /** 报警条件解除：把未结案的那条自动结掉，下次再触发才算新报警 */
  private async resolveOpen(device: GpsDevice, type: AnomalyType): Promise<void> {
    const open = await this.anomalyRepo.findOne({
      where: { deviceNo: device.deviceNo, anomalyType: type, resolved: false },
      order: { detectedAt: 'DESC' },
    });
    if (!open) return;
    await this.anomalyRepo.update(open.id, { resolved: true, resolvedAt: new Date() });
    this.logger.log(`${type} cleared for device ${device.deviceNo}`);
  }

  private describe(device: GpsDevice, type: AnomalyType, pos: Position): string {
    const who = device.vehiclePlate || device.name || device.deviceNo;
    if (type === AnomalyType.POWER_CUT) {
      const volt = pos.extras.voltage != null ? `，外电 ${pos.extras.voltage.toFixed(2)}V` : '';
      return `${who} 定位器主电源被切断（防拆报警）${volt}`;
    }
    if (type === AnomalyType.SHOCK) {
      const armed = pos.extras.alarmExtState?.armed ? '设防状态下' : '';
      return `${who} 定位器检测到${armed}震动`;
    }
    return `${who} ${ALARM_LABEL[type] ?? type}`;
  }

  private describeFence(device: GpsDevice, type: AnomalyType, fence: Geofence): string {
    const who = device.vehiclePlate || device.name || device.deviceNo;
    const verb = type === AnomalyType.GEOFENCE_ENTER ? '驶入' : '驶离';
    return `${who} ${verb}围栏「${fence.name}」（半径 ${fence.radiusM} 米）`;
  }
}
