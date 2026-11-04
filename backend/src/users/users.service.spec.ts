import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole, UserStatus } from './user.entity';

// App Store guideline 5.1.1(v): an app that lets people sign up must let them delete their account in the app.
// Work records, tasks and GPS history stay (payroll and job evidence); the person's own details go.
describe('UsersService.deleteOwnAccount', () => {
  async function setup(role: UserRole = UserRole.DRIVER) {
    const user: any = {
      id: 'u1', username: 'liu', email: 'liu@example.com', fullName: 'Liu', phone: '021 123',
      avatarUrl: 'x.png', role, status: UserStatus.ACTIVE, password: await bcrypt.hash('secret1', 4),
    };
    const repo: any = {
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => user),
      })),
      findOne: jest.fn(async () => user),
      save: jest.fn(async (u: any) => u),
      remove: jest.fn(),
    };
    const service = new UsersService(repo, {} as any, {} as any);
    return { service, repo, user };
  }

  it('wipes personal details, blocks sign-in and keeps the row for job history', async () => {
    const { service, repo, user } = await setup();
    await service.deleteOwnAccount('u1', 'secret1');
    expect(repo.remove).not.toHaveBeenCalled();
    const saved = repo.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.DISABLED);
    expect(saved.username).not.toBe('liu');
    expect(saved.email).not.toContain('liu@example.com');
    expect(saved.fullName).not.toBe('Liu');
    expect(saved.phone).toBeNull();
    expect(saved.avatarUrl).toBeNull();
    expect(await bcrypt.compare('secret1', saved.password)).toBe(false);
    expect(user.id).toBe('u1');
  });

  it('refuses with a wrong password', async () => {
    const { service, repo } = await setup();
    await expect(service.deleteOwnAccount('u1', 'wrong')).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('an administrator cannot delete their own account from the app', async () => {
    const { service, repo } = await setup(UserRole.ADMIN);
    await expect(service.deleteOwnAccount('u1', 'secret1')).rejects.toThrow(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
