-- ============================================================
-- schema_v9.sql
-- projects テーブルへ案件基本情報カラムを追加
-- ============================================================

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS owner_name              VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dept_a_owner            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dept_b_owner            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dept_c_owner            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS order_date              DATE,
    ADD COLUMN IF NOT EXISTS price_type              VARCHAR(20),
    ADD COLUMN IF NOT EXISTS price_amount            NUMERIC(15,0),
    ADD COLUMN IF NOT EXISTS required_delivery_date  DATE,
    ADD COLUMN IF NOT EXISTS promised_delivery_date  DATE,
    ADD COLUMN IF NOT EXISTS delivery_status         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS management_no_a         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_no_b         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_no_c         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_no_d         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_no_e         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_no_f         VARCHAR(100);

COMMENT ON COLUMN projects.owner_name              IS '自部門担当者';
COMMENT ON COLUMN projects.dept_a_owner            IS 'A部門担当者';
COMMENT ON COLUMN projects.dept_b_owner            IS 'B部門担当者';
COMMENT ON COLUMN projects.dept_c_owner            IS 'C部門担当者';
COMMENT ON COLUMN projects.order_date              IS '受注日';
COMMENT ON COLUMN projects.price_type              IS '価格種別（概算/確定）';
COMMENT ON COLUMN projects.price_amount            IS '価格（円）';
COMMENT ON COLUMN projects.required_delivery_date  IS '要求納期';
COMMENT ON COLUMN projects.promised_delivery_date  IS '回答納期';
COMMENT ON COLUMN projects.delivery_status         IS '納期調整状況（暫定/調整中/済み）';
COMMENT ON COLUMN projects.management_no_a         IS '管理番号A';
COMMENT ON COLUMN projects.management_no_b         IS '管理番号B';
COMMENT ON COLUMN projects.management_no_c         IS '管理番号C';
COMMENT ON COLUMN projects.management_no_d         IS '管理番号D';
COMMENT ON COLUMN projects.management_no_e         IS '管理番号E';
COMMENT ON COLUMN projects.management_no_f         IS '管理番号F';

-- delivery_status: 旧制約（not_delivered/in_transit/delivered/accepted）を廃止し
--   新値（暫定/調整中/済み）へ切り替え
ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_delivery_status;
ALTER TABLE projects ALTER COLUMN delivery_status DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN delivery_status DROP DEFAULT;
UPDATE projects
   SET delivery_status = NULL
 WHERE delivery_status IN ('not_delivered', 'in_transit', 'delivered', 'accepted');

COMMIT;
