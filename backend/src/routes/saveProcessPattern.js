const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

const buildFingerprint = (steps) =>
    JSON.stringify(
        steps.map((s, idx) => ({
            process_name:    s.process_name    || null,
            department_code: s.department_code || null,
            sort_order:      idx + 1,
            offset_days:     s.offset_days,
            offset_base:     s.offset_base,
        }))
    );

/**
 * POST /projects/:projectId/events/:eventId/save-process-pattern
 * 現在のイベントの工程ステップ群を新規工程パターンとして保存。
 * 重複チェック: pattern_code → pattern_name → 構成フィンガープリント
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId = req.params.projectId;
        const eventId   = req.params.eventId;
        const { pattern_code, pattern_name, description } = req.body;

        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        const codeToCheck = pattern_code?.trim() || null;
        const nameToCheck = pattern_name.trim();

        // 重複チェック（コード・名前）
        const { rows: dup } = await client.query(
            `SELECT pattern_code, pattern_name FROM process_pattern
             WHERE deleted_at IS NULL
               AND (($1::text IS NOT NULL AND pattern_code = $1) OR pattern_name = $2)`,
            [codeToCheck, nameToCheck]
        );
        if (dup.length > 0) {
            await client.query('ROLLBACK');
            const byCode = codeToCheck && dup.some(r => r.pattern_code === codeToCheck);
            const byName = dup.some(r => r.pattern_name === nameToCheck);
            const what   = byCode && byName ? 'コードと名前' : byCode ? 'コード' : '名前';
            return res.status(409).json({
                error:   'DUPLICATE_PATTERN',
                message: `同じ${what}の工程パターンが既に存在します。`,
            });
        }

        // 保存対象ステップ取得
        const { rows: sourceSteps } = await client.query(
            `SELECT process_name, department_code, sort_order, offset_days, offset_base
             FROM project_process_steps
             WHERE project_id = $1 AND parent_event_id = $2 AND deleted_at IS NULL
             ORDER BY sort_order`,
            [projectId, eventId]
        );

        if (sourceSteps.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '保存対象の工程ステップがありません。' });
        }

        const newFp = buildFingerprint(sourceSteps);

        // 構成フィンガープリントチェック
        const { rows: existingPatterns } = await client.query(
            `SELECT p.id, p.pattern_name,
                    json_agg(
                        json_build_object(
                            'process_name',    s.process_name,
                            'department_code', s.department_code,
                            'sort_order',      s.sort_order,
                            'offset_days',     s.offset_days,
                            'offset_base',     s.offset_base
                        ) ORDER BY s.sort_order
                    ) AS steps
             FROM process_pattern p
             LEFT JOIN process_pattern_steps s ON s.process_pattern_id = p.id
             WHERE p.deleted_at IS NULL
             GROUP BY p.id`
        );

        for (const ep of existingPatterns) {
            if (!ep.steps || ep.steps.length === 0) continue;
            if (buildFingerprint(ep.steps) === newFp) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error:            'DUPLICATE_PATTERN_STRUCTURE',
                    existing_pattern: ep.pattern_name,
                    message:          `同じ工程構成のパターンが既に存在します。既存パターン：${ep.pattern_name}`,
                });
            }
        }

        const safeCode = (codeToCheck || `PROC_${Date.now()}`).slice(0, 100);

        const { rows: [newPattern] } = await client.query(
            `INSERT INTO process_pattern (pattern_code, pattern_name, description)
             VALUES ($1, $2, $3) RETURNING *`,
            [safeCode, nameToCheck, description?.trim() || null]
        );

        for (let i = 0; i < sourceSteps.length; i++) {
            const s = sourceSteps[i];
            await client.query(
                `INSERT INTO process_pattern_steps
                    (process_pattern_id, process_name, department_code,
                     sort_order, offset_days, offset_base)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [newPattern.id, s.process_name, s.department_code || null,
                 (i + 1) * 10, s.offset_days ?? 0, s.offset_base || 'parent_event']
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            pattern: newPattern,
            step_count: sourceSteps.length,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(409).json({ error: 'DUPLICATE_PATTERN', message: '同じコードまたは名前の工程パターンが既に存在します。' });
        }
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
