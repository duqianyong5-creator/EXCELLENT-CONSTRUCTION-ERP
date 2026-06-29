import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { GpsLog } from './gps-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Task, TaskStatus } from '../tasks/task.entity';
import { UserRole } from '../users/user.entity';
import { haversineKm } from './geo.util';

type RequestUser = { id: string; role: UserRole };

const MAX_SPEED_KMH = 140;
const TELEPORT_THRESHOLD_KM = 10;
const GPS_TIMEOUT_SECONDS = 60;
const ONLINE_POSITION_WINDOW_SECONDS = 90;

@Injectable()
export class GpsService {
  private readonly logger = new Logger('GpsService');

  constructor(
    @InjectRepository(GpsLog) private repo: Repository<GpsLog>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    private notifService: NotificationsService,
  ) {}

  async upload(driverId: string, taskId: string, data: {
    latitude: number;
    longitude: number;
    speed: number;
    heading?: number;
    accuracy?: number;
  }): Promise<{ log: GpsLog; anomalies: string[] }> {
    const anomalies: string[] = [];

    // Check speed anomaly
    if (data.speed > MAX_SPEED_KMH) {
      anomalies.push('speed_anomaly');
    }

    // Check teleport
    const lastLog = await this.repo.findOne({
      where: { driverId, taskId },
      order: { timestamp: 'DESC' },
    });

    if (lastLog) {
      const dist = haversineKm(
        Number(lastLog.latitude), Number(lastLog.longitude),
        data.latitude, data.longitude,
      );
      const timeDiff = (Date.now() - lastLog.timestamp.getTime()) / 1000;
      const expectedMaxDist = (MAX_SPEED_KMH / 3600) * timeDiff;

      if (dist > TELEPORT_THRESHOLD_KM && dist > expectedMaxDist * 1.5) {
        anomalies.push('teleport');
      }
    }

    const log = this.repo.create({
      driverId,
      taskId,
      ...data,
      isAnomaly: anomalies.length > 0,
    });
    const saved = await this.repo.save(log);

    this.notifService.broadcastGpsUpdate(driverId, {
      taskId,
      latitude: saved.latitude,
      longitude: saved.longitude,
      speed: saved.speed,
      heading: saved.heading,
      accuracy: saved.accuracy,
      timestamp: saved.timestamp,
    });

    if (anomalies.length > 0) {
      await this.notifService.create(null, {
        title: 'GPS 异常',
        content: `司机 GPS 检测到异常：${anomalies.join(', ')}`,
        type: 'gps_anomaly',
        meta: { driverId, taskId, anomalies },
        notifyAdmins: true,
      });
    }

    return { log: saved, anomalies };
  }

  async getTrack(taskId: string): Promise<GpsLog[]> {
    return this.repo.find({
      where: { taskId },
      order: { timestamp: 'ASC' },
    });
  }

  // 运营角色（管理员/调度/监控）可看任意任务/司机；客户只能看自己名下的任务/司机；
  // 司机只能看自己。否则 403。防止任意登录账号枚举他人定位。
  private isStaff(role: UserRole): boolean {
    return role === UserRole.ADMIN || role === UserRole.DISPATCHER || role === UserRole.MONITOR;
  }

  private async assertTaskVisible(taskId: string, user: RequestUser): Promise<void> {
    if (this.isStaff(user.role)) return;
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      select: ['id', 'clientId', 'driverId'],
    });
    if (task) {
      if (user.role === UserRole.CLIENT && task.clientId === user.id) return;
      if (user.role === UserRole.DRIVER && task.driverId === user.id) return;
    }
    throw new ForbiddenException('无权查看该任务轨迹 / Not allowed');
  }

  private async assertDriverVisible(driverId: string, user: RequestUser): Promise<void> {
    if (this.isStaff(user.role)) return;
    if (user.role === UserRole.DRIVER && driverId === user.id) return;
    if (user.role === UserRole.CLIENT) {
      // 客户仅能查看自己名下任务上的司机
      const task = await this.taskRepo.findOne({
        where: { clientId: user.id, driverId },
        select: ['id'],
      });
      if (task) return;
    }
    throw new ForbiddenException('无权查看该司机位置 / Not allowed');
  }

  async getTrackForUser(taskId: string, user: RequestUser): Promise<GpsLog[]> {
    await this.assertTaskVisible(taskId, user);
    return this.getTrack(taskId);
  }

  async getDriverPositionForUser(driverId: string, user: RequestUser): Promise<GpsLog | null> {
    await this.assertDriverVisible(driverId, user);
    return this.getDriverLatestPosition(driverId);
  }

  // 每个司机取最新一条位置（最近窗口内、进行中任务）。用 getMany + JS 去重，
  // 避免 Postgres 专属的 DISTINCT ON 原生列名出错导致接口 500。
  private dedupeLatestByDriver(logs: GpsLog[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const g of logs) {
      if (!g.driverId || seen.has(g.driverId)) continue;
      seen.add(g.driverId);
      result.push({
        driverId: g.driverId,
        taskId: g.taskId,
        latitude: g.latitude,
        longitude: g.longitude,
        speed: g.speed,
        heading: g.heading,
        accuracy: g.accuracy,
        timestamp: g.timestamp,
      });
    }
    return result;
  }

  // 把司机账号名直接挂到每个位置点上，地图标记不必再单独查司机列表
  // （监控/客户等角色拿不到司机列表也能显示名字）。
  private attachDriverNames(positions: any[], tasks: Task[]): any[] {
    const nameById = new Map<string, string>();
    for (const t of tasks) {
      if (t.driverId) nameById.set(t.driverId, t.driver?.fullName || t.driver?.username || '司机');
    }
    for (const p of positions) {
      p.driverName = nameById.get(p.driverId) || '司机';
    }
    return positions;
  }

  async getLatestPositions(): Promise<any[]> {
    // 取进行中任务（带司机关系，用于给位置点附上司机账号名）
    const inProgress = await this.taskRepo.find({
      where: { status: TaskStatus.IN_PROGRESS },
      relations: ['driver'],
    });
    const taskIds = inProgress.map((t) => t.id);
    if (taskIds.length === 0) {
      this.logger.log('getLatestPositions: 0 in-progress tasks');
      return [];
    }
    // 用数据库自身时钟比对"新鲜度"，避免本机时钟与云数据库(Supabase)时钟不一致导致全被过滤
    const logs = await this.repo
      .createQueryBuilder('g')
      .where('g.taskId IN (:...taskIds)', { taskIds })
      .andWhere(`g.timestamp > NOW() - (:windowSec * INTERVAL '1 second')`, { windowSec: ONLINE_POSITION_WINDOW_SECONDS })
      .orderBy('g.timestamp', 'DESC')
      .getMany();
    const result = this.attachDriverNames(this.dedupeLatestByDriver(logs), inProgress);
    this.logger.log(`getLatestPositions: ${taskIds.length} in-progress task(s), ${logs.length} fresh point(s) (<${ONLINE_POSITION_WINDOW_SECONDS}s), ${result.length} on map`);
    return result;
  }

  async getDriverLatestPosition(driverId: string): Promise<GpsLog | null> {
    return this.repo.findOne({
      where: { driverId },
      order: { timestamp: 'DESC' },
    });
  }

  async getClientDriverPositions(clientId: string): Promise<any[]> {
    const inProgress = await this.taskRepo.find({
      where: { status: TaskStatus.IN_PROGRESS, clientId },
      relations: ['driver'],
    });
    const taskIds = inProgress.map((t) => t.id);
    if (taskIds.length === 0) return [];
    const logs = await this.repo
      .createQueryBuilder('g')
      .where('g.taskId IN (:...taskIds)', { taskIds })
      .andWhere(`g.timestamp > NOW() - (:windowSec * INTERVAL '1 second')`, { windowSec: ONLINE_POSITION_WINDOW_SECONDS })
      .orderBy('g.timestamp', 'DESC')
      .getMany();
    return this.attachDriverNames(this.dedupeLatestByDriver(logs), inProgress);
  }

  async checkGpsTimeout(driverId: string, taskId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - GPS_TIMEOUT_SECONDS * 1000);
    const recent = await this.repo.findOne({
      where: {
        driverId,
        taskId,
        timestamp: MoreThan(cutoff),
      },
    });
    return !recent;
  }

  async calculateGpsDuration(taskId: string): Promise<number> {
    const logs = await this.getTrack(taskId);
    if (logs.length < 2) return 0;

    let validSeconds = 0;
    for (let i = 1; i < logs.length; i++) {
      const diff = (logs[i].timestamp.getTime() - logs[i - 1].timestamp.getTime()) / 1000;
      if (diff <= GPS_TIMEOUT_SECONDS) {
        validSeconds += diff;
      }
    }

    return Math.round(validSeconds / 60);
  }
}
