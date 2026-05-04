import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GpsAnomaly } from './gps-anomaly.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('异常管理 / Anomalies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.DISPATCHER)
@Controller('anomalies')
export class AnomaliesController {
  constructor(
    @InjectRepository(GpsAnomaly) private repo: Repository<GpsAnomaly>,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取所有 GPS 异常记录' })
  findAll() {
    return this.repo.find({
      relations: ['driver', 'task'],
      order: { detectedAt: 'DESC' },
      take: 200,
    });
  }

  @Get('unresolved')
  findUnresolved() {
    return this.repo.find({
      where: { resolved: false },
      relations: ['driver', 'task'],
      order: { detectedAt: 'DESC' },
    });
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: '标记异常已处理' })
  async resolve(@Param('id') id: string, @CurrentUser() user: any) {
    await this.repo.update(id, {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: user.id,
    });
    return this.repo.findOne({ where: { id }, relations: ['driver'] });
  }
}
