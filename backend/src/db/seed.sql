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

-- pattern3/4 を採番付きで追加する前に、採番を pattern1/2 の最大IDへ合わせる
SELECT setval('template_events_id_seq', GREATEST((SELECT MAX(id) FROM milestone_pattern_events), 69));

-- パターン3（リピート品）: 6イベント
--   id は自動採番。(pattern_id, event_master_id) で冪等化（seed-demo 由来の既存行とも衝突しない）
INSERT INTO milestone_pattern_events
    (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
VALUES
    (3, 53, 1,   0, 'project_start', false, true),   -- 日程表A
    (3, 26, 2,   7, 'project_start', true,  true),   -- KK日 ★MS
    (3, 39, 3,  10, 'project_start', false, true),   -- 全体会議①
    (3, 45, 4,  40, 'project_start', false, true),   -- 対応完了日(B)
    (3, 57, 5,  55, 'project_start', true,  true),   -- 納期(B) ★MS
    (3, 52, 6,  60, 'project_start', true,  true)    -- 確認日 ★MS
ON CONFLICT (pattern_id, event_master_id) DO NOTHING;

-- パターン4（EOL対応）: 6イベント
INSERT INTO milestone_pattern_events
    (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
VALUES
    (4, 53, 1,   0, 'project_start', false, true),   -- 日程表A
    (4, 39, 2,  14, 'project_start', false, true),   -- 全体会議①
    (4, 26, 3,  20, 'project_start', true,  true),   -- KK日 ★MS
    (4, 45, 4,  45, 'project_start', false, true),   -- 対応完了日(B)
    (4, 57, 5,  80, 'project_start', true,  true),   -- 納期(B) ★MS
    (4, 52, 6, 100, 'project_start', true,  true)    -- 確認日 ★MS
ON CONFLICT (pattern_id, event_master_id) DO NOTHING;

SELECT setval('template_events_id_seq', GREATEST((SELECT MAX(id) FROM milestone_pattern_events), 81));

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

-- ─────────────────────────────────────────────
-- 6. locations（場所マスタ） ※ schema_v18 で追加
-- ─────────────────────────────────────────────
INSERT INTO locations (id, location_code, location_name, location_type, region, sort_order) VALUES
    (1, 'LOC_SAITAMA',   '埼玉工場',   'factory',   '関東', 10),
    (2, 'LOC_OSAKA',     '大阪工場',   'factory',   '関西', 20),
    (3, 'LOC_HQ_TEST',   '本社試験室', 'test_room', '関東', 30),
    (4, 'LOC_PARTNER_A', '協力会社A',  'partner',   '関東', 40),
    (5, 'LOC_OVERSEAS',  '海外拠点',   'overseas',  '海外', 50)
ON CONFLICT (id) DO NOTHING;

SELECT setval('locations_id_seq', GREATEST((SELECT MAX(id) FROM locations), 5));

-- ─────────────────────────────────────────────
-- 7. resources（設備・能力枠マスタ） ※ schema_v18 で追加
--    home_location_id で locations に紐付け。REVIEW-D のみ capacity=2。
-- ─────────────────────────────────────────────
INSERT INTO resources (id, resource_code, resource_name, resource_type, home_location_id, department_code, capacity, sort_order) VALUES
    (1, 'MC-01',       'マシニングセンタ MC-01', 'machine',        1, 'D', 1, 10),
    (2, 'THERMO-01',   '恒温槽',                 'test_equipment', 3, 'C', 1, 20),
    (3, 'EMC-ROOM',    'EMC試験室',              'test_equipment', 3, 'C', 1, 30),
    (4, 'ASSY-LINE-A', '組立ラインA',            'line',           2, 'B', 1, 40),
    (5, 'REVIEW-D',    'D部門 設計レビュー枠',   'review_slot',    1, 'D', 2, 50)
ON CONFLICT (id) DO NOTHING;

SELECT setval('resources_id_seq', GREATEST((SELECT MAX(id) FROM resources), 5));

-- ─────────────────────────────────────────────
-- 8. review_rules（工程計画レビュー項目カタログ） ※ schema_v20 で追加
--    RULE-001 のみ有効。002〜008 は将来項目としてカタログ登録（is_enabled=false）。
-- ─────────────────────────────────────────────
INSERT INTO review_rules (id, rule_code, rule_name, category, description, is_enabled, sort_order) VALUES
    (1, 'RULE-001', 'Resource重複',     'resource',  '同一resource・同一日程・同一工程の件数が capacity を超える衝突を検出', true,  10),
    (2, 'RULE-002', 'Location偏り',     'location',  '拠点（location）への工程集中・偏りを検出（将来）',                    false, 20),
    (3, 'RULE-003', '工程集中',         'schedule',  '同一時期への工程集中を検出（将来）',                                  false, 30),
    (4, 'RULE-004', '担当者負荷',       'people',    '担当者・部門の負荷集中を検出（将来）',                                false, 40),
    (5, 'RULE-005', '納期リスク',       'delivery',  '納期に対する遅延リスクを検出（将来）',                                false, 50),
    (6, 'RULE-006', '休日・稼働日',     'calendar',  '休日・非稼働日への工程割当を検出（将来）',                            false, 60),
    (7, 'RULE-007', 'KPI影響',          'kpi',       'KPI Insight 連携による影響評価（将来）',                              false, 70),
    (8, 'RULE-008', 'SCM/EOL影響',      'scm',       'SCM・EOL 観点の影響評価（将来）',                                    false, 80)
ON CONFLICT (id) DO NOTHING;

SELECT setval('review_rules_id_seq', GREATEST((SELECT MAX(id) FROM review_rules), 8));

COMMIT;
