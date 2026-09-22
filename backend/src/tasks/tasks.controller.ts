import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, UseInterceptors, UploadedFiles,
  HttpCode, HttpStatus, NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StorageService } from '../common/services/storage.service';
import { UserRole } from '../users/user.entity';

@ApiTags('任务管理 / Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private service: TasksService,
    private storage: StorageService,
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
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MONITOR)
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findById(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '创建任务' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '分配司机' })
  assign(@Param('id') id: string, @Body('driverId') driverId: string, @CurrentUser() user: any) {
    return this.service.assign(id, driverId, user);
  }

  @Post(':id/start')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: '开始任务' })
  startTask(@Param('id') id: string, @CurrentUser() user: any, @Body('vehiclePlate') vehiclePlate?: string) {
    return this.service.startTask(id, user.id, vehiclePlate);
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
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.cancel(id, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除任务' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.delete(id, user);
  }

}
