import { AuthService } from './auth.service';

describe('AuthService operation logging', () => {
  it('records an operation log when a user logs in', async () => {
    const jwtService = { sign: jest.fn(() => 'token') };
    const operationLogs = { record: jest.fn() };
    const service = new AuthService({} as any, jwtService as any, operationLogs as any);

    await service.login({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      fullName: 'Admin',
      language: 'zh',
      avatarUrl: null,
    });

    expect(operationLogs.record).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'Admin',
      action: 'auth.login',
      targetType: 'user',
      targetId: 'admin-1',
      description: 'User logged in',
      details: { role: 'admin' },
    });
  });
});
