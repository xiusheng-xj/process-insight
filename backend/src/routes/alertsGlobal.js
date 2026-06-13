const express = require('express');
const router = express.Router();
const db = require('../db');

/* ── 設定デフォルト値 ── */
const DEFAULTS = {
    event_delay_enabled:             'true',
    schedule_missing_days:           '3',
    required_delivery_missing_days:  '3',
    confirmed_delivery_missing_days: '5',
};

async function getSettings() {
    const { rows } = await db.query('SELECT key, value FROM alert_settings');
    const s = { ...DEFAULTS };
    rows.forEach((r) => { s[r.key] = r.value; });
    return s;
}

/* ── アラーム生成ロジック ── */
async function generateAlerts() {
    const cfg = await getSettings();
    const delayEnabled  = cfg.event_delay_enabled === 'true';
    const schedDays     = Math.max(1, parseInt(cfg.schedule_missing_days)           || 3);
    const reqDays       = Math.max(1, parseInt(cfg.required_delivery_missing_days)  || 3);
    const confDays      = Math.max(1, parseInt(cfg.confirmed_delivery_missing_days) || 5);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const { rows: projects } = await db.query(
        `SELECT id, project_name, created_at,
                required_delivery_date, confirmed_delivery_date
         FROM projects WHERE status NOT IN ('cancelled')`
    );

    let generated = 0;

    const exists = async (projectId, eventId, alertType) => {
        const cond = eventId != null
            ? `event_id = ${eventId}`
            : `event_id IS NULL`;
        const { rows } = await db.query(
            `SELECT 1 FROM project_alerts
             WHERE project_id=$1 AND ${cond} AND alert_type=$2 AND is_resolved=FALSE`,
            [projectId, alertType]
        );
        return rows.length > 0;
    };

    const insert = async (projectId, eventId, alertType, severity, message) => {
        await db.query(
            `INSERT INTO project_alerts (project_id, event_id, alert_type, severity, message)
             VALUES ($1, $2, $3, $4, $5)`,
            [projectId, eventId, alertType, severity, message]
        );
        generated++;
    };

    for (const proj of projects) {
        const createdAt = new Date(proj.created_at);
        createdAt.setHours(0, 0, 0, 0);
        const daysSince = Math.floor((today - createdAt) / 86400000);

        /* 1. イベント遅延 */
        if (delayEnabled) {
            const { rows: delayed } = await db.query(
                `SELECT id, event_name FROM project_events
                 WHERE project_id=$1 AND actual_date IS NULL AND plan_date < $2`,
                [proj.id, todayStr]
            );
            for (const ev of delayed) {
                if (!await exists(proj.id, ev.id, 'event_delay')) {
                    await insert(proj.id, ev.id, 'event_delay', 'warning',
                        `「${ev.event_name}」が予定日を超過しています`);
                }
            }
        }

        /* 2. 予定未登録 */
        if (daysSince >= schedDays) {
            const { rows: noSched } = await db.query(
                `SELECT id, event_name FROM project_events
                 WHERE project_id=$1 AND plan_date IS NULL`,
                [proj.id]
            );
            for (const ev of noSched) {
                if (!await exists(proj.id, ev.id, 'schedule_missing')) {
                    await insert(proj.id, ev.id, 'schedule_missing', 'info',
                        `案件登録から${daysSince}日経過していますが「${ev.event_name}」の予定日が未登録です`);
                }
            }
        }

        /* 3. 要求納期未入力 */
        if (daysSince >= reqDays && !proj.required_delivery_date) {
            if (!await exists(proj.id, null, 'required_delivery_missing')) {
                await insert(proj.id, null, 'required_delivery_missing', 'warning',
                    `案件登録から${daysSince}日経過していますが要求納期が未入力です`);
            }
        }

        /* 4. 確定納期未入力 */
        if (daysSince >= confDays && !proj.confirmed_delivery_date) {
            if (!await exists(proj.id, null, 'confirmed_delivery_missing')) {
                await insert(proj.id, null, 'confirmed_delivery_missing', 'info',
                    `案件登録から${daysSince}日経過していますが確定納期が未入力です`);
            }
        }
    }

    return generated;
}

/* ── GET /api/alerts ── */
router.get('/', async (req, res, next) => {
    try {
        const { status = 'unresolved', alert_type, project_id } = req.query;
        const params = [];
        const where = [];

        if (status === 'unresolved') where.push('a.is_resolved = FALSE');
        else if (status === 'resolved') where.push('a.is_resolved = TRUE');

        if (alert_type && alert_type !== 'all') {
            params.push(alert_type);
            where.push(`a.alert_type = $${params.length}`);
        }
        if (project_id) {
            params.push(Number(project_id));
            where.push(`a.project_id = $${params.length}`);
        }

        const wc = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const { rows } = await db.query(
            `SELECT a.*,
                    p.project_no, p.project_name,
                    e.event_name, e.plan_date AS event_plan_date
             FROM project_alerts a
             JOIN projects p ON p.id = a.project_id
             LEFT JOIN project_events e ON e.id = a.event_id
             ${wc}
             ORDER BY a.created_at DESC
             LIMIT 500`,
            params
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/* ── GET /api/alerts/summary ── */
router.get('/summary', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT p.id AS project_id, p.project_no, p.project_name,
                    COUNT(a.id) AS total_alerts,
                    COUNT(a.id) FILTER (WHERE a.severity='critical') AS critical_count,
                    COUNT(a.id) FILTER (WHERE a.severity='warning')  AS warning_count,
                    COUNT(a.id) FILTER (WHERE a.severity='info')     AS info_count
             FROM projects p
             LEFT JOIN project_alerts a ON a.project_id=p.id AND a.is_resolved=FALSE
             GROUP BY p.id, p.project_no, p.project_name
             HAVING COUNT(a.id) > 0
             ORDER BY critical_count DESC, warning_count DESC`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/* ── GET /api/alerts/settings ── */
router.get('/settings', async (req, res, next) => {
    try { res.json(await getSettings()); }
    catch (err) { next(err); }
});

/* ── PUT /api/alerts/settings ── */
router.put('/settings', async (req, res, next) => {
    try {
        const allowed = new Set(Object.keys(DEFAULTS));
        for (const [key, value] of Object.entries(req.body)) {
            if (!allowed.has(key)) continue;
            await db.query(
                `INSERT INTO alert_settings (key, value)
                 VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [key, String(value)]
            );
        }
        res.json(await getSettings());
    } catch (err) { next(err); }
});

/* ── POST /api/alerts/generate ── */
router.post('/generate', async (req, res, next) => {
    try {
        const count = await generateAlerts();
        res.json({ generated: count });
    } catch (err) { next(err); }
});

/* ── PATCH /api/alerts/:id/resolve ── */
router.patch('/:id/resolve', async (req, res, next) => {
    try {
        const resolvedBy = req.headers['x-user-name'] || req.body?.resolved_by || 'unknown';
        const { rows } = await db.query(
            `UPDATE project_alerts
             SET is_resolved=TRUE, resolved_at=NOW(), resolved_by=$2
             WHERE id=$1
             RETURNING *`,
            [req.params.id, resolvedBy]
        );
        if (!rows[0]) return res.status(404).json({ error: 'アラームが見つかりません。' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

module.exports = router;
