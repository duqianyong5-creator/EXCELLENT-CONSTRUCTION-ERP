import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from './task.entity';
import { WorkRecord } from '../work-records/work-record.entity';
import { GpsLog } from '../gps/gps-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../users/user.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    @InjectRepository(WorkRecord) private workRepo: Repository<WorkRecord>,
    @InjectRepository(GpsLog) private gpsRepo: Repository<GpsLog>,
    private notifService: NotificationsService,
  ) {}

  async findAll(user: any) {
    const qb = this.taskRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.client', 'client')
      .leftJoinAndSelect('t.driver', 'driver')
      .orderBy('t.createdAt', 'DESC');

    if (user.role === UserRole.DRIVER) {
      qb.where('t.driverId = :id', { id: user.id });
    } else if (user.role === UserRole.CLIENT) {
      qb.where('t.clientId = :id', { id: user.id });
    }

    return qb.getMany();
  }

  async findTodayTasks(driverId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.taskRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.client', 'client')
      .where('t.driverId = :id', { id: driverId })
      .andWhere('t.scheduledAt >= :today', { today })
      .andWhere('t.scheduledAt < :tomorrow', { tomorrow })
      .andWhere('t.status != :cancelled', { cancelled: TaskStatus.CANCELLED })
      .orderBy('t.scheduledAt', 'ASC')
      .getMany();
  }

  async findById(id: string): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['client', 'driver'],
    });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  async create(data: Partial<Task>, creatorId: string): Promise<Task> {
    const task = this.taskRepo.create({ ...data, dispatcherId: creatorId });
    const saved = await this.taskRepo.save(task);

    if (saved.driverId) {
      await this.notifService.create(saved.driverId, {
        title: '新任务分配',
        content: `您有新任务：${saved.title}`,
        type: 'new_task',
        meta: { taskId: saved.id },
      });
      saved.status = TaskStatus.ASSIGNED;
      await this.taskRepo.save(saved);
    }

    if (saved.clientId) {
      await this.notifService.create(saved.clientId, {
        title: '任务已创建',
        content: `您的任务 "${saved.title}" 已创建`,
        type: 'task_created',
        meta: { taskId: saved.id },
      });
    }

    return saved;
  }

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const task = await this.findById(id);
    Object.assign(task, data);
    return this.taskRepo.save(task);
  }

  async assign(taskId: string, driverId: string): Promise<Task> {
    const task = await this.findById(taskId);
    task.driverId = driverId;
    task.status = TaskStatus.ASSIGNED;
    const saved = await this.taskRepo.save(task);

    await this.notifService.create(driverId, {
      title: '任务分配',
      content: `任务 "${saved.title}" 已分配给您`,
      type: 'task_assigned',
      meta: { taskId: saved.id },
    });

    return saved;
  }

  async startTask(taskId: string, driverId: string): Promise<WorkRecord> {
    const task = await this.findById(taskId);
    if (task.driverId !== driverId) throw new ForbiddenException('无权操作此任务');
    if (task.status !== TaskStatus.ASSIGNED) throw new ForbiddenException('任务状态不正确');

    task.status = TaskStatus.IN_PROGRESS;
    await this.taskRepo.save(task);

    const record = this.workRepo.create({
      driverId,
      taskId,
      startTime: new Date(),
    });
    return this.workRepo.save(record);
  }

  async completeTask(
    taskId: string,
    driverId: string,
    data: { notes?: string; imageUrls?: string[] },
  ): Promise<WorkRecord> {
    const task = await this.findById(taskId);
    if (task.driverId !== driverId) throw new ForbiddenException('无权操作此任务');
    if (task.status !== TaskStatus.IN_PROGRESS) throw new ForbiddenException('任务未在进行中');

    const endTime = new Date();
    task.status = TaskStatus.COMPLETED;
    await this.taskRepo.save(task);

    const record = await this.workRepo.findOne({ where: { taskId, driverId } });
    if (!record) throw new NotFoundException('未找到工作记录，请先开始任务');

    record.endTime = endTime;
    const diffMs = endTime.getTime() - record.startTime.getTime();
    record.systemDuration = Math.round(diffMs / 60000);
    record.finalDuration = record.systemDuration;
    record.completionNotes = data.notes;
    record.imageUrls = data.imageUrls;
    const saved = await this.workRepo.save(record);

    await this.notifService.create(task.clientId, {
      title: '任务完成',
      content: `任务 "${task.title}" 已完成`,
      type: 'task_completed',
      meta: { taskId },
    });

    return saved;
  }

  async cancel(id: string): Promise<Task> {
    const task = await this.findById(id);
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new BadRequestException('已完成或已取消的任务无法取消');
    }
    task.status = TaskStatus.CANCELLED;
    return this.taskRepo.save(task);
  }

  async delete(id: string): Promise<void> {
    const task = await this.findById(id);
    await this.gpsRepo.delete({ taskId: id });
    await this.workRepo.delete({ taskId: id });
    await this.taskRepo.remove(task);
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [total, pending, inProgress, completed, todayCount] = await Promise.all([
      this.taskRepo.count(),
      this.taskRepo.count({ where: { status: TaskStatus.PENDING } }),
      this.taskRepo.count({ where: { status: TaskStatus.IN_PROGRESS } }),
      this.taskRepo.count({ where: { status: TaskStatus.COMPLETED } }),
      this.taskRepo
        .createQueryBuilder('t')
        .where('t.scheduledAt >= :today', { today })
        .andWhere('t.scheduledAt < :tomorrow', { tomorrow })
        .andWhere('t.status != :cancelled', { cancelled: TaskStatus.CANCELLED })
        .getCount(),
    ]);
    return { total, pending, inProgress, completed, today: todayCount };
  }
}
