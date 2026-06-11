-- ============================================================
-- schema_v6.sql
-- project_events_archive テーブル追加
-- テンプレート再適用時の実績データ消失防止
-- ============================================================
-- 設計方針:
--   - project_events を DELETE する前に全行をここへコピーする
--   - actual_date あり/なし 両方を退避する（データは全量保護）
--   - 外部キー参照は持たない（元テーブル削除後も参照できるよう）
--   - GENERATED 列 (diff_days) は通常の INTEGER として保持
-- ============================================================

CREATE TABLE IF NOT EXISTS project_events_archive (
    id                  SERIAL        PRIMARY KEY,

    -- 元レコードの参照情報
    source_project_id   INTEGER       NOT NULL,
    source_event_id     INTEGER,
    source_event_code   VARCHAR(100),
    source_event_name   VARCHAR(255)  NOT NULL,

    -- project_events の主要カラムをそのまま保持
    event_type          VARCHAR(100),
    plan_date           DATE,
    actual_date         DATE,
    actual_date_prev1   DATE,
    actual_date_prev2   DATE,
    diff_days           INTEGER,
    status              VARCHAR(50),
    owner_department    VARCHAR(100),
    updated_by          VARCHAR(100),
    event_master_id     INTEGER,

    -- 退避メタデータ
    archived_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    archived_reason     VARCHAR(100)  NOT NULL DEFAULT 'template_reapply',
    archived_by         VARCHAR(100)
);

COMMENT ON TABLE project_events_archive                    IS '工程イベント退避テーブル：テンプレート再適用前に自動退避される';
COMMENT ON COLUMN project_events_archive.source_event_id   IS '元 project_events.id（削除後も追跡用）';
COMMENT ON COLUMN project_events_archive.source_event_code IS '元 event_master.event_code（非正規化コピー）';
COMMENT ON COLUMN project_events_archive.archived_reason   IS '退避理由: template_reapply / manual など';
COMMENT ON COLUMN project_events_archive.archived_by       IS '退避を実行したユーザー名（x-user-name ヘッダー）';

CREATE INDEX IF NOT EXISTS idx_archive_source_project ON project_events_archive(source_project_id);
CREATE INDEX IF NOT EXISTS idx_archive_archived_at    ON project_events_archive(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_actual_date    ON project_events_archive(actual_date) WHERE actual_date IS NOT NULL;
