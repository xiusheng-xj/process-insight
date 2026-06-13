const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

/**
 * POST /api/projects/:id/apply-template
 * body: { pattern_id: number, base_date?: string (YYYY-MM-DD) }
 *
 * 処理順序:
 *   1. 案件存在確認
 *   2. パターン存在確認（0イベントパターンも許可）
 *   3. 既存 project_events を event_code 単位でインデックス化
 *   4. 新パターンの milestone_pattern_events を取得
 *   5. 新パターンに存在しない event_code の archive 復元候補を取得
 *   6. 既存 project_events を全件 archive へ退避 → DELETE
 *      （実績データ消失を防ぐため、全行を退避してから物理削除する）
 *   7. 新パターンのイベントを INSERT（3段階優先順位でデータ選択）
 *      - Priority 1: 既存 project_events に同じ event_code あり → 日付・実績を引き継ぎ
 *      - Priority 2: archive に同 project_id + event_code の履歴あり → 直近を復元
 *      - Priority 3: 新規 → base_date + offset_days で計算
 *   8. projects.applied_milestone_pattern_id 更新
 *   9. 生成イベント一覧 + 各種カウントを返す
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId         = req.params.id;
        const { pattern_id, base_date } = req.body;
        const archivedBy        = req.headers['x-user-name'] || 'system';

        // ── 入力検証 ─────────────────────────────────────
        if (!pattern_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'pattern_id は必須です。' });
        }

        // ── 1. 案件存在確認 ───────────────────────────────
        const { rows: projectRows } = await client.query(
            'SELECT id FROM projects WHERE id = $1',
            [projectId]
        );
        if (!projectRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '案件が見つかりません。' });
        }

        // ── 2. パターン存在確認 ───────────────────────────
        const { rows: patternRows } = await client.query(
            'SELECT id FROM milestone_pattern WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
            [pattern_id]
        );
        if (!patternRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'マイルストーンパターンが見つかりません。' });
        }

        // ── 3. 既存イベントを event_code でインデックス化 ────
        // is_custom = FALSE（パターン由来）のみ carry/restore 対象
        // is_custom = TRUE の案件固有イベントはこの処理をスキップして保持する
        const { rows: existingEvents } = await client.query(
            `SELECT e.*, m.event_code
             FROM project_events e
             LEFT JOIN event_master m ON m.id = e.event_master_id
             WHERE e.project_id = $1 AND e.is_custom = FALSE`,
            [projectId]
        );

        // 案件固有イベントの件数（パターン再適用後も保持される）
        const { rows: customCountRows } = await client.query(
            `SELECT COUNT(*) AS cnt FROM project_events
             WHERE project_id = $1 AND is_custom = TRUE AND deleted_at IS NULL`,
            [projectId]
        );
        const customPreservedCount = Number(customCountRows[0]?.cnt ?? 0);
        // event_code → row のマップ（null の event_code は除外）
        const existingByCode = new Map(
            existingEvents
                .filter(e => e.event_code)
                .map(e => [e.event_code, e])
        );

        // ── 4. 新パターンのイベントを取得（sort_order 昇順）─
        const { rows: templateEvents } = await client.query(
            `SELECT
                te.sort_order,
                te.offset_days,
                te.offset_base,
                te.is_milestone,
                te.is_required,
                m.id            AS event_master_id,
                m.event_code,
                m.event_name,
                m.event_type,
                m.owner_department
             FROM milestone_pattern_events te
             JOIN event_master             m ON m.id = te.event_master_id
             WHERE te.pattern_id = $1
               AND m.is_active   = TRUE
             ORDER BY te.sort_order ASC`,
            [pattern_id]
        );

        // ── 5. archive 復元候補を取得 ────────────────────
        // 新パターンに含まれるが現在の project_events には存在しない event_code
        // → archive から直近の plan_date / actual_date を引き出す（Priority 2）
        const newPatternCodes = new Set(templateEvents.map(te => te.event_code));
        const missingCodes    = templateEvents
            .map(te => te.event_code)
            .filter(code => !existingByCode.has(code));

        let archiveByCode = new Map();
        if (missingCodes.length > 0) {
            const { rows: archiveRows } = await client.query(
                `SELECT DISTINCT ON (source_event_code)
                     source_event_code,
                     plan_date,
                     actual_date,
                     actual_date_prev1,
                     actual_date_prev2,
                     status,
                     owner_department,
                     updated_by
                 FROM project_events_archive
                 WHERE source_project_id = $1
                   AND source_event_code = ANY($2::text[])
                 ORDER BY source_event_code, archived_at DESC`,
                [projectId, missingCodes]
            );
            archiveByCode = new Map(archiveRows.map(r => [r.source_event_code, r]));
        }

        // ── 6. is_custom=FALSE のイベントのみ archive へ退避 → DELETE ──
        // is_custom=TRUE の案件固有イベントは project_events に残す（削除しない）
        const { rowCount: archivedCount } = await client.query(
            `INSERT INTO project_events_archive (
                source_project_id,
                source_event_id,
                source_event_code,
                source_event_name,
                event_type,
                plan_date,
                actual_date,
                actual_date_prev1,
                actual_date_prev2,
                diff_days,
                status,
                owner_department,
                updated_by,
                event_master_id,
                is_custom,
                sort_order,
                archived_reason,
                archived_by
            )
            SELECT
                e.project_id,
                e.id,
                m.event_code,
                e.event_name,
                e.event_type,
                e.plan_date,
                e.actual_date,
                e.actual_date_prev1,
                e.actual_date_prev2,
                e.diff_days,
                e.status,
                e.owner_department,
                e.updated_by,
                e.event_master_id,
                e.is_custom,
                e.sort_order,
                'template_reapply',
                $2
            FROM project_events e
            LEFT JOIN event_master m ON m.id = e.event_master_id
            WHERE e.project_id = $1 AND e.is_custom = FALSE`,
            [projectId, archivedBy]
        );

        await client.query(
            'DELETE FROM project_events WHERE project_id = $1 AND is_custom = FALSE',
            [projectId]
        );

        // ── 7. 新パターンイベントを INSERT ───────────────
        // ローカル日付ユーティリティ（UTC ずれ回避）
        const parseLocalDate = (str) => {
            const [y, m, d] = str.split('-').map(Number);
            return new Date(y, m - 1, d);
        };
        const toDateStr = (d) => {
            const y   = d.getFullYear();
            const m   = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const baseDate = base_date
            ? parseLocalDate(base_date)
            : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

        const insertedEvents = [];
        let   prevPlanDate   = null;   // offset_base='prev_event' 用
        let   carriedCount   = 0;      // Priority 1: 既存から引き継ぎ
        let   restoredCount  = 0;      // Priority 2: archive から復元
        let   calculatedCount = 0;     // Priority 3: offset_days で新規計算

        for (const te of templateEvents) {
            const existing = existingByCode.get(te.event_code);
            const archived = archiveByCode.get(te.event_code);

            let planDateStr, actualDate, actualPrev1, actualPrev2,
                status, ownerDept, updatedBy, source;

            if (existing) {
                // ── Priority 1: 現在の project_events から引き継ぎ ──
                planDateStr  = existing.plan_date;
                actualDate   = existing.actual_date;
                actualPrev1  = existing.actual_date_prev1;
                actualPrev2  = existing.actual_date_prev2;
                status       = existing.status;
                ownerDept    = existing.owner_department || te.owner_department;
                updatedBy    = existing.updated_by;
                source       = 'carried';
                carriedCount++;

            } else if (archived) {
                // ── Priority 2: archive から直近履歴を復元 ──────
                planDateStr  = archived.plan_date;
                actualDate   = archived.actual_date;
                actualPrev1  = archived.actual_date_prev1;
                actualPrev2  = archived.actual_date_prev2;
                status       = archived.status || 'pending';
                ownerDept    = archived.owner_department || te.owner_department;
                updatedBy    = archived.updated_by || archivedBy;
                source       = 'restored';
                restoredCount++;

            } else {
                // ── Priority 3: base_date + offset_days で新規計算 ─
                const anchorDate = (te.offset_base === 'prev_event' && prevPlanDate !== null)
                    ? prevPlanDate
                    : baseDate;
                const planDateObj = new Date(anchorDate);
                planDateObj.setDate(planDateObj.getDate() + te.offset_days);
                planDateStr  = toDateStr(planDateObj);
                actualDate   = null;
                actualPrev1  = null;
                actualPrev2  = null;
                status       = 'pending';
                ownerDept    = te.owner_department;
                updatedBy    = archivedBy;
                source       = 'calculated';
                calculatedCount++;
            }

            // prevPlanDate を更新（offset_base='prev_event' チェーン用）
            prevPlanDate = planDateStr ? parseLocalDate(planDateStr) : prevPlanDate;

            const { rows } = await client.query(
                `INSERT INTO project_events
                    (project_id, event_master_id, event_type, event_name,
                     plan_date, actual_date, actual_date_prev1, actual_date_prev2,
                     status, owner_department, updated_by, sort_order, is_custom)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE)
                 RETURNING *`,
                [
                    projectId,
                    te.event_master_id,
                    te.event_type,
                    te.event_name,
                    planDateStr   || null,
                    actualDate    || null,
                    actualPrev1   || null,
                    actualPrev2   || null,
                    status,
                    ownerDept,
                    updatedBy,
                    te.sort_order,
                ]
            );

            insertedEvents.push({
                ...rows[0],
                sort_order:   te.sort_order,
                is_milestone: te.is_milestone,
                is_required:  te.is_required,
                event_code:   te.event_code,
                _source:      source,
            });
        }

        // ── 8. applied_milestone_pattern_id 更新 ─────────
        await client.query(
            'UPDATE projects SET applied_milestone_pattern_id = $1 WHERE id = $2',
            [pattern_id, projectId]
        );

        await client.query('COMMIT');

        // 除外されたイベント数（archive に退避済みだが新パターンには含まれない）
        const removedCount = existingEvents.filter(
            e => e.event_code && !newPatternCodes.has(e.event_code)
        ).length;

        res.status(201).json({
            message:                      `パターンを適用しました。${insertedEvents.length} 件のイベントを生成しました。`,
            project_id:                   Number(projectId),
            applied_milestone_pattern_id: Number(pattern_id),
            base_date:                    toDateStr(baseDate),
            event_count:                  insertedEvents.length,
            archived_count:               archivedCount,
            carried_count:                carriedCount,
            restored_count:               restoredCount,
            calculated_count:             calculatedCount,
            removed_count:                removedCount,
            custom_preserved_count:       customPreservedCount,
            events:                       insertedEvents,
        });

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
