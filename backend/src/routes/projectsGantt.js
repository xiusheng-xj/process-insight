const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { computeEventConflicts, computeStepConflicts } = require('../services/resourceConflicts');

// 衝突詳細配列 → 案件単位のサマリ（重複排除）と確認喚起文を作る
function summarizeConflicts(details) {
    const seen = new Set();
    const conflicts = [];
    const depts = new Set();
    for (const d of details) {
        const key = `${d.resource_name}|${d.plan_date}`;
        if (!seen.has(key)) { seen.add(key); conflicts.push(d); }
        if (d.department_code) depts.add(d.department_code);
    }
    const guidance = [...depts].map((dep) => `${dep}部門と日程確認を行ってください。`);
    return { conflicts, guidance };
}

/* ── Shared SQL (mirrors projects.js exactly) ── */
const EFFECTIVE_STATUS_SQL = `
    CASE
        WHEN p.status = 'on_hold'   THEN 'on_hold'
        WHEN p.status = 'cancelled' THEN 'cancelled'
        WHEN ec.done = 0            THEN 'not_started'
        WHEN ec.done = ec.total AND ec.total > 0
            AND p.project_name IS NOT NULL
            AND p.owner_name IS NOT NULL
            AND p.order_date IS NOT NULL
            AND p.required_delivery_date IS NOT NULL
            AND p.confirmed_delivery_date IS NOT NULL
            THEN 'completed'
        ELSE 'in_progress'
    END
`;

const EVENT_COUNTS_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total, COUNT(actual_date) AS done
        FROM project_events WHERE project_id = p.id
    ) ec ON TRUE
`;

const ALARM_STATS_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                       AS alarm_count,
            COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
        FROM project_alerts
        WHERE project_id = p.id AND is_resolved = FALSE
    ) al ON TRUE
`;

const OVERDUE_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS overdue_count
        FROM project_events
        WHERE project_id = p.id
          AND actual_date IS NULL
          AND plan_date < CURRENT_DATE
    ) ov ON TRUE
`;

const HEALTH_STATUS_SQL = `
    CASE
        WHEN ov.overdue_count >= 3 OR al.critical_count > 0 THEN 'danger'
        WHEN ov.overdue_count >= 1 OR al.alarm_count    >= 1 THEN 'caution'
        ELSE 'healthy'
    END
`;

/* GET /api/projects/gantt */
router.get('/', async (req, res, next) => {
    try {
        const { status, health_status, search } = req.query;
        const params = [];
        const where  = ['p.deleted_at IS NULL', "p.status != 'cancelled'"];

        if (status) {
            params.push(status);
            where.push(`p.status = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(`(p.project_no ILIKE $${params.length} OR p.project_name ILIKE $${params.length})`);
        }

        const whereClause = `WHERE ${where.join(' AND ')}`;

        const { rows } = await db.query(
            `SELECT
                p.id, p.project_no, p.project_name, p.status,
                p.machine_type, p.owner_name,
                ec.total         AS progress_total,
                ec.done          AS progress_done,
                al.alarm_count,
                ov.overdue_count,
                ${EFFECTIVE_STATUS_SQL} AS effective_status,
                ${HEALTH_STATUS_SQL}    AS health_status,
                dates.plan_start,
                dates.plan_end,
                dates.actual_start,
                dates.actual_latest,
                dates.max_overdue_days,
                ms.milestones
             FROM projects p
             ${EVENT_COUNTS_LATERAL}
             ${ALARM_STATS_LATERAL}
             ${OVERDUE_LATERAL}
             LEFT JOIN LATERAL (
                SELECT
                    MIN(plan_date)   AS plan_start,
                    MAX(plan_date)   AS plan_end,
                    MIN(actual_date) AS actual_start,
                    MAX(actual_date) AS actual_latest,
                    COALESCE(MAX(CASE
                        WHEN actual_date IS NULL AND plan_date < CURRENT_DATE
                        THEN (CURRENT_DATE - plan_date) ELSE 0
                    END), 0) AS max_overdue_days
                FROM project_events
                WHERE project_id = p.id AND deleted_at IS NULL
             ) dates ON TRUE
             LEFT JOIN LATERAL (
                SELECT json_agg(
                    json_build_object(
                        'id',           pe.id,
                        'event_name',   pe.event_name,
                        'plan_date',    TO_CHAR(pe.plan_date,   'YYYY-MM-DD'),
                        'actual_date',  TO_CHAR(pe.actual_date, 'YYYY-MM-DD'),
                        'is_overdue',   (pe.actual_date IS NULL AND pe.plan_date < CURRENT_DATE),
                        'is_completed', (pe.actual_date IS NOT NULL),
                        'diff_days',    CASE WHEN pe.actual_date IS NOT NULL
                                             THEN (pe.actual_date - pe.plan_date) ELSE NULL END,
                        'sort_order',   pe.sort_order
                    ) ORDER BY pe.sort_order
                ) AS milestones
                FROM project_events pe
                WHERE pe.project_id = p.id
                  AND pe.deleted_at IS NULL
                  AND pe.plan_date IS NOT NULL
             ) ms ON TRUE
             ${whereClause}
             ORDER BY p.updated_at DESC`,
            params
        );

        /* health_status フィルターはサーバー側で算出後に適用 */
        const filtered = health_status
            ? rows.filter(r => r.health_status === health_status)
            : rows;

        /* 工程計画レビュー（Resource重複）を案件横断で一括算出 */
        const evConf = await computeEventConflicts();
        const stConf = await computeStepConflicts();

        /* 全案件の計画期間から date_range を算出 */
        let minDate = null;
        let maxDate = null;
        for (const r of filtered) {
            const ps = r.plan_start ? String(r.plan_start).slice(0, 10) : null;
            const pe = r.plan_end   ? String(r.plan_end).slice(0, 10)   : null;
            if (ps && (!minDate || ps < minDate)) minDate = ps;
            if (pe && (!maxDate || pe > maxDate)) maxDate = pe;
        }

        res.json({
            data: filtered.map(r => {
                // マイルストーン（イベント）に衝突フラグを付与
                const milestones = (r.milestones || []).map((m) => {
                    const c = evConf.byId.get(m.id);
                    return c ? { ...m, is_conflict: true, conflict: c } : m;
                });
                // 案件単位の衝突サマリ（イベント＋ステップ）
                const details = [
                    ...(evConf.byProject.get(r.id) || []),
                    ...(stConf.byProject.get(r.id) || []),
                ];
                const reviewVerdict = details.length > 0 ? 'adjust' : 'ok';
                const { conflicts, guidance } = summarizeConflicts(details);

                return {
                    ...r,
                    plan_start:    r.plan_start    ? String(r.plan_start).slice(0, 10)    : null,
                    plan_end:      r.plan_end      ? String(r.plan_end).slice(0, 10)      : null,
                    actual_start:  r.actual_start  ? String(r.actual_start).slice(0, 10)  : null,
                    actual_latest: r.actual_latest ? String(r.actual_latest).slice(0, 10) : null,
                    milestones,
                    review_verdict:   reviewVerdict,
                    review_conflicts: conflicts,
                    review_guidance:  guidance,
                };
            }),
            total: filtered.length,
            date_range: { min_date: minDate, max_date: maxDate },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
