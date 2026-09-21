import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 启动时自检并补齐车载定位器相关的表结构。
 *
 * 生产库 synchronize 是关闭的：如果先部署新代码、后执行 SQL 迁移，
 * gps_logs 少一个 source 列会让所有 GPS 上报与轨迹查询直接报错（地图全黑）。
 * 这里用幂等 DDL 在服务启动、开始对外提供接口之前补齐，消除上线顺序风险。
 * 已经执行过 database/migrations 的库，这些语句都是空操作。
 */
export const GPS_DEVICE_DDL: string[] = [
  // ALTER 需要 ACCESS EXCLUSIVE 锁：加超时，避免有长查询时把启动卡死
  `SET lock_timeout = '5s'`,
  `ALTER TABLE gps_logs ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'app'`,
  `CREATE TABLE IF NOT EXISTS gps_devices (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_no       VARCHAR(32) NOT NULL UNIQUE,
      vehicle_plate   VARCHAR(32),
      name            VARCHAR(128),
      enabled         BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at    TIMESTAMPTZ,
      last_latitude   DECIMAL(10, 7),
      last_longitude  DECIMAL(10, 7),
      last_speed      DECIMAL(6, 2),
      last_fix_at     TIMESTAMPTZ,
      battery_percent INT,
      external_power  BOOLEAN,
      signal_percent  INT,
      last_task_id    UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_gps_devices_plate ON gps_devices(vehicle_plate)`,
  // 与 database/migrations 里的脚本保持一致：两条路径不能建出安全属性不同的表
  `ALTER TABLE gps_devices ENABLE ROW LEVEL SECURITY`,
];

@Injectable()
export class GpsDeviceSchemaGuard implements OnModuleInit {
  private readonly logger = new Logger('GpsDeviceSchema');

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  /**
   * 注意这里是「失败就不启动」：gps_logs.source 一旦缺失，连手机 App 的定位上报也会全部报错，
   * 整个车队在地图上直接消失。与其带病上线，不如让这次部署失败、让 Railway 继续跑上一个正常版本。
   */
  async ensureSchema(): Promise<void> {
    const failures: string[] = [];
    for (const statement of GPS_DEVICE_DDL) {
      try {
        await this.dataSource.query(statement);
      } catch (e: any) {
        // 某一条失败不影响后面几条：表可能已存在、只是缺索引
        failures.push(e?.message || String(e));
      }
    }

    const [{ ok }] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'gps_logs' AND column_name = 'source'
       ) AS ok`,
    );
    if (!ok) {
      throw new Error(
        'gps_logs.source is missing and could not be created — run database/migrations/2026-09-14_gps_devices.sql '
        + `in the database, then redeploy. Details: ${failures.join(' | ') || 'no error reported'}`,
      );
    }

    const [{ ok: devicesOk }] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'gps_devices'
       ) AS ok`,
    );
    if (!devicesOk) {
      throw new Error(
        'gps_devices table is missing and could not be created — run database/migrations/2026-09-14_gps_devices.sql. '
        + `Details: ${failures.join(' | ') || 'no error reported'}`,
      );
    }

    if (failures.length) {
      this.logger.warn(`schema statements reported errors but the schema is valid: ${failures.join(' | ')}`);
    }
    this.logger.log('gps_devices / gps_logs.source schema verified');
  }
}
