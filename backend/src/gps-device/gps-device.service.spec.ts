import { BadRequestException } from '@nestjs/common';
import { GpsDeviceService, normalizePlate } from './gps-device.service';
import { TaskStatus } from '../tasks/task.entity';
import type { Position } from './jt808.codec';

function pos(over: Partial<Position> = {}): Position {
  return {
    alarm: 0, status: 2, acc: true, fixed: true, moving: true,
    latitude: -36.8485, longitude: 174.7633, altitude: 10, speedKmh: 42.5, heading: 90,
    time: new Date('2026-09-14T03:00:00.000Z'),
    extras: { raw: new Map(), batteryPercent: 88, externalPower: true, signalPercent: 70 },
    ...over,
  };
}

function build(opts: { device?: any; tasks?: any[] } = {}) {
  const device = opts.device === undefined
    ? { id: 'dev1', deviceNo: '51160004464', vehiclePlate: 'ABC 123', enabled: true }
    : opts.device;
  const repo = {
    findOne: jest.fn(async ({ where }: any) => (where.deviceNo === '51160004464' || where.id === 'dev1') ? device : null),
    update: jest.fn(async () => undefined),
    create: jest.fn((v: any) => ({ id: 'new', ...v })),
    save: jest.fn(async (v: any) => v),
    find: jest.fn(async () => [device].filter(Boolean)),
    delete: jest.fn(async () => undefined),
  };
  const taskRepo = {
    find: jest.fn(async () => opts.tasks ?? [
      { id: 't1', driverId: 'd1', vehiclePlate: 'abc-123', updatedAt: new Date() },
    ]),
  };
  const gpsService = { upload: jest.fn(async () => ({ log: {}, anomalies: [] })) };
  const service = new GpsDeviceService(repo as any, taskRepo as any, gpsService as any);
  return { service, repo, taskRepo, gpsService, device };
}

describe('normalizePlate', () => {
  it('ignores case, spaces, hyphens and dots', () => {
    expect(normalizePlate(' abc-123 ')).toBe('ABC123');
    expect(normalizePlate('粤B·88888')).toBe('粤B88888');
    expect(normalizePlate(null)).toBe('');
  });
});

describe('GpsDeviceService.ingest', () => {
  it('returns unknown for an unregistered device and writes nothing', async () => {
    const { service, repo, gpsService } = build();
    expect(await service.ingest('999', pos())).toBe('unknown');
    expect(repo.update).not.toHaveBeenCalled();
    expect(gpsService.upload).not.toHaveBeenCalled();
  });

  it('returns disabled for a disabled device', async () => {
    const { service } = build({ device: { id: 'dev1', deviceNo: '51160004464', enabled: false } });
    expect(await service.ingest('051160004464', pos())).toBe('disabled');
  });

  it('stores the point on the in-progress task whose plate matches (case/space-insensitive)', async () => {
    const { service, repo, gpsService } = build();
    expect(await service.ingest('051160004464', pos())).toBe('stored');
    expect(gpsService.upload).toHaveBeenCalledWith('d1', 't1', expect.objectContaining({
      latitude: -36.8485, longitude: 174.7633, speed: 42.5, heading: 90,
      timestamp: new Date('2026-09-14T03:00:00.000Z'), source: 'device',
    }));
    expect(repo.update).toHaveBeenCalledWith('dev1', expect.objectContaining({
      lastLatitude: -36.8485, lastLongitude: 174.7633, lastSpeed: 42.5, lastTaskId: 't1',
      batteryPercent: 88, externalPower: true, signalPercent: 70,
    }));
  });

  it('returns no_task when no in-progress task carries that plate, but still updates device state', async () => {
    const { service, repo, gpsService } = build({ tasks: [{ id: 't9', driverId: 'd9', vehiclePlate: 'ZZZ999', updatedAt: new Date() }] });
    expect(await service.ingest('51160004464', pos())).toBe('no_task');
    expect(gpsService.upload).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('dev1', expect.objectContaining({ lastLatitude: -36.8485 }));
  });

  it('ignores points without a GPS fix or with 0,0 / out-of-range coordinates (keeps liveness + battery)', async () => {
    const { service, repo, gpsService } = build();
    expect(await service.ingest('51160004464', pos({ fixed: false }))).toBe('no_fix');
    expect(await service.ingest('51160004464', pos({ latitude: 0, longitude: 0 }))).toBe('no_fix');
    expect(await service.ingest('51160004464', pos({ latitude: 95 }))).toBe('no_fix');
    expect(gpsService.upload).not.toHaveBeenCalled();
    const patch: any = (repo.update.mock.calls[0] as any)[1];
    expect(patch.lastSeenAt).toBeInstanceOf(Date);
    expect(patch.batteryPercent).toBe(88);
    expect(patch.lastLatitude).toBeUndefined();
  });

  it('replaces an obviously wrong device clock (unsynced / far future) with server time', async () => {
    const { service, gpsService } = build();
    const before = Date.now();
    await service.ingest('51160004464', pos({ time: new Date('2000-01-01T00:00:00Z') }));
    await service.ingest('51160004464', pos({ time: new Date(Date.now() + 3600 * 1000) }));
    for (const call of gpsService.upload.mock.calls) {
      const ts: Date = (call as any)[2].timestamp;
      expect(ts.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(ts.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('keeps a legitimately old blind-zone backfill timestamp (hours old)', async () => {
    const { service, gpsService } = build();
    const old = new Date(Date.now() - 6 * 3600 * 1000);
    await service.ingest('51160004464', pos({ time: old }), { batch: true });
    expect((gpsService.upload.mock.calls[0] as any)[2].timestamp).toEqual(old);
  });

  it('caches device and task lookups and drops them on invalidate()', async () => {
    const { service, repo, taskRepo } = build();
    await service.ingest('51160004464', pos());
    await service.ingest('51160004464', pos());
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(taskRepo.find).toHaveBeenCalledTimes(1);
    expect(taskRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: TaskStatus.IN_PROGRESS } }));
    service.invalidate('051160004464');
    await service.ingest('51160004464', pos());
    expect(repo.findOne).toHaveBeenCalledTimes(2);
    expect(taskRepo.find).toHaveBeenCalledTimes(2);
  });

  it('picks the most recently updated task when two in-progress tasks share a plate', async () => {
    const { service, gpsService } = build({ tasks: [
      { id: 'newer', driverId: 'd2', vehiclePlate: 'ABC123', updatedAt: new Date('2026-09-14T02:00:00Z') },
      { id: 'older', driverId: 'd1', vehiclePlate: 'ABC123', updatedAt: new Date('2026-09-13T02:00:00Z') },
    ] });
    await service.ingest('51160004464', pos());
    const call: any = gpsService.upload.mock.calls[0];
    expect(call[0]).toBe('d2');
    expect(call[1]).toBe('newer');
  });
});

describe('GpsDeviceService.create / touch', () => {
  it('normalizes the device number and rejects non-numeric or duplicate numbers', async () => {
    const { service, repo } = build({ device: null });
    await expect(service.create({ deviceNo: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    const created = await service.create({ deviceNo: ' 0511-6000-4464 ', vehiclePlate: ' abc123 ', name: ' Truck 1 ' });
    expect(created).toMatchObject({ deviceNo: '51160004464', vehiclePlate: 'abc123', name: 'Truck 1', enabled: true });
    repo.findOne.mockResolvedValueOnce({ id: 'x', deviceNo: '51160004464' });
    await expect(service.create({ deviceNo: '51160004464' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('touch refreshes lastSeenAt (and battery when given) for known devices only', async () => {
    const { service, repo } = build();
    await service.touch('051160004464', { batteryPercent: 40 });
    expect(repo.update).toHaveBeenCalledWith('dev1', expect.objectContaining({ batteryPercent: 40, lastSeenAt: expect.any(Date) }));
    repo.update.mockClear();
    await service.touch('1');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
