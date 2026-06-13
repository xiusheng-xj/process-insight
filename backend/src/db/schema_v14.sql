BEGIN;
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_reason TEXT,
    ADD COLUMN IF NOT EXISTS deleted_by     VARCHAR(100);
COMMENT ON COLUMN projects.deleted_at     IS '論理削除日時';
COMMENT ON COLUMN projects.deleted_reason IS '削除理由';
COMMENT ON COLUMN projects.deleted_by     IS '削除者（将来の管理者完全削除用）';
COMMIT;
