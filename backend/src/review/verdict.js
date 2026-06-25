// 工程計画レビュー：判定語彙と集約ユーティリティ（全Rule共通）

const VERDICT = { OK: 'ok', CAUTION: 'caution', ADJUST: 'adjust' };

const SEVERITY = { ok: 0, caution: 1, adjust: 2 };

const LABEL_JA = { ok: '問題なし', caution: '注意', adjust: '要調整' };

// 2つの verdict のうち重い方を返す
function worst(a, b) {
    return (SEVERITY[a] ?? 0) >= (SEVERITY[b] ?? 0) ? a : b;
}

// verdict 配列の最悪値（空なら ok）
function aggregate(verdicts) {
    return verdicts.reduce((acc, v) => worst(acc, v), VERDICT.OK);
}

module.exports = { VERDICT, SEVERITY, LABEL_JA, worst, aggregate };
