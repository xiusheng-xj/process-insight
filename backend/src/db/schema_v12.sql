-- ============================================================
-- schema_v12.sql
-- 案件情報追加項目（書類A最新版提出日・リピート/新規）
-- ============================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS doc_a_latest_submit_date DATE,
    ADD COLUMN IF NOT EXISTS project_type             VARCHAR(20);

COMMENT ON COLUMN projects.doc_a_latest_submit_date IS '書類A 最新版提出日';
COMMENT ON COLUMN projects.project_type             IS 'リピート/新規（繰返/設計）';

COMMIT;
