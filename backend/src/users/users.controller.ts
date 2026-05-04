import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, Query, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, UserStatus } from './user.entity';

@ApiTags('用户管理 / Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: '获取用户列表' })
  findAll(
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
  ) {
    return this.service.findAll({ role, status });
  }

  @Get('drivers')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  findDrivers() {
    return this.service.findDrivers();
  }

  @Get('clients')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  findClients() {
    return this.service.findClients();
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  getPending() {
    return this.service.findAll({ status: UserStatus.PENDING });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员直接创建用户' })
  async create(@Body() body: any) {
    const bcrypt = require('bcrypt');
    const hashed = await bcrypt.hash(body.password || 'Temp@123456', 12);
    return this.service.create({
      ...body,
      password: hashed,
      status: UserStatus.ACTIVE,
      approvedAt: new Date(),
    });
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.approve(id, user.id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }

  @Patch(':id/disable')
  @Roles(UserRole.ADMIN)
  disable(@Param('id') id: string) {
    return this.service.disable(id);
  }

  @Patch(':id/enable')
  @Roles(UserRole.ADMIN)
  enable(@Param('id') id: string) {
    return this.service.enable(id);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  updateRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.service.updateRole(id, role);
  }

  @Patch('profile')
  @ApiOperation({ summary: '更新个人资料' })
  updateProfile(@CurrentUser() user: any, @Body() body: any) {
    const { password, role, status, ...safe } = body;
    return this.service.updateProfile(user.id, safe);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除用户（仅管理员）' })
  deleteUser(@Param('id') id: string, @CurrentUser() me: any) {
    if (id === me.id) throw new BadRequestException('不能删除自己的账户');
    return this.service.delete(id);
  }

  @Patch('change-password')
  @ApiOperation({ summary: '修改密码' })
  changePassword(
    @CurrentUser() user: any,
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.service.changePassword(user.id, oldPassword, newPassword);
  }

  @Patch(':id/reset-password')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员重置用户密码' })
  resetPassword(@Param('id') id: string, @Body('newPassword') newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('密码长度不能少于6位');
    }
    return this.service.resetPassword(id, newPassword);
  }
}
