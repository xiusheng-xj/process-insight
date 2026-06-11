-- ============================================================
-- schema_v5.sql
-- event_master / template_events をExcel工程表の顔に合わせる
-- ============================================================
-- 変更概要:
--   1. event_master の20工程をExcel列名・並び順へ全面更新
--      （既存レコードは UPSERT、新規コードは INSERT）
--   2. 新20工程に含まれない旧工程を is_active=FALSE へ
--      （外部キー参照が残るため DELETE ではなく論理削除）
--   3. STD_MFG テンプレートの template_events をExcel列順で再構築
--
-- 退避が必要な実績日:
--   ORDER_CONFIRM  受注確定→受注日  actual_date=2026-06-11  ← 復元可（project 側で対応）
--   PARTS_ORDER    部品発注         actual_date=2026-07-31  ← 新テンプレートに工程なし・消失
-- ============================================================

BEGIN;

-- ============================================================
-- 1. event_master をExcel工程名・順序へ UPSERT
--    sort_order: event_master 一覧表示用（10刻みで余白を確保）
-- ============================================================

INSERT INTO event_master
    (event_code, event_name, event_type, owner_department, standard_lead_days, sort_order, is_active)
VALUES
    ('ORDER_CONFIRM',        '受注日',              'other',         '営業部',   0,  10, TRUE),
    ('REQUIRED_DELIVERY',    '要求納期',            'delivery',      '営業部',   0,  20, TRUE),
    ('PROMISED_DELIVERY',    '回答納期',            'delivery',      '営業部',   0,  30, TRUE),
    ('SCHEDULE_A_SUBMIT',    '日程表A',             'other',         '管理部',   0,  40, TRUE),
    ('SCHEDULE_B_SUBMIT',    '日程表B',             'other',         '管理部',   0,  50, TRUE),
    ('DOC_A_LATEST_RECV',    '書類A最新版提出日',   'other',         '管理部',   0,  60, TRUE),
    ('MEETING_1',            '全体会議①',          'other',         '管理部',   0,  70, TRUE),
    ('MEETING_2',            '全体会議②',          'other',         '管理部',   0,  80, TRUE),
    ('MEETING_3',            '全体会議③',          'other',         '管理部',   0,  90, TRUE),
    ('MEETING_4',            '全体会議④',          'other',         '管理部',   0, 100, TRUE),
    ('MEETING_5',            '全体会議⑤',          'other',         '管理部',   0, 110, TRUE),
    ('DOC_A_INITIAL_SUBMIT', '書類A初版提出日',     'other',         '管理部',   0, 120, TRUE),
    ('DEPT_B_COMPLETE',      '対応完了日 B部門',    'manufacturing', 'B部門',    0, 130, TRUE),
    ('DEPT_C_COMPLETE',      '対応完了日 C部門',    'manufacturing', 'C部門',    0, 140, TRUE),
    ('DEPT_C_DELIVERY',      '納期 C部門',          'delivery',      'C部門',    0, 150, TRUE),
    ('VERIFICATION',         '照合日 D部門',        'inspection',    'D部門',    0, 160, TRUE),
    ('KK_DATE',              'KK日',                'design',        'D部門',    0, 170, TRUE),
    ('DEPT_D_START',         '開始日 D部門',        'manufacturing', 'D部門',    0, 180, TRUE),
    ('DEPT_D_COMPLETE',      '完了日 D部門',        'manufacturing', 'D部門',    0, 190, TRUE),
    ('FINAL_CONFIRM',        '確認日',              'other',         '営業部',   0, 200, TRUE)
ON CONFLICT (event_code) DO UPDATE SET
    event_name         = EXCLUDED.event_name,
    event_type         = EXCLUDED.event_type,
    owner_department   = EXCLUDED.owner_department,
    standard_lead_days = EXCLUDED.standard_lead_days,
    sort_order         = EXCLUDED.sort_order,
    is_active          = TRUE,
    updated_at         = NOW();

-- ============================================================
-- 2. 新20工程に含まれない旧工程を論理削除（is_active=FALSE）
--    DELETE しない理由: project_events.event_master_id に
--    外部キー参照が残っているため
-- ============================================================

UPDATE event_master
SET is_active = FALSE, updated_at = NOW()
WHERE event_code NOT IN (
    'ORDER_CONFIRM', 'REQUIRED_DELIVERY', 'PROMISED_DELIVERY',
    'SCHEDULE_A_SUBMIT', 'SCHEDULE_B_SUBMIT', 'DOC_A_LATEST_RECV',
    'MEETING_1', 'MEETING_2', 'MEETING_3', 'MEETING_4', 'MEETING_5',
    'DOC_A_INITIAL_SUBMIT', 'DEPT_B_COMPLETE', 'DEPT_C_COMPLETE',
    'DEPT_C_DELIVERY', 'VERIFICATION', 'KK_DATE',
    'DEPT_D_START', 'DEPT_D_COMPLETE', 'FINAL_CONFIRM'
);

-- ============================================================
-- 3. STD_MFG テンプレートを Excel列順で再構築
--    sort_order 1〜20 = Excel列順
--    offset_days は仮値（業務確認後に schema_v6.sql で更新すること）
--    is_milestone: 顧客合意が必要な主要節点を TRUE に設定
-- ============================================================

DELETE FROM template_events WHERE template_id = 1;

INSERT INTO template_events
    (template_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
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
    --  event_code                       sort  offset  milestone
    ('ORDER_CONFIRM'::TEXT,                 1,    0,    TRUE),
    ('REQUIRED_DELIVERY'::TEXT,             2,    3,    FALSE),
    ('PROMISED_DELIVERY'::TEXT,             3,    7,    TRUE),
    ('SCHEDULE_A_SUBMIT'::TEXT,             4,   14,    FALSE),
    ('SCHEDULE_B_SUBMIT'::TEXT,             5,   21,    FALSE),
    ('DOC_A_LATEST_RECV'::TEXT,             6,   28,    FALSE),
    ('MEETING_1'::TEXT,                     7,   30,    FALSE),
    ('MEETING_2'::TEXT,                     8,   45,    FALSE),
    ('MEETING_3'::TEXT,                     9,   60,    FALSE),
    ('MEETING_4'::TEXT,                    10,   75,    FALSE),
    ('MEETING_5'::TEXT,                    11,   90,    FALSE),
    ('DOC_A_INITIAL_SUBMIT'::TEXT,         12,   30,    FALSE),
    ('DEPT_B_COMPLETE'::TEXT,              13,   60,    FALSE),
    ('DEPT_C_COMPLETE'::TEXT,              14,   75,    FALSE),
    ('DEPT_C_DELIVERY'::TEXT,              15,   90,    TRUE),
    ('VERIFICATION'::TEXT,                 16,   95,    FALSE),
    ('KK_DATE'::TEXT,                      17,   14,    TRUE),
    ('DEPT_D_START'::TEXT,                 18,  100,    FALSE),
    ('DEPT_D_COMPLETE'::TEXT,              19,  120,    TRUE),
    ('FINAL_CONFIRM'::TEXT,                20,  130,    TRUE)
) AS v(event_code, sort_order, offset_days, is_milestone)
    ON m.event_code = v.event_code
WHERE m.is_active = TRUE;

COMMIT;
