import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdjustmentLog } from './adjustment-log.entity';
import { AdjustmentsController } from './adjustments.controller';
import { AdjustmentsService } from './adjustments.service';
import { WorkRecordsModule } from '../work-records/work-records.module';

@Module({
  imports: [TypeOrmModule.forFeature([AdjustmentLog]), WorkRecordsModule],
  controllers: [AdjustmentsController],
  providers: [AdjustmentsService],
  exports: [AdjustmentsService],
})
export class AdjustmentsModule {}
