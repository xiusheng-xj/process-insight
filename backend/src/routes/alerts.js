const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');

// 案件配下のアラート一覧
router.get('/', async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const { is_resolved, severity } = req.query;
        const params = [project_id];
        const where = ['a.project_id = $1'];

        if (is_resolved !== undefined) {
            params.push(is_resolved === 'true');
            where.push(`a.is_resolved = $${params.length}`);
        }
        if (severity) {
            params.push(severity);
            where.push(`a.severity = $${params.length}`);
        }

        const { rows } = await db.query(
            `SELECT a.*, e.event_name, e.plan_date, e.actual_date
             FROM project_alerts a
             LEFT JOIN project_events e ON e.id = a.event_id
             WHERE ${where.join(' AND ')}
             ORDER BY a.created_at DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// アラート解決
router.patch('/:id/resolve', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE project_alerts
             SET is_resolved = TRUE, resolved_at = NOW()
             WHERE id = $1 AND project_id = $2
             RETURNING *`,
            [req.params.id, req.params.project_id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'アラートが見つかりません。' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// 全案件の未解決アラート集計
router.get('/summary', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT p.id AS project_id, p.project_no, p.project_name,
                    COUNT(a.id)                                          AS total_alerts,
                    COUNT(a.id) FILTER (WHERE a.severity = 'critical')  AS critical_count,
                    COUNT(a.id) FILTER (WHERE a.severity = 'warning')   AS warning_count,
                    COUNT(a.id) FILTER (WHERE a.severity = 'info')      AS info_count
             FROM projects p
             LEFT JOIN project_alerts a ON a.project_id = p.id AND a.is_resolved = FALSE
             GROUP BY p.id, p.project_no, p.project_name
             HAVING COUNT(a.id) > 0
             ORDER BY critical_count DESC, warning_count DESC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
