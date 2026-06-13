const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET / - 工程パターン一覧（ステップ付き）
router.get('/', async (req, res, next) => {
    try {
        const { include_inactive } = req.query;
        const cond = include_inactive === 'true'
            ? 'p.deleted_at IS NULL'
            : 'p.deleted_at IS NULL AND p.is_active = TRUE';

        const { rows } = await db.query(
            `SELECT p.*,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id',              s.id,
                                'process_name',    s.process_name,
                                'department_code', s.department_code,
                                'sort_order',      s.sort_order,
                                'offset_days',     s.offset_days,
                                'offset_base',     s.offset_base
                            ) ORDER BY s.sort_order
                        ) FILTER (WHERE s.id IS NOT NULL),
                        '[]'
                    ) AS steps
             FROM process_pattern p
             LEFT JOIN process_pattern_steps s ON s.process_pattern_id = p.id
             WHERE ${cond}
             GROUP BY p.id
             ORDER BY p.id`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST / - 工程パターン新規作成
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { pattern_code, pattern_name, description, steps = [] } = req.body;

        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        const codeToCheck = pattern_code?.trim() || null;
        const nameToCheck = pattern_name.trim();

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

        const safeCode = (codeToCheck || `PROC_${Date.now()}`).slice(0, 100);

        const { rows: [pattern] } = await client.query(
            `INSERT INTO process_pattern (pattern_code, pattern_name, description)
             VALUES ($1, $2, $3) RETURNING *`,
            [safeCode, nameToCheck, description?.trim() || null]
        );

        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            await client.query(
                `INSERT INTO process_pattern_steps
                    (process_pattern_id, process_name, department_code,
                     sort_order, offset_days, offset_base)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [pattern.id, s.process_name, s.department_code || null,
                 (i + 1) * 10, s.offset_days ?? 0, s.offset_base || 'parent_event']
            );
        }

        await client.query('COMMIT');
        res.status(201).json(pattern);
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

// PATCH /:id - is_active 切替
router.patch('/:id', async (req, res, next) => {
    try {
        const { is_active } = req.body;
        const { rows: [pattern] } = await db.query(
            `UPDATE process_pattern SET is_active = $1, updated_at = NOW()
             WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
            [is_active, req.params.id]
        );
        if (!pattern) return res.status(404).json({ error: '工程パターンが見つかりません。' });
        res.json(pattern);
    } catch (err) {
        next(err);
    }
});

// DELETE /:id - 論理削除
router.delete('/:id', async (req, res, next) => {
    try {
        const { rows: [row] } = await db.query(
            `UPDATE process_pattern SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (!row) return res.status(404).json({ error: '工程パターンが見つかりません。' });
        res.json({ id: row.id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
