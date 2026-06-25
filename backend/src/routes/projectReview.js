const express = require('express');
const router  = express.Router({ mergeParams: true });
const { runReview } = require('../review');

// GET /api/projects/:id/review — 工程計画レビューのライブ評価（DB 書込なし）
router.get('/', async (req, res, next) => {
    try {
        const result = await runReview(req.params.id);
        res.json({
            project_id:   Number(req.params.id),
            ...result,
            evaluated_at: new Date().toISOString(),
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
