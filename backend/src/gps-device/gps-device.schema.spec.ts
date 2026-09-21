import { Logger } from '@nestjs/common';
import { GpsDeviceSchemaGuard, GPS_DEVICE_DDL } from './gps-device.schema';

/**
 * 按 SQL 文本响应，而不是按调用顺序：DDL 语句增减时测试不会跟着碎掉。
 */
function guardWith(opts: { columnOk?: boolean; tableOk?: boolean; ddlFails?: boolean | number } = {}) {
  const { columnOk = true, tableOk = true, ddlFails = false } = opts;
  let ddlCalls = 0;
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('information_schema.columns')) return [{ ok: columnOk }];
    if (sql.includes('information_schema.tables')) return [{ ok: tableOk }];
    ddlCalls++;
    const shouldFail = ddlFails === true || (typeof ddlFails === 'number' && ddlCalls === ddlFails);
    if (shouldFail) throw new Error('permission denied');
    return undefined;
  });
  return { guard: new GpsDeviceSchemaGuard({ query } as any), query };
}

describe('GpsDeviceSchemaGuard', () => {
  beforeAll(() => { Logger.overrideLogger(false); });

  it('runs every DDL statement and then verifies the result', async () => {
    const { guard, query } = guardWith();
    await guard.ensureSchema();
    const executed = query.mock.calls.map((c) => c[0]);
    for (const ddl of GPS_DEVICE_DDL) expect(executed).toContain(ddl);
    expect(executed.filter((s) => s.includes('information_schema'))).toHaveLength(2);
  });

  it('sets a lock timeout before altering gps_logs (a long reader must not hang the boot)', () => {
    expect(GPS_DEVICE_DDL[0]).toMatch(/lock_timeout/);
    expect(GPS_DEVICE_DDL.findIndex((s) => s.includes('ALTER TABLE gps_logs'))).toBeGreaterThan(0);
  });

  it('enables row level security on gps_devices, matching the SQL migration', () => {
    expect(GPS_DEVICE_DDL.some((s) => /gps_devices ENABLE ROW LEVEL SECURITY/.test(s))).toBe(true);
  });

  it('keeps going after one statement fails, as long as the schema ends up valid', async () => {
    const { guard, query } = guardWith({ ddlFails: 1 });
    await expect(guard.ensureSchema()).resolves.toBeUndefined();
    // 第一条失败不应该跳过后面的建表
    expect(query.mock.calls.map((c) => c[0])).toContain(
      GPS_DEVICE_DDL.find((s) => s.includes('CREATE TABLE')),
    );
  });

  it('REFUSES TO START when gps_logs.source is missing (otherwise every GPS upload breaks silently)', async () => {
    const { guard } = guardWith({ ddlFails: true, columnOk: false });
    await expect(guard.ensureSchema()).rejects.toThrow(/gps_logs\.source is missing[\s\S]*2026-09-14_gps_devices\.sql/);
  });

  it('refuses to start when the gps_devices table is missing', async () => {
    const { guard } = guardWith({ tableOk: false });
    await expect(guard.ensureSchema()).rejects.toThrow(/gps_devices table is missing/);
  });

  it('onModuleInit propagates the failure so the deploy fails instead of booting broken', async () => {
    const { guard } = guardWith({ columnOk: false });
    await expect(guard.onModuleInit()).rejects.toThrow();
  });
});
