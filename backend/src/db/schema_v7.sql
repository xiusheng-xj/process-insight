-- ============================================================
-- schema_v7.sql
-- マイルストーンパターン構造への移行
-- ============================================================
-- 変更概要:
--   1. event_template  → milestone_pattern         (テーブルリネーム)
--   2. template_events → milestone_pattern_events  (テーブルリネーム)
--   3. projects.applied_template_id
--      → applied_milestone_pattern_id              (列リネーム)
--   4. milestone_pattern レコード更新
--      STD_MFG → PATTERN_1_STANDARD
--   5. event_master: 16工程に整合
--      - 新5コード INSERT: SCHEDULE_A / SCHEDULE_B / DOC_A_INITIAL /
--                          SELF_COMPLETE / DEPT_B_DELIVERY
--      - 流用11コード: event_name / owner_department / sort_order 更新
--      - 不要9コード: is_active=FALSE (物理削除不可: FK参照あり)
--   6. milestone_pattern_events: 16工程で再構築
--
-- 注意:
--   - project_events の既存データは一切削除しない
--   - is_active=FALSE は論理削除。event_master_id FK は維持される
--   - offset_days は仮値。業務確認後 schema_v8.sql で更新すること
-- ============================================================

BEGIN;

-- ============================================================
-- 1. event_template → milestone_pattern リネーム
-- ============================================================

ALTER TABLE event_template RENAME TO milestone_pattern;
ALTER TABLE milestone_pattern RENAME COLUMN template_code TO pattern_code;
ALTER TABLE milestone_pattern RENAME COLUMN template_name TO pattern_name;

-- 主要制約・インデックスのリネーム（機能には影響しないが保守性のため）
ALTER TABLE milestone_pattern
    RENAME CONSTRAINT event_template_pkey TO milestone_pattern_pkey;
ALTER INDEX IF EXISTS event_template_template_code_key
    RENAME TO milestone_pattern_pattern_code_key;
ALTER INDEX IF EXISTS idx_event_template_is_active
    RENAME TO idx_milestone_pattern_is_active;
ALTER INDEX IF EXISTS idx_event_template_machine_type
    RENAME TO idx_milestone_pattern_machine_type;

-- ============================================================
-- 2. template_events → milestone_pattern_events リネーム
-- ============================================================

ALTER TABLE template_events RENAME TO milestone_pattern_events;
ALTER TABLE milestone_pattern_events RENAME COLUMN template_id TO pattern_id;

-- 制約・インデックスのリネーム
ALTER TABLE milestone_pattern_events
    RENAME CONSTRAINT template_events_pkey TO milestone_pattern_events_pkey;
ALTER TABLE milestone_pattern_events
    RENAME CONSTRAINT fk_te_template TO fk_mpe_pattern;
ALTER TABLE milestone_pattern_events
    RENAME CONSTRAINT fk_te_event_master TO fk_mpe_event_master;
ALTER TABLE milestone_pattern_events
    RENAME CONSTRAINT uq_template_event_master TO uq_mpe_pattern_event_master;

-- ============================================================
-- 3. projects.applied_template_id → applied_milestone_pattern_id
-- ============================================================

ALTER TABLE projects
    RENAME COLUMN applied_template_id TO applied_milestone_pattern_id;

ALTER TABLE projects
    RENAME CONSTRAINT projects_applied_template_id_fkey
    TO projects_applied_milestone_pattern_id_fkey;

-- ============================================================
-- 4. milestone_pattern レコード更新
--    STD_MFG → PATTERN_1_STANDARD
--    machine_type: NULL に（パターンは機種ではなく案件進行パターンで管理）
-- ============================================================

UPDATE milestone_pattern SET
    pattern_code = 'PATTERN_1_STANDARD',
    pattern_name = 'マイルストーンパターン1（標準）',
    description  = 'PoC標準: 16マイルストーン管理パターン',
    machine_type = NULL,
    updated_at   = NOW()
WHERE pattern_code = 'STD_MFG';

-- ============================================================
-- 5a. event_master: 新5コードを UPSERT
--     （既存コードと重複しない新コード）
-- ============================================================

INSERT INTO event_master
    (event_code, event_name, event_type, owner_department, standard_lead_days, sort_order, is_active)
VALUES
    ('SCHEDULE_A',      '日程表A',         'other',    'A部門',  0,  10, TRUE),
    ('SCHEDULE_B',      '日程表B',         'other',    'A部門',  0,  20, TRUE),
    ('DOC_A_INITIAL',   '書類A初版提出日', 'other',    '自部門', 0,  80, TRUE),
    ('SELF_COMPLETE',   '対応完了日',      'other',    '自部門', 0,  90, TRUE),
    ('DEPT_B_DELIVERY', '納期',            'delivery', 'B部門',  0, 110, TRUE)
ON CONFLICT (event_code) DO UPDATE SET
    event_name       = EXCLUDED.event_name,
    event_type       = EXCLUDED.event_type,
    owner_department = EXCLUDED.owner_department,
    sort_order       = EXCLUDED.sort_order,
    is_active        = TRUE,
    updated_at       = NOW();

-- ============================================================
-- 5b. event_master: 流用11コードの event_name / owner_department /
--     sort_order を新16工程定義に合わせて更新
-- ============================================================

UPDATE event_master SET event_name = '全体会議①', owner_department = '全部門', sort_order =  30, updated_at = NOW() WHERE event_code = 'MEETING_1';
UPDATE event_master SET event_name = '全体会議②', owner_department = '全部門', sort_order =  40, updated_at = NOW() WHERE event_code = 'MEETING_2';
UPDATE event_master SET event_name = '全体会議③', owner_department = '全部門', sort_order =  50, updated_at = NOW() WHERE event_code = 'MEETING_3';
UPDATE event_master SET event_name = '全体会議④', owner_department = '全部門', sort_order =  60, updated_at = NOW() WHERE event_code = 'MEETING_4';
UPDATE event_master SET event_name = '全体会議⑤', owner_department = '全部門', sort_order =  70, updated_at = NOW() WHERE event_code = 'MEETING_5';
UPDATE event_master SET event_name = '対応完了日', owner_department = 'B部門',  sort_order = 100, updated_at = NOW() WHERE event_code = 'DEPT_B_COMPLETE';
UPDATE event_master SET event_name = '照合日',     owner_department = 'C部門',  sort_order = 120, updated_at = NOW() WHERE event_code = 'VERIFICATION';
UPDATE event_master SET event_name = 'KK日',       owner_department = 'C部門',  sort_order = 130, updated_at = NOW() WHERE event_code = 'KK_DATE';
UPDATE event_master SET event_name = '開始日',     owner_department = 'D部門',  sort_order = 140, updated_at = NOW() WHERE event_code = 'DEPT_D_START';
UPDATE event_master SET event_name = '完了日',     owner_department = 'D部門',  sort_order = 150, updated_at = NOW() WHERE event_code = 'DEPT_D_COMPLETE';
UPDATE event_master SET event_name = '確認日',     owner_department = '自部門', sort_order = 160, updated_at = NOW() WHERE event_code = 'FINAL_CONFIRM';

-- ============================================================
-- 5c. event_master: 旧コードを論理削除 (is_active=FALSE)
--     理由: project_events.event_master_id FK があるため物理削除不可
--     対象: 案件属性に移管されるもの / 新コードに置き換えられたもの
-- ============================================================

UPDATE event_master
SET is_active = FALSE, updated_at = NOW()
WHERE event_code IN (
    -- 案件属性へ移管
    'ORDER_CONFIRM',
    'REQUIRED_DELIVERY',
    'PROMISED_DELIVERY',
    -- 新コードへ置き換え
    'SCHEDULE_A_SUBMIT',    -- → SCHEDULE_A
    'SCHEDULE_B_SUBMIT',    -- → SCHEDULE_B
    'DOC_A_INITIAL_SUBMIT', -- → DOC_A_INITIAL
    -- 廃止
    'DOC_A_LATEST_RECV',
    'DEPT_C_COMPLETE',      -- → SELF_COMPLETE（意味が変わるため別コード）
    'DEPT_C_DELIVERY'       -- → DEPT_B_DELIVERY（担当部門が変わるため別コード）
);

-- ============================================================
-- 6. milestone_pattern_events: 16工程で再構築
--    sort_order 1-16 = 新マイルストーンパターン1定義の順序
--    offset_days: 仮値（業務確認後に schema_v8.sql で更新すること）
--    is_milestone: 顧客合意・節点となる工程を TRUE
-- ============================================================

DELETE FROM milestone_pattern_events WHERE pattern_id = 1;

INSERT INTO milestone_pattern_events
    (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
SELECT
    1,
    m.id,
    v.sort_order,
    v.offset_days,
    'project_start',
    v.is_milestone,
    TRUE
FROM event_master m
JOIN (VALUES
    --  event_code                 sort  offset  milestone
    ('SCHEDULE_A'::TEXT,              1,   0,    FALSE),
    ('SCHEDULE_B'::TEXT,              2,   7,    FALSE),
    ('MEETING_1'::TEXT,               3,  14,    FALSE),
    ('MEETING_2'::TEXT,               4,  30,    FALSE),
    ('MEETING_3'::TEXT,               5,  60,    FALSE),
    ('MEETING_4'::TEXT,               6,  90,    FALSE),
    ('MEETING_5'::TEXT,               7, 120,    FALSE),
    ('DOC_A_INITIAL'::TEXT,           8,  14,    FALSE),
    ('SELF_COMPLETE'::TEXT,           9,  90,    FALSE),
    ('DEPT_B_COMPLETE'::TEXT,        10,  90,    FALSE),
    ('DEPT_B_DELIVERY'::TEXT,        11, 105,     TRUE),
    ('VERIFICATION'::TEXT,           12, 110,    FALSE),
    ('KK_DATE'::TEXT,                13,  14,     TRUE),
    ('DEPT_D_START'::TEXT,           14, 115,    FALSE),
    ('DEPT_D_COMPLETE'::TEXT,        15, 130,     TRUE),
    ('FINAL_CONFIRM'::TEXT,          16, 135,     TRUE)
) AS v(event_code, sort_order, offset_days, is_milestone)
    ON m.event_code = v.event_code
WHERE m.is_active = TRUE;

COMMIT;
