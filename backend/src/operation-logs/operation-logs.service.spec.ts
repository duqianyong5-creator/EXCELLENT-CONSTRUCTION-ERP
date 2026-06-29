import { OperationLogsService } from './operation-logs.service';

describe('OperationLogsService', () => {
  function createService() {
    const repo = {
      create: jest.fn((data) => ({ id: 'log-1', ...data })),
      save: jest.fn(async (log) => ({ ...log, createdAt: new Date('2026-06-26T00:00:00.000Z') })),
      find: jest.fn(async () => [
        { id: 'log-2', action: 'tasks.assign', createdAt: new Date('2026-06-26T00:01:00.000Z') },
        { id: 'log-1', action: 'tasks.create', createdAt: new Date('2026-06-26T00:00:00.000Z') },
      ]),
    };

    return {
      service: new OperationLogsService(repo as any),
      repo,
    };
  }

  it('records an operation with actor, action, target, and details', async () => {
    const { service, repo } = createService();

    const saved = await service.record({
      actorId: 'admin-1',
      actorName: 'admin',
      action: 'tasks.create',
      targetType: 'task',
      targetId: 'task-1',
      description: 'Created task Demo',
      details: { title: 'Demo' },
    });

    expect(repo.create).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'admin',
      action: 'tasks.create',
      targetType: 'task',
      targetId: 'task-1',
      description: 'Created task Demo',
      details: { title: 'Demo' },
    });
    expect(saved.id).toBe('log-1');
  });

  it('returns recent logs newest first', async () => {
    const { service, repo } = createService();

    const logs = await service.findRecent();

    expect(repo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      take: 100,
      relations: ['actor'],
    });
    expect(logs.map((log) => log.action)).toEqual(['tasks.assign', 'tasks.create']);
  });
});
