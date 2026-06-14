-- schema_v17.sql
-- 工程パターン管理テーブル群を追加
-- 本番DBに直接作成された内容を migration として記録

-- 工程パターン
CREATE TABLE IF NOT EXISTS process_pattern (
    id           SERIAL PRIMARY KEY,
    pattern_code VARCHAR(100) NOT NULL,
    pattern_name VARCHAR(255) NOT NULL,
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_process_pattern_code_active
    ON process_pattern (pattern_code) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_process_pattern_name_active
    ON process_pattern (pattern_name) WHERE deleted_at IS NULL;

-- 工程パターンのステップ定義
CREATE TABLE IF NOT EXISTS process_pattern_steps (
    id                  SERIAL PRIMARY KEY,
    process_pattern_id  INTEGER NOT NULL
        REFERENCES process_pattern(id) ON DELETE CASCADE,
    process_name        VARCHAR(255) NOT NULL,
    department_code     VARCHAR(20),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    offset_days         INTEGER NOT NULL DEFAULT 0,
    offset_base         VARCHAR(50) NOT NULL DEFAULT 'parent_event',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 案件の工程ステップ（適用後の実データ）
CREATE TABLE IF NOT EXISTS project_process_steps (
    id                  SERIAL PRIMARY KEY,
    project_id          INTEGER NOT NULL
        REFERENCES projects(id),
    parent_event_id     INTEGER
        REFERENCES project_events(id),
    process_pattern_id  INTEGER
        REFERENCES process_pattern(id),
    applied_pattern_id  INTEGER
        REFERENCES process_pattern(id),
    process_name        VARCHAR(255) NOT NULL,
    department_code     VARCHAR(20),
    plan_date           DATE,
    actual_date         DATE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    offset_days         INTEGER DEFAULT 0,
    offset_base         VARCHAR(50) DEFAULT 'parent_event',
    source              VARCHAR(50) DEFAULT 'custom',
    is_custom           BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 工程ステップの実績履歴
CREATE TABLE IF NOT EXISTS project_process_step_actuals (
    id                       BIGSERIAL PRIMARY KEY,
    project_process_step_id  BIGINT NOT NULL
        REFERENCES project_process_steps(id),
    actual_date              DATE NOT NULL,
    registered_by            VARCHAR(255),
    registered_at            TIMESTAMP DEFAULT now(),
    notes                    TEXT,
    deleted_at               TIMESTAMP,
    created_at               TIMESTAMP DEFAULT now()
);
