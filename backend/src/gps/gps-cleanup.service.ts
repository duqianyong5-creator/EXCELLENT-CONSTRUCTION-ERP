import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GpsLog } from './gps-log.entity';
import { Task, TaskStatus } from '../tasks/task.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class GpsCleanupService {
  private readonly logger = new Logger(GpsCleanupService.name);

  constructor(
    @InjectRepository(GpsLog) private gpsRepo: Repository<GpsLog>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    private settings: SystemSettingsService,
  ) {}

  // 每天凌晨 3 点清理：删除「非进行中任务」且超过保留天数的 GPS 轨迹点。
  // 进行中任务的实时点永不删除；工时数字存在 work_records，删点不影响工时。
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldGps() {
    try {
      const days = await this.settings.getNumber('gps_retention_days', 7);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // 进行中任务的 id（这些任务的 GPS 点要保留，地图实时要用）
      const inProgress = await this.taskRepo.find({
        where: { status: TaskStatus.IN_PROGRESS },
        select: ['id'],
      });
      const keepTaskIds = inProgress.map((t) => t.id);

      const qb = this.gpsRepo
        .createQueryBuilder()
        .delete()
        .from(GpsLog)
        .where('timestamp < :cutoff', { cutoff });

      if (keepTaskIds.length > 0) {
        // 删除截止时间前、且不属于进行中任务的轨迹点
        qb.andWhere('(task_id IS NULL OR task_id NOT IN (:...keepTaskIds))', { keepTaskIds });
      }

      const result = await qb.execute();
      this.logger.log(
        `GPS 清理完成：删除 ${result.affected ?? 0} 条（保留 ${days} 天，进行中任务除外）`,
      );
    } catch (e: any) {
      this.logger.error(`GPS 清理失败：${e?.message || e}`);
    }
  }
}
