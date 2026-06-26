// マイルストーンパターン → project_events 生成サービス
// 新規案件作成時の「計算生成（calculated）」に使用する。
// 既存イベントの引き継ぎ/archive 復元は行わない（新規案件にはそもそも既存イベントが無いため）。
// 既存案件への再適用は routes/applyTemplate.js（引き継ぎ・復元・退避あり）が担当する。

// 'YYYY-MM-DD' をローカル日付として解釈（UTC ずれ回避）
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

/**
 * 指定パターンの milestone_pattern_events から project_events を生成する。
 * 呼び出し側のトランザクション（client）内で実行すること。
 *
 * @param {object} client  - db.getClient() で取得した接続（BEGIN 済み）
 * @param {object} opts
 * @param {number} opts.projectId
 * @param {number} opts.patternId
 * @param {string} [opts.baseDate]  - 'YYYY-MM-DD'（省略時は当日）
 * @param {string} [opts.updatedBy]
 * @returns {Promise<number>} 生成したイベント件数
 */
async function generateMilestoneEvents(client, { projectId, patternId, baseDate, updatedBy }) {
    const { rows: templateEvents } = await client.query(
        `SELECT
            te.sort_order,
            te.offset_days,
            te.offset_base,
            m.id            AS event_master_id,
            m.event_name,
            m.event_type,
            m.owner_department
         FROM milestone_pattern_events te
         JOIN event_master             m ON m.id = te.event_master_id
         WHERE te.pattern_id = $1
           AND m.is_active   = TRUE
         ORDER BY te.sort_order ASC`,
        [patternId]
    );

    const base = baseDate
        ? parseLocalDate(baseDate)
        : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

    let prevPlanDate = null;
    let count = 0;

    for (const te of templateEvents) {
        const anchor = (te.offset_base === 'prev_event' && prevPlanDate !== null)
            ? prevPlanDate
            : base;
        const planObj = new Date(anchor);
        planObj.setDate(planObj.getDate() + te.offset_days);
        const planStr = toDateStr(planObj);

        await client.query(
            `INSERT INTO project_events
                (project_id, event_master_id, event_type, event_name, plan_date, actual_date,
                 status, owner_department, updated_by, sort_order, is_custom)
             VALUES ($1, $2, $3, $4, $5, NULL, 'pending', $6, $7, $8, FALSE)`,
            [projectId, te.event_master_id, te.event_type, te.event_name,
             planStr, te.owner_department, updatedBy || null, te.sort_order]
        );

        prevPlanDate = parseLocalDate(planStr);
        count++;
    }

    return count;
}

module.exports = { generateMilestoneEvents };
