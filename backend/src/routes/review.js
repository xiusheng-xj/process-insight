const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/review/rules — レビュー項目カタログ（有効/無効・将来項目を含む）
router.get('/rules', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, rule_code, rule_name, category, description, is_enabled, sort_order
             FROM review_rules
             ORDER BY sort_order ASC, id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
