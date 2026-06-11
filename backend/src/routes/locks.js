const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');

// ロック取得（編集開始）
router.post('/acquire', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { project_id } = req.params;
        const lockedBy = req.headers['x-user-name'] || req.body.user_name || 'unknown';

        // 有効なロックの存在確認
        const { rows: existing } = await client.query(
            `SELECT * FROM project_locks
             WHERE project_id = $1 AND lock_status = 'active' AND expires_at > NOW()`,
            [project_id]
        );

        if (existing[0] && existing[0].locked_by !== lockedBy) {
            await client.query('ROLLBACK');
            return res.status(423).json({
                error: `${existing[0].locked_by} が編集中です。`,
                locked_by:  existing[0].locked_by,
                expires_at: existing[0].expires_at,
            });
        }

        // UPSERT でロック設定（30分有効）
        const { rows } = await client.query(
            `INSERT INTO project_locks (project_id, locked_by, locked_at, expires_at, lock_status)
             VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 minutes', 'active')
             ON CONFLICT (project_id) DO UPDATE
               SET locked_by   = EXCLUDED.locked_by,
                   locked_at   = EXCLUDED.locked_at,
                   expires_at  = EXCLUDED.expires_at,
                   lock_status = 'active'
             RETURNING *`,
            [project_id, lockedBy]
        );
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// ロック解放（編集終了）
router.post('/release', async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const lockedBy = req.headers['x-user-name'] || req.body.user_name || 'unknown';

        const { rows } = await db.query(
            `UPDATE project_locks
             SET lock_status = 'released'
             WHERE project_id = $1 AND locked_by = $2 AND lock_status = 'active'
             RETURNING *`,
            [project_id, lockedBy]
        );
        if (!rows[0]) return res.status(404).json({ error: 'ロックが見つかりません。' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// ロック状態確認
router.get('/status', async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const { rows } = await db.query(
            `SELECT * FROM project_locks
             WHERE project_id = $1 AND lock_status = 'active' AND expires_at > NOW()`,
            [project_id]
        );
        if (!rows[0]) return res.json({ locked: false });
        res.json({ locked: true, locked_by: rows[0].locked_by, expires_at: rows[0].expires_at });
    } catch (err) {
        next(err);
    }
});

// 期限切れロックの一括クリーンアップ（定期バッチ用）
router.post('/cleanup', async (req, res, next) => {
    try {
        const { rowCount } = await db.query(
            `UPDATE project_locks SET lock_status = 'expired'
             WHERE lock_status = 'active' AND expires_at <= NOW()`
        );
        res.json({ cleaned: rowCount });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
