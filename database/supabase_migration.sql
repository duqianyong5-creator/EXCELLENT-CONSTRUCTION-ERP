-- ============================================================
-- 货车司机调度与管理系统 - Supabase 迁移脚本
-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- ============================================================

-- Supabase 默认已启用 uuid-ossp，无需手动启用
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- Supabase 已内置

-- ============================================================
-- ENUM 类型（先清理再创建，避免重复执行报错）
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'dispatcher', 'driver', 'client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'rejected', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE anomaly_type AS ENUM ('gps_disconnect', 'speed_anomaly', 'teleport', 'time_inconsistency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(64) UNIQUE NOT NULL,
    email       VARCHAR(128) UNIQUE NOT NULL,
    password    VARCHAR(256) NOT NULL,
    role        user_role NOT NULL DEFAULT 'driver',
    status      user_status NOT NULL DEFAULT 'pending',
    full_name   VARCHAR(128),
    phone       VARCHAR(32),
    avatar_url  VARCHAR(512),
    language    VARCHAR(8) DEFAULT 'zh',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id)
);

-- ============================================================
-- 任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID NOT NULL REFERENCES users(id),
    driver_id       UUID REFERENCES users(id),
    dispatcher_id   UUID REFERENCES users(id),
    title           VARCHAR(256) NOT NULL,
    start_location  VARCHAR(512) NOT NULL,
    end_location    VARCHAR(512) NOT NULL,
    start_lat       DECIMAL(10, 7),
    start_lng       DECIMAL(10, 7),
    end_lat         DECIMAL(10, 7),
    end_lng         DECIMAL(10, 7),
    cargo           TEXT,
    cargo_weight    DECIMAL(10, 2),
    scheduled_at    TIMESTAMPTZ,
    status          task_status NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GPS 轨迹日志
-- ============================================================
CREATE TABLE IF NOT EXISTS gps_logs (
    id          BIGSERIAL PRIMARY KEY,
    driver_id   UUID NOT NULL REFERENCES users(id),
    task_id     UUID REFERENCES tasks(id),
    latitude    DECIMAL(10, 7) NOT NULL,
    longitude   DECIMAL(10, 7) NOT NULL,
    speed       DECIMAL(6, 2) DEFAULT 0,
    heading     DECIMAL(5, 2),
    accuracy    DECIMAL(6, 2),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_anomaly  BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_driver_task ON gps_logs(driver_id, task_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_timestamp ON gps_logs(timestamp DESC);

-- ============================================================
-- 工作记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS work_records (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id         UUID NOT NULL REFERENCES users(id),
    task_id           UUID NOT NULL REFERENCES tasks(id),
    start_time        TIMESTAMPTZ,
    end_time          TIMESTAMPTZ,
    system_duration   INTEGER DEFAULT 0,
    gps_duration      INTEGER DEFAULT 0,
    final_duration    INTEGER DEFAULT 0,
    adjustment_time   INTEGER DEFAULT 0,
    image_urls        TEXT[],
    completion_notes  TEXT,
    anomaly_flag      BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 工时调整日志
-- ============================================================
CREATE TABLE IF NOT EXISTS adjustment_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id       UUID NOT NULL REFERENCES users(id),
    task_id         UUID NOT NULL REFERENCES tasks(id),
    work_record_id  UUID REFERENCES work_records(id),
    added_minutes   INTEGER NOT NULL,
    reason          TEXT,
    operator_id     UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GPS 异常记录
-- ============================================================
CREATE TABLE IF NOT EXISTS gps_anomalies (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id     UUID NOT NULL REFERENCES users(id),
    task_id       UUID REFERENCES tasks(id),
    anomaly_type  anomaly_type NOT NULL,
    description   TEXT,
    latitude      DECIMAL(10, 7),
    longitude     DECIMAL(10, 7),
    speed         DECIMAL(6, 2),
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved      BOOLEAN DEFAULT FALSE,
    resolved_at   TIMESTAMPTZ,
    resolved_by   UUID REFERENCES users(id)
);

-- ============================================================
-- 通知表
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    title       VARCHAR(256) NOT NULL,
    content     TEXT NOT NULL,
    type        VARCHAR(64),
    is_read     BOOLEAN DEFAULT FALSE,
    meta        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 使用 DO 块避免重复创建触发器（不触发 Supabase 破坏性操作警告）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
    CREATE TRIGGER trg_tasks_updated_at
      BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_work_records_updated_at') THEN
    CREATE TRIGGER trg_work_records_updated_at
      BEFORE UPDATE ON work_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ============================================================
-- Row Level Security（RLS）- Supabase 安全层
-- 注意：后端使用 Service Role Key 时自动绕过 RLS
-- ============================================================
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service Role 绕过所有 RLS（后端使用 service_role key 访问，无需额外策略）
-- 如需前端直连 Supabase（不推荐），需另配各表的 SELECT/INSERT/UPDATE 策略

-- ============================================================
-- 初始管理员账户
-- 密码: Admin@123456（bcrypt hash，上线后必须修改）
-- ============================================================
INSERT INTO users (username, email, password, role, status, full_name, approved_at)
VALUES (
    'admin',
    'admin@trucksystem.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGVJGYzqLgHh8FbP.RlVGHmVW2C',
    'admin',
    'active',
    '系统管理员',
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 完成！请在 Supabase Dashboard 中验证表是否已创建
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
