import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { GpsLog } from './gps-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Task } from '../tasks/task.entity';

const MAX_SPEED_KMH = 140;
const TELEPORT_THRESHOLD_KM = 10;
const GPS_TIMEOUT_SECONDS = 60;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class GpsService {
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

  async getLatestPositions(): Promise<any[]> {
    const result = await this.repo
      .createQueryBuilder('g')
      .select('DISTINCT ON (g.driverId) g.*')
      .orderBy('g.driverId')
      .addOrderBy('g.timestamp', 'DESC')
      .getRawMany();
    return result;
  }

  async getDriverLatestPosition(driverId: string): Promise<GpsLog | null> {
    return this.repo.findOne({
      where: { driverId },
      order: { timestamp: 'DESC' },
    });
  }

  async getClientDriverPositions(clientId: string): Promise<any[]> {
    const tasks = await this.taskRepo.find({
      where: { clientId },
      select: ['driverId'],
    });
    const driverIds = [...new Set(tasks.map(t => t.driverId).filter(Boolean))];
    if (driverIds.length === 0) return [];

    const positions = await this.repo
      .createQueryBuilder('g')
      .select('DISTINCT ON (g.driverId) g.*')
      .where('g.driverId IN (:...ids)', { ids: driverIds })
      .orderBy('g.driverId')
      .addOrderBy('g.timestamp', 'DESC')
      .getRawMany();
    return positions;
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
