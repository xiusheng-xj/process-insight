-- schema_v21.sql
-- 変更内容: project_process_steps に location_id / resource_id を追加
-- 適用日: 2026-06-26
-- 背景: 実際にユーザーが編集するのは工程ステップ（project_process_steps）の画面のため、
--       ロケーション/リソースを工程ステップ側で保持する。
--       project_events 側の location_id / resource_id は互換維持のため残す（schema_v18）。
-- 後方互換: 追加列は nullable・FK は ON DELETE SET NULL（マスタ削除で工程ステップ行を壊さない）。

BEGIN;

ALTER TABLE project_process_steps
    ADD COLUMN IF NOT EXISTS location_id INTEGER
        REFERENCES locations(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS resource_id INTEGER
        REFERENCES resources(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN project_process_steps.location_id IS '工程ステップの場所（NULL=未設定。resource選択時 home_location から補完可）';
COMMENT ON COLUMN project_process_steps.resource_id IS '工程ステップが使用する設備/能力枠（将来の重複検出キー）';

-- 索引（参照・将来の重複/キャパ検出 resource_id × plan_date の土台）
CREATE INDEX IF NOT EXISTS idx_pps_resource_id   ON project_process_steps(resource_id);
CREATE INDEX IF NOT EXISTS idx_pps_location_id   ON project_process_steps(location_id);
CREATE INDEX IF NOT EXISTS idx_pps_resource_plan ON project_process_steps(resource_id, plan_date);

COMMIT;
