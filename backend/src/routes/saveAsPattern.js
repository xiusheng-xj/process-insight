const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

/**
 * POST /api/projects/:id/save-as-pattern
 * body: { pattern_name, pattern_code?, description? }
 *
 * 処理:
 *   1. pattern_code / pattern_name 重複チェック → 409
 *   2. 案件確認
 *   3. event_master_id あり・論理削除なしの project_events を取得（event_master JOIN）
 *   4. event_master_id 重複を除去（先着1件を採用）
 *   5. 保存対象外件数カウント
 *   6. offset_days を事前計算
 *   7. 構成フィンガープリント比較（既存 active パターンと完全一致チェック） → 409
 *   8. milestone_pattern INSERT
 *   9. milestone_pattern_events INSERT
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId = req.params.id;
        const { pattern_name, pattern_code, description } = req.body;

        if (!pattern_name?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'パターン名は必須です。' });
        }

        // ─── 重複チェック1&2: pattern_code / pattern_name ───────────────────────
        const codeToCheck = pattern_code?.trim() || null;
        const nameToCheck = pattern_name.trim();

        const { rows: dupRows } = await client.query(
            `SELECT pattern_code, pattern_name FROM milestone_pattern
             WHERE is_active = TRUE
               AND (($1::text IS NOT NULL AND pattern_code = $1) OR pattern_name = $2)`,
            [codeToCheck, nameToCheck]
        );

        if (dupRows.length > 0) {
            await client.query('ROLLBACK');
            const dupByCode = codeToCheck != null && dupRows.some(r => r.pattern_code === codeToCheck);
            const dupByName = dupRows.some(r => r.pattern_name === nameToCheck);
            let what = '同じ';
            if (dupByCode && dupByName) what += 'コードと名前の';
            else if (dupByCode) what += 'コードの';
            else what += '名前の';
            return res.status(409).json({
                error:   'DUPLICATE_PATTERN',
                field:   dupByCode && dupByName ? 'both' : (dupByCode ? 'code' : 'name'),
                message: `${what}マイルストーンパターンが既に存在します。別の名前で保存してください。`,
            });
        }

        // ─── 1. 案件確認 ─────────────────────────────────────────────────────────
        const { rows: pRows } = await client.query(
            'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
            [projectId]
        );
        if (!pRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '案件が見つかりません。' });
        }

        // ─── 2. 保存対象イベント取得（event_master JOIN で event_name・department_code を取得）
        const { rows: saveableRaw } = await client.query(
            `SELECT pe.id, pe.event_master_id, pe.sort_order, pe.plan_date,
                    em.event_name, em.department_code
             FROM project_events pe
             JOIN event_master em ON em.id = pe.event_master_id
             WHERE pe.project_id = $1
               AND pe.deleted_at IS NULL
               AND pe.event_master_id IS NOT NULL
             ORDER BY pe.sort_order ASC, pe.id ASC`,
            [projectId]
        );

        // ─── 3. event_master_id 重複を除去（先着採用）────────────────────────────
        const seen = new Set();
        const saveable = [];
        let duplicateCount = 0;
        for (const ev of saveableRaw) {
            const mid = Number(ev.event_master_id);
            if (seen.has(mid)) {
                duplicateCount++;
            } else {
                seen.add(mid);
                saveable.push(ev);
            }
        }

        // ─── 4. event_master_id なし（保存対象外）の件数 ─────────────────────────
        const { rows: excludedRows } = await client.query(
            `SELECT COUNT(*) AS cnt FROM project_events
             WHERE project_id = $1 AND deleted_at IS NULL AND event_master_id IS NULL`,
            [projectId]
        );
        const excludedCount = Number(excludedRows[0].cnt);

        if (saveable.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: '保存対象のイベントがありません。event_master_id が設定されているイベントが必要です。',
            });
        }

        // ─── 5. offset_days 事前計算 ─────────────────────────────────────────────
        const planDates = saveable.map(e => e.plan_date).filter(Boolean);
        const baseDateStr = planDates.length > 0
            ? planDates.reduce((a, b) => a < b ? a : b)
            : null;

        const toDay0 = (str) => {
            const [y, m, d] = str.slice(0, 10).split('-').map(Number);
            return new Date(y, m - 1, d).getTime();
        };
        const baseDateMs = baseDateStr ? toDay0(baseDateStr) : null;

        const saveableWithOffsets = saveable.map((ev, i) => {
            let offsetDays = 0;
            if (baseDateMs !== null && ev.plan_date) {
                offsetDays = Math.round((toDay0(ev.plan_date) - baseDateMs) / 86400000);
            }
            return {
                ...ev,
                new_sort_order: (i + 1) * 10,
                offset_days:    offsetDays,
                offset_base:    'project_start',
            };
        });

        // ─── 重複チェック3: 構成の完全一致 ───────────────────────────────────────
        // sort_order は順序を正規化した連番（idx+1 ベース）で比較する。
        // 既存パターンは 1,2,3… で保存されており、新規は 10,20,30… になるため
        // 生の値を使うと永遠に一致しない。正規化することで順序の同一性を比較できる。
        const buildFingerprint = (events) =>
            JSON.stringify(events.map((e, idx) => ({
                event_master_id: Number(e.event_master_id),
                event_name:      e.event_name      || null,
                department_code: e.department_code || null,
                sort_order:      idx + 1,
                offset_days:     e.offset_days,
                offset_base:     e.offset_base,
            })));

        const currentFingerprint = buildFingerprint(saveableWithOffsets);

        const { rows: existingPatterns } = await client.query(
            `SELECT p.id, p.pattern_name,
                    json_agg(
                        json_build_object(
                            'event_master_id', mpe.event_master_id,
                            'event_name',      em.event_name,
                            'department_code', em.department_code,
                            'sort_order',      mpe.sort_order,
                            'offset_days',     mpe.offset_days,
                            'offset_base',     mpe.offset_base
                        ) ORDER BY mpe.sort_order
                    ) AS events
             FROM milestone_pattern p
             JOIN milestone_pattern_events mpe ON mpe.pattern_id = p.id
             LEFT JOIN event_master em ON em.id = mpe.event_master_id
             WHERE p.is_active = TRUE
             GROUP BY p.id, p.pattern_name`
        );

        for (const pattern of existingPatterns) {
            if (buildFingerprint(pattern.events || []) === currentFingerprint) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error:            'DUPLICATE_PATTERN_STRUCTURE',
                    existing_pattern: pattern.pattern_name,
                    message:          '同じイベント構成のマイルストーンパターンが既に存在します。',
                });
            }
        }

        // ─── 6. パターンコード生成 ────────────────────────────────────────────────
        const rawCode  = codeToCheck || `PROJ_${projectId}_${Date.now()}`;
        const safeCode = rawCode.slice(0, 100);

        // ─── 7. milestone_pattern INSERT ──────────────────────────────────────────
        const { rows: patternRows } = await client.query(
            `INSERT INTO milestone_pattern (pattern_code, pattern_name, description, is_active)
             VALUES ($1, $2, $3, TRUE)
             RETURNING *`,
            [safeCode, nameToCheck, description?.trim() || null]
        );
        const newPattern = patternRows[0];

        // ─── 8. milestone_pattern_events INSERT ───────────────────────────────────
        for (const ev of saveableWithOffsets) {
            await client.query(
                `INSERT INTO milestone_pattern_events
                    (pattern_id, event_master_id, sort_order,
                     offset_days, offset_base, is_milestone, is_required)
                 VALUES ($1, $2, $3, $4, 'project_start', FALSE, FALSE)`,
                [newPattern.id, ev.event_master_id, ev.new_sort_order, ev.offset_days]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            pattern:         newPattern,
            event_count:     saveable.length,
            excluded_count:  excludedCount,
            duplicate_count: duplicateCount,
            base_date:       baseDateStr,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            if (err.constraint === 'milestone_pattern_pattern_code_key') {
                return res.status(409).json({
                    error:   'DUPLICATE_PATTERN',
                    field:   'code',
                    message: '同じコードのマイルストーンパターンが既に存在します。別の名前で保存してください。',
                });
            }
            if (err.constraint === 'ux_milestone_pattern_name_active') {
                return res.status(409).json({
                    error:   'DUPLICATE_PATTERN',
                    field:   'name',
                    message: '同じ名前のマイルストーンパターンが既に存在します。別の名前で保存してください。',
                });
            }
        }
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
