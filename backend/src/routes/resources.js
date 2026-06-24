const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/resources?active=1 — 設備/能力枠マスタ一覧（home_location 名を結合）
router.get('/', async (req, res, next) => {
    try {
        const onlyActive = req.query.active === '1' || req.query.active === 'true';
        const where = onlyActive ? 'WHERE r.is_active = TRUE' : '';
        const { rows } = await db.query(
            `SELECT r.*,
                    l.location_name AS home_location_name,
                    l.location_code AS home_location_code
             FROM resources r
             LEFT JOIN locations l ON l.id = r.home_location_id
             ${where}
             ORDER BY r.sort_order ASC, r.id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/resources — 新規作成
router.post('/', async (req, res, next) => {
    try {
        const { resource_code, resource_name, resource_type,
                home_location_id, department_code, capacity, sort_order } = req.body;
        if (!resource_name?.trim()) return res.status(400).json({ error: 'resource_name は必須です。' });

        const code = (resource_code?.trim() || `RES_${Date.now()}`).slice(0, 50);
        const { rows: [row] } = await db.query(
            `INSERT INTO resources
                (resource_code, resource_name, resource_type,
                 home_location_id, department_code, capacity, sort_order)
             VALUES ($1, $2, COALESCE($3, 'machine'), $4, $5, COALESCE($6, 1), COALESCE($7, 0))
             RETURNING *`,
            [code, resource_name.trim(), resource_type || null,
             home_location_id || null, department_code?.trim() || null,
             capacity ?? null, sort_order ?? null]
        );
        res.status(201).json(row);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: '同じコードの設備が既に存在します。' });
        next(err);
    }
});

// PUT /api/resources/:id — 更新
router.put('/:id', async (req, res, next) => {
    try {
        const { resource_name, resource_type, home_location_id,
                department_code, capacity, sort_order, is_active } = req.body;
        const { rows: [row] } = await db.query(
            `UPDATE resources SET
                resource_name    = COALESCE($1, resource_name),
                resource_type    = COALESCE($2, resource_type),
                home_location_id = $3,
                department_code  = $4,
                capacity         = COALESCE($5, capacity),
                sort_order       = COALESCE($6, sort_order),
                is_active        = COALESCE($7, is_active)
             WHERE id = $8
             RETURNING *`,
            [resource_name?.trim() || null, resource_type || null, home_location_id || null,
             department_code?.trim() || null, capacity ?? null, sort_order ?? null,
             typeof is_active === 'boolean' ? is_active : null, req.params.id]
        );
        if (!row) return res.status(404).json({ error: '設備が見つかりません。' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
