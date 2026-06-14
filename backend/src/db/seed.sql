-- ============================================================
-- seed.sql  マスターデータ初期投入
-- 適用順: schema.sql〜schema_v15.sql の後に実行
-- 冪等: ON CONFLICT DO NOTHING のため再実行しても安全
-- ============================================================
BEGIN;

-- ─────────────────────────────────────────────
-- 1. event_master  (is_active=true のみ)
-- ─────────────────────────────────────────────
INSERT INTO event_master
    (id, event_code, event_name, event_type, owner_department,
     standard_lead_days, description, is_active, sort_order, department_code)
VALUES
    (26, 'KK_DATE',         'KK日',            'design',         'C部門', 0,  '', true,  130, 'C'),
    (39, 'MEETING_1',       '全体会議①',        'other',          'A部門', 0,  '', true,   30, 'A'),
    (40, 'MEETING_2',       '全体会議②',        'other',          'A部門', 0,  '', true,   40, 'A'),
    (41, 'MEETING_3',       '全体会議③',        'other',          'A部門', 0,  '', true,   50, 'A'),
    (42, 'MEETING_4',       '全体会議④',        'other',          'A部門', 0,  '', true,   60, 'A'),
    (43, 'MEETING_5',       '全体会議⑤',        'other',          'A部門', 0,  '', true,   70, 'A'),
    (45, 'DEPT_B_COMPLETE', '対応完了日',        'manufacturing',  'B部門', 0,  '', true,  100, 'B'),
    (48, 'VERIFICATION',    '照合日',            'inspection',     'C部門', 0,  '', true,  120, 'C'),
    (50, 'DEPT_D_START',    '開始日',            'manufacturing',  'D部門', 0,  '', true,  140, 'D'),
    (51, 'DEPT_D_COMPLETE', '完了日',            'manufacturing',  'D部門', 0,  '', true,  150, 'D'),
    (52, 'FINAL_CONFIRM',   '確認日',            'other',          '自部門', 0, '', true,  160, 'SELF'),
    (53, 'SCHEDULE_A',      '日程表A',           'other',          'A部門', 0,  '', true,   10, 'A'),
    (54, 'SCHEDULE_B',      '日程表B',           'other',          'A部門', 0,  '', true,   20, 'A'),
    (55, 'DOC_A_INITIAL',   '書類A初版提出日',   'other',          'A部門', 0,  '', true,   80, 'A'),
    (56, 'SELF_COMPLETE',   '対応完了日',        'other',          '自部門', 0, '', true,   90, 'SELF'),
    (57, 'DEPT_B_DELIVERY', '納期',              'delivery',       'B部門', 0,  '', true,  110, 'B')
ON CONFLICT (id) DO NOTHING;

SELECT setval('event_master_id_seq', GREATEST((SELECT MAX(id) FROM event_master), 57));

-- ─────────────────────────────────────────────
-- 2. milestone_pattern
-- ─────────────────────────────────────────────
INSERT INTO milestone_pattern
    (id, pattern_code, pattern_name, machine_type, description, is_active)
VALUES
    (1, 'PATTERN_1_STANDARD', 'マイルストーンパターン1（標準）',       NULL,
        'PoC標準: 16マイルストーン管理パターン',              true),
    (2, 'PATTERN_2_SIMPLE',   'マイルストーンパターン2（簡易）',       NULL,
        '簡易案件向け: 全体会議②〜④を省略した13工程パターン', true),
    (3, 'PATTERN_3_REPEAT',   'マイルストーンパターン3（リピート品）', NULL,
        'リピート品向けパターン（イベント適宜追加）',          true),
    (4, 'PATTERN_4_EOL',      'マイルストーンパターン4（EOL対応）',    NULL,
        'EOL・製廃対応案件向けパターン',                      true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('event_template_id_seq', GREATEST((SELECT MAX(id) FROM milestone_pattern), 4));

-- ─────────────────────────────────────────────
-- 3. milestone_pattern_events
--    offset_base: 'project_start' のみ
-- ─────────────────────────────────────────────
-- パターン1（標準）: 16イベント
INSERT INTO milestone_pattern_events
    (id, pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
VALUES
    (41, 1, 53, 1,    0, 'project_start', false, true),   -- 日程表A
    (42, 1, 54, 2,    7, 'project_start', false, true),   -- 日程表B
    (43, 1, 39, 3,   14, 'project_start', false, true),   -- 全体会議①
    (44, 1, 40, 4,   30, 'project_start', false, true),   -- 全体会議②
    (45, 1, 41, 5,   60, 'project_start', false, true),   -- 全体会議③
    (46, 1, 42, 6,   90, 'project_start', false, true),   -- 全体会議④
    (47, 1, 43, 7,  120, 'project_start', false, true),   -- 全体会議⑤
    (48, 1, 55, 8,   14, 'project_start', false, true),   -- 書類A初版提出日
    (49, 1, 56, 9,   90, 'project_start', false, true),   -- 対応完了日(SELF)
    (50, 1, 45, 10,  90, 'project_start', false, true),   -- 対応完了日(B)
    (51, 1, 57, 11, 105, 'project_start', true,  true),   -- 納期(B) ★MS
    (52, 1, 48, 12, 110, 'project_start', false, true),   -- 照合日
    (53, 1, 26, 13,  14, 'project_start', true,  true),   -- KK日 ★MS
    (54, 1, 50, 14, 115, 'project_start', false, true),   -- 開始日(D)
    (55, 1, 51, 15, 130, 'project_start', true,  true),   -- 完了日(D) ★MS
    (56, 1, 52, 16, 135, 'project_start', true,  true)    -- 確認日 ★MS
ON CONFLICT (id) DO NOTHING;

-- パターン2（簡易）: 13イベント（全体会議②④⑤省略）
INSERT INTO milestone_pattern_events
    (id, pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
VALUES
    (57, 2, 53, 1,    0, 'project_start', false, true),   -- 日程表A
    (58, 2, 54, 2,    7, 'project_start', false, true),   -- 日程表B
    (59, 2, 39, 3,   14, 'project_start', false, true),   -- 全体会議①
    (60, 2, 43, 4,   75, 'project_start', false, true),   -- 全体会議⑤
    (61, 2, 55, 5,   14, 'project_start', false, true),   -- 書類A初版提出日
    (62, 2, 56, 6,   90, 'project_start', false, true),   -- 対応完了日(SELF)
    (63, 2, 45, 7,   90, 'project_start', false, true),   -- 対応完了日(B)
    (64, 2, 57, 8,  105, 'project_start', true,  true),   -- 納期(B) ★MS
    (65, 2, 48, 9,  110, 'project_start', false, true),   -- 照合日
    (66, 2, 26, 10,  14, 'project_start', true,  true),   -- KK日 ★MS
    (67, 2, 50, 11, 115, 'project_start', false, true),   -- 開始日(D)
    (68, 2, 51, 12, 130, 'project_start', true,  true),   -- 完了日(D) ★MS
    (69, 2, 52, 13, 135, 'project_start', true,  true)    -- 確認日 ★MS
ON CONFLICT (id) DO NOTHING;

SELECT setval('template_events_id_seq', GREATEST((SELECT MAX(id) FROM milestone_pattern_events), 69));

-- ─────────────────────────────────────────────
-- 4. process_pattern
-- ─────────────────────────────────────────────
INSERT INTO process_pattern
    (id, pattern_code, pattern_name, description, is_active)
VALUES
    (1, 'STANDARD_PROCESS', '標準工程', '加工・組立・検査・試運転・出荷', true),
    (2, 'SIMPLE_PROCESS',   '簡易工程', '組立・検査・出荷',               true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('process_pattern_id_seq', GREATEST((SELECT MAX(id) FROM process_pattern), 2));

-- ─────────────────────────────────────────────
-- 5. process_pattern_steps
-- ─────────────────────────────────────────────
-- 標準工程（5ステップ）
INSERT INTO process_pattern_steps
    (id, process_pattern_id, process_name, department_code, sort_order, offset_days, offset_base)
VALUES
    (1, 1, '出荷',   NULL, 50, 20, 'parent_event'),
    (2, 1, '試運転', NULL, 40, 15, 'parent_event'),
    (3, 1, '検査',   NULL, 30, 10, 'parent_event'),
    (4, 1, '組立',   NULL, 20,  5, 'parent_event'),
    (5, 1, '加工',   NULL, 10,  0, 'parent_event')
ON CONFLICT (id) DO NOTHING;

-- 簡易工程（3ステップ）
INSERT INTO process_pattern_steps
    (id, process_pattern_id, process_name, department_code, sort_order, offset_days, offset_base)
VALUES
    (6, 2, '出荷', NULL, 30, 10, 'parent_event'),
    (7, 2, '検査', NULL, 20,  5, 'parent_event'),
    (8, 2, '組立', NULL, 10,  0, 'parent_event')
ON CONFLICT (id) DO NOTHING;

SELECT setval('process_pattern_steps_id_seq', GREATEST((SELECT MAX(id) FROM process_pattern_steps), 8));

COMMIT;
