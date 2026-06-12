-- ============================================================
-- schema_v10.sql
-- 価格カラムを概算・確定の2カラムに分割
-- ============================================================
-- 旧 price_type / price_amount は物理削除しない（データ保全）
-- ============================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS final_price     NUMERIC(15,2);

COMMENT ON COLUMN projects.estimated_price IS '概算価格';
COMMENT ON COLUMN projects.final_price     IS '確定価格';

COMMIT;
