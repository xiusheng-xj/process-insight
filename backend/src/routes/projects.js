const express = require('express');
const router = express.Router();
const db = require('../db');

// 一覧取得
router.get('/', async (req, res, next) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        const params = [];
        const where = [];

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
                    (SELECT COUNT(*) FROM project_alerts a
                     WHERE a.project_id = p.id AND a.is_resolved = FALSE) AS unresolved_alerts,
                    (SELECT COUNT(*) FROM project_events e2
                     WHERE e2.project_id = p.id
                       AND e2.actual_date IS NULL
                       AND e2.plan_date < NOW()::DATE) AS delay_count,
                    CASE WHEN pl.lock_status = 'active' AND pl.expires_at > NOW()
                         THEN TRUE ELSE FALSE END AS is_locked,
                    pl.locked_by AS current_locked_by
             FROM projects p
             LEFT JOIN project_locks pl
               ON pl.project_id = p.id AND pl.lock_status = 'active' AND pl.expires_at > NOW()
             ${whereClause}
             ORDER BY p.updated_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const total = rows[0]?.total_count ?? 0;
        res.json({ data: rows, total: Number(total), page: Number(page), limit: Number(limit) });
    } catch (err) {
        next(err);
    }
});

// 単件取得
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM project_alerts a
                     WHERE a.project_id = p.id AND a.is_resolved = FALSE) AS unresolved_alerts
             FROM projects p WHERE p.id = $1`,
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
        const { project_no, pattern_no, machine_type, project_name, product_name, quantity, status, comment } = req.body;
        if (!project_no || !project_name) {
            return res.status(400).json({ error: 'project_no と project_name は必須です。' });
        }

        const { rows } = await db.query(
            `INSERT INTO projects
                (project_no, pattern_no, machine_type, project_name, product_name, quantity, status, comment)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING *`,
            [project_no, pattern_no, machine_type, project_name, product_name, quantity ?? 0, status ?? 'active', comment]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
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
            order_date, price_type, price_amount,
            required_delivery_date, promised_delivery_date, delivery_status,
            management_no_a, management_no_b, management_no_c,
            management_no_d, management_no_e, management_no_f,
        } = req.body;

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
                price_type               = $13,
                price_amount             = $14,
                required_delivery_date   = $15,
                promised_delivery_date   = $16,
                delivery_status          = $17,
                management_no_a          = $18,
                management_no_b          = $19,
                management_no_c          = $20,
                management_no_d          = $21,
                management_no_e          = $22,
                management_no_f          = $23
             WHERE id = $24
             RETURNING *`,
            [
                pattern_no   || null,
                machine_type || null,
                project_name || null,
                product_name || null,
                quantity != null && quantity !== '' ? quantity : null,
                status       || null,
                comment      || null,
                owner_name   || null,
                dept_a_owner || null,
                dept_b_owner || null,
                dept_c_owner || null,
                order_date              || null,
                price_type              || null,
                price_amount != null && price_amount !== '' ? price_amount : null,
                required_delivery_date  || null,
                promised_delivery_date  || null,
                delivery_status         || null,
                management_no_a || null,
                management_no_b || null,
                management_no_c || null,
                management_no_d || null,
                management_no_e || null,
                management_no_f || null,
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

// 削除
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await db.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: '案件が見つかりません。' });
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
