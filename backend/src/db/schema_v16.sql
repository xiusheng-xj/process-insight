-- schema_v16.sql
-- event_master に department_code 列を追加
-- 本番DBに直接 ALTER された内容を migration として記録
ALTER TABLE event_master
    ADD COLUMN IF NOT EXISTS department_code VARCHAR(20);
