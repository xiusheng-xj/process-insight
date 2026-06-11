-- ============================================================
-- process_schedule DB スキーマ定義
-- ============================================================

-- 案件テーブル
CREATE TABLE IF NOT EXISTS projects (
    id           SERIAL PRIMARY KEY,
    project_no   VARCHAR(50)  NOT NULL UNIQUE,
    pattern_no   VARCHAR(50),
    machine_type VARCHAR(100),
    project_name VARCHAR(255) NOT NULL,
    product_name VARCHAR(255),
    quantity     INTEGER      DEFAULT 0,
    status       VARCHAR(50)  NOT NULL DEFAULT 'active',
    comment      TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- イベントテーブル
CREATE TABLE IF NOT EXISTS project_events (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER      NOT NULL,
    event_type       VARCHAR(100) NOT NULL,
    event_name       VARCHAR(255) NOT NULL,
    plan_date        DATE,
    actual_date      DATE,
    diff_days        INTEGER      GENERATED ALWAYS AS (
                         CASE
                             WHEN actual_date IS NOT NULL AND plan_date IS NOT NULL
                             THEN (actual_date - plan_date)
                             ELSE NULL
                         END
                     ) STORED,
    status           VARCHAR(50)  NOT NULL DEFAULT 'pending',
    owner_department VARCHAR(100),
    updated_by       VARCHAR(100),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_events_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- アラートテーブル
CREATE TABLE IF NOT EXISTS project_alerts (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER      NOT NULL,
    event_id    INTEGER,
    alert_type  VARCHAR(100) NOT NULL,
    severity    VARCHAR(20)  NOT NULL DEFAULT 'warning',  -- info / warning / critical
    message     TEXT         NOT NULL,
    is_resolved BOOLEAN      NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_alerts_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_alerts_event
        FOREIGN KEY (event_id)
        REFERENCES project_events(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- 編集ロックテーブル
CREATE TABLE IF NOT EXISTS project_locks (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER      NOT NULL UNIQUE,
    locked_by   VARCHAR(100) NOT NULL,
    locked_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
    lock_status VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active / released / expired

    CONSTRAINT fk_locks_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================================
-- インデックス定義
-- ============================================================

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_project_no  ON projects(project_no);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at  ON projects(updated_at DESC);

-- project_events
CREATE INDEX IF NOT EXISTS idx_events_project_id    ON project_events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_status        ON project_events(status);
CREATE INDEX IF NOT EXISTS idx_events_plan_date     ON project_events(plan_date);
CREATE INDEX IF NOT EXISTS idx_events_event_type    ON project_events(event_type);

-- project_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_project_id    ON project_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_resolved   ON project_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_severity      ON project_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at    ON project_alerts(created_at DESC);

-- project_locks
CREATE INDEX IF NOT EXISTS idx_locks_project_id     ON project_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_locks_lock_status    ON project_locks(lock_status);
CREATE INDEX IF NOT EXISTS idx_locks_expires_at     ON project_locks(expires_at);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_projects
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_events
    BEFORE UPDATE ON project_events
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
