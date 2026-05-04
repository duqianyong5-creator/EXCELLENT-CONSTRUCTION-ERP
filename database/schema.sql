-- ============================================================
-- 货车司机调度与管理系统 - 数据库结构
-- PostgreSQL 15+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- 可选，用于地理空间查询

-- ============================================================
-- ENUM 类型
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'dispatcher', 'driver', 'client');
CREATE TYPE user_status AS ENUM ('pending', 'active', 'rejected', 'disabled');
CREATE TYPE task_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE anomaly_type AS ENUM ('gps_disconnect', 'speed_anomaly', 'teleport', 'time_inconsistency');

-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE users (
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
CREATE TABLE tasks (
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
CREATE TABLE gps_logs (
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

CREATE INDEX idx_gps_logs_driver_task ON gps_logs(driver_id, task_id);
CREATE INDEX idx_gps_logs_timestamp ON gps_logs(timestamp DESC);

-- ============================================================
-- 工作记录表
-- ============================================================
CREATE TABLE work_records (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id         UUID NOT NULL REFERENCES users(id),
    task_id           UUID NOT NULL REFERENCES tasks(id),
    start_time        TIMESTAMPTZ,
    end_time          TIMESTAMPTZ,
    system_duration   INTEGER DEFAULT 0,   -- 分钟
    gps_duration      INTEGER DEFAULT 0,   -- 分钟
    final_duration    INTEGER DEFAULT 0,   -- 分钟（含调整）
    adjustment_time   INTEGER DEFAULT 0,   -- 分钟
    image_urls        TEXT[],
    completion_notes  TEXT,
    anomaly_flag      BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 工时调整日志
-- ============================================================
CREATE TABLE adjustment_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id     UUID NOT NULL REFERENCES users(id),
    task_id       UUID NOT NULL REFERENCES tasks(id),
    work_record_id UUID REFERENCES work_records(id),
    added_minutes INTEGER NOT NULL,
    reason        TEXT,
    operator_id   UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GPS 异常记录
-- ============================================================
CREATE TABLE gps_anomalies (
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
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    title       VARCHAR(256) NOT NULL,
    content     TEXT NOT NULL,
    type        VARCHAR(64),
    is_read     BOOLEAN DEFAULT FALSE,
    meta        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_work_records_updated_at
    BEFORE UPDATE ON work_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 初始管理员账户（密码: Admin@123456，请上线后立即修改）
-- bcrypt hash of 'Admin@123456'
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
);
