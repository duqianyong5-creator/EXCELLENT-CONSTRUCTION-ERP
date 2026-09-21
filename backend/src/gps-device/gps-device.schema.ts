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
];

@Injectable()
export class GpsDeviceSchemaGuard implements OnModuleInit {
  private readonly logger = new Logger('GpsDeviceSchema');

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  async ensureSchema(): Promise<void> {
    for (const statement of GPS_DEVICE_DDL) {
      try {
        await this.dataSource.query(statement);
      } catch (e: any) {
        // 不中断启动：可能是数据库账号没有 DDL 权限，此时需要人工执行 database/migrations 下的脚本
        this.logger.error(
          `Schema check failed, run database/migrations/2026-09-14_gps_devices.sql manually: ${e?.message || e}`,
        );
        return;
      }
    }
    this.logger.log('gps_devices / gps_logs.source schema verified');
  }
}
