import { useState, useEffect, useCallback } from 'react';
import {
    fetchProcessPatterns,
    toggleProcessPattern,
    deleteProcessPattern,
    createProcessPattern,
} from '../api/processPatterns';

const DEPT_LABEL = { A: 'A部門', SELF: '自部門', B: 'B部門', C: 'C部門', D: 'D部門' };

function StepList({ steps }) {
    if (!steps || steps.length === 0) return <span style={{ color: 'var(--color-subtle)', fontSize: 12 }}>ステップなし</span>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {steps.map((s, i) => (
                <span key={i} style={{
                    fontSize: 11, background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    borderRadius: 4, padding: '2px 7px', color: 'var(--color-text)',
                }}>
                    {i + 1}. {s.process_name}
                    {s.department_code && <span style={{ color: 'var(--color-muted)' }}> ({DEPT_LABEL[s.department_code] || s.department_code})</span>}
                </span>
            ))}
        </div>
    );
}

function CreatePatternModal({ onClose, onCreated }) {
    const [name, setName]         = useState('');
    const [code, setCode]         = useState('');
    const [desc, setDesc]         = useState('');
    const [steps, setSteps]       = useState([{ process_name: '', department_code: '', offset_days: 0 }]);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');

    const updateStep = (i, field, val) => {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
    };
    const addStep    = () => setSteps(prev => [...prev, { process_name: '', department_code: '', offset_days: 0 }]);
    const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) { setError('パターン名は必須です。'); return; }
        const validSteps = steps.filter(s => s.process_name?.trim());
        if (validSteps.length === 0) { setError('ステップを1件以上追加してください。'); return; }

        setSaving(true);
        setError('');
        try {
            const result = await createProcessPattern({
                pattern_name: name.trim(),
                pattern_code: code.trim() || undefined,
                description:  desc.trim() || undefined,
                steps: validSteps.map(s => ({
                    process_name:    s.process_name.trim(),
                    department_code: s.department_code || null,
                    offset_days:     Number(s.offset_days) || 0,
                    offset_base:     'parent_event',
                })),
            });
            onCreated(result);
        } catch (err) {
            setError(err?.data?.message || err?.message || '作成に失敗しました。');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 640, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">工程パターン 新規作成</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
                    <form id="create-proc-pattern" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">パターン名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                            <input className="form-input" type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="例：標準製造工程" maxLength={255} autoFocus />
                        </div>
                        <div className="form-group">
                            <label className="form-label">パターンコード（任意）</label>
                            <input className="form-input" type="text" value={code} onChange={e => setCode(e.target.value)}
                                placeholder="例：STD_PROCESS" maxLength={100} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">説明（任意）</label>
                            <textarea className="form-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
                        </div>

                        {/* ステップリスト */}
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>工程ステップ</div>
                            {steps.map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--color-subtle)', width: 20, textAlign: 'right' }}>{i + 1}</span>
                                    <input
                                        className="form-input"
                                        type="text"
                                        style={{ flex: 2 }}
                                        placeholder="工程名"
                                        value={s.process_name}
                                        onChange={e => updateStep(i, 'process_name', e.target.value)}
                                        maxLength={255}
                                    />
                                    <select className="form-input" style={{ flex: 1 }} value={s.department_code}
                                        onChange={e => updateStep(i, 'department_code', e.target.value)}>
                                        <option value="">部門未設定</option>
                                        {Object.entries(DEPT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <input
                                        className="form-input"
                                        type="number"
                                        style={{ width: 80 }}
                                        placeholder="offset"
                                        value={s.offset_days}
                                        onChange={e => updateStep(i, 'offset_days', e.target.value)}
                                    />
                                    <button type="button" onClick={() => removeStep(i)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-subtle)', fontSize: 16, padding: 0 }}
                                        disabled={steps.length <= 1}>×</button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-secondary btn-sm" onClick={addStep} style={{ marginTop: 4 }}>
                                ＋ ステップを追加
                            </button>
                        </div>
                    </form>
                    {error && <div className="error-state">{error}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>キャンセル</button>
                    <button type="submit" form="create-proc-pattern" className="btn btn-primary" disabled={saving}>
                        {saving ? '作成中…' : '作成'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProcessPatternAdmin() {
    const [patterns, setPatterns]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [expanded, setExpanded]   = useState(new Set());

    const load = useCallback(() => {
        setLoading(true);
        fetchProcessPatterns(true)
            .then(setPatterns)
            .catch(() => setError('読み込みに失敗しました。'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleExpand = (id) => setExpanded(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
    });

    const handleToggleActive = async (pattern) => {
        try {
            const updated = await toggleProcessPattern(pattern.id, !pattern.is_active);
            setPatterns(prev => prev.map(p => p.id === updated.id ? { ...p, is_active: updated.is_active } : p));
        } catch {
            alert('更新に失敗しました。');
        }
    };

    const handleDelete = async (pattern) => {
        if (!window.confirm(`「${pattern.pattern_name}」を削除しますか？（論理削除）`)) return;
        try {
            await deleteProcessPattern(pattern.id);
            setPatterns(prev => prev.filter(p => p.id !== pattern.id));
        } catch {
            alert('削除に失敗しました。');
        }
    };

    const handleCreated = (newPattern) => {
        setShowCreate(false);
        load();
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">工程パターン管理</h1>
                    <p className="page-sub">全 {patterns.length} 件</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    ＋ 新規パターン
                </button>
            </div>

            <div className="card">
                {loading && <div className="loading-state">読み込み中…</div>}
                {error   && <div className="error-state" style={{ margin: '16px' }}>{error}</div>}

                {!loading && !error && patterns.length === 0 && (
                    <div className="empty-state">工程パターンがありません</div>
                )}

                {!loading && patterns.map(p => (
                    <div key={p.id} style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        padding: '16px 20px',
                        opacity: p.is_active ? 1 : 0.55,
                        background: p.is_active ? 'transparent' : '#fafbfc',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{p.pattern_name}</span>
                                    {p.pattern_code && (
                                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-muted)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px' }}>
                                            {p.pattern_code}
                                        </span>
                                    )}
                                    {!p.is_active && (
                                        <span className="badge badge-delayed" style={{ fontSize: 10 }}>無効</span>
                                    )}
                                    {p.steps?.length > 0 && (
                                        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{p.steps.length} ステップ</span>
                                    )}
                                </div>
                                {p.description && (
                                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>{p.description}</div>
                                )}
                                <div style={{ marginBottom: 6 }}>
                                    <StepList steps={p.steps} />
                                </div>
                                {p.steps?.length > 0 && (
                                    <button
                                        onClick={() => toggleExpand(p.id)}
                                        style={{ fontSize: 11, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
                                    >
                                        {expanded.has(p.id) ? '▲ 折りたたむ' : '▼ 詳細を展開'}
                                    </button>
                                )}
                                {expanded.has(p.id) && p.steps?.length > 0 && (
                                    <div style={{ marginTop: 10, border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px', background: '#f8fafc', padding: '6px 12px', fontSize: 10.5, color: 'var(--color-subtle)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                                            <span>#</span><span>工程名</span><span>部門</span><span>Offset</span>
                                        </div>
                                        {p.steps.map((s, i) => (
                                            <div key={i} style={{
                                                display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px',
                                                padding: '7px 12px', fontSize: 12.5,
                                                borderBottom: i < p.steps.length - 1 ? '1px solid var(--color-border-light)' : undefined,
                                                background: i % 2 === 0 ? '#fff' : '#fafbfc',
                                            }}>
                                                <span style={{ color: 'var(--color-subtle)' }}>{i + 1}</span>
                                                <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{s.process_name}</span>
                                                <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>
                                                    {s.department_code ? (DEPT_LABEL[s.department_code] || s.department_code) : '—'}
                                                </span>
                                                <span style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                                    {s.offset_days >= 0 ? `+${s.offset_days}日` : `${s.offset_days}日`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                <button
                                    className={`btn btn-sm ${p.is_active ? 'btn-secondary' : 'btn-primary'}`}
                                    onClick={() => handleToggleActive(p)}
                                >
                                    {p.is_active ? '無効化' : '有効化'}
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                                    削除
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showCreate && (
                <CreatePatternModal
                    onClose={() => setShowCreate(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}
