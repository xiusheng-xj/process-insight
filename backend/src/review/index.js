// 工程計画レビュー：ランナー
// 有効な Rule（review_rules.is_enabled=TRUE）を順に実行し、項目別判定＋総合判定＋
// 人間系の確認喚起（guidance）を集約して返す。

const db       = require('../db');
const registry = require('./registry');
const { VERDICT, SEVERITY, worst, aggregate } = require('./verdict');

/**
 * 案件の工程計画レビューをライブ評価する（DB 書込なし）。
 * @param {number|string} projectId
 * @returns {{ overall_verdict: string, overall_severity: number, guidance: string[], findings: object[] }}
 */
async function runReview(projectId) {
    // 有効 Rule をカタログ順に取得
    const { rows: enabled } = await db.query(
        `SELECT rule_code, rule_name FROM review_rules
         WHERE is_enabled = TRUE
         ORDER BY sort_order ASC, id ASC`
    );

    const findings = [];
    const guidance = new Set();
    let overall = VERDICT.OK;

    for (const { rule_code, rule_name } of enabled) {
        const rule = registry[rule_code];
        if (!rule) continue;  // カタログにあるが未実装

        const { items, summary } = await rule.evaluate({ projectId, db });
        const verdict = aggregate(items.map((it) => it.verdict));
        overall = worst(overall, verdict);

        // 人間系の確認喚起：要調整/注意の finding の部門から生成
        for (const it of items) {
            if (it.verdict !== VERDICT.OK && it.detail?.department_code) {
                guidance.add(`${it.detail.department_code}部門と日程確認を行ってください。`);
            }
        }

        findings.push({
            rule_code,
            rule_name: rule.name || rule_name,
            verdict,
            summary,
            items,
        });
    }

    return {
        overall_verdict:  overall,
        overall_severity: SEVERITY[overall] ?? 0,
        guidance:         [...guidance],
        findings,
    };
}

module.exports = { runReview };
