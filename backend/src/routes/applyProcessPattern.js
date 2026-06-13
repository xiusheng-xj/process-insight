const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

/**
 * POST /projects/:projectId/events/:eventId/apply-process-pattern
 *
 * 整合チェック（PoC）:
 *   親イベントが department_code='D' かつ event_name='開始日' の場合のみ、
 *   同プロジェクト内の D部門 完了日 を終了日として期間チェックを行う。
 *   終了日が見つからない場合 → 409
 *   ステップが終了日を超過する場合 → 409
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId = req.params.projectId;
        const eventId   = req.params.eventId;
        const { pattern_id, base_date } = req.body;

        if (!pattern_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'pattern_id は必須です。' });
        }

        // ── 1. パターン取得 ──
        const { rows: [pattern] } = await client.query(
            `SELECT p.*, json_agg(
                json_build_object(
                    'id',              s.id,
                    'process_name',    s.process_name,
                    'department_code', s.department_code,
                    'sort_order',      s.sort_order,
                    'offset_days',     s.offset_days,
                    'offset_base',     s.offset_base
                ) ORDER BY s.sort_order
             ) AS steps
             FROM process_pattern p
             LEFT JOIN process_pattern_steps s ON s.process_pattern_id = p.id
             WHERE p.id = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE
             GROUP BY p.id`,
            [pattern_id]
        );
        if (!pattern) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '工程パターンが見つかりません。' });
        }

        // ── 2. 親イベント取得 + base_date 解決 ──
        const { rows: [parentEvent] } = await client.query(
            `SELECT plan_date, owner_department, event_name
             FROM project_events
             WHERE id = $1`,
            [eventId]
        );

        let resolvedBase = base_date
            || (parentEvent?.plan_date ? String(parentEvent.plan_date).slice(0, 10) : null);

        // ── 3. 整合チェック（D部門 開始日 のみ対象） ──
        const isDeptDStart = parentEvent?.owner_department === 'D部門'
                          && parentEvent?.event_name === '開始日';

        if (isDeptDStart) {
            // 対応する D部門 完了日 を検索
            const { rows: [endEvent] } = await client.query(
                `SELECT plan_date, event_name
                 FROM project_events
                 WHERE project_id = $1
                   AND owner_department = 'D部門'
                   AND event_name = '完了日'
                   AND deleted_at IS NULL
                 ORDER BY plan_date ASC
                 LIMIT 1`,
                [projectId]
            );

            if (!endEvent?.plan_date) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'END_EVENT_NOT_FOUND',
                    message: '対応する完了日が見つからないため、工程パターンを適用できません。',
                    details: [],
                });
            }

            const endDateStr = String(endEvent.plan_date).slice(0, 10);
            const endDateMs  = new Date(endDateStr).getTime();

            // 各ステップ予定日を仮計算して範囲外チェック
            const steps = pattern.steps || [];
            const violations = [];
            for (const s of steps) {
                if (s.offset_days == null || !resolvedBase) continue;
                const d = new Date(resolvedBase);
                d.setDate(d.getDate() + Number(s.offset_days));
                const plannedDate = d.toISOString().slice(0, 10);
                if (d.getTime() > endDateMs) {
                    violations.push({
                        process_name: s.process_name,
                        plan_date:    plannedDate,
                        limit_date:   endDateStr,
                    });
                }
            }

            if (violations.length > 0) {
                await client.query('ROLLBACK');
                const v = violations[0];
                return res.status(409).json({
                    error: 'PROCESS_SCHEDULE_OUT_OF_RANGE',
                    message: `工程スケジュールがマイルストーン期間に収まりません。${v.process_name}（${v.plan_date}）が完了日（${v.limit_date}）を超過しています。先にマイルストーン日程を変更してください。`,
                    details: violations,
                });
            }
        }

        // ── 4. 既存の非カスタムステップをアーカイブ ──
        const { rowCount: archivedCount } = await client.query(
            `UPDATE project_process_steps
             SET deleted_at = NOW(), updated_at = NOW()
             WHERE project_id = $1
               AND parent_event_id = $2
               AND is_custom = FALSE
               AND deleted_at IS NULL`,
            [projectId, eventId]
        );

        // ── 5. 新規挿入 ──
        const steps = pattern.steps || [];
        const inserted = [];

        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            let plannedDate = null;
            if (resolvedBase && s.offset_days != null) {
                const d = new Date(resolvedBase);
                d.setDate(d.getDate() + Number(s.offset_days));
                plannedDate = d.toISOString().slice(0, 10);
            }

            const { rows: [row] } = await client.query(
                `INSERT INTO project_process_steps
                    (project_id, parent_event_id, process_name, department_code,
                     sort_order, offset_days, offset_base, plan_date,
                     is_custom, source, applied_pattern_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'pattern', $9)
                 RETURNING *`,
                [
                    projectId, eventId,
                    s.process_name, s.department_code || null,
                    (i + 1) * 10,
                    s.offset_days ?? 0,
                    s.offset_base || 'parent_event',
                    plannedDate,
                    pattern_id,
                ]
            );
            inserted.push(row);
        }

        await client.query('COMMIT');
        res.json({
            archived_count: archivedCount,
            inserted_count: inserted.length,
            steps: inserted,
            pattern_name: pattern.pattern_name,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
