-- schema_v20.sql
-- 変更内容: 工程計画レビュー（Process Planning Review）基盤
--           review_rules / review_snapshots / review_findings を追加
-- 適用日: 2026-06-25
-- 方針: 工程計画レビューは複数の Rule を走らせ、項目別判定＋総合判定を返す仕組み。
--       Phase 3 はライブ評価（GET /review）まで実装。snapshots/findings への
--       永続化は将来 Phase で実装するが、KPI Insight 接続を見据えてテーブルは先に用意する。
--       project_events 等の既存テーブルは変更しない（既存API/seed/demo 互換）。

BEGIN;

-- ============================================================
-- 1. review_rules（レビュー項目カタログ）
-- ============================================================
-- Rule-001〜008 を登録。is_enabled で有効/無効を管理（将来の管理者モードのトグル先）。
CREATE TABLE IF NOT EXISTS review_rules (
    id          SERIAL       PRIMARY KEY,
    rule_code   VARCHAR(20)  NOT NULL UNIQUE,   -- 'RULE-001'
    rule_name   VARCHAR(255) NOT NULL,          -- 'Resource重複'
    category    VARCHAR(50)  NOT NULL DEFAULT 'resource',
    description TEXT,
    is_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  review_rules            IS '工程計画レビュー：レビュー項目カタログ';
COMMENT ON COLUMN review_rules.is_enabled IS 'TRUE=評価実行対象（将来は管理者モードで切替）';

-- ============================================================
-- 2. review_snapshots（レビュー実行スナップショット）
-- ============================================================
-- 1回のレビュー実行＝1スナップショット。KPI 時系列・監査の単位。
-- ※ Phase 3 では未書込（GET /review はライブ評価）。将来 POST /snapshots で利用。
CREATE TABLE IF NOT EXISTS review_snapshots (
    id               SERIAL       PRIMARY KEY,
    project_id       INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    overall_verdict  VARCHAR(10)  NOT NULL,      -- ok / caution / adjust
    overall_severity INTEGER      NOT NULL DEFAULT 0,
    trigger_source   VARCHAR(20)  NOT NULL DEFAULT 'manual',  -- manual / on_edit / on_confirm
    reviewed_by      VARCHAR(100),
    reviewed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_review_snap_verdict CHECK (overall_verdict IN ('ok','caution','adjust'))
);

COMMENT ON TABLE review_snapshots IS '工程計画レビュー：レビュー実行スナップショット（KPI時系列・監査）';

-- ============================================================
-- 3. review_findings（レビュー明細：Rule×対象工程ごとの判定）
-- ============================================================
-- detail_json に KPI 用の数値メトリクスを保持し、Rule 追加時のスキーマ変更を不要にする。
CREATE TABLE IF NOT EXISTS review_findings (
    id          SERIAL       PRIMARY KEY,
    snapshot_id INTEGER      NOT NULL REFERENCES review_snapshots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    rule_code   VARCHAR(20)  NOT NULL,
    target_type VARCHAR(20)  NOT NULL DEFAULT 'event',  -- event（将来 step 等）
    target_id   INTEGER,
    verdict     VARCHAR(10)  NOT NULL,                  -- ok / caution / adjust
    severity    INTEGER      NOT NULL DEFAULT 0,
    message     TEXT,
    detail_json JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_review_find_verdict CHECK (verdict IN ('ok','caution','adjust'))
);

COMMENT ON TABLE  review_findings             IS '工程計画レビュー：Rule×対象工程ごとの判定明細';
COMMENT ON COLUMN review_findings.detail_json IS 'Rule固有のKPI数値（count/capacity/over_by/conflict_project_nos 等）';

-- ============================================================
-- 4. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_review_snap_project ON review_snapshots(project_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_find_snap    ON review_findings(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_review_find_rule    ON review_findings(rule_code, verdict);

-- ============================================================
-- 5. updated_at トリガー（既存関数を流用）
-- ============================================================
CREATE OR REPLACE TRIGGER set_updated_at_review_rules
    BEFORE UPDATE ON review_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
