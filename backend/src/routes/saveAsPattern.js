const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

/**
 * POST /api/projects/:id/save-as-pattern
 * body: { pattern_name, pattern_code?, description? }
 *
 * 処理:
 *   1. 案件確認
 *   2. deleted_at IS NULL かつ event_master_id IS NOT NULL の project_events を取得
 *      (sort_order 昇順)
 *   3. event_master_id 重複を除去（先着1件を採用）
 *   4. event_master_id IS NULL のイベント件数をカウント（保存対象外）
 *   5. milestone_pattern を新規 INSERT
 *   6. milestone_pattern_events を一括 INSERT
 *      - offset_days: saveable イベントの最小 plan_date を基準 0 日とし、
 *                     plan_date - base_date（日数）を算出。plan_date 未設定は 0。
 *      - offset_base: 'project_start'
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId = req.params.id;
        const { pattern_name, pattern_code, description } = req.body;

        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        // 1. 案件確認
        const { rows: pRows } = await client.query(
            'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
            [projectId]
        );
        if (!pRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '案件が見つかりません。' });
        }

        // 2. 保存対象イベント取得（event_master_id あり、論理削除なし）
        const { rows: saveableRaw } = await client.query(
            `SELECT pe.id, pe.event_master_id, pe.sort_order, pe.plan_date, pe.event_name
             FROM project_events pe
             WHERE pe.project_id = $1
               AND pe.deleted_at IS NULL
               AND pe.event_master_id IS NOT NULL
             ORDER BY pe.sort_order ASC, pe.id ASC`,
            [projectId]
        );

        // 3. event_master_id 重複を除去（先着採用）
        const seen = new Set();
        const saveable = [];
        let duplicateCount = 0;
        for (const ev of saveableRaw) {
            const mid = Number(ev.event_master_id);
            if (seen.has(mid)) {
                duplicateCount++;
            } else {
                seen.add(mid);
                saveable.push(ev);
            }
        }

        // 4. event_master_id なし（保存対象外）の件数
        const { rows: excludedRows } = await client.query(
            `SELECT COUNT(*) AS cnt FROM project_events
             WHERE project_id = $1 AND deleted_at IS NULL AND event_master_id IS NULL`,
            [projectId]
        );
        const excludedCount = Number(excludedRows[0].cnt);

        if (saveable.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: '保存対象のイベントがありません。event_master_id が設定されているイベントが必要です。',
            });
        }

        // 5. offset_days 算出: 最小 plan_date を基準日とする
        const planDates = saveable.map(e => e.plan_date).filter(Boolean);
        const baseDateStr = planDates.length > 0
            ? planDates.reduce((a, b) => a < b ? a : b)
            : null;

        const toDay0 = (str) => {
            const [y, m, d] = str.slice(0, 10).split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.getTime();
        };
        const baseDateMs = baseDateStr ? toDay0(baseDateStr) : null;

        // 6. パターンコード生成（未指定時は自動生成）
        const rawCode  = pattern_code?.trim() || `PROJ_${projectId}_${Date.now()}`;
        const safeCode = rawCode.slice(0, 100);

        // 7. milestone_pattern INSERT
        const { rows: patternRows } = await client.query(
            `INSERT INTO milestone_pattern (pattern_code, pattern_name, description, is_active)
             VALUES ($1, $2, $3, TRUE)
             RETURNING *`,
            [safeCode, pattern_name.trim(), description?.trim() || null]
        );
        const newPattern = patternRows[0];

        // 8. milestone_pattern_events INSERT
        for (let i = 0; i < saveable.length; i++) {
            const ev = saveable[i];
            let offsetDays = 0;
            if (baseDateMs !== null && ev.plan_date) {
                offsetDays = Math.round((toDay0(ev.plan_date) - baseDateMs) / 86400000);
            }

            await client.query(
                `INSERT INTO milestone_pattern_events
                    (pattern_id, event_master_id, sort_order,
                     offset_days, offset_base, is_milestone, is_required)
                 VALUES ($1, $2, $3, $4, 'project_start', FALSE, FALSE)`,
                [newPattern.id, ev.event_master_id, (i + 1) * 10, offsetDays]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            pattern:         newPattern,
            event_count:     saveable.length,
            excluded_count:  excludedCount,
            duplicate_count: duplicateCount,
            base_date:       baseDateStr,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505' && err.constraint === 'milestone_pattern_pattern_code_key') {
            return res.status(409).json({
                error: `パターンコード「${req.body.pattern_code}」は既に使用されています。別のコードを指定してください。`,
            });
        }
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
