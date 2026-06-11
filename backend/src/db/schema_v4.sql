-- ============================================================
-- schema_v4.sql
-- STD_MFG テンプレートを 12工程 → 20工程 へ移行
-- ============================================================
-- 変更内容:
--   1. template_events の既存12工程の sort_order を再番号付け
--      (新規8工程が間に挿入されるため)
--   2. 新規8工程を template_events へ追加
-- ============================================================

BEGIN;

-- ── 1. 既存12工程の sort_order を 20工程シーケンスへ更新 ────────
--       event_master.sort_order (10〜132) に対応した
--       template 内連番 (1〜20) に変更する

UPDATE template_events SET sort_order = 1
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'ORDER_CONFIRM');

UPDATE template_events SET sort_order = 4
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'BASIC_DESIGN');

UPDATE template_events SET sort_order = 5
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'DETAIL_DESIGN');

UPDATE template_events SET sort_order = 6
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'DESIGN_REVIEW');

UPDATE template_events SET sort_order = 8
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'PARTS_ORDER');

UPDATE template_events SET sort_order = 10
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'PARTS_ARRIVAL');

UPDATE template_events SET sort_order = 11
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'ASSEMBLY_START');

UPDATE template_events SET sort_order = 12
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'ASSEMBLY_COMPLETE');

UPDATE template_events SET sort_order = 14
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'FACTORY_TEST');

UPDATE template_events SET sort_order = 16
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'SHIPMENT');

UPDATE template_events SET sort_order = 18
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'SITE_INSTALL');

UPDATE template_events SET sort_order = 19
WHERE template_id = 1
  AND event_master_id = (SELECT id FROM event_master WHERE event_code = 'ACCEPTANCE');

-- ── 2. 新規8工程を template_events へ追加 ────────────────────
--       offset_days は仮値（業務確認後に更新すること）
--       offset_base = 'project_start' で統一（変更は別途対応）

INSERT INTO template_events
    (template_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
VALUES
    -- sort 2: 仕様確定（受注確定の5日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'SPEC_CONFIRM'),
        2, 5, 'project_start', FALSE, TRUE),

    -- sort 3: KK日（設計起工）（仕様確定の2日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'KK_DATE'),
        3, 7, 'project_start', FALSE, TRUE),

    -- sort 7: 図面承認（設計レビュー完了の2日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'DRAWING_APPROVAL'),
        7, 44, 'project_start', FALSE, FALSE),

    -- sort 9: 材料発注（部品発注の3日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'MATERIAL_ORDER'),
        9, 48, 'project_start', FALSE, FALSE),

    -- sort 13: 配線完了（組立完了の5日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'WIRING_COMPLETE'),
        13, 103, 'project_start', FALSE, FALSE),

    -- sort 15: 客先立会検査完了（社内試験完了の1日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'CUSTOMER_INSPECTION'),
        15, 109, 'project_start', TRUE, FALSE),

    -- sort 17: 出荷準備完了（出荷の2日前）
    (1, (SELECT id FROM event_master WHERE event_code = 'SHIPPING_READY'),
        17, 113, 'project_start', FALSE, FALSE),

    -- sort 20: 現地試験完了（現地据付完了の3日後）
    (1, (SELECT id FROM event_master WHERE event_code = 'SITE_TEST'),
        20, 128, 'project_start', FALSE, FALSE)

ON CONFLICT (template_id, event_master_id) DO NOTHING;

COMMIT;
