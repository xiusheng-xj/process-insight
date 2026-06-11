-- ============================================================
-- schema_v8.sql
-- マイルストーンパターン 2〜4 追加
-- ============================================================
-- 変更概要:
--   PATTERN_2_SIMPLE  13イベント（PATTERN_1 から MEETING_2〜4 除外）
--   PATTERN_3_REPEAT   0イベント（未定義）
--   PATTERN_4_EOL      0イベント（未定義）
-- ============================================================

BEGIN;

-- ============================================================
-- 1. milestone_pattern 登録
-- ============================================================

INSERT INTO milestone_pattern (pattern_code, pattern_name, description, machine_type, is_active)
VALUES
    ('PATTERN_2_SIMPLE',
     'マイルストーンパターン2（簡易）',
     '簡易案件向け: 全体会議②〜④を省略した13工程パターン',
     NULL, TRUE),
    ('PATTERN_3_REPEAT',
     'マイルストーンパターン3（リピート品）',
     '未定義（0イベント）',
     NULL, TRUE),
    ('PATTERN_4_EOL',
     'マイルストーンパターン4（EOL対応）',
     '未定義（0イベント）',
     NULL, TRUE)
ON CONFLICT (pattern_code) DO UPDATE SET
    pattern_name = EXCLUDED.pattern_name,
    description  = EXCLUDED.description,
    is_active    = TRUE,
    updated_at   = NOW();

-- ============================================================
-- 2. PATTERN_2_SIMPLE のイベント登録
--    PATTERN_1_STANDARD (16件) から MEETING_2 / MEETING_3 / MEETING_4 を除外
--    sort_order は 1 から採番し直す
-- ============================================================

INSERT INTO milestone_pattern_events
    (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
SELECT
    p.id,
    m.id,
    v.sort_order,
    v.offset_days,
    'project_start',
    v.is_milestone,
    TRUE
FROM milestone_pattern p
CROSS JOIN (VALUES
    --  event_code                sort  offset  milestone
    ('SCHEDULE_A'::TEXT,            1,   0,    FALSE),
    ('SCHEDULE_B'::TEXT,            2,   7,    FALSE),
    ('MEETING_1'::TEXT,             3,  14,    FALSE),
    ('MEETING_5'::TEXT,             4,  75,    FALSE),
    ('DOC_A_INITIAL'::TEXT,         5,  14,    FALSE),
    ('SELF_COMPLETE'::TEXT,         6,  90,    FALSE),
    ('DEPT_B_COMPLETE'::TEXT,       7,  90,    FALSE),
    ('DEPT_B_DELIVERY'::TEXT,       8, 105,     TRUE),
    ('VERIFICATION'::TEXT,          9, 110,    FALSE),
    ('KK_DATE'::TEXT,              10,  14,     TRUE),
    ('DEPT_D_START'::TEXT,         11, 115,    FALSE),
    ('DEPT_D_COMPLETE'::TEXT,      12, 130,     TRUE),
    ('FINAL_CONFIRM'::TEXT,        13, 135,     TRUE)
) AS v(event_code, sort_order, offset_days, is_milestone)
JOIN event_master m ON m.event_code = v.event_code AND m.is_active = TRUE
WHERE p.pattern_code = 'PATTERN_2_SIMPLE';

-- PATTERN_3_REPEAT / PATTERN_4_EOL はイベントなし（登録不要）

COMMIT;
