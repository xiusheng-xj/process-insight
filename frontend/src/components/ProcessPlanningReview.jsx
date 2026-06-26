import { useState, useEffect, useCallback } from 'react';
import { fetchProjectReview, fetchReviewRules } from '../api/review';

/* 判定の見た目 */
const VERDICT = {
    ok:      { label: '問題なし', icon: '✔', color: '#059669', bg: '#ecfdf5' },
    caution: { label: '注意',     icon: '△', color: '#d97706', bg: '#fffbeb' },
    adjust:  { label: '要調整',   icon: '⚠', color: '#dc2626', bg: '#fef2f2' },
};
const vmeta = (v) => VERDICT[v] || VERDICT.ok;

export default function ProcessPlanningReview({ projectId, refreshKey = 0, onReview }) {
    const [review, setReview]   = useState(null);
    const [rules,  setRules]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,  setError]    = useState('');

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError('');
        try {
            const [rv, rl] = await Promise.all([
                fetchProjectReview(projectId),
                fetchReviewRules().catch(() => []),
            ]);
            setReview(rv);
            setRules(rl);
            onReview?.(rv);  // 親（案件詳細）へレビュー結果を通知（上部アラート用）
        } catch (e) {
            setError(e.message || 'レビューの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    }, [projectId, onReview]);

    useEffect(() => { load(); }, [load, refreshKey]);

    // 有効Ruleごとの finding をマージ（有効だが finding 無し＝問題なし）
    const enabledRules  = rules.filter((r) => r.is_enabled);
    const futureRules   = rules.filter((r) => !r.is_enabled);
    const findingByCode = Object.fromEntries((review?.findings || []).map((f) => [f.rule_code, f]));
    const overall       = vmeta(review?.overall_verdict);

    return (
        <div className="section" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>工程計画レビュー</h2>
                <button className="btn btn-xs btn-secondary" onClick={load} disabled={loading}>
                    {loading ? '評価中…' : '再評価'}
                </button>
            </div>

            {error && <div className="error-state" style={{ marginBottom: 12 }}>{error}</div>}

            {!error && (
                <>
                    {/* 項目別 */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                        {enabledRules.length === 0 && (
                            <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>
                                有効なレビュー項目がありません。
                            </div>
                        )}
                        {enabledRules.map((rule) => {
                            const f = findingByCode[rule.rule_code];
                            const v = vmeta(f?.verdict || 'ok');
                            const items = f?.items || [];
                            return (
                                <div key={rule.rule_code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: v.bg }}>
                                        <span style={{ color: v.color, fontWeight: 700 }}>{v.icon}</span>
                                        <span style={{ fontWeight: 600, fontSize: 14 }}>{rule.rule_name}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 12, color: v.color, fontWeight: 600 }}>{v.label}</span>
                                    </div>
                                    {items.length > 0 && (
                                        <ul style={{ margin: 0, padding: '8px 14px 10px 40px', fontSize: 12.5, color: '#374151' }}>
                                            {items.map((it, i) => (
                                                <li key={i} style={{ marginBottom: 4 }}>
                                                    {it.message}
                                                    {it.detail?.conflict_project_nos?.length > 0 && (
                                                        <span style={{ color: '#6b7280' }}>
                                                            　対象: {it.detail.conflict_project_nos.join(' / ')}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 総合判定 */}
                    <div style={{
                        marginTop: 12, padding: '12px 16px', borderRadius: 6,
                        background: overall.bg, border: `1px solid ${overall.color}33`,
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>総合判定</span>
                        <span style={{ fontWeight: 700, color: overall.color }}>
                            {overall.icon} {overall.label}
                        </span>
                    </div>

                    {/* 確認喚起 */}
                    {(review?.guidance || []).length > 0 && (
                        <div style={{ marginTop: 8, padding: '10px 16px', background: '#fef2f2', borderRadius: 6, fontSize: 13, color: '#b91c1c' }}>
                            {review.guidance.map((g, i) => <div key={i}>💬 {g}</div>)}
                        </div>
                    )}

                    {/* 将来項目 */}
                    {futureRules.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
                            将来のレビュー項目（未対応）：{futureRules.map((r) => r.rule_name).join(' / ')}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
