import { GpsService } from './gps.service';
import { TaskStatus } from '../tasks/task.entity';
import { UserRole } from '../users/user.entity';
import { ForbiddenException } from '@nestjs/common';

describe('GpsService live positions', () => {
  it('returns one fresh position per driver, filtered to in-progress tasks', async () => {
    const ts = new Date('2026-06-27T00:00:00.000Z');
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        { driverId: 'd1', taskId: 't1', latitude: 1, longitude: 2, speed: 0, timestamp: ts },
        { driverId: 'd1', taskId: 't1', latitude: 9, longitude: 9, speed: 0, timestamp: new Date(ts.getTime() - 1000) },
        { driverId: 'd2', taskId: 't1', latitude: 3, longitude: 4, speed: 0, timestamp: ts },
      ]),
    };
    const gpsRepo = { createQueryBuilder: jest.fn(() => qb) };
    const taskRepo = { find: jest.fn(async () => [{ id: 't1' }]) };
    const service = new GpsService(
      gpsRepo as any,
      taskRepo as any,
      { create: jest.fn(), broadcastGpsUpdate: jest.fn() } as any,
    );

    const result = await service.getLatestPositions();

    // 只查进行中任务
    expect(taskRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: TaskStatus.IN_PROGRESS } }),
    );
    // 用数据库时钟比对新鲜度（NOW() - INTERVAL）
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('NOW()'),
      expect.objectContaining({ windowSec: expect.any(Number) }),
    );
    // 每个司机只保留最新一条
    expect(result).toHaveLength(2);
    expect(result.find((p: any) => p.driverId === 'd1')).toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('returns empty when there are no in-progress tasks (no gps query)', async () => {
    const gpsRepo = { createQueryBuilder: jest.fn() };
    const taskRepo = { find: jest.fn(async () => []) };
    const service = new GpsService(gpsRepo as any, taskRepo as any, {} as any);

    const result = await service.getLatestPositions();

    expect(result).toEqual([]);
    expect(gpsRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('GpsService position/track authorization (IDOR fix)', () => {
  const makeService = (taskRow: any) => {
    const gpsRepo = {
      find: jest.fn(async () => [{ id: 'g1', taskId: 't1' }]),
      findOne: jest.fn(async () => ({ id: 'g1', driverId: 'd1', latitude: 1, longitude: 2 })),
    };
    const taskRepo = { findOne: jest.fn(async () => taskRow) };
    const service = new GpsService(gpsRepo as any, taskRepo as any, {} as any);
    return { service, gpsRepo, taskRepo };
  };

  it('lets staff (dispatcher) read any task track without an ownership lookup', async () => {
    const { service, taskRepo } = makeService(null);
    await expect(
      service.getTrackForUser('t1', { id: 'staff', role: UserRole.DISPATCHER }),
    ).resolves.toHaveLength(1);
    expect(taskRepo.findOne).not.toHaveBeenCalled();
  });

  it('lets a client read the track of their own task', async () => {
    const { service } = makeService({ id: 't1', clientId: 'c1', driverId: 'd1' });
    await expect(
      service.getTrackForUser('t1', { id: 'c1', role: UserRole.CLIENT }),
    ).resolves.toHaveLength(1);
  });

  it('blocks a client from reading another client\'s task track', async () => {
    const { service } = makeService({ id: 't1', clientId: 'OTHER', driverId: 'd1' });
    await expect(
      service.getTrackForUser('t1', { id: 'c1', role: UserRole.CLIENT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a client from reading an arbitrary driver position not on their task', async () => {
    const { service, taskRepo } = makeService(null); // no task links this client to the driver
    await expect(
      service.getDriverPositionForUser('d-other', { id: 'c1', role: UserRole.CLIENT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(taskRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'c1', driverId: 'd-other' } }),
    );
  });

  it('lets a client read the position of a driver on their own task', async () => {
    const { service } = makeService({ id: 't1' }); // task linking c1 -> d1 exists
    await expect(
      service.getDriverPositionForUser('d1', { id: 'c1', role: UserRole.CLIENT }),
    ).resolves.toMatchObject({ driverId: 'd1' });
  });
});

describe('GpsService upload realtime broadcast', () => {
  it('broadcasts the saved GPS point so maps can update immediately', async () => {
    const savedAt = new Date('2026-06-27T00:00:00.000Z');
    const gpsRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 'gps-1', timestamp: savedAt, ...data })),
    };
    const notifService = {
      create: jest.fn(),
      broadcastGpsUpdate: jest.fn(),
    };
    const service = new GpsService(
      gpsRepo as any,
      {} as any,
      notifService as any,
    );

    await service.upload('driver-1', 'task-1', {
      latitude: -36.87444,
      longitude: 174.85928,
      speed: 42,
      heading: 180,
      accuracy: 6,
    });

    expect(notifService.broadcastGpsUpdate).toHaveBeenCalledWith('driver-1', {
      taskId: 'task-1',
      latitude: -36.87444,
      longitude: 174.85928,
      speed: 42,
      heading: 180,
      accuracy: 6,
      timestamp: savedAt,
    });
  });
});
