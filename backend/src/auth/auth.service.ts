import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(identifier: string, password: string) {
    const user = await this.usersService.findByEmailOrUsername(identifier);
    if (!user) throw new UnauthorizedException('账户不存在');

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('账户待审核，请等待管理员批准');
    }
    if (user.status === UserStatus.REJECTED) {
      throw new UnauthorizedException('账户申请已被拒绝');
    }
    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('账户已被禁用');
    }

    const userWithPassword = await this.usersService.findWithPassword(user.id);
    const isMatch = await bcrypt.compare(password, userWithPassword.password);
    if (!isMatch) throw new UnauthorizedException('密码错误');

    return user;
  }

  async login(user: any) {
    const payload = { sub: user.id, role: user.role, username: user.username };
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

    if (dto.role === UserRole.ADMIN || dto.role === UserRole.DISPATCHER) {
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
