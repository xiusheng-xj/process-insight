const express = require('express');
const router  = express.Router();
const db      = require('../db');

const WITH_EVENTS = `
    SELECT mp.*,
        COALESCE(
            json_agg(
                json_build_object(
                    'id',               mpe.id,
                    'event_master_id',  mpe.event_master_id,
                    'event_name',       em.event_name,
                    'event_code',       em.event_code,
                    'owner_department', em.owner_department,
                    'sort_order',       mpe.sort_order,
                    'offset_days',      mpe.offset_days,
                    'offset_base',      mpe.offset_base,
                    'is_milestone',     mpe.is_milestone,
                    'is_required',      mpe.is_required
                ) ORDER BY mpe.sort_order
            ) FILTER (WHERE mpe.id IS NOT NULL),
            '[]'
        ) AS events
    FROM milestone_pattern mp
    LEFT JOIN milestone_pattern_events mpe ON mpe.pattern_id = mp.id
    LEFT JOIN event_master em ON em.id = mpe.event_master_id
`;

// GET / — 一覧（イベント付き）
router.get('/', async (req, res, next) => {
    try {
        const { include_inactive } = req.query;
        const cond = include_inactive === 'true'
            ? 'mp.deleted_at IS NULL'
            : 'mp.deleted_at IS NULL AND mp.is_active = TRUE';

        const { rows } = await db.query(
            `${WITH_EVENTS} WHERE ${cond} GROUP BY mp.id ORDER BY mp.id`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /:id — 単件
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `${WITH_EVENTS} WHERE mp.id = $1 AND mp.deleted_at IS NULL GROUP BY mp.id`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'マイルストーンパターンが見つかりません。' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

async function checkDuplicate(client, codeToCheck, nameToCheck, excludeId = null) {
    const { rows } = await client.query(
        `SELECT pattern_code, pattern_name FROM milestone_pattern
         WHERE deleted_at IS NULL
           AND ($3::integer IS NULL OR id != $3)
           AND (($1::text IS NOT NULL AND pattern_code = $1) OR pattern_name = $2)`,
        [codeToCheck, nameToCheck, excludeId]
    );
    if (rows.length === 0) return null;
    const byCode = codeToCheck && rows.some(r => r.pattern_code === codeToCheck);
    const byName = rows.some(r => r.pattern_name === nameToCheck);
    const what   = byCode && byName ? 'コードと名前' : byCode ? 'コード' : '名前';
    return `同じ${what}のマイルストーンパターンが既に存在します。`;
}

async function checkEventComposition(client, eventMasterIds, excludeId = null) {
    if (eventMasterIds.length === 0) return null;
    const sorted = [...eventMasterIds].map(Number).sort((a, b) => a - b);
    const { rows } = await client.query(
        `SELECT mp.id, mp.pattern_name
         FROM milestone_pattern mp
         WHERE mp.deleted_at IS NULL
           AND ($2::integer IS NULL OR mp.id != $2)
           AND $1::integer[] = (
               SELECT COALESCE(array_agg(mpe.event_master_id ORDER BY mpe.event_master_id), ARRAY[]::integer[])
               FROM milestone_pattern_events mpe
               WHERE mpe.pattern_id = mp.id
           )`,
        [sorted, excludeId]
    );
    if (rows.length === 0) return null;
    return `同じイベント構成のパターンが既に存在します：「${rows[0].pattern_name}」`;
}

async function replaceEvents(client, patternId, events) {
    await client.query(`DELETE FROM milestone_pattern_events WHERE pattern_id = $1`, [patternId]);
    const valid = events.filter(e => e.event_master_id);
    for (let i = 0; i < valid.length; i++) {
        const e = valid[i];
        await client.query(
            `INSERT INTO milestone_pattern_events
                (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                patternId,
                e.event_master_id,
                (i + 1) * 10,
                e.offset_days ?? 0,
                e.offset_base || 'project_start',
                e.is_milestone ?? false,
                e.is_required ?? true,
            ]
        );
    }
}

// POST / — 新規作成
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { pattern_code, pattern_name, machine_type, description, events = [] } = req.body;
        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        const codeToCheck = pattern_code?.trim() || null;
        const nameToCheck = pattern_name.trim();

        const dupMsg = await checkDuplicate(client, codeToCheck, nameToCheck, null);
        if (dupMsg) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'DUPLICATE_PATTERN', message: dupMsg }); }

        const validEvents = events.filter(e => e.event_master_id);
        const compMsg = await checkEventComposition(client, validEvents.map(e => e.event_master_id), null);
        if (compMsg) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'DUPLICATE_EVENT_COMPOSITION', message: compMsg }); }

        const safeCode = (codeToCheck || `MPT_${Date.now()}`).slice(0, 100);
        const { rows: [pattern] } = await client.query(
            `INSERT INTO milestone_pattern (pattern_code, pattern_name, machine_type, description)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [safeCode, nameToCheck, machine_type?.trim() || null, description?.trim() || null]
        );

        await replaceEvents(client, pattern.id, validEvents);
        await client.query('COMMIT');
        res.status(201).json(pattern);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ error: 'DUPLICATE_PATTERN', message: '同じコードまたは名前のパターンが既に存在します。' });
        next(err);
    } finally {
        client.release();
    }
});

// PUT /:id — 更新（イベント全置換）
router.put('/:id', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const id = Number(req.params.id);
        const { pattern_code, pattern_name, machine_type, description, events = [] } = req.body;
        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        const codeToCheck = pattern_code?.trim() || null;
        const nameToCheck = pattern_name.trim();

        const dupMsg = await checkDuplicate(client, codeToCheck, nameToCheck, id);
        if (dupMsg) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'DUPLICATE_PATTERN', message: dupMsg }); }

        const validEvents = events.filter(e => e.event_master_id);
        const compMsg = await checkEventComposition(client, validEvents.map(e => e.event_master_id), id);
        if (compMsg) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'DUPLICATE_EVENT_COMPOSITION', message: compMsg }); }

        const { rows: [pattern] } = await client.query(
            `UPDATE milestone_pattern
             SET pattern_code = $1, pattern_name = $2, machine_type = $3, description = $4, updated_at = NOW()
             WHERE id = $5 AND deleted_at IS NULL RETURNING *`,
            [codeToCheck || `MPT_${id}`, nameToCheck, machine_type?.trim() || null, description?.trim() || null, id]
        );
        if (!pattern) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'マイルストーンパターンが見つかりません。' });
        }

        await replaceEvents(client, id, validEvents);
        await client.query('COMMIT');
        res.json(pattern);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ error: 'DUPLICATE_PATTERN', message: '同じコードまたは名前のパターンが既に存在します。' });
        next(err);
    } finally {
        client.release();
    }
});

// PATCH /:id/toggle-active — 有効／無効切替
router.patch('/:id/toggle-active', async (req, res, next) => {
    try {
        const { rows: [pattern] } = await db.query(
            `UPDATE milestone_pattern SET is_active = NOT is_active, updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
            [req.params.id]
        );
        if (!pattern) return res.status(404).json({ error: 'マイルストーンパターンが見つかりません。' });
        res.json(pattern);
    } catch (err) {
        next(err);
    }
});

// DELETE /:id — 論理削除
router.delete('/:id', async (req, res, next) => {
    try {
        const userName     = req.headers['x-user-name'] || null;
        const deletedReason = req.body?.deleted_reason || null;
        const { rows: [row] } = await db.query(
            `UPDATE milestone_pattern
             SET deleted_at = NOW(), deleted_by = $2, deleted_reason = $3, updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id, userName, deletedReason]
        );
        if (!row) return res.status(404).json({ error: 'マイルストーンパターンが見つかりません。' });
        res.json({ id: row.id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
