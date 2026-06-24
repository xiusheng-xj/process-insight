-- schema_v18.sql
-- 変更内容: locations / resources マスタ追加、project_events に location_id / resource_id 追加
-- 適用日: 2026-06-25
-- 方針: 工程属性として「場所(location)」と「設備・能力枠(resource)」を分離保持する。
--       初期は project_events のみに付与。project_process_steps への展開は将来 vXX で追加予定。
--       後方互換: 追加列は nullable・FK は ON DELETE SET NULL（マスタ削除で工程行を壊さない）。

BEGIN;

-- ============================================================
-- 1. locations（場所マスタ）
-- ============================================================
-- 移動コスト・リードタイム・拠点偏りなどの KPI 分析に使用する「場所」。
-- 例: 埼玉工場 / 大阪工場 / 本社試験室 / 協力会社A / 海外拠点
CREATE TABLE IF NOT EXISTS locations (
    id            SERIAL       PRIMARY KEY,
    location_code VARCHAR(50)  NOT NULL UNIQUE,
    location_name VARCHAR(255) NOT NULL,
    location_type VARCHAR(30)  NOT NULL DEFAULT 'factory',
    region        VARCHAR(100),
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_locations_type CHECK (
        location_type IN ('factory','test_room','partner','overseas','hq','other')
    )
);

COMMENT ON TABLE  locations               IS '場所マスタ：移動コスト・LT・拠点偏りKPIに使用';
COMMENT ON COLUMN locations.location_type IS 'factory/test_room/partner/overseas/hq/other';

-- ============================================================
-- 2. resources（設備・ライン・能力枠マスタ）
-- ============================================================
-- 工程を実行する能力・設備。工程重複/キャパ検出（将来 Phase 3）の主キーになる。
-- 例: マシニングセンタ MC-01 / 恒温槽 / EMC試験室 / 組立ラインA / D部門 設計レビュー枠
CREATE TABLE IF NOT EXISTS resources (
    id               SERIAL       PRIMARY KEY,
    resource_code    VARCHAR(50)  NOT NULL UNIQUE,
    resource_name    VARCHAR(255) NOT NULL,
    resource_type    VARCHAR(30)  NOT NULL DEFAULT 'machine',
    home_location_id INTEGER      REFERENCES locations(id) ON DELETE SET NULL ON UPDATE CASCADE,
    department_code  VARCHAR(20),
    capacity         INTEGER      NOT NULL DEFAULT 1,
    sort_order       INTEGER      NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resources_type CHECK (
        resource_type IN ('machine','test_equipment','inspection','line','review_slot','other')
    ),
    CONSTRAINT chk_resources_capacity CHECK (capacity >= 1)
);

COMMENT ON TABLE  resources                  IS '設備・ライン・能力枠マスタ：工程重複/キャパ検出に使用';
COMMENT ON COLUMN resources.home_location_id IS '既定設置場所（project_events.location_id の自動補完元）';
COMMENT ON COLUMN resources.capacity         IS '同一日に並行実行可能な工程数（例: 設計レビュー枠=2）';
COMMENT ON COLUMN resources.department_code  IS '保有部門（event_master.department_code と整合: A/B/C/D/SELF 等）';

-- ============================================================
-- 3. project_events 追加列
-- ============================================================
ALTER TABLE project_events
    ADD COLUMN IF NOT EXISTS location_id INTEGER
        REFERENCES locations(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS resource_id INTEGER
        REFERENCES resources(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN project_events.location_id IS '工程の場所（NULL=未設定。resource選択時 home_location から補完可）';
COMMENT ON COLUMN project_events.resource_id IS '工程が使用する設備/能力枠（将来の重複検出キー）';

-- ============================================================
-- 4. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_events_resource_id      ON project_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_events_location_id      ON project_events(location_id);
-- 将来の重複/キャパ検出（resource_id × plan_date）の土台
CREATE INDEX IF NOT EXISTS idx_events_resource_plan    ON project_events(resource_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_resources_home_location ON resources(home_location_id);
CREATE INDEX IF NOT EXISTS idx_resources_department    ON resources(department_code);

-- ============================================================
-- 5. updated_at 自動更新トリガー（既存関数を流用）
-- ============================================================
CREATE OR REPLACE TRIGGER set_updated_at_locations
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_resources
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
