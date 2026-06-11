-- ============================================================
-- schema_v3.sql
-- 3世代実績日・delivery_status・project_members・project_attributes
-- ============================================================

-- ============================================================
-- 1. project_events: 3世代実績日列を追加
-- ============================================================
-- actual_date       : 最新実績日（既存列）
-- actual_date_prev1 : 1世代前の実績日
-- actual_date_prev2 : 2世代前の実績日
--
-- 更新ルール（API 側で実装）:
--   新しい actual_date を書き込む際
--     prev2 ← prev1, prev1 ← actual_date, actual_date ← 新値
--   actual_date を NULL にする場合はシフトしない（履歴そのまま保持）

ALTER TABLE project_events
    ADD COLUMN IF NOT EXISTS actual_date_prev1  DATE,
    ADD COLUMN IF NOT EXISTS actual_date_prev2  DATE;

COMMENT ON COLUMN project_events.actual_date_prev1 IS '1世代前の実績日（actual_date 更新時に旧値を自動格納）';
COMMENT ON COLUMN project_events.actual_date_prev2 IS '2世代前の実績日（actual_date_prev1 更新時に旧値を自動格納）';

-- ============================================================
-- 2. projects: 納品ステータス列を追加
-- ============================================================
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) NOT NULL DEFAULT 'not_delivered';

-- CHECK 制約は別途 ADD CONSTRAINT で追加（列追加後に設定するため）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'projects' AND constraint_name = 'chk_projects_delivery_status'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT chk_projects_delivery_status
            CHECK (delivery_status IN ('not_delivered','in_transit','delivered','accepted'));
    END IF;
END
$$;

COMMENT ON COLUMN projects.delivery_status IS '納品ステータス: not_delivered=未納品 / in_transit=輸送中 / delivered=納品済 / accepted=検収済';

-- ============================================================
-- 3. project_members: 案件メンバー管理テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL,
    user_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(100),                -- 例: PM / 設計担当 / 品証担当
    department    VARCHAR(100),
    is_lead       BOOLEAN      NOT NULL DEFAULT FALSE,
    note          TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pmem_project
        FOREIGN KEY (project_id) REFERENCES projects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_pmem_project_user
        UNIQUE (project_id, user_name)
);

COMMENT ON TABLE  project_members             IS '案件メンバー：案件に関与する担当者一覧';
COMMENT ON COLUMN project_members.is_lead     IS 'プロジェクトリーダーフラグ';
COMMENT ON COLUMN project_members.role        IS '担当役割（例: PM / 設計担当 / 品証担当）';

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_name  ON project_members(user_name);

CREATE OR REPLACE TRIGGER set_updated_at_project_members
    BEFORE UPDATE ON project_members
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 4. project_attributes: 案件属性（EAV パターン）
-- ============================================================
-- 固定スキーマに収まらない案件固有の属性を格納する
--
-- 想定 attr_key 例:
--   kk_date            DATE    KK日（設計起工日）
--   contract_date      DATE    契約日
--   management_no_a    text    管理番号A
--   management_no_b    text    管理番号B
--   management_no_c    text    管理番号C
--   management_no_d    text    管理番号D
--   management_no_e    text    管理番号E
--   management_no_f    text    管理番号F
--
-- 正式な attr_key 名称は業務確認後に確定する

CREATE TABLE IF NOT EXISTS project_attributes (
    id            SERIAL       PRIMARY KEY,
    project_id    INTEGER      NOT NULL,
    attr_key      VARCHAR(100) NOT NULL,
    attr_value    TEXT,
    attr_type     VARCHAR(20)  NOT NULL DEFAULT 'text',  -- text / date / number / boolean
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pattr_project
        FOREIGN KEY (project_id) REFERENCES projects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_pattr_project_key
        UNIQUE (project_id, attr_key),

    CONSTRAINT chk_pattr_type
        CHECK (attr_type IN ('text', 'date', 'number', 'boolean'))
);

COMMENT ON TABLE  project_attributes           IS '案件属性（EAV）：固定スキーマに収まらない案件固有の属性値';
COMMENT ON COLUMN project_attributes.attr_key  IS '属性キー（例: kk_date / management_no_a）';
COMMENT ON COLUMN project_attributes.attr_type IS 'text / date / number / boolean';

CREATE INDEX IF NOT EXISTS idx_project_attributes_project ON project_attributes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_attributes_key     ON project_attributes(project_id, attr_key);

CREATE OR REPLACE TRIGGER set_updated_at_project_attributes
    BEFORE UPDATE ON project_attributes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 5. event_master: 20工程へ拡張（仮登録）
-- ============================================================
-- 既存12工程はそのまま保持し、新規8工程を追加して計20工程とする
-- 正式部門名・KK日の定義・管理番号の意味は業務確認後に更新すること

INSERT INTO event_master (event_code, event_name, event_type, owner_department, standard_lead_days, sort_order)
VALUES
    -- 既存12工程（ON CONFLICT DO NOTHING でスキップ）
    ('ORDER_CONFIRM',       '受注確定',           'other',         '営業部',   0,   10),
    ('BASIC_DESIGN',        '基本設計完了',        'design',        '設計部',   14,  20),
    ('DETAIL_DESIGN',       '詳細設計完了',        'design',        '設計部',   21,  30),
    ('DESIGN_REVIEW',       '設計レビュー完了',    'design',        '設計部',   7,   40),
    ('PARTS_ORDER',         '部品発注',            'manufacturing', '調達部',   3,   50),
    ('PARTS_ARRIVAL',       '部品入庫',            'manufacturing', '調達部',   30,  60),
    ('ASSEMBLY_START',      '組立開始',            'manufacturing', '製造部',   0,   70),
    ('ASSEMBLY_COMPLETE',   '組立完了',            'manufacturing', '製造部',   20,  80),
    ('FACTORY_TEST',        '社内試験（FAT）完了', 'inspection',    '品証部',   10,  90),
    ('SHIPMENT',            '出荷',                'delivery',      '物流部',   3,   100),
    ('SITE_INSTALL',        '現地据付完了',        'delivery',      '工事部',   14,  110),
    ('ACCEPTANCE',          '検収完了',            'delivery',      '営業部',   7,   120),

    -- 新規8工程（仮登録 ─ 部門名・内容は後で業務確認）
    ('SPEC_CONFIRM',        '仕様確定',            'design',        '設計部',   5,   15),
    ('KK_DATE',             'KK日（設計起工）',    'design',        '設計部',   3,   18),
    ('DRAWING_APPROVAL',    '図面承認',            'design',        '品証部',   7,   45),
    ('MATERIAL_ORDER',      '材料発注',            'manufacturing', '調達部',   3,   53),
    ('WIRING_COMPLETE',     '配線完了',            'manufacturing', '製造部',   10,  83),
    ('CUSTOMER_INSPECTION', '客先立会検査完了',    'inspection',    '品証部',   5,   93),
    ('SHIPPING_READY',      '出荷準備完了',        'delivery',      '物流部',   2,   107),
    ('SITE_TEST',           '現地試験完了',        'delivery',      '工事部',   7,   123)
ON CONFLICT (event_code) DO NOTHING;
