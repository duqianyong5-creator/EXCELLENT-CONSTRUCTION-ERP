import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkRecord } from './work-record.entity';
import { UserRole } from '../users/user.entity';
import { ErrorCode } from '../common/i18n/messages';

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
    } else if (user.role === UserRole.CLIENT) {
      // 客户是公司外部账号。以前这里不收窄，客户用自己的 token 就能拉到
      // 全公司所有司机的工时、姓名和完工照片。
      qb.where('task.clientId = :id', { id: user.id });
    }

    return qb.getMany();
  }

  async findByTask(taskId: string, actor?: any): Promise<WorkRecord | null> {
    const record = await this.repo.findOne({
      where: { taskId },
      relations: ['driver', 'task'],
    });
    if (record) this.assertVisible(record, actor);
    return record;
  }

  /** 客户只能看自己任务的工时，司机只能看自己的 */
  private assertVisible(record: WorkRecord, actor?: any): void {
    if (!actor) return;
    if (actor.role === UserRole.DRIVER && record.driverId !== actor.id) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN_WORK_RECORD);
    }
    if (actor.role === UserRole.CLIENT && (record as any).task?.clientId !== actor.id) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN_WORK_RECORD);
    }
  }

  async findByDriver(driverId: string): Promise<WorkRecord[]> {
    return this.repo.find({
      where: { driverId },
      relations: ['task'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, actor?: any): Promise<WorkRecord> {
    const record = await this.repo.findOne({
      where: { id },
      relations: ['driver', 'task'],
    });
    if (!record) throw new NotFoundException('工作记录不存在');
    this.assertVisible(record, actor);
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
