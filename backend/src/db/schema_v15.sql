BEGIN;

-- ── project_events: sort_order / is_custom / deleted_at 追加 ──────────
ALTER TABLE project_events
    ADD COLUMN IF NOT EXISTS sort_order INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_custom  BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 既存レコードの sort_order を event_master.sort_order で初期化
-- event_master がないもの（手動作成）は 999
UPDATE project_events pe
SET    sort_order = COALESCE(
           (SELECT em.sort_order FROM event_master em WHERE em.id = pe.event_master_id),
           999
       );

-- event_master_id が NULL = 手動作成イベント → is_custom = TRUE
UPDATE project_events
SET    is_custom = TRUE
WHERE  event_master_id IS NULL;

COMMENT ON COLUMN project_events.sort_order IS '表示順（パターン由来=mpe.sort_order, カスタム=末尾）';
COMMENT ON COLUMN project_events.is_custom  IS 'TRUE=案件固有イベント（パターン再適用時も保持）';
COMMENT ON COLUMN project_events.deleted_at IS '論理削除日時（復元は v1.9 で実装）';

-- ── project_events_archive: sort_order / is_custom 追加 ──────────────
ALTER TABLE project_events_archive
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_custom  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN project_events_archive.sort_order IS '退避時点の sort_order';
COMMENT ON COLUMN project_events_archive.is_custom  IS '退避時点の is_custom フラグ';

COMMIT;
