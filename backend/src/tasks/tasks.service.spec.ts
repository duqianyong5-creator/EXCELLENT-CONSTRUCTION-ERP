import { TasksService } from './tasks.service';

describe('TasksService operation logging', () => {
  function createService() {
    const savedTask = {
      id: 'task-1',
      title: 'Concrete delivery',
      clientId: 'client-1',
      driverId: null,
      dispatcherId: 'admin-1',
      status: 'pending',
    };
    const taskRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async () => savedTask),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };
    const service = new TasksService(
      taskRepo as any,
      { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), delete: jest.fn() } as any,
      { delete: jest.fn() } as any,
      { create: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    return {
      service,
      taskRepo,
      operationLogs: (service as any).operationLogs,
    };
  }

  it('records an operation log when an admin creates a task', async () => {
    const { service, operationLogs } = createService();

    await service.create(
      {
        clientId: 'client-1',
        title: 'Concrete delivery',
        startLocation: 'Depot',
        endLocation: 'Site',
      },
      { id: 'admin-1', username: 'admin', role: 'admin' },
    );

    expect(operationLogs.record).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'admin',
      action: 'tasks.create',
      targetType: 'task',
      targetId: 'task-1',
      description: 'Created task Concrete delivery',
      details: {
        clientId: 'client-1',
        driverId: null,
        status: 'pending',
      },
    });
  });
});
