import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdjustmentLog } from './adjustment-log.entity';
import { WorkRecordsService } from '../work-records/work-records.service';

@Injectable()
export class AdjustmentsService {
  constructor(
    @InjectRepository(AdjustmentLog) private repo: Repository<AdjustmentLog>,
    private workService: WorkRecordsService,
  ) {}

  async addAdjustment(data: {
    workRecordId: string;
    driverId: string;
    taskId: string;
    addedMinutes: number;
    reason?: string;
    operatorId: string;
  }): Promise<AdjustmentLog> {
    await this.workService.applyAdjustment(data.workRecordId, data.addedMinutes);

    const log = this.repo.create({
      workRecordId: data.workRecordId,
      driverId: data.driverId,
      taskId: data.taskId,
      addedMinutes: data.addedMinutes,
      reason: data.reason,
      operatorId: data.operatorId,
    });
    return this.repo.save(log);
  }

  async setFinalDuration(workRecordId: string, finalMinutes: number, operatorId: string) {
    const record = await this.workService.findById(workRecordId);
    const diff = finalMinutes - record.systemDuration;
    await this.workService.setFinalDuration(workRecordId, finalMinutes);

    const log = this.repo.create({
      workRecordId,
      driverId: record.driverId,
      taskId: record.taskId,
      addedMinutes: diff,
      reason: '手动覆盖最终工时',
      operatorId,
    });
    return this.repo.save(log);
  }

  async getLogs(taskId?: string, driverId?: string): Promise<AdjustmentLog[]> {
    const qb = this.repo
      .createQueryBuilder('al')
      .leftJoinAndSelect('al.operator', 'operator')
      .leftJoinAndSelect('al.driver', 'driver')
      .leftJoinAndSelect('al.task', 'task')
      .orderBy('al.createdAt', 'DESC');

    if (taskId) qb.andWhere('al.taskId = :taskId', { taskId });
    if (driverId) qb.andWhere('al.driverId = :driverId', { driverId });

    return qb.getMany();
  }
}
