// RULE-001 Resource重複チェック
// 判定: 同一 resource × 同一 plan_date × 同一工程（event_master_id、カスタムは event_name）の
//       件数が resource.capacity を超えたら衝突（要調整）。
//       「同一工程種別で数える」方針（確定）。Location は判定対象にしない（将来 Rule-002）。
//
// 当該案件の工程が関与する衝突グループのみを抽出し、案件横断の件数で判定する。
//
// 【将来拡張の設計余地】
//   現状は project_events.resource_id を対象に判定する。ユーザーが実際に編集するのは
//   project_process_steps（schema_v21 で location_id/resource_id を追加済み）であるため、
//   将来は project_process_steps を UNION して resource 衝突を見られるようにする。
//   その際は下記クエリの対象テーブルを events/steps の和に拡張し、target_type を
//   'event' / 'step' で出し分ける（review_findings.target_type は対応済み）。

const { VERDICT, SEVERITY } = require('../verdict');

// 「同一工程」キー：event_master_id があればそれ、無ければ 'N:'+event_name
const PROCESS_KEY = `COALESCE(event_master_id::text, 'N:' || event_name)`;

module.exports = {
    code: 'RULE-001',
    name: 'Resource重複',
    category: 'resource',

    async evaluate({ projectId, db }) {
        const { rows } = await db.query(
            `WITH grp AS (
                SELECT
                    x.resource_id,
                    x.plan_date,
                    ${PROCESS_KEY}                              AS process_key,
                    COUNT(*)                                    AS cnt,
                    array_agg(DISTINCT p.project_no ORDER BY p.project_no) AS conflict_project_nos
                FROM project_events x
                JOIN projects p ON p.id = x.project_id
                WHERE x.resource_id IS NOT NULL
                  AND x.plan_date   IS NOT NULL
                  AND x.deleted_at  IS NULL
                GROUP BY x.resource_id, x.plan_date, ${PROCESS_KEY}
            )
            SELECT
                g.resource_id, g.plan_date, g.cnt, g.conflict_project_nos,
                r.resource_name, r.capacity, r.department_code,
                -- この案件の代表イベント（findings.target_id 用）
                (SELECT e2.id
                   FROM project_events e2
                  WHERE e2.project_id = $1
                    AND e2.resource_id = g.resource_id
                    AND e2.plan_date   = g.plan_date
                    AND ${PROCESS_KEY.replace(/event_master_id/g, 'e2.event_master_id').replace(/event_name/g, 'e2.event_name')} = g.process_key
                    AND e2.deleted_at IS NULL
                  LIMIT 1)                                      AS target_id,
                (SELECT e3.event_name
                   FROM project_events e3
                  WHERE e3.project_id = $1
                    AND e3.resource_id = g.resource_id
                    AND e3.plan_date   = g.plan_date
                    AND ${PROCESS_KEY.replace(/event_master_id/g, 'e3.event_master_id').replace(/event_name/g, 'e3.event_name')} = g.process_key
                    AND e3.deleted_at IS NULL
                  LIMIT 1)                                      AS event_name
            FROM grp g
            JOIN resources r ON r.id = g.resource_id
            WHERE g.cnt > r.capacity
              AND EXISTS (
                  SELECT 1 FROM project_events e
                   WHERE e.project_id = $1
                     AND e.resource_id = g.resource_id
                     AND e.plan_date   = g.plan_date
                     AND ${PROCESS_KEY.replace(/event_master_id/g, 'e.event_master_id').replace(/event_name/g, 'e.event_name')} = g.process_key
                     AND e.deleted_at IS NULL
              )
            ORDER BY g.plan_date, r.resource_name`,
            [projectId]
        );

        const items = rows.map((r) => {
            const count    = Number(r.cnt);
            const overBy   = count - r.capacity;
            return {
                target_id: r.target_id,
                verdict:   VERDICT.ADJUST,
                severity:  SEVERITY.adjust,
                message:   `${r.plan_date} 「${r.event_name}」が ${r.resource_name} に集中：`
                         + `${count}件 / capacity ${r.capacity}（+${overBy} 超過）`,
                detail: {
                    resource_id:          r.resource_id,
                    resource_name:        r.resource_name,
                    plan_date:            r.plan_date,
                    event_name:           r.event_name,
                    count,
                    capacity:             r.capacity,
                    over_by:              overBy,
                    department_code:      r.department_code,
                    conflict_project_nos: r.conflict_project_nos,
                },
            };
        });

        const summary = items.length
            ? `${items.length}件の resource 衝突`
            : 'resource 衝突なし';

        return { items, summary };
    },
};
