-- project_alerts 重複行クリーンアップ（開発用DB安全版）
-- 方針:
--   1. is_resolved = FALSE (未解決) の行は絶対に削除しない
--   2. is_resolved = TRUE (解決済み) の重複行のうち、古いものを削除（最新のみ残す）
--   3. PARTITION BY project_id, event_id, alert_type, is_resolved で重複判定
--      ※ event_id IS NULL の行も COALESCE でグループ化
--   4. 実行前に SELECT で削除対象を確認すること

-- ① 削除対象確認（実行前に必ずこれを先に実行）
SELECT
    '削除対象' AS action,
    id,
    project_id,
    event_id,
    alert_type,
    is_resolved,
    to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS created_at_jst,
    LEFT(message, 60) AS message_short
FROM project_alerts
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY
                       project_id,
                       COALESCE(event_id::text, '__null__'),
                       alert_type,
                       is_resolved
                   ORDER BY id DESC  -- 最大 id (最新) を残す
               ) AS rn
        FROM project_alerts
        WHERE is_resolved = TRUE  -- 未解決は対象外
    ) ranked
    WHERE rn > 1  -- 2番目以降（古いもの）を削除
)
ORDER BY project_id, event_id NULLS LAST, id;

-- ② 実際の削除（上記確認後、問題なければ実行）
-- BEGIN;
-- DELETE FROM project_alerts
-- WHERE id IN (
--     SELECT id FROM (
--         SELECT id,
--                ROW_NUMBER() OVER (
--                    PARTITION BY
--                        project_id,
--                        COALESCE(event_id::text, '__null__'),
--                        alert_type,
--                        is_resolved
--                    ORDER BY id DESC
--                ) AS rn
--         FROM project_alerts
--         WHERE is_resolved = TRUE
--     ) ranked
--     WHERE rn > 1
-- );
-- -- 削除件数を確認してから COMMIT
-- -- ROLLBACK;  -- 問題があればロールバック
-- COMMIT;

-- ③ 実行後の確認
-- SELECT project_id, event_id, alert_type, is_resolved, COUNT(*) AS cnt
-- FROM project_alerts
-- GROUP BY project_id, event_id, alert_type, is_resolved
-- HAVING COUNT(*) > 1;
-- -- 0行なら重複なし
