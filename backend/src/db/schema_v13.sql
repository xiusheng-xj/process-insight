-- ============================================================
-- schema_v13.sql
-- アラーム確認者カラム + アラート設定テーブル
-- ============================================================

BEGIN;

ALTER TABLE project_alerts
    ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100);

COMMENT ON COLUMN project_alerts.resolved_by IS 'アラーム確認者';

CREATE TABLE IF NOT EXISTS alert_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT         NOT NULL,
    description VARCHAR(255)
);

INSERT INTO alert_settings (key, value, description) VALUES
    ('event_delay_enabled',             'true', 'イベント遅延アラート有効/無効'),
    ('schedule_missing_days',           '3',    '予定未登録（案件登録後N日）'),
    ('required_delivery_missing_days',  '3',    '要求納期未入力（案件登録後N日）'),
    ('confirmed_delivery_missing_days', '5',    '確定納期未入力（案件登録後N日）')
ON CONFLICT (key) DO NOTHING;

COMMIT;
