const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');

/**
 * POST /api/projects/:id/apply-template
 * body: { pattern_id: number, base_date?: string (YYYY-MM-DD) }
 *
 * 処理順序:
 *   1. 案件存在確認
 *   2. 既存イベントを project_events_archive へ退避 → DELETE
 *      （実績データ消失を防ぐため、全行を退避してから物理削除する）
 *   3. milestone_pattern_events 取得（sort_order 昇順）
 *   4. 予定日計算
 *      - offset_base = 'project_start' → base_date + offset_days
 *      - offset_base = 'prev_event'    → 直前イベント予定日 + offset_days
 *        （最初のイベントは prev_event 指定でも project_start として扱う）
 *   5. project_events 一括 INSERT
 *   6. projects.applied_milestone_pattern_id 更新
 *   7. 生成イベント一覧 + archived_count を返す
 */
router.post('/', async (req, res, next) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const projectId  = req.params.id;
        const { pattern_id, base_date } = req.body;

        // ── 入力検証 ─────────────────────────────────────
        if (!pattern_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'pattern_id は必須です。' });
        }

        // ── 1. 案件存在確認 ───────────────────────────────
        const { rows: projectRows } = await client.query(
            'SELECT id, project_no, project_name, created_at FROM projects WHERE id = $1',
            [projectId]
        );
        if (!projectRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '案件が見つかりません。' });
        }

        // ── 2. 既存イベントを archive へ退避してから DELETE ──────
        // actual_date の有無にかかわらず全行退避する（データ消失防止）
        const archivedBy = req.headers['x-user-name'] || 'system';

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
                'template_reapply',
                $2
            FROM project_events e
            LEFT JOIN event_master m ON m.id = e.event_master_id
            WHERE e.project_id = $1`,
            [projectId, archivedBy]
        );

        await client.query(
            'DELETE FROM project_events WHERE project_id = $1',
            [projectId]
        );

        // ── 3. パターンイベント取得（sort_order 昇順）──────
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
             JOIN milestone_pattern        t ON t.id = te.pattern_id
             WHERE te.pattern_id = $1
               AND m.is_active   = TRUE
               AND t.is_active   = TRUE
             ORDER BY te.sort_order ASC`,
            [pattern_id]
        );

        if (templateEvents.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'マイルストーンパターンが見つからないか、有効な工程が登録されていません。',
            });
        }

        // ── 4. 基準日の確定 ───────────────────────────────
        // new Date('YYYY-MM-DD') は UTC 解釈されるため、ローカル日付として生成する
        const parseLocalDate = (str) => {
            const [y, m, d] = str.split('-').map(Number);
            return new Date(y, m - 1, d);   // ローカルタイムゾーン基準
        };
        const toDateStr = (d) => {
            const y   = d.getFullYear();
            const m   = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const baseDate = base_date ? parseLocalDate(base_date) : (() => {
            const d = new Date(); d.setHours(0, 0, 0, 0); return d;
        })();

        // ── 5. 予定日計算 & 一括 INSERT ──────────────────
        const insertedEvents = [];
        let   prevPlanDate   = null;          // 直前イベントの Date オブジェクト

        for (const te of templateEvents) {
            // offset_base に応じた起点日
            const anchorDate = (te.offset_base === 'prev_event' && prevPlanDate !== null)
                ? prevPlanDate
                : baseDate;

            const planDate = new Date(anchorDate);
            planDate.setDate(planDate.getDate() + te.offset_days);

            const { rows } = await client.query(
                `INSERT INTO project_events
                    (project_id, event_master_id, event_type, event_name,
                     plan_date, status, owner_department, updated_by)
                 VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
                 RETURNING *`,
                [
                    projectId,
                    te.event_master_id,
                    te.event_type,
                    te.event_name,
                    toDateStr(planDate),
                    te.owner_department,
                    req.headers['x-user-name'] || 'system',
                ]
            );

            insertedEvents.push({
                ...rows[0],
                sort_order:   te.sort_order,
                is_milestone: te.is_milestone,
                is_required:  te.is_required,
                event_code:   te.event_code,
            });

            prevPlanDate = planDate;
        }

        // ── 6. applied_milestone_pattern_id 更新 ─────────
        await client.query(
            'UPDATE projects SET applied_milestone_pattern_id = $1 WHERE id = $2',
            [pattern_id, projectId]
        );

        await client.query('COMMIT');

        res.status(201).json({
            message:                       `パターンを適用しました。${insertedEvents.length} 件のイベントを生成しました。`,
            project_id:                    Number(projectId),
            applied_milestone_pattern_id:  Number(pattern_id),
            base_date:                     toDateStr(baseDate),
            event_count:                   insertedEvents.length,
            archived_count:                archivedCount,
            events:                        insertedEvents,
        });

    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
