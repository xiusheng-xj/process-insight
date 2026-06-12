-- ============================================================
-- schema_v11.sql
-- 確定納期カラム追加 + status 旧値の正規化
-- ============================================================
-- confirmed_delivery_date: 最終合意納期（完了判定に使用）
-- status '作業中'（旧Japanese値）→ 'active' に正規化
-- ============================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS confirmed_delivery_date DATE;

COMMENT ON COLUMN projects.confirmed_delivery_date IS '確定納期（最終合意日）';

UPDATE projects SET status = 'active' WHERE status = '作業中';

COMMIT;
