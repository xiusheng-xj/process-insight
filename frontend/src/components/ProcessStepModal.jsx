import { useState, useEffect } from 'react';
import { fetchProcessPatterns, applyProcessPattern, createProjectProcessStep } from '../api/processPatterns';

const DEPT_LABEL = { A: 'A部門', SELF: '自部門', B: 'B部門', C: 'C部門', D: 'D部門' };

/**
 * 工程ステップ管理モーダル
 * tab="apply"  → パターン選択して適用
 * tab="custom" → 任意ステップを個別追加
 */
export default function ProcessStepModal({ projectId, event, onClose, onApplied, onAdded, initialTab = 'apply' }) {
    const [tab, setTab]             = useState(initialTab);
    const [patterns, setPatterns]   = useState([]);
    const [loadingP, setLoadingP]   = useState(true);
    const [patternId, setPatternId] = useState('');
    const [baseDate, setBaseDate]   = useState(event?.plan_date?.slice(0, 10) || '');
    const [applying, setApplying]       = useState(false);
    const [applyErr, setApplyErr]       = useState('');
    const [applyErrDetails, setApplyErrDetails] = useState([]);

    // custom form
    const [processName, setProcessName]   = useState('');
    const [deptCode, setDeptCode]         = useState('');
    const [offsetDays, setOffsetDays]     = useState(0);
    const [plannedDate, setPlannedDate]   = useState('');
    const [note, setNote]                 = useState('');
    const [adding, setAdding]             = useState(false);
    const [addErr, setAddErr]             = useState('');

    useEffect(() => {
        fetchProcessPatterns()
            .then(setPatterns)
            .catch(() => setPatterns([]))
            .finally(() => setLoadingP(false));
    }, []);

    const selectedPattern = patterns.find(p => String(p.id) === String(patternId));

    const handleApply = async () => {
        if (!patternId) { setApplyErr('パターンを選択してください。'); return; }
        setApplying(true);
        setApplyErr('');
        setApplyErrDetails([]);
        try {
            const result = await applyProcessPattern(projectId, event.id, {
                pattern_id: Number(patternId),
                base_date:  baseDate || undefined,
            });
            onApplied(result);
            onClose();
        } catch (err) {
            setApplyErr(err.data?.message || err.message || '適用に失敗しました。');
            setApplyErrDetails(err.data?.details || []);
        } finally {
            setApplying(false);
        }
    };

    const handleAddCustom = async (e) => {
        e.preventDefault();
        if (!processName.trim()) { setAddErr('工程名は必須です。'); return; }
        setAdding(true);
        setAddErr('');
        try {
            const step = await createProjectProcessStep(projectId, {
                parent_event_id: event.id,
                process_name:    processName.trim(),
                department_code: deptCode || null,
                offset_days:     Number(offsetDays) || 0,
                planned_date:    plannedDate || null,
                note:            note.trim() || null,
            });
            onAdded(step);
            setProcessName(''); setDeptCode(''); setOffsetDays(0); setPlannedDate(''); setNote('');
        } catch (err) {
            setAddErr(err.data?.message || err.message || '追加に失敗しました。');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 620, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        工程ステップ管理
                        <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                            {event.event_name}
                        </span>
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                {/* タブ */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', paddingLeft: 24 }}>
                    {[['apply', 'パターン適用'], ['custom', '任意追加']].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key)} style={{
                            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: tab === key ? 600 : 400,
                            color: tab === key ? '#2563eb' : '#6b7280',
                            borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
                            marginBottom: -1,
                        }}>
                            {label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* ── パターン適用タブ ── */}
                    {tab === 'apply' && (
                        <div>
                            <div className="form-group">
                                <label className="form-label">工程パターン <span style={{ color: '#dc2626' }}>*</span></label>
                                {loadingP ? (
                                    <div style={{ fontSize: 13, color: '#9ca3af' }}>読み込み中…</div>
                                ) : patterns.length === 0 ? (
                                    <div style={{ fontSize: 13, color: '#dc2626' }}>有効な工程パターンがありません。</div>
                                ) : (
                                    <select
                                        className="form-input"
                                        value={patternId}
                                        onChange={e => setPatternId(e.target.value)}
                                    >
                                        <option value="">— パターンを選択 —</option>
                                        {patterns.map(p => (
                                            <option key={p.id} value={p.id}>{p.pattern_name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {selectedPattern && (
                                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 16, overflow: 'hidden' }}>
                                    <div style={{ background: '#f9fafb', padding: '8px 12px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                                        {selectedPattern.pattern_name} — {selectedPattern.steps?.length || 0} ステップ
                                        {selectedPattern.description && <span style={{ marginLeft: 8 }}>/ {selectedPattern.description}</span>}
                                    </div>
                                    {(selectedPattern.steps || []).map((s, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '7px 12px', fontSize: 12,
                                            borderBottom: i < selectedPattern.steps.length - 1 ? '1px solid #f3f4f6' : undefined,
                                        }}>
                                            <span style={{ color: '#9ca3af', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                            <span style={{ flex: 1, fontWeight: 500 }}>{s.process_name}</span>
                                            {s.department_code && (
                                                <span style={{ fontSize: 10, background: '#f3f4f6', borderRadius: 3, padding: '1px 5px', color: '#6b7280' }}>
                                                    {DEPT_LABEL[s.department_code] || s.department_code}
                                                </span>
                                            )}
                                            <span style={{ color: '#6b7280', fontSize: 11 }}>
                                                {s.offset_days >= 0 ? `+${s.offset_days}日` : `${s.offset_days}日`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">基準日（省略時はイベント予定日を使用）</label>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={baseDate}
                                    onChange={e => setBaseDate(e.target.value)}
                                />
                            </div>

                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#92400e', marginBottom: 16 }}>
                                ⚠ パターン適用すると、既存の非カスタムステップは削除されます。カスタムで追加したステップは保持されます。
                            </div>

                            {applyErr && (
                                <div className="error-state" style={{ marginBottom: 12 }}>
                                    <div>{applyErr}</div>
                                    {applyErrDetails.length > 0 && (
                                        <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 11, color: 'inherit' }}>
                                            {applyErrDetails.map((d, i) => (
                                                <li key={i}>{d.process_name}：{d.plan_date} が 完了日 {d.limit_date} を超過</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                onClick={handleApply}
                                disabled={applying || !patternId || loadingP}
                                style={{ width: '100%' }}
                            >
                                {applying ? '適用中…' : 'パターンを適用'}
                            </button>
                        </div>
                    )}

                    {/* ── 任意追加タブ ── */}
                    {tab === 'custom' && (
                        <form onSubmit={handleAddCustom}>
                            <div className="form-group">
                                <label className="form-label">工程名 <span style={{ color: '#dc2626' }}>*</span></label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={processName}
                                    onChange={e => setProcessName(e.target.value)}
                                    placeholder="例：塗装、梱包、社内検査"
                                    autoFocus
                                    maxLength={255}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">担当部門</label>
                                <select className="form-input" value={deptCode} onChange={e => setDeptCode(e.target.value)}>
                                    <option value="">— 未設定 —</option>
                                    {Object.entries(DEPT_LABEL).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">オフセット日数</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={offsetDays}
                                        onChange={e => setOffsetDays(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">予定日（直接指定）</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={plannedDate}
                                        onChange={e => setPlannedDate(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">メモ</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="備考・詳細"
                                />
                            </div>
                            {addErr && <div className="error-state" style={{ marginBottom: 12 }}>{addErr}</div>}
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={adding}
                                style={{ width: '100%' }}
                            >
                                {adding ? '追加中…' : '工程ステップを追加'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
}
