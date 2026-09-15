import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GpsDevice } from './gps-device.entity';
import { GpsDeviceService } from './gps-device.service';
import { GpsDeviceController } from './gps-device.controller';
import { Jt808Server } from './jt808.server';
import { GpsModule } from '../gps/gps.module';
import { Task } from '../tasks/task.entity';

/** 车载 JT808 定位器接入：TCP 网关 + 设备登记管理 */
@Module({
  imports: [TypeOrmModule.forFeature([GpsDevice, Task]), GpsModule],
  controllers: [GpsDeviceController],
  providers: [GpsDeviceService, Jt808Server],
  exports: [GpsDeviceService, Jt808Server],
})
export class GpsDeviceModule {}
