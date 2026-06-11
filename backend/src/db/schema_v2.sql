-- ============================================================
-- schema_v2.sql
-- イベントマスター / テンプレート テーブル追加
-- 既存テーブルへの列追加（マスター参照）
-- ============================================================

-- ============================================================
-- 1. event_master  （工程ステップの定義）
-- ============================================================
-- 「どんな工程ステップが存在するか」の辞書。
-- Excelの列見出しに相当するものを行で管理する。
--
-- event_code : システム内部の一意キー ("DESIGN_REVIEW", "FAT" など)
-- event_name : 画面表示名 ("設計レビュー完了" など)
-- event_type : 大分類 (design / manufacturing / inspection / delivery / other)
-- standard_lead_days : 前工程から本工程までの標準所要日数
--                      テンプレート適用時の予定日自動計算に使用
-- sort_order : マスター一覧の表示順（テンプレート内順序は template_events 側で管理）

CREATE TABLE IF NOT EXISTS event_master (
    id                  SERIAL       PRIMARY KEY,
    event_code          VARCHAR(100) NOT NULL UNIQUE,
    event_name          VARCHAR(255) NOT NULL,
    event_type          VARCHAR(50)  NOT NULL DEFAULT 'other',
    owner_department    VARCHAR(100),
    standard_lead_days  INTEGER      NOT NULL DEFAULT 0,
    description         TEXT,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_event_master_type CHECK (
        event_type IN ('design', 'manufacturing', 'inspection', 'delivery', 'other')
    )
);

COMMENT ON TABLE  event_master                    IS '工程マスター：工程ステップの定義辞書';
COMMENT ON COLUMN event_master.event_code         IS 'システム内部識別コード（英数字）';
COMMENT ON COLUMN event_master.standard_lead_days IS '前工程からの標準所要日数（テンプレート展開時に使用）';
COMMENT ON COLUMN event_master.sort_order         IS 'マスター一覧のデフォルト表示順';

-- ============================================================
-- 2. event_template  （テンプレートの器）
-- ============================================================
-- 「どの工程ステップをどの順で使うか」のセットを名前で管理する。
-- 機種や製品ラインごとに複数テンプレートを用意できる。
--
-- machine_type : 紐づく機種（NULL = 全機種共通）
--                projects.machine_type と突き合わせてテンプレート候補を絞り込む

CREATE TABLE IF NOT EXISTS event_template (
    id              SERIAL       PRIMARY KEY,
    template_code   VARCHAR(100) NOT NULL UNIQUE,
    template_name   VARCHAR(255) NOT NULL,
    machine_type    VARCHAR(100),
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  event_template              IS '工程テンプレート：工程ステップの組み合わせセット';
COMMENT ON COLUMN event_template.machine_type IS '対象機種（NULL=全機種共通）';

-- ============================================================
-- 3. template_events  （テンプレート ↔ イベントマスター 中間テーブル）
-- ============================================================
-- テンプレートを構成する工程ステップの一覧と順序・オフセットを定義する。
--
-- sort_order    : テンプレート内での表示順・展開順
-- offset_days   : 基準日（offset_base）からの日数
--                 例) sort_order=3, offset_base='project_start', offset_days=20
--                     → 案件開始日 + 20日が予定日
-- offset_base   : 'project_start' … 案件の開始日（projects.start_date、将来追加予定）
--                 'prev_event'    … 同テンプレート内の直前工程の予定日
-- is_milestone  : 重要工程フラグ（差異アラートの閾値を厳しくするなど将来使用）
-- is_required   : 必須フラグ（FALSEの工程は案件によって省略可）

CREATE TABLE IF NOT EXISTS template_events (
    id              SERIAL      PRIMARY KEY,
    template_id     INTEGER     NOT NULL,
    event_master_id INTEGER     NOT NULL,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    offset_days     INTEGER     NOT NULL DEFAULT 0,
    offset_base     VARCHAR(20) NOT NULL DEFAULT 'project_start',
    is_milestone    BOOLEAN     NOT NULL DEFAULT FALSE,
    is_required     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_te_template
        FOREIGN KEY (template_id)
        REFERENCES event_template(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_te_event_master
        FOREIGN KEY (event_master_id)
        REFERENCES event_master(id)
        ON DELETE RESTRICT       -- マスター削除はテンプレートから外してから行う
        ON UPDATE CASCADE,

    CONSTRAINT uq_template_event_master
        UNIQUE (template_id, event_master_id),

    CONSTRAINT chk_te_offset_base CHECK (
        offset_base IN ('project_start', 'prev_event')
    )
);

COMMENT ON TABLE  template_events              IS 'テンプレート構成：テンプレートと工程マスターの中間テーブル';
COMMENT ON COLUMN template_events.offset_days  IS '基準日（offset_base）からの日数オフセット';
COMMENT ON COLUMN template_events.offset_base  IS 'project_start=案件開始日基準 / prev_event=直前工程基準';
COMMENT ON COLUMN template_events.is_milestone IS 'マイルストーン工程フラグ（アラート厳格化などに使用）';
COMMENT ON COLUMN template_events.is_required  IS 'FALSE の工程は案件適用時に省略可能';

-- ============================================================
-- 4. 既存テーブルへの列追加
-- ============================================================

-- projects : どのテンプレートを適用して project_events を生成したか
-- NULL = テンプレート未適用（手動でイベントを個別追加した案件）
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS applied_template_id INTEGER
        REFERENCES event_template(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;

COMMENT ON COLUMN projects.applied_template_id IS '適用済みテンプレートID（NULL=テンプレート未使用）';

-- project_events : どのマスター工程から生成されたか
-- NULL = テンプレート外の手動追加イベント
ALTER TABLE project_events
    ADD COLUMN IF NOT EXISTS event_master_id INTEGER
        REFERENCES event_master(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;

COMMENT ON COLUMN project_events.event_master_id IS '元のマスター工程ID（NULL=手動追加）';

-- ============================================================
-- 5. インデックス定義
-- ============================================================

-- event_master
CREATE INDEX IF NOT EXISTS idx_event_master_event_type ON event_master(event_type);
CREATE INDEX IF NOT EXISTS idx_event_master_is_active   ON event_master(is_active);
CREATE INDEX IF NOT EXISTS idx_event_master_sort_order  ON event_master(sort_order);

-- event_template
CREATE INDEX IF NOT EXISTS idx_event_template_machine_type ON event_template(machine_type);
CREATE INDEX IF NOT EXISTS idx_event_template_is_active    ON event_template(is_active);

-- template_events
CREATE INDEX IF NOT EXISTS idx_template_events_template_id     ON template_events(template_id);
CREATE INDEX IF NOT EXISTS idx_template_events_event_master_id ON template_events(event_master_id);
CREATE INDEX IF NOT EXISTS idx_template_events_sort_order      ON template_events(template_id, sort_order);

-- project_events（追加列）
CREATE INDEX IF NOT EXISTS idx_events_event_master_id ON project_events(event_master_id);

-- projects（追加列）
CREATE INDEX IF NOT EXISTS idx_projects_applied_template ON projects(applied_template_id);

-- ============================================================
-- 6. updated_at 自動更新トリガー（新テーブル分）
-- ============================================================

CREATE OR REPLACE TRIGGER set_updated_at_event_master
    BEFORE UPDATE ON event_master
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_event_template
    BEFORE UPDATE ON event_template
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 7. マスターデータサンプル（動作確認用）
-- ============================================================

INSERT INTO event_master (event_code, event_name, event_type, owner_department, standard_lead_days, sort_order)
VALUES
    ('ORDER_CONFIRM',    '受注確定',          'other',         '営業部',   0,   10),
    ('BASIC_DESIGN',     '基本設計完了',       'design',        '設計部',   14,  20),
    ('DETAIL_DESIGN',    '詳細設計完了',       'design',        '設計部',   21,  30),
    ('DESIGN_REVIEW',    '設計レビュー完了',   'design',        '設計部',   7,   40),
    ('PARTS_ORDER',      '部品発注',           'manufacturing', '調達部',   3,   50),
    ('PARTS_ARRIVAL',    '部品入庫',           'manufacturing', '調達部',   30,  60),
    ('ASSEMBLY_START',   '組立開始',           'manufacturing', '製造部',   0,   70),
    ('ASSEMBLY_COMPLETE','組立完了',           'manufacturing', '製造部',   20,  80),
    ('FACTORY_TEST',     '社内試験（FAT）完了', 'inspection',   '品証部',   10,  90),
    ('SHIPMENT',         '出荷',               'delivery',      '物流部',   3,   100),
    ('SITE_INSTALL',     '現地据付完了',       'delivery',      '工事部',   14,  110),
    ('ACCEPTANCE',       '検収完了',           'delivery',      '営業部',   7,   120)
ON CONFLICT (event_code) DO NOTHING;

INSERT INTO event_template (template_code, template_name, description)
VALUES
    ('STD_MFG', '標準製造フロー', '一般的な設備製造案件向け標準テンプレート')
ON CONFLICT (template_code) DO NOTHING;

INSERT INTO template_events (template_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
SELECT
    t.id,
    m.id,
    v.sort_order,
    v.offset_days,
    'project_start',
    v.is_milestone,
    TRUE
FROM event_template t
CROSS JOIN (
    VALUES
        ('ORDER_CONFIRM',     1,   0,  TRUE),
        ('BASIC_DESIGN',      2,  14,  FALSE),
        ('DETAIL_DESIGN',     3,  35,  FALSE),
        ('DESIGN_REVIEW',     4,  42,  TRUE),
        ('PARTS_ORDER',       5,  45,  FALSE),
        ('PARTS_ARRIVAL',     6,  75,  FALSE),
        ('ASSEMBLY_START',    7,  78,  FALSE),
        ('ASSEMBLY_COMPLETE', 8,  98,  TRUE),
        ('FACTORY_TEST',      9, 108,  TRUE),
        ('SHIPMENT',         10, 111,  TRUE),
        ('SITE_INSTALL',     11, 125,  FALSE),
        ('ACCEPTANCE',       12, 132,  TRUE)
) AS v(event_code, sort_order, offset_days, is_milestone)
JOIN event_master m ON m.event_code = v.event_code
WHERE t.template_code = 'STD_MFG'
ON CONFLICT (template_id, event_master_id) DO NOTHING;
