import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RucAlertLevel, RucThresholds, applyDistance, assessRuc } from './ruc.util';

/** 车牌归一化：与 gps-device / 任务侧完全一致，否则三方对不上 */
export function normalizeVehiclePlate(plate: string | null | undefined): string {
  return String(plate ?? '').toUpperCase().replace(/[\s\-·•.]/g, '');
}

/** 日均里程的统计窗口：太短会被单日长途带偏，太长又反应不过来 */
const SNAPSHOT_WINDOW_DAYS = 7;

const LEVEL_RANK: Record<RucAlertLevel, number> = {
  [RucAlertLevel.UNKNOWN]: 0,
  [RucAlertLevel.OK]: 0,
  [RucAlertLevel.WARN]: 1,
  [RucAlertLevel.CRITICAL]: 2,
  [RucAlertLevel.EXCEEDED]: 3,
};

export interface VehicleRucStatus extends Vehicle {
  level: RucAlertLevel;
  remainingKm: number | null;
  avgDailyKm: number;
  projectedDays: number | null;
  projectedExhaustedAt: Date | null;
  /** 距离上次人工校准过去了多少天，用来提示估算可信度 */
  daysSinceCalibration: number | null;
}

@Injectable()
export class RucService {
  private readonly logger = new Logger('RUC');

  constructor(
    @InjectRepository(Vehicle) private repo: Repository<Vehicle>,
    private notifications: NotificationsService,
    private settings: SystemSettingsService,
  ) {}

  // ---------- 车辆档案 ----------

  list(): Promise<Vehicle[]> {
    return this.repo.find({ order: { plate: 'ASC' } });
  }

  findByPlate(plate: string): Promise<Vehicle | null> {
    const key = normalizeVehiclePlate(plate);
    if (!key) return Promise.resolve(null);
    return this.repo.findOne({ where: { plate: key } });
  }

  private async findByIdOrFail(id: string): Promise<Vehicle> {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('车辆不存在 / Vehicle not found');
    return vehicle;
  }

  async create(dto: { plate: string; label?: string }): Promise<Vehicle> {
    const plate = normalizeVehiclePlate(dto.plate);
    if (!plate) throw new BadRequestException('请填写车牌 / Plate is required');
    if (plate.length > 32) throw new BadRequestException('车牌过长 / Plate too long');
    if (await this.repo.findOne({ where: { plate } })) {
      throw new BadRequestException('该车牌已登记 / This plate is already registered');
    }
    return this.repo.save(this.repo.create({
      plate,
      displayPlate: String(dto.plate).trim(),
      label: dto.label?.trim() || null,
    }));
  }

  async update(id: string, dto: { label?: string; enabled?: boolean }): Promise<Vehicle> {
    const vehicle = await this.findByIdOrFail(id);
    if (dto.label !== undefined) vehicle.label = dto.label?.trim() || null;
    if (dto.enabled !== undefined) vehicle.enabled = !!dto.enabled;
    return this.repo.save(vehicle);
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrFail(id);
    await this.repo.delete(id);
  }

  // ---------- RUC 许可 ----------

  /**
   * 登记一张已购买的 RUC 许可。
   * 买到一张已经跑过头的许可等于白买，所以这里当场校验。
   */
  async recordLicence(
    id: string,
    dto: { licenceNo?: string; startKm: number; endKm: number; purchasedAt?: Date },
  ): Promise<Vehicle> {
    const vehicle = await this.findByIdOrFail(id);
    const startKm = Number(dto.startKm);
    const endKm = Number(dto.endKm);
    if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
      throw new BadRequestException('起止里程必须是数字 / Start and end readings must be numbers');
    }
    if (endKm <= startKm) {
      throw new BadRequestException('许可的截止里程必须大于起始里程 / Licence end must be greater than its start');
    }
    const current = numberOrNull(vehicle.odometerKm);
    if (current != null && endKm <= current) {
      throw new BadRequestException(
        `当前里程估算已经超过这张许可的截止里程（${Math.round(current)} km）/ The odometer has already passed this licence`,
      );
    }

    vehicle.rucLicenceNo = dto.licenceNo?.trim() || null;
    vehicle.rucStartKm = startKm;
    vehicle.rucEndKm = endKm;
    vehicle.rucPurchasedAt = dto.purchasedAt ?? new Date();
    vehicle.rucAlertLevel = 0; // 新许可重新开始计提醒级别
    return this.repo.save(vehicle);
  }

  /**
   * 人工校准：以车上 hubodometer 的真实读数为准。
   * 系统里的里程始终是估算值，靠这一步把误差清零。
   */
  async calibrate(id: string, odometerKm: number): Promise<Vehicle> {
    const vehicle = await this.findByIdOrFail(id);
    const reading = Number(odometerKm);
    if (!Number.isFinite(reading) || reading < 0) {
      throw new BadRequestException('里程读数无效 / Invalid odometer reading');
    }
    const current = numberOrNull(vehicle.odometerKm);
    if (current != null && reading < current - 1) {
      throw new BadRequestException(
        `里程读数不能比当前估算（${Math.round(current)} km）更小 / An odometer cannot run backwards`,
      );
    }
    const now = new Date();
    vehicle.odometerKm = reading;
    vehicle.odometerCalibratedKm = reading;
    vehicle.odometerCalibratedAt = now;
    vehicle.odometerUpdatedAt = now;
    // 校准点同时作为日均里程的新起算点，避免把校准造成的跳变算成"跑了很多"
    vehicle.odoSnapshotKm = reading;
    vehicle.odoSnapshotAt = now;
    return this.repo.save(vehicle);
  }

  // ---------- 里程累计（由定位器上报驱动） ----------

  async addDistance(plate: string, report: { deviceOdoKm?: number | null; gpsKm?: number | null }): Promise<void> {
    const vehicle = await this.findByPlate(plate);
    if (!vehicle || !vehicle.enabled) return;

    const before = { odometerKm: numberOrNull(vehicle.odometerKm), lastDeviceOdoKm: numberOrNull(vehicle.lastDeviceOdoKm) };
    const after = applyDistance(before, report);
    if (after.odometerKm === before.odometerKm && after.lastDeviceOdoKm === before.lastDeviceOdoKm) return;

    try {
      await this.repo.update(vehicle.id, {
        odometerKm: after.odometerKm,
        lastDeviceOdoKm: after.lastDeviceOdoKm,
        odometerUpdatedAt: new Date(),
      });
    } catch (e: any) {
      this.logger.warn(`odometer update for ${vehicle.plate} failed: ${e?.message || e}`);
    }
  }

  // ---------- 状态与提醒 ----------

  private async thresholds(): Promise<RucThresholds> {
    return {
      warnKm: await this.settings.getNumber('ruc_warn_km', 500),
      criticalKm: await this.settings.getNumber('ruc_critical_km', 200),
      warnDays: await this.settings.getNumber('ruc_warn_days', 3),
    };
  }

  /** 用滚动快照估算日均里程；没有足够历史时返回 0（不预估） */
  private avgDailyKm(vehicle: Vehicle, now: number): number {
    const odo = numberOrNull(vehicle.odometerKm);
    const snapKm = numberOrNull(vehicle.odoSnapshotKm);
    const snapAt = vehicle.odoSnapshotAt ? new Date(vehicle.odoSnapshotAt).getTime() : null;
    if (odo == null || snapKm == null || snapAt == null) return 0;
    const days = (now - snapAt) / (24 * 3600 * 1000);
    if (days < 0.5) return 0; // 时间太短，算出来的日均没有意义
    const travelled = odo - snapKm;
    return travelled > 0 ? travelled / days : 0;
  }

  async listWithStatus(): Promise<VehicleRucStatus[]> {
    const [vehicles, thresholds] = await Promise.all([this.list(), this.thresholds()]);
    const now = Date.now();
    return vehicles.map((v) => {
      const avgDailyKm = this.avgDailyKm(v, now);
      const assessment = assessRuc({
        odometerKm: numberOrNull(v.odometerKm),
        rucEndKm: numberOrNull(v.rucEndKm),
        avgDailyKm,
        thresholds,
        now: new Date(now),
      });
      const calibratedAt = v.odometerCalibratedAt ? new Date(v.odometerCalibratedAt).getTime() : null;
      return Object.assign({}, v, {
        ...assessment,
        avgDailyKm: Math.round(avgDailyKm * 10) / 10,
        daysSinceCalibration: calibratedAt ? Math.floor((now - calibratedAt) / (24 * 3600 * 1000)) : null,
      });
    });
  }

  /**
   * 每天检查一次。RUC 是按里程走的，不需要按分钟盯；
   * 每天一次既能提前几天发现，又不会变成刷屏的噪音。
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkAll(): Promise<void> {
    try {
      const rows = await this.listWithStatus();
      const now = new Date();
      for (const row of rows) {
        if (!row.enabled) continue;
        await this.rollSnapshot(row, now);

        const rank = LEVEL_RANK[row.level];
        // 只在"变得更严重"时提醒一次：同一级别每天重复推送会让人彻底忽略它
        if (rank === 0 || rank <= (row.rucAlertLevel ?? 0)) continue;

        await this.notify(row);
        await this.repo.update(row.id, { rucAlertLevel: rank });
      }
    } catch (e: any) {
      this.logger.error(`RUC check failed: ${e?.message || e}`);
    }
  }

  /** 滚动日均里程的起算点，让"每天跑多少"反映的是最近一周 */
  private async rollSnapshot(vehicle: Vehicle, now: Date): Promise<void> {
    const odo = numberOrNull(vehicle.odometerKm);
    if (odo == null) return;
    const snapAt = vehicle.odoSnapshotAt ? new Date(vehicle.odoSnapshotAt).getTime() : null;
    const stale = snapAt == null || (now.getTime() - snapAt) > SNAPSHOT_WINDOW_DAYS * 24 * 3600 * 1000;
    if (!stale) return;
    await this.repo.update(vehicle.id, { odoSnapshotKm: odo, odoSnapshotAt: now });
  }

  private async notify(row: VehicleRucStatus): Promise<void> {
    const plate = row.displayPlate || row.plate;
    const remaining = row.remainingKm ?? 0;
    const days = row.projectedDays != null ? `，按最近用量约 ${Math.floor(row.projectedDays)} 天后用完` : '';

    const title = row.level === RucAlertLevel.EXCEEDED
      ? `RUC 已超出许可：${plate}`
      : row.level === RucAlertLevel.CRITICAL
        ? `RUC 即将用完：${plate}`
        : `RUC 提醒：${plate}`;

    const content = row.level === RucAlertLevel.EXCEEDED
      ? `车辆 ${plate} 的 RUC 许可已超出 ${Math.abs(Math.round(remaining))} km，继续行驶可能被处罚，请立即购买路税。`
      : `车辆 ${plate} 的 RUC 许可还剩约 ${Math.round(remaining)} km${days}，请安排购买。（里程为系统估算，以车上 hubodometer 读数为准）`;

    await this.notifications.create(null, {
      title,
      content,
      type: 'ruc_due',
      meta: {
        vehicleId: row.id,
        plate,
        level: row.level,
        remainingKm: row.remainingKm,
        projectedDays: row.projectedDays,
        rucEndKm: numberOrNull(row.rucEndKm),
        odometerKm: numberOrNull(row.odometerKm),
      },
      notifyAdmins: true,
    });
    this.logger.log(`RUC ${row.level} for ${plate}: ${Math.round(remaining)} km left`);
  }
}

function numberOrNull(v: unknown): number | null {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
}
