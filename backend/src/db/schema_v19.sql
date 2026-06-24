-- schema_v19.sql
-- 変更内容: project_events に notes 列を追加（マイグレーション欠落の解消）
-- 適用日: 2026-06-25
-- 背景: backend/src/routes/events.js は project_events.notes を読み書きしているが、
--       schema.sql〜schema_v18.sql に notes 列の定義が無く、新規DBを
--       マイグレーションから構築すると events 作成/更新が失敗していた。
--       既存（ライブ）DB には既に notes 列が存在するため IF NOT EXISTS で安全に追加する。
-- 影響: 既存データ・API/UI挙動・seed/demo は不変（列追加のみ・nullable）。

BEGIN;

ALTER TABLE project_events
    ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN project_events.notes IS '工程の補足コメント（自由記述・NULL可）';

COMMIT;
