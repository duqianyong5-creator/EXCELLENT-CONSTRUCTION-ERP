import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GpsLog } from './gps-log.entity';
import { GpsAnomaly } from './gps-anomaly.entity';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';
import { AnomaliesController } from './anomalies.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { Task } from '../tasks/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GpsLog, GpsAnomaly, Task]), NotificationsModule],
  controllers: [GpsController, AnomaliesController],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}
