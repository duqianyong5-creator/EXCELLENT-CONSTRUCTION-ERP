import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Task } from '../tasks/task.entity';
import { GpsLog } from '../gps/gps-log.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Task, GpsLog]), OperationLogsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
