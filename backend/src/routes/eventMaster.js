const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/', async (req, res, next) => {
    try {
        const { event_type, department_code } = req.query;
        const params = [];
        const where  = ['is_active = TRUE'];

        if (department_code) {
            params.push(department_code);
            where.push(`department_code = $${params.length}`);
        } else if (event_type) {
            params.push(event_type);
            where.push(`event_type = $${params.length}`);
        }

        const { rows } = await db.query(
            `SELECT id, event_code, event_name, event_type, department_code,
                    owner_department, standard_lead_days, sort_order
             FROM event_master
             WHERE ${where.join(' AND ')}
             ORDER BY sort_order ASC, id ASC`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
