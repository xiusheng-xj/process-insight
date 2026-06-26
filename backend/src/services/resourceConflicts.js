// Resource重複（キャパ超過）の一括計算サービス
// 工程計画レビュー Rule-001 の判定を、案件横断で「1クエリ」で求める。
// プログラムガント／工程ステップ一覧など、複数案件を一覧する画面で利用する。
//
// 判定: 同一 resource × 同一 plan_date × 同一工程 の件数 > resource.capacity で衝突。
//   - イベント側の「同一工程」キー: event_master_id（カスタムは event_name）
//   - ステップ側の「同一工程」キー: process_name
//
// 戻り値:
//   byId      : Map<id, detail>           衝突に関与する各 event/step の id → 衝突詳細
//   byProject : Map<projectId, detail[]>  案件 id → その案件が関与する衝突詳細の配列
// detail = { resource_name, plan_date, count, capacity, over_by, department_code }

const db = require('../db');

function buildMaps(rows) {
    const byId = new Map();
    const byProject = new Map();
    for (const g of rows) {
        const detail = {
            resource_name:   g.resource_name,
            plan_date:       g.plan_date,
            count:           Number(g.cnt),
            capacity:        g.capacity,
            over_by:         Number(g.cnt) - g.capacity,
            department_code: g.department_code,
        };
        for (const id of g.ids) byId.set(id, detail);
        for (const pid of g.pids) {
            if (!byProject.has(pid)) byProject.set(pid, []);
            byProject.get(pid).push(detail);
        }
    }
    return { byId, byProject };
}

// イベント（project_events）の resource 衝突
async function computeEventConflicts(database = db) {
    const { rows } = await database.query(
        `WITH grp AS (
            SELECT resource_id, plan_date,
                   COALESCE(event_master_id::text, 'N:' || event_name) AS pk,
                   COUNT(*)                       AS cnt,
                   array_agg(id)                  AS ids,
                   array_agg(DISTINCT project_id) AS pids
            FROM project_events
            WHERE resource_id IS NOT NULL
              AND plan_date   IS NOT NULL
              AND deleted_at  IS NULL
            GROUP BY resource_id, plan_date, COALESCE(event_master_id::text, 'N:' || event_name)
        )
        SELECT g.ids, g.pids, g.cnt,
               TO_CHAR(g.plan_date, 'YYYY-MM-DD') AS plan_date,
               r.resource_name, r.capacity, r.department_code
        FROM grp g JOIN resources r ON r.id = g.resource_id
        WHERE g.cnt > r.capacity`
    );
    return buildMaps(rows);
}

// 工程ステップ（project_process_steps）の resource 衝突
async function computeStepConflicts(database = db) {
    const { rows } = await database.query(
        `WITH grp AS (
            SELECT resource_id, plan_date, process_name AS pk,
                   COUNT(*)                       AS cnt,
                   array_agg(id)                  AS ids,
                   array_agg(DISTINCT project_id) AS pids
            FROM project_process_steps
            WHERE resource_id IS NOT NULL
              AND plan_date   IS NOT NULL
              AND deleted_at  IS NULL
            GROUP BY resource_id, plan_date, process_name
        )
        SELECT g.ids, g.pids, g.cnt,
               TO_CHAR(g.plan_date, 'YYYY-MM-DD') AS plan_date,
               r.resource_name, r.capacity, r.department_code
        FROM grp g JOIN resources r ON r.id = g.resource_id
        WHERE g.cnt > r.capacity`
    );
    return buildMaps(rows);
}

module.exports = { computeEventConflicts, computeStepConflicts };
