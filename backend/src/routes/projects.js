const express = require('express');
const router = express.Router();
const db = require('../db');

/* ── effective_status 算出 SQL ── */
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

/* ── イベント件数 LATERAL JOIN ── */
const EVENT_COUNTS_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total, COUNT(actual_date) AS done
        FROM project_events WHERE project_id = p.id
    ) ec ON TRUE
`;

/* ── アラーム統計 LATERAL JOIN ── */
const ALARM_STATS_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                       AS alarm_count,
            COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
        FROM project_alerts
        WHERE project_id = p.id AND is_resolved = FALSE
    ) al ON TRUE
`;

/* ── 未完了遅れ件数 LATERAL JOIN ── */
const OVERDUE_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS overdue_count
        FROM project_events
        WHERE project_id = p.id
          AND actual_date IS NULL
          AND plan_date < CURRENT_DATE
    ) ov ON TRUE
`;

/* ── 健全性算出 SQL ── */
const HEALTH_STATUS_SQL = `
    CASE
        WHEN ov.overdue_count >= 3 OR al.critical_count > 0 THEN 'danger'
        WHEN ov.overdue_count >= 1 OR al.alarm_count    >= 1 THEN 'caution'
        ELSE 'healthy'
    END
`;

/* ── スケジュール評価 LATERAL JOIN（単件取得のみ） ── */
const SCHEDULE_EVAL_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE actual_date IS NOT NULL AND actual_date < plan_date)  AS ahead,
            COUNT(*) FILTER (WHERE actual_date IS NOT NULL AND actual_date = plan_date)  AS on_time,
            COUNT(*) FILTER (WHERE actual_date IS NOT NULL AND actual_date > plan_date)  AS delayed,
            COUNT(*) FILTER (WHERE actual_date IS NULL AND plan_date < CURRENT_DATE)     AS overdue,
            COUNT(*) FILTER (WHERE actual_date IS NULL
                             AND (plan_date IS NULL OR plan_date >= CURRENT_DATE))       AS pending
        FROM project_events WHERE project_id = p.id
    ) sc ON TRUE
`;

// 一覧取得
router.get('/', async (req, res, next) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        const params = [];
        const where = ['p.deleted_at IS NULL'];

        if (status) {
            params.push(status);
            where.push(`p.status = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(`(p.project_no ILIKE $${params.length} OR p.project_name ILIKE $${params.length} OR p.product_name ILIKE $${params.length})`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        params.push(limit);
        params.push(offset);

        const { rows } = await db.query(
            `SELECT p.*,
                    COUNT(*) OVER() AS total_count,
                    ec.total  AS progress_total,
                    ec.done   AS progress_done,
                    al.alarm_count,
                    ${EFFECTIVE_STATUS_SQL} AS effective_status,
                    ${HEALTH_STATUS_SQL}    AS health_status,
                    CASE WHEN pl.lock_status = 'active' AND pl.expires_at > NOW()
                         THEN TRUE ELSE FALSE END AS is_locked,
                    pl.locked_by AS current_locked_by
             FROM projects p
             LEFT JOIN project_locks pl
               ON pl.project_id = p.id AND pl.lock_status = 'active' AND pl.expires_at > NOW()
             ${EVENT_COUNTS_LATERAL}
             ${ALARM_STATS_LATERAL}
             ${OVERDUE_LATERAL}
             ${whereClause}
             ORDER BY p.updated_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const total = rows[0]?.total_count ?? 0;
        const { rows: tc } = await db.query(
            'SELECT COUNT(*) AS cnt FROM projects WHERE deleted_at IS NOT NULL'
        );
        res.json({
            data: rows,
            total: Number(total),
            page: Number(page),
            limit: Number(limit),
            trash_count: Number(tc[0]?.cnt ?? 0),
        });
    } catch (err) {
        next(err);
    }
});

// ゴミ箱一覧（/:id より前に定義）
router.get('/trash', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, project_no, project_name,
                    deleted_at, deleted_reason, deleted_by, updated_at
             FROM projects
             WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC`
        );
        res.json({ data: rows, total: rows.length });
    } catch (err) { next(err); }
});

// 復元（/:id より前に定義）
router.patch('/:id/restore', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE projects
             SET deleted_at = NULL, deleted_reason = NULL
             WHERE id = $1 AND deleted_at IS NOT NULL
             RETURNING *`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: '案件が見つかりません。' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// 単件取得
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM project_alerts a
                     WHERE a.project_id = p.id AND a.is_resolved = FALSE) AS unresolved_alerts,
                    ec.total AS progress_total,
                    ec.done  AS progress_done,
                    sc.ahead   AS eval_ahead,
                    sc.on_time AS eval_on_time,
                    sc.delayed AS eval_delayed,
                    sc.overdue AS eval_overdue,
                    sc.pending AS eval_pending,
                    ${EFFECTIVE_STATUS_SQL} AS effective_status
             FROM projects p
             ${EVENT_COUNTS_LATERAL}
             ${SCHEDULE_EVAL_LATERAL}
             WHERE p.id = $1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: '案件が見つかりません。' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// 新規作成
router.post('/', async (req, res, next) => {
    try {
        const { project_no, project_name, owner_name, applied_milestone_pattern_id } = req.body;
        if (!project_no?.trim())   return res.status(400).json({ error: 'project_no は必須です。' });
        if (!project_name?.trim()) return res.status(400).json({ error: 'project_name は必須です。' });
        if (!owner_name?.trim())   return res.status(400).json({ error: 'owner_name は必須です。' });

        const { rows } = await db.query(
            `INSERT INTO projects
                (project_no, project_name, owner_name, applied_milestone_pattern_id, status)
             VALUES ($1, $2, $3, $4, 'active')
             RETURNING *`,
            [
                project_no.trim(),
                project_name.trim(),
                owner_name.trim(),
                applied_milestone_pattern_id || null,
            ]
        );
        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

// 更新
router.put('/:id', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // ロックチェック
        const { rows: lockRows } = await client.query(
            `SELECT * FROM project_locks
             WHERE project_id = $1 AND lock_status = 'active' AND expires_at > NOW()`,
            [req.params.id]
        );
        const lockedBy    = lockRows[0]?.locked_by;
        const requestUser = req.headers['x-user-name'] || 'unknown';
        if (lockedBy && lockedBy !== requestUser) {
            await client.query('ROLLBACK');
            return res.status(423).json({ error: `${lockedBy} が編集中です。`, locked_by: lockedBy });
        }

        const {
            pattern_no, machine_type, project_name, product_name, quantity, status, comment,
            owner_name, dept_a_owner, dept_b_owner, dept_c_owner,
            order_date, estimated_price, final_price,
            required_delivery_date, promised_delivery_date, confirmed_delivery_date, delivery_status,
            management_no_a, management_no_b, management_no_c,
            management_no_d, management_no_e, management_no_f,
            doc_a_latest_submit_date, project_type,
        } = req.body;

        const toNum = (v) => (v != null && v !== '') ? Number(v) : null;

        const { rows } = await client.query(
            `UPDATE projects SET
                pattern_no               = COALESCE($1,  pattern_no),
                machine_type             = $2,
                project_name             = COALESCE($3,  project_name),
                product_name             = $4,
                quantity                 = $5,
                status                   = COALESCE($6,  status),
                comment                  = $7,
                owner_name               = $8,
                dept_a_owner             = $9,
                dept_b_owner             = $10,
                dept_c_owner             = $11,
                order_date               = $12,
                estimated_price          = $13,
                final_price              = $14,
                required_delivery_date   = $15,
                promised_delivery_date   = $16,
                confirmed_delivery_date  = $17,
                delivery_status          = $18,
                management_no_a          = $19,
                management_no_b          = $20,
                management_no_c          = $21,
                management_no_d          = $22,
                management_no_e          = $23,
                management_no_f          = $24,
                doc_a_latest_submit_date = $25,
                project_type             = $26
             WHERE id = $27
             RETURNING *`,
            [
                pattern_no   || null,
                machine_type || null,
                project_name || null,
                product_name || null,
                toNum(quantity),
                status       || null,
                comment      || null,
                owner_name   || null,
                dept_a_owner || null,
                dept_b_owner || null,
                dept_c_owner || null,
                order_date              || null,
                toNum(estimated_price),
                toNum(final_price),
                required_delivery_date  || null,
                promised_delivery_date  || null,
                confirmed_delivery_date || null,
                delivery_status         || null,
                management_no_a || null,
                management_no_b || null,
                management_no_c || null,
                management_no_d || null,
                management_no_e || null,
                management_no_f || null,
                doc_a_latest_submit_date || null,
                project_type             || null,
                req.params.id,
            ]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '案件が見つかりません。' });
        }
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// 論理削除（ゴミ箱へ移動）
router.delete('/:id', async (req, res, next) => {
    try {
        const reason    = req.body?.reason    || null;
        const deletedBy = req.headers['x-user-name'] || req.body?.deleted_by || null;
        const { rows } = await db.query(
            `UPDATE projects
             SET deleted_at = NOW(), deleted_reason = $2, deleted_by = $3
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING id`,
            [req.params.id, reason, deletedBy]
        );
        if (!rows[0]) return res.status(404).json({ error: '案件が見つかりません。' });
        res.json({ id: rows[0].id });
    } catch (err) { next(err); }
});

module.exports = router;
