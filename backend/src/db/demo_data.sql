-- ============================================================
-- demo_data.sql  デモ案件データ
-- 前提: schema*.sql → seed.sql 適用済み
-- 日付は CURRENT_DATE 基準で自動計算（いつ実行しても動く）
-- 冪等: project_no の UNIQUE 制約はないため、
--       実行前に既存デモデータを削除してから流す
-- ============================================================

-- ─────────────────────────────────────────────
-- 0. 既存デモデータを削除（DEMO-xxx プレフィックス）
-- ─────────────────────────────────────────────
BEGIN;

DELETE FROM projects WHERE project_no LIKE 'DEMO-%';

-- ─────────────────────────────────────────────
-- 1. DEMO-001  標準案件（順調・作業中）
--    パターン1 適用 / 着手60日経過 / 前半完了
-- ─────────────────────────────────────────────
INSERT INTO projects (
    project_no, pattern_no, machine_type, project_name, product_name, quantity,
    status, owner_name, dept_a_owner, dept_b_owner,
    order_date, required_delivery_date, promised_delivery_date, confirmed_delivery_date,
    delivery_status, project_type, applied_milestone_pattern_id
) VALUES (
    'DEMO-001', 'PT-001', 'TYPE-A', '標準案件（デモ）', 'MODEL-X1', 1,
    'active', '山田 太郎', '鈴木 一郎', '田中 花子',
    CURRENT_DATE - INTERVAL '65 days',
    CURRENT_DATE + INTERVAL '80 days',
    CURRENT_DATE + INTERVAL '75 days',
    NULL,
    '暫定', 'standard',
    (SELECT id FROM milestone_pattern WHERE pattern_code = 'PATTERN_1_STANDARD')
);

-- project_start = CURRENT_DATE - 60日 として16イベントを登録
-- offset  0日: 日程表A        → 完了(on time)
-- offset  7日: 日程表B        → 完了(on time)
-- offset 14日: 全体会議①     → 完了(on time)
-- offset 14日: 書類A初版      → 完了(+2日遅延)
-- offset 14日: KK日           → 完了(on time) ★MS
-- offset 30日: 全体会議②     → 完了(on time)
-- offset 60日: 全体会議③     → 完了(今日完了)
-- offset 90日: 全体会議④     → pending
-- offset 90日: 対応完了(SELF) → pending
-- offset 90日: 対応完了(B)   → pending
-- offset105日: 納期(B)       → pending ★MS
-- offset110日: 照合日         → pending
-- offset115日: 開始日(D)     → pending
-- offset120日: 全体会議⑤    → pending
-- offset130日: 完了日(D)     → pending ★MS
-- offset135日: 確認日         → pending ★MS

INSERT INTO project_events (
    project_id, event_master_id, event_type, event_name,
    plan_date, actual_date, status, owner_department, sort_order
)
SELECT
    p.id,
    v.em_id,
    v.event_type,
    v.event_name,
    (CURRENT_DATE - INTERVAL '60 days')::date + v.offset_days,
    v.actual_date,
    CASE WHEN v.actual_date IS NOT NULL THEN 'completed' ELSE 'pending' END,
    v.dept,
    v.sort_order
FROM projects p,
(VALUES
    (53, 'other',         '日程表A',         0,
     (CURRENT_DATE - INTERVAL '60 days')::date,              'A部門',  1),
    (54, 'other',         '日程表B',         7,
     (CURRENT_DATE - INTERVAL '53 days')::date,              'A部門',  2),
    (39, 'other',         '全体会議①',       14,
     (CURRENT_DATE - INTERVAL '46 days')::date,              'A部門',  3),
    (55, 'other',         '書類A初版提出日', 14,
     (CURRENT_DATE - INTERVAL '44 days')::date,              'A部門',  4),
    (26, 'design',        'KK日',            14,
     (CURRENT_DATE - INTERVAL '46 days')::date,              'C部門',  5),
    (40, 'other',         '全体会議②',       30,
     (CURRENT_DATE - INTERVAL '30 days')::date,              'A部門',  6),
    (41, 'other',         '全体会議③',       60,
     CURRENT_DATE,                                            'A部門',  7),
    (42, 'other',         '全体会議④',       90,
     NULL::date,                                              'A部門',  8),
    (56, 'other',         '対応完了日',       90,
     NULL::date,                                              '自部門', 9),
    (45, 'manufacturing', '対応完了日',       90,
     NULL::date,                                              'B部門', 10),
    (57, 'delivery',      '納期',            105,
     NULL::date,                                              'B部門', 11),
    (48, 'inspection',    '照合日',          110,
     NULL::date,                                              'C部門', 12),
    (50, 'manufacturing', '開始日',          115,
     NULL::date,                                              'D部門', 13),
    (43, 'other',         '全体会議⑤',      120,
     NULL::date,                                              'A部門', 14),
    (51, 'manufacturing', '完了日',          130,
     NULL::date,                                              'D部門', 15),
    (52, 'other',         '確認日',          135,
     NULL::date,                                              '自部門', 16)
) AS v(em_id, event_type, event_name, offset_days, actual_date, dept, sort_order)
WHERE p.project_no = 'DEMO-001';

-- ─────────────────────────────────────────────
-- 2. DEMO-002  遅延案件（危険・作業中）
--    パターン1 適用 / 着手90日経過 / 複数イベント遅延
-- ─────────────────────────────────────────────
INSERT INTO projects (
    project_no, pattern_no, machine_type, project_name, product_name, quantity,
    status, owner_name, dept_a_owner, dept_b_owner,
    order_date, required_delivery_date, promised_delivery_date, confirmed_delivery_date,
    delivery_status, project_type, applied_milestone_pattern_id
) VALUES (
    'DEMO-002', 'PT-002', 'TYPE-B', '遅延案件（デモ）', 'MODEL-X2', 2,
    'active', '佐藤 次郎', '高橋 二郎', '渡辺 美咲',
    CURRENT_DATE - INTERVAL '95 days',
    CURRENT_DATE + INTERVAL '50 days',
    CURRENT_DATE + INTERVAL '45 days',
    NULL,
    '暫定', 'standard',
    (SELECT id FROM milestone_pattern WHERE pattern_code = 'PATTERN_1_STANDARD')
);

-- project_start = CURRENT_DATE - 100日
-- 遅延状況: 全体会議①+6日, KK日+10日, 書類A初版+5日 遅延で完了
-- 全体会議③ offset60日=CURRENT_DATE-40 → overdue ✓
-- 全体会議④ offset90日=CURRENT_DATE-10 → overdue ✓
-- 対応完了(SELF/B) offset90日 → overdue ✓
-- → overdue_count=4 → health_status='danger'
INSERT INTO project_events (
    project_id, event_master_id, event_type, event_name,
    plan_date, actual_date, status, owner_department, sort_order
)
SELECT
    p.id,
    v.em_id,
    v.event_type,
    v.event_name,
    (CURRENT_DATE - INTERVAL '100 days')::date + v.offset_days,
    v.actual_date,
    CASE WHEN v.actual_date IS NOT NULL THEN 'completed' ELSE 'pending' END,
    v.dept,
    v.sort_order
FROM projects p,
(VALUES
    (53, 'other',         '日程表A',         0,
     (CURRENT_DATE - INTERVAL '100 days')::date,            'A部門',  1),
    (54, 'other',         '日程表B',         7,
     (CURRENT_DATE - INTERVAL '93 days')::date,             'A部門',  2),
    (39, 'other',         '全体会議①',       14,
     (CURRENT_DATE - INTERVAL '80 days')::date,             'A部門',  3),
    (55, 'other',         '書類A初版提出日', 14,
     (CURRENT_DATE - INTERVAL '81 days')::date,             'A部門',  4),
    (26, 'design',        'KK日',            14,
     (CURRENT_DATE - INTERVAL '76 days')::date,             'C部門',  5),
    (40, 'other',         '全体会議②',       30,
     (CURRENT_DATE - INTERVAL '68 days')::date,             'A部門',  6),
    (41, 'other',         '全体会議③',       60,
     NULL::date,                                             'A部門',  7),
    (42, 'other',         '全体会議④',       90,
     NULL::date,                                             'A部門',  8),
    (56, 'other',         '対応完了日',       90,
     NULL::date,                                             '自部門', 9),
    (45, 'manufacturing', '対応完了日',       90,
     NULL::date,                                             'B部門', 10),
    (57, 'delivery',      '納期',            105,
     NULL::date,                                             'B部門', 11),
    (48, 'inspection',    '照合日',          110,
     NULL::date,                                             'C部門', 12),
    (50, 'manufacturing', '開始日',          115,
     NULL::date,                                             'D部門', 13),
    (43, 'other',         '全体会議⑤',      120,
     NULL::date,                                             'A部門', 14),
    (51, 'manufacturing', '完了日',          130,
     NULL::date,                                             'D部門', 15),
    (52, 'other',         '確認日',          135,
     NULL::date,                                             '自部門', 16)
) AS v(em_id, event_type, event_name, offset_days, actual_date, dept, sort_order)
WHERE p.project_no = 'DEMO-002';

-- ─────────────────────────────────────────────
-- 3. DEMO-003  完了案件（全イベント完了）
--    パターン2（簡易）適用 / 着手160日経過
-- ─────────────────────────────────────────────
INSERT INTO projects (
    project_no, pattern_no, machine_type, project_name, product_name, quantity,
    status, owner_name, dept_a_owner, dept_b_owner,
    order_date, required_delivery_date, promised_delivery_date, confirmed_delivery_date,
    delivery_status, project_type, applied_milestone_pattern_id
) VALUES (
    'DEMO-003', 'PT-003', 'TYPE-A', '完了案件（デモ）', 'MODEL-Y1', 3,
    'active', '伊藤 三郎', '中村 三郎', '小林 陽子',
    CURRENT_DATE - INTERVAL '170 days',
    CURRENT_DATE - INTERVAL '20 days',
    CURRENT_DATE - INTERVAL '22 days',
    CURRENT_DATE - INTERVAL '18 days',
    '暫定', 'standard',
    (SELECT id FROM milestone_pattern WHERE pattern_code = 'PATTERN_2_SIMPLE')
);

-- project_start = CURRENT_DATE - 160日 / 全13件完了
-- パターン2: offset135日=CURRENT_DATE-25 が最終 → 全完了
INSERT INTO project_events (
    project_id, event_master_id, event_type, event_name,
    plan_date, actual_date, status, owner_department, sort_order
)
SELECT
    p.id,
    v.em_id,
    v.event_type,
    v.event_name,
    (CURRENT_DATE - INTERVAL '160 days')::date + v.offset_days,
    (CURRENT_DATE - INTERVAL '160 days')::date + v.actual_offset,
    'completed',
    v.dept,
    v.sort_order
FROM projects p,
(VALUES
    (53, 'other',         '日程表A',          0,    0, 'A部門',  1),
    (54, 'other',         '日程表B',          7,    8, 'A部門',  2),
    (39, 'other',         '全体会議①',        14,  14, 'A部門',  3),
    (55, 'other',         '書類A初版提出日',  14,  16, 'A部門',  4),
    (26, 'design',        'KK日',             14,  14, 'C部門',  5),
    (43, 'other',         '全体会議⑤',        75,  76, 'A部門',  6),
    (56, 'other',         '対応完了日',        90,  91, '自部門', 7),
    (45, 'manufacturing', '対応完了日',        90,  93, 'B部門',  8),
    (57, 'delivery',      '納期',             105, 103, 'B部門',  9),
    (48, 'inspection',    '照合日',           110, 111, 'C部門', 10),
    (50, 'manufacturing', '開始日',           115, 115, 'D部門', 11),
    (51, 'manufacturing', '完了日',           130, 132, 'D部門', 12),
    (52, 'other',         '確認日',           135, 137, '自部門', 13)
) AS v(em_id, event_type, event_name, offset_days, actual_offset, dept, sort_order)
WHERE p.project_no = 'DEMO-003';

-- ─────────────────────────────────────────────
-- 4. DEMO-004  EOL案件（カスタムイベント）
--    パターン4 適用 / 着手30日経過 / 前半完了
-- ─────────────────────────────────────────────
INSERT INTO projects (
    project_no, pattern_no, machine_type, project_name, product_name, quantity,
    status, owner_name, dept_a_owner,
    order_date, required_delivery_date, promised_delivery_date,
    delivery_status, project_type, applied_milestone_pattern_id
) VALUES (
    'DEMO-004', 'PT-004', 'TYPE-C', 'EOL対応案件（デモ）', 'MODEL-Z1（EOL）', 1,
    'active', '加藤 四郎', '松本 四郎',
    CURRENT_DATE - INTERVAL '35 days',
    CURRENT_DATE + INTERVAL '100 days',
    CURRENT_DATE + INTERVAL '95 days',
    '暫定', 'eol',
    (SELECT id FROM milestone_pattern WHERE pattern_code = 'PATTERN_4_EOL')
);

-- EOL案件はカスタムイベント（is_custom=true、event_master_id=NULL）
INSERT INTO project_events (
    project_id, event_master_id, event_type, event_name,
    plan_date, actual_date, status, owner_department, sort_order, is_custom
)
SELECT
    p.id,
    NULL::integer,
    v.event_type,
    v.event_name,
    CURRENT_DATE - INTERVAL '30 days' + (v.offset_days * INTERVAL '1 day'),
    v.actual_date,
    CASE WHEN v.actual_date IS NOT NULL THEN 'completed' ELSE 'pending' END,
    v.dept,
    v.sort_order,
    true
FROM projects p,
(VALUES
    ('other',        'EOL通知受領',          0,
     (CURRENT_DATE - INTERVAL '30 days')::date, '営業部',  1),
    ('other',        '代替品検討開始',       10,
     (CURRENT_DATE - INTERVAL '20 days')::date, '設計部',  2),
    ('design',       '代替品選定完了',       30,
     NULL::date,                                '設計部',  3),
    ('manufacturing','最終発注',             45,
     NULL::date,                                '調達部',  4),
    ('delivery',     '最終入庫',             80,
     NULL::date,                                '調達部',  5),
    ('delivery',     'EOL移行完了',         100,
     NULL::date,                                '営業部',  6)
) AS v(event_type, event_name, offset_days, actual_date, dept, sort_order)
WHERE p.project_no = 'DEMO-004';

-- ─────────────────────────────────────────────
-- シーケンスリセット
-- ─────────────────────────────────────────────
SELECT setval('projects_id_seq',      GREATEST((SELECT MAX(id) FROM projects),      1));
SELECT setval('project_events_id_seq', GREATEST((SELECT MAX(id) FROM project_events), 1));

COMMIT;
