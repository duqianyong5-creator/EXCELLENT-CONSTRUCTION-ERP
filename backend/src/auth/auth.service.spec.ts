import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserStatus } from '../users/user.entity';

/**
 * 登录失败时必须说清楚「哪里错了」：
 * 司机站在工地上登不进去，只说一句「登录失败」他无法判断是账号打错、密码打错，
 * 还是账户还没被审核——这三种的处理方式完全不同。
 */
function build(user: any, passwordHash?: string) {
  const usersService = {
    findByEmailOrUsername: jest.fn(async () => user),
    findWithPassword: jest.fn(async () => ({ ...user, password: passwordHash })),
  };
  const service = new AuthService(
    usersService as any,
    { sign: jest.fn(() => 'token') } as any,
    { record: jest.fn(async () => undefined) } as any,
  );
  return { service, usersService };
}

const activeUser = { id: 'u1', username: 'driver1', status: UserStatus.ACTIVE, role: 'driver' };

describe('AuthService.validateUser failure messages', () => {
  it('says the account does not exist when the username is wrong', async () => {
    const { service } = build(null);
    await expect(service.validateUser('nope', 'x')).rejects.toThrow(UnauthorizedException);
    await expect(service.validateUser('nope', 'x')).rejects.toThrow(/账号不存在[\s\S]*Account not found/);
  });

  it('says the password is wrong when the account exists', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    const { service } = build(activeUser, hash);
    await expect(service.validateUser('driver1', 'wrong')).rejects.toThrow(/密码错误[\s\S]*Incorrect password/);
  });

  it('distinguishes pending, rejected and disabled accounts from a bad password', async () => {
    const hash = await bcrypt.hash('pw', 10);
    for (const [status, pattern] of [
      [UserStatus.PENDING, /待审核[\s\S]*awaiting approval/],
      [UserStatus.REJECTED, /已被拒绝[\s\S]*rejected/],
      [UserStatus.DISABLED, /已被禁用[\s\S]*disabled/],
    ] as const) {
      const { service } = build({ ...activeUser, status }, hash);
      // 即使密码是对的，也应该报状态问题而不是密码问题
      await expect(service.validateUser('driver1', 'pw')).rejects.toThrow(pattern);
    }
  });

  it('answers in both Chinese and English (the app can be switched to English)', async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { service } = build(activeUser, hash);
    const message = await service.validateUser('driver1', 'bad').catch((e) => e.message);
    expect(message).toMatch(/[一-鿿]/);
    expect(message).toMatch(/[A-Za-z]{4,}/);
  });

  it('lets a correct password through', async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { service } = build(activeUser, hash);
    await expect(service.validateUser('driver1', 'pw')).resolves.toMatchObject({ id: 'u1' });
  });
});
