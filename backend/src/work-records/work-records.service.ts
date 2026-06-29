import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkRecord } from './work-record.entity';
import { UserRole } from '../users/user.entity';

@Injectable()
export class WorkRecordsService {
  constructor(
    @InjectRepository(WorkRecord) private repo: Repository<WorkRecord>,
  ) {}

  async findAll(user: any) {
    const qb = this.repo
      .createQueryBuilder('wr')
      .leftJoinAndSelect('wr.driver', 'driver')
      .leftJoinAndSelect('wr.task', 'task')
      .leftJoinAndSelect('task.client', 'client')
      .orderBy('wr.createdAt', 'DESC');

    if (user.role === UserRole.DRIVER) {
      qb.where('wr.driverId = :id', { id: user.id });
    }

    return qb.getMany();
  }

  async findByTask(taskId: string): Promise<WorkRecord | null> {
    return this.repo.findOne({
      where: { taskId },
      relations: ['driver', 'task'],
    });
  }

  async findByDriver(driverId: string): Promise<WorkRecord[]> {
    return this.repo.find({
      where: { driverId },
      relations: ['task'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<WorkRecord> {
    const record = await this.repo.findOne({
      where: { id },
      relations: ['driver', 'task'],
    });
    if (!record) throw new NotFoundException('工作记录不存在');
    return record;
  }

  async applyAdjustment(id: string, addedMinutes: number): Promise<WorkRecord> {
    const record = await this.findById(id);
    record.adjustmentTime += addedMinutes;
    record.finalDuration = record.systemDuration + record.adjustmentTime;
    return this.repo.save(record);
  }

  async setFinalDuration(id: string, finalDuration: number): Promise<WorkRecord> {
    const record = await this.findById(id);
    record.finalDuration = finalDuration;
    return this.repo.save(record);
  }

  async updateGpsDuration(taskId: string, gpsDuration: number): Promise<void> {
    await this.repo.update({ taskId }, { gpsDuration });
  }

  async delete(id: string): Promise<void> {
    const record = await this.findById(id);
    await this.repo.remove(record);
  }
}
