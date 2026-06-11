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
        const lockedBy = lockRows[0]?.locked_by;
        const requestUser = req.headers['x-user-name'] || 'unknown';
        if (lockedBy && lockedBy !== requestUser) {
            await client.query('ROLLBACK');
            return res.status(423).json({ error: `${lockedBy} が編集中です。`, locked_by: lockedBy });
        }

        const { pattern_no, machine_type, project_name, product_name, quantity, status, comment } = req.body;
        const { rows } = await client.query(
            `UPDATE projects SET
                pattern_no   = COALESCE($1, pattern_no),
                machine_type = COALESCE($2, machine_type),
                project_name = COALESCE($3, project_name),
                product_name = COALESCE($4, product_name),
                quantity     = COALESCE($5, quantity),
                status       = COALESCE($6, status),
                comment      = COALESCE($7, comment)
             WHERE id = $8
             RETURNING *`,
            [pattern_no, machine_type, project_name, product_name, quantity, status, comment, req.params.id]
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
