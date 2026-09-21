import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { OperationLogsService } from '../operation-logs/operation-logs.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private operationLogs: OperationLogsService,
  ) {}

  async validateUser(identifier: string, password: string) {
    // 提示语中英双写：司机端可切英文，网页端也有英文界面，后端只有一种文案时另一边会看不懂
    const user = await this.usersService.findByEmailOrUsername(identifier);
    if (!user) throw new UnauthorizedException('账号不存在，请检查账号是否输错 / Account not found — check the username or email');

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('账户待审核，请等待管理员批准 / Account is awaiting approval');
    }
    if (user.status === UserStatus.REJECTED) {
      throw new UnauthorizedException('账户申请已被拒绝 / Account application was rejected');
    }
    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('账户已被禁用，请联系管理员 / Account is disabled — contact your administrator');
    }

    const userWithPassword = await this.usersService.findWithPassword(user.id);
    const isMatch = await bcrypt.compare(password, userWithPassword.password);
    if (!isMatch) throw new UnauthorizedException('密码错误，请重新输入 / Incorrect password');

    return user;
  }

  async login(user: any) {
    const payload = { sub: user.id, role: user.role, username: user.username };
    await this.operationLogs.record({
      actorId: user.id,
      actorName: user.fullName || user.username || user.email || user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      description: 'User logged in',
      details: { role: user.role },
    });
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        language: user.language,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmailOrUsername(dto.email);
    if (existing) throw new BadRequestException('邮箱已被注册');

    const existingUsername = await this.usersService.findByEmailOrUsername(dto.username);
    if (existingUsername) throw new BadRequestException('用户名已被使用');

    if (dto.role === UserRole.ADMIN || dto.role === UserRole.DISPATCHER || dto.role === UserRole.MONITOR) {
      throw new BadRequestException('无法自行注册该角色');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      ...dto,
      password: hashed,
      status: UserStatus.PENDING,
    });

    return { message: '注册成功，等待管理员审核', userId: user.id };
  }
}
