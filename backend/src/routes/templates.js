const express = require('express');
const router  = express.Router();
const db      = require('../db');

/**
 * GET /api/templates
 * クエリ: ?machine_type=TYPE-A  → 機種一致 + 全機種共通(NULL)を返す
 */
router.get('/', async (req, res, next) => {
    try {
        const { machine_type } = req.query;
        const params = [];
        const where  = ['t.is_active = TRUE'];

        if (machine_type) {
            params.push(machine_type);
            where.push(`(t.machine_type = $${params.length} OR t.machine_type IS NULL)`);
        }

        const { rows } = await db.query(
            `SELECT
                t.*,
                COUNT(te.id)                                        AS event_count,
                COUNT(te.id) FILTER (WHERE te.is_milestone = TRUE)  AS milestone_count
             FROM milestone_pattern t
             LEFT JOIN milestone_pattern_events te ON te.pattern_id = t.id
             WHERE ${where.join(' AND ')}
             GROUP BY t.id
             ORDER BY t.pattern_name`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/templates/:id/events
 * テンプレートの工程一覧（適用前プレビュー用）
 * クエリ: ?base_date=2026-06-01 → 予定日プレビューも計算して返す
 */
router.get('/:id/events', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT
                te.sort_order,
                te.offset_days,
                te.offset_base,
                te.is_milestone,
                te.is_required,
                m.id            AS event_master_id,
                m.event_code,
                m.event_name,
                m.event_type,
                m.owner_department,
                m.standard_lead_days
             FROM milestone_pattern_events te
             JOIN event_master             m ON m.id = te.event_master_id
             WHERE te.pattern_id = $1
               AND m.is_active   = TRUE
             ORDER BY te.sort_order ASC`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: 'テンプレートが見つからないか、有効な工程がありません。',
            });
        }

        // base_date が指定されていれば予定日を計算してプレビューとして付加
        const { base_date } = req.query;
        if (base_date) {
            // 'YYYY-MM-DD' をローカル日付として解釈（UTC ずれ回避）
            const [y, mo, dy] = base_date.split('-').map(Number);
            const baseDate  = new Date(y, mo - 1, dy);
            const toStr = (d) => {
                const yy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yy}-${mm}-${dd}`;
            };
            let prevPlanDate = null;

            rows.forEach((te) => {
                const anchor = (te.offset_base === 'prev_event' && prevPlanDate)
                    ? prevPlanDate
                    : baseDate;
                const d = new Date(anchor);
                d.setDate(d.getDate() + te.offset_days);
                te.preview_plan_date = toStr(d);
                prevPlanDate = d;
            });
        }

        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
