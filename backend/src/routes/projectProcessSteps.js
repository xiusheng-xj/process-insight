const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');
const { resolveLocationResource } = require('../services/locationResource');
const { computeStepConflicts } = require('../services/resourceConflicts');

// GET /projects/:projectId/process-steps
// 実績履歴テーブルから latest/previous/pre_previous + diff_days + step_status を算出
router.get('/', async (req, res, next) => {
    try {
        const { parent_event_id } = req.query;
        const params = [req.params.projectId];
        let extraWhere = '';
        if (parent_event_id) {
            params.push(parent_event_id);
            extraWhere = `AND pps.parent_event_id = $${params.length}`;
        }

        const { rows } = await db.query(
            `WITH ranked_actuals AS (
                SELECT
                    project_process_step_id,
                    actual_date,
                    ROW_NUMBER() OVER (
                        PARTITION BY project_process_step_id
                        ORDER BY actual_date DESC, id DESC
                    ) AS rn
                FROM project_process_step_actuals
                WHERE deleted_at IS NULL
            )
            SELECT
                pps.*,
                a1.actual_date AS latest_actual_date,
                a2.actual_date AS previous_actual_date,
                a3.actual_date AS pre_previous_actual_date,
                loc.location_name AS location_name,
                r.resource_name   AS resource_name,
                CASE
                    WHEN a1.actual_date IS NOT NULL AND pps.plan_date IS NOT NULL
                    THEN (a1.actual_date - pps.plan_date)
                    ELSE NULL
                END AS diff_days,
                CASE
                    WHEN a1.actual_date IS NOT NULL THEN 'completed'
                    ELSE 'pending'
                END AS step_status
            FROM project_process_steps pps
            LEFT JOIN ranked_actuals a1 ON a1.project_process_step_id = pps.id AND a1.rn = 1
            LEFT JOIN ranked_actuals a2 ON a2.project_process_step_id = pps.id AND a2.rn = 2
            LEFT JOIN ranked_actuals a3 ON a3.project_process_step_id = pps.id AND a3.rn = 3
            LEFT JOIN locations loc ON loc.id = pps.location_id
            LEFT JOIN resources r   ON r.id   = pps.resource_id
            WHERE pps.project_id = $1
              AND pps.deleted_at IS NULL
              ${extraWhere}
            ORDER BY pps.parent_event_id, pps.sort_order`,
            params
        );

        // Resource重複（キャパ超過）を案件横断で算出し、該当ステップに付与
        const stConf = await computeStepConflicts();
        const enriched = rows.map((s) => {
            const c = stConf.byId.get(s.id);
            return c ? { ...s, is_conflict: true, conflict: c } : s;
        });
        res.json(enriched);
    } catch (err) {
        next(err);
    }
});

// POST /projects/:projectId/process-steps — カスタムステップ追加
router.post('/', async (req, res, next) => {
    try {
        const { parent_event_id, process_name, department_code,
                sort_order, offset_days, offset_base, planned_date, note } = req.body;

        if (!parent_event_id) return res.status(400).json({ error: 'parent_event_id は必須です。' });
        if (!process_name?.trim()) return res.status(400).json({ error: 'process_name は必須です。' });

        // location_id / resource_id（resource選択時は home_location を補完）
        const { locationId, resourceId } = await resolveLocationResource(db, req.body);

        const { rows: [step] } = await db.query(
            `INSERT INTO project_process_steps
                (project_id, parent_event_id, process_name, department_code,
                 sort_order, offset_days, offset_base,
                 plan_date, notes, is_custom, source, location_id, resource_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 'custom', $10, $11)
             RETURNING *`,
            [
                req.params.projectId, parent_event_id,
                process_name.trim(), department_code || null,
                sort_order ?? 999,
                offset_days ?? 0,
                offset_base || 'parent_event',
                planned_date || null,
                note?.trim() || null,
                locationId ?? null, resourceId ?? null,
            ]
        );
        res.status(201).json(step);
    } catch (err) {
        next(err);
    }
});

// PUT /projects/:projectId/process-steps/:stepId — 基本情報更新（実績は /actuals エンドポイントで管理）
router.put('/:stepId', async (req, res, next) => {
    try {
        const { process_name, department_code, sort_order,
                offset_days, offset_base, planned_date, note } = req.body;

        // location_id / resource_id（送信時のみ更新。resource選択時は home_location 補完）
        const { hasLocation, hasResource, locationId, resourceId } =
            await resolveLocationResource(db, req.body);

        const { rows: [step] } = await db.query(
            `UPDATE project_process_steps SET
                process_name    = COALESCE($1, process_name),
                department_code = $2,
                sort_order      = COALESCE($3, sort_order),
                offset_days     = COALESCE($4, offset_days),
                offset_base     = COALESCE($5, offset_base),
                plan_date       = $6,
                notes           = $7,
                location_id     = CASE WHEN $10::boolean THEN $11::integer ELSE location_id END,
                resource_id     = CASE WHEN $12::boolean THEN $13::integer ELSE resource_id END,
                updated_at      = NOW()
             WHERE id = $8
               AND project_id = $9
               AND deleted_at IS NULL
             RETURNING *`,
            [
                process_name?.trim() || null,
                department_code || null,
                sort_order ?? null,
                offset_days ?? null,
                offset_base || null,
                planned_date || null,
                note?.trim() || null,
                req.params.stepId,
                req.params.projectId,
                hasLocation, locationId ?? null, hasResource, resourceId ?? null,
            ]
        );
        if (!step) return res.status(404).json({ error: '工程ステップが見つかりません。' });
        res.json(step);
    } catch (err) {
        next(err);
    }
});

// POST /projects/:projectId/process-steps/:stepId/actuals — 実績を履歴として追加
router.post('/:stepId/actuals', async (req, res, next) => {
    try {
        const { actual_date, notes } = req.body;
        const registered_by = req.headers['x-user-name'] || 'anonymous';

        if (!actual_date) return res.status(400).json({ error: 'actual_date は必須です。' });

        // ステップがこのプロジェクトに属するか確認
        const { rows: [step] } = await db.query(
            `SELECT id FROM project_process_steps
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [req.params.stepId, req.params.projectId]
        );
        if (!step) return res.status(404).json({ error: '工程ステップが見つかりません。' });

        const { rows: [actual] } = await db.query(
            `INSERT INTO project_process_step_actuals
                (project_process_step_id, actual_date, registered_by, notes)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.params.stepId, actual_date, registered_by, notes?.trim() || null]
        );
        res.status(201).json(actual);
    } catch (err) {
        next(err);
    }
});

// DELETE /projects/:projectId/process-steps/:stepId/actuals/latest — 最新実績を論理削除
router.delete('/:stepId/actuals/latest', async (req, res, next) => {
    try {
        // 最新の未削除実績を取得
        const { rows: [latest] } = await db.query(
            `SELECT id FROM project_process_step_actuals
             WHERE project_process_step_id = $1 AND deleted_at IS NULL
             ORDER BY actual_date DESC, id DESC
             LIMIT 1`,
            [req.params.stepId]
        );
        if (!latest) return res.status(404).json({ error: '取り消せる実績がありません。' });

        const { rows: [updated] } = await db.query(
            `UPDATE project_process_step_actuals
             SET deleted_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [latest.id]
        );
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// PATCH /:stepId/uncomplete — 後方互換用（実績履歴への移行後は /actuals/latest DELETE を推奨）
router.patch('/:stepId/uncomplete', async (req, res, next) => {
    try {
        const { rows: [step] } = await db.query(
            `UPDATE project_process_steps
             SET actual_date = NULL, updated_at = NOW()
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
             RETURNING *`,
            [req.params.stepId, req.params.projectId]
        );
        if (!step) return res.status(404).json({ error: '工程ステップが見つかりません。' });
        res.json(step);
    } catch (err) { next(err); }
});

// DELETE /projects/:projectId/process-steps/:stepId — 論理削除
router.delete('/:stepId', async (req, res, next) => {
    try {
        const { rows: [row] } = await db.query(
            `UPDATE project_process_steps
             SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1
               AND project_id = $2
               AND deleted_at IS NULL
             RETURNING id`,
            [req.params.stepId, req.params.projectId]
        );
        if (!row) return res.status(404).json({ error: '工程ステップが見つかりません。' });
        res.json({ id: row.id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
