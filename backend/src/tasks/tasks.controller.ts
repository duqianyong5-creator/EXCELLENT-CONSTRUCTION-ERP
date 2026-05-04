import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, UseInterceptors, UploadedFiles,
  HttpCode, HttpStatus, NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StorageService } from '../common/services/storage.service';
import { EmailService } from '../common/services/email.service';
import { UserRole } from '../users/user.entity';
import { WorkRecord } from '../work-records/work-record.entity';

@ApiTags('任务管理 / Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private service: TasksService,
    private storage: StorageService,
    private email: EmailService,
    @InjectRepository(WorkRecord) private workRepo: Repository<WorkRecord>,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取任务列表（按角色过滤）' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get('today')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: '司机今日任务' })
  todayTasks(@CurrentUser() user: any) {
    return this.service.findTodayTasks(user.id);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '创建任务' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.service.create(body, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '分配司机' })
  assign(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.service.assign(id, driverId);
  }

  @Post(':id/start')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: '开始任务' })
  startTask(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.startTask(id, user.id);
  }

  @Post(':id/complete')
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FilesInterceptor('images', 5, { storage: memoryStorage() }))
  @ApiOperation({ summary: '完成任务（上传工作记录照片到 Supabase Storage）' })
  async completeTask(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('notes') notes: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const imageUrls = files?.length
      ? await this.storage.uploadMany(files, 'work-records')
      : [];
    return this.service.completeTask(id, user.id, { notes, imageUrls });
  }

  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除任务' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/send-email')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '向客户发送任务完成邮件' })
  async sendEmail(@Param('id') id: string) {
    if (!this.email.isConfigured()) {
      return { success: false, message: 'SMTP 未配置，请在 .env 文件中设置 SMTP_HOST / SMTP_USER / SMTP_PASS' };
    }

    const task = await this.service.findById(id);
    if (!task.client?.email) {
      return { success: false, message: '该客户未设置邮箱地址' };
    }

    const workRecord = await this.workRepo.findOne({
      where: { taskId: id },
      relations: ['driver'],
    });

    if (!workRecord || !workRecord.endTime) {
      return { success: false, message: '任务尚未完成，无法发送邮件' };
    }

    await this.email.sendTaskCompletion({
      to: task.client.email,
      clientName: task.client.fullName || task.client.username,
      taskTitle: task.title,
      startLocation: task.startLocation,
      endLocation: task.endLocation,
      startTime: workRecord.startTime,
      endTime: workRecord.endTime,
      driverName: workRecord.driver?.fullName || workRecord.driver?.username || '未知司机',
      notes: workRecord.completionNotes,
      imageUrls: workRecord.imageUrls || [],
    });

    return { success: true, message: `邮件已发送至 ${task.client.email}` };
  }
}
