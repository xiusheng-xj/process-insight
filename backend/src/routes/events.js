const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');

// 案件配下のイベント一覧
router.get('/', async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const { event_type, status } = req.query;
        const params = [project_id];
        const where = ['e.project_id = $1', 'e.deleted_at IS NULL'];

        if (event_type) {
            params.push(event_type);
            where.push(`e.event_type = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`e.status = $${params.length}`);
        }

        const { rows } = await db.query(
            `SELECT e.*,
                    m.sort_order AS master_sort_order,
                    CASE
                        WHEN e.actual_date IS NULL AND e.plan_date < NOW()::DATE
                        THEN (NOW()::DATE - e.plan_date)
                        ELSE NULL
                    END AS overdue_days
             FROM project_events e
             LEFT JOIN event_master m ON m.id = e.event_master_id
             WHERE ${where.join(' AND ')}
             ORDER BY e.sort_order ASC NULLS LAST, e.plan_date ASC NULLS LAST, e.id ASC`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// 並び替え一括更新
router.patch('/reorder', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { project_id } = req.params;
        const items = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '並び替えデータが不正です。' });
        }

        for (const item of items) {
            await client.query(
                `UPDATE project_events SET sort_order = $1
                 WHERE id = $2 AND project_id = $3 AND deleted_at IS NULL`,
                [item.sort_order, item.id, project_id]
            );
        }

        await client.query('COMMIT');
        res.json({ updated: items.length });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// 単件取得
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM project_events WHERE id = $1 AND project_id = $2',
            [req.params.id, req.params.project_id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'イベントが見つかりません。' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// 新規作成
router.post('/', async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const { event_type, event_name, plan_date, actual_date, status,
                owner_department, updated_by, event_master_id, notes } = req.body;

        if (!event_name) {
            return res.status(400).json({ error: 'event_name は必須です。' });
        }
        // カテゴリ未指定時は 'other' を使用
        const eventTypeVal = (event_type && event_type.trim()) ? event_type.trim() : 'other';

        // sort_order = 既存の最大値 + 10（カスタムイベントは末尾に追加）
        const { rows: soRows } = await db.query(
            `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_so
             FROM project_events WHERE project_id = $1 AND deleted_at IS NULL`,
            [project_id]
        );
        const nextSortOrder = Number(soRows[0].next_so);

        const { rows } = await db.query(
            `INSERT INTO project_events
                (project_id, event_master_id, event_type, event_name, plan_date, actual_date,
                 status, owner_department, updated_by, is_custom, sort_order, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TRUE, $10, $11)
             RETURNING *`,
            [project_id, event_master_id || null, eventTypeVal, event_name,
             plan_date || null, actual_date || null,
             status ?? 'pending', owner_department || null, updated_by || null,
             nextSortOrder, notes || null]
        );

        // 実績日入力時にアラート自動解決
        if (actual_date) {
            await db.query(
                `UPDATE project_alerts SET is_resolved = TRUE, resolved_at = NOW()
                 WHERE event_id = $1 AND is_resolved = FALSE`,
                [rows[0].id]
            );
        }

        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// 更新（実績日入力・差異計算含む）
router.put('/:id', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { event_type, event_name, plan_date, actual_date, status,
                owner_department, updated_by, notes } = req.body;
        const newActual = actual_date || null;

        // 3世代シフトロジック:
        //   actual_date が新たに入力される場合のみシフト
        //   prev2 ← prev1, prev1 ← actual_date, actual_date ← 新値
        //   actual_date を null にする場合はシフトしない（履歴保持）
        const { rows } = await client.query(
            `UPDATE project_events SET
                actual_date_prev2 = CASE WHEN $4::DATE IS NOT NULL THEN actual_date_prev1 ELSE actual_date_prev2 END,
                actual_date_prev1 = CASE WHEN $4::DATE IS NOT NULL THEN actual_date      ELSE actual_date_prev1 END,
                actual_date      = $4,
                event_type       = COALESCE($1, event_type),
                event_name       = COALESCE($2, event_name),
                plan_date        = COALESCE($3, plan_date),
                status           = COALESCE($5, status),
                owner_department = COALESCE($6, owner_department),
                updated_by       = COALESCE($7, updated_by),
                notes            = COALESCE($10, notes)
             WHERE id = $8 AND project_id = $9
             RETURNING *`,
            [event_type, event_name, plan_date || null, newActual,
             status, owner_department, updated_by, req.params.id, req.params.project_id,
             notes || null]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'イベントが見つかりません。' });
        }

        const updated = rows[0];

        // 実績日入力→アラート自動解決
        if (actual_date) {
            await client.query(
                `UPDATE project_alerts SET is_resolved = TRUE, resolved_at = NOW()
                 WHERE event_id = $1 AND is_resolved = FALSE`,
                [updated.id]
            );
        }

        // 遅延チェック: 予定比 diff_days が設定値を超えたらアラート生成（重複防止）
        if (updated.diff_days !== null && updated.diff_days > 3) {
            await client.query(
                `INSERT INTO project_alerts (project_id, event_id, alert_type, severity, message)
                 SELECT $1, $2, 'delay', 'warning', $3
                 WHERE NOT EXISTS (
                     SELECT 1 FROM project_alerts
                     WHERE project_id = $1
                       AND event_id = $2
                       AND alert_type = 'delay'
                       AND is_resolved = FALSE
                 )`,
                [updated.project_id, updated.id,
                 `「${updated.event_name}」が予定より ${updated.diff_days} 日遅延しています。`]
            );
        }

        await client.query('COMMIT');
        res.json(updated);
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// 論理削除（物理削除禁止）
router.delete('/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE project_events
             SET deleted_at = NOW()
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
             RETURNING id`,
            [req.params.id, req.params.project_id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'イベントが見つかりません。' });
        res.json({ id: rows[0].id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
