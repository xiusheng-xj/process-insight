const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/locations?active=1 — 場所マスタ一覧
router.get('/', async (req, res, next) => {
    try {
        const onlyActive = req.query.active === '1' || req.query.active === 'true';
        const where = onlyActive ? 'WHERE is_active = TRUE' : '';
        const { rows } = await db.query(
            `SELECT * FROM locations ${where}
             ORDER BY sort_order ASC, id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/locations — 新規作成
router.post('/', async (req, res, next) => {
    try {
        const { location_code, location_name, location_type, region, sort_order } = req.body;
        if (!location_name?.trim()) return res.status(400).json({ error: 'location_name は必須です。' });

        const code = (location_code?.trim() || `LOC_${Date.now()}`).slice(0, 50);
        const { rows: [row] } = await db.query(
            `INSERT INTO locations (location_code, location_name, location_type, region, sort_order)
             VALUES ($1, $2, COALESCE($3, 'factory'), $4, COALESCE($5, 0))
             RETURNING *`,
            [code, location_name.trim(), location_type || null, region?.trim() || null, sort_order ?? null]
        );
        res.status(201).json(row);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: '同じコードの場所が既に存在します。' });
        next(err);
    }
});

// PUT /api/locations/:id — 更新
router.put('/:id', async (req, res, next) => {
    try {
        const { location_name, location_type, region, sort_order, is_active } = req.body;
        const { rows: [row] } = await db.query(
            `UPDATE locations SET
                location_name = COALESCE($1, location_name),
                location_type = COALESCE($2, location_type),
                region        = $3,
                sort_order    = COALESCE($4, sort_order),
                is_active     = COALESCE($5, is_active)
             WHERE id = $6
             RETURNING *`,
            [location_name?.trim() || null, location_type || null, region?.trim() || null,
             sort_order ?? null, typeof is_active === 'boolean' ? is_active : null, req.params.id]
        );
        if (!row) return res.status(404).json({ error: '場所が見つかりません。' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
