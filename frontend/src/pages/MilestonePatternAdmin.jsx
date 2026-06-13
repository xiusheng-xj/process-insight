import { useState, useEffect, useCallback } from 'react';
import {
    fetchMilestonePatternsList,
    createMilestonePattern,
    updateMilestonePattern,
    toggleMilestonePattern,
    deleteMilestonePattern,
    fetchEventMasterList,
} from '../api/milestonePatterns';

const OFFSET_BASE_LABEL = { project_start: 'プロジェクト開始日', prev_event: '前イベント' };

function EventBadge({ ev }) {
    return (
        <span style={{
            fontSize: 11, background: ev.is_milestone ? '#eff6ff' : '#f3f4f6',
            border: `1px solid ${ev.is_milestone ? '#bfdbfe' : '#e5e7eb'}`,
            borderRadius: 4, padding: '2px 7px', color: ev.is_milestone ? '#1d4ed8' : '#374151',
        }}>
            {ev.event_name}
            {ev.owner_department && <span style={{ color: '#9ca3af' }}> ({ev.owner_department})</span>}
        </span>
    );
}

function EventList({ events }) {
    if (!events || events.length === 0) return <span style={{ color: '#9ca3af', fontSize: 12 }}>イベントなし</span>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {events.map((e, i) => <EventBadge key={i} ev={e} />)}
        </div>
    );
}

function EventRows({ events, onChange, eventMasters }) {
    const updateRow = (i, field, val) =>
        onChange(events.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
    const addRow    = () => onChange([...events, { event_master_id: '', offset_days: 0, offset_base: 'project_start', is_milestone: false, is_required: true }]);
    const removeRow = (i) => onChange(events.filter((_, idx) => idx !== i));
    const moveUp    = (i) => { if (i === 0) return; const a = [...events]; [a[i-1], a[i]] = [a[i], a[i-1]]; onChange(a); };
    const moveDown  = (i) => { if (i === events.length - 1) return; const a = [...events]; [a[i], a[i+1]] = [a[i+1], a[i]]; onChange(a); };

    return (
        <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                イベント構成 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（マスタから選択）</span>
            </div>
            {events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <select
                        className="form-input"
                        style={{ flex: 2 }}
                        value={ev.event_master_id}
                        onChange={e => updateRow(i, 'event_master_id', Number(e.target.value) || '')}
                    >
                        <option value="">— イベントを選択 —</option>
                        {eventMasters.map(em => (
                            <option key={em.id} value={em.id}>
                                {em.event_name}{em.owner_department ? ` (${em.owner_department})` : ''}
                            </option>
                        ))}
                    </select>
                    <input
                        className="form-input"
                        type="number"
                        style={{ width: 72 }}
                        placeholder="offset"
                        value={ev.offset_days}
                        onChange={e => updateRow(i, 'offset_days', Number(e.target.value) || 0)}
                        title="オフセット日数"
                    />
                    <select
                        className="form-input"
                        style={{ width: 120 }}
                        value={ev.offset_base}
                        onChange={e => updateRow(i, 'offset_base', e.target.value)}
                    >
                        {Object.entries(OFFSET_BASE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input type="checkbox" checked={ev.is_milestone} onChange={e => updateRow(i, 'is_milestone', e.target.checked)} />
                        M
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input type="checkbox" checked={ev.is_required} onChange={e => updateRow(i, 'is_required', e.target.checked)} />
                        必須
                    </label>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button type="button" onClick={() => moveUp(i)} disabled={i === 0}
                            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10, color: '#6b7280' }}>↑</button>
                        <button type="button" onClick={() => moveDown(i)} disabled={i === events.length - 1}
                            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10, color: '#6b7280' }}>↓</button>
                        <button type="button" onClick={() => removeRow(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                    </div>
                </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: 4 }}>
                ＋ イベントを追加
            </button>
        </div>
    );
}

function PatternModal({ pattern, eventMasters, onClose, onSaved }) {
    const isEdit = !!pattern;
    const [name,        setName]        = useState(pattern?.pattern_name || '');
    const [code,        setCode]        = useState(pattern?.pattern_code || '');
    const [machineType, setMachineType] = useState(pattern?.machine_type || '');
    const [desc,        setDesc]        = useState(pattern?.description || '');
    const [events,      setEvents]      = useState(
        (pattern?.events || []).map(e => ({
            event_master_id: e.event_master_id,
            offset_days:     e.offset_days ?? 0,
            offset_base:     e.offset_base || 'project_start',
            is_milestone:    e.is_milestone ?? false,
            is_required:     e.is_required ?? true,
        }))
    );
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) { setError('パターン名は必須です。'); return; }
        if (events.filter(ev => ev.event_master_id).length === 0) { setError('イベントを1件以上追加してください。'); return; }

        setSaving(true); setError('');
        const body = {
            pattern_name: name.trim(),
            pattern_code: code.trim() || undefined,
            machine_type: machineType.trim() || undefined,
            description:  desc.trim() || undefined,
            events: events.filter(ev => ev.event_master_id),
        };
        try {
            const result = isEdit
                ? await updateMilestonePattern(pattern.id, body)
                : await createMilestonePattern(body);
            onSaved(result);
        } catch (err) {
            setError(err?.data?.message || err?.message || '保存に失敗しました。');
            setSaving(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 700, display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {isEdit ? 'マイルストーンパターン 編集' : 'マイルストーンパターン 新規作成'}
                    </h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
                    <form id="mp-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">パターン名 <span style={{ color: '#dc2626' }}>*</span></label>
                            <input className="form-input" type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="例：標準マイルストーン" maxLength={255} autoFocus />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">パターンコード（任意）</label>
                                <input className="form-input" type="text" value={code} onChange={e => setCode(e.target.value)}
                                    placeholder="例：STD_MILESTONE" maxLength={100} />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">機種タイプ（任意）</label>
                                <input className="form-input" type="text" value={machineType} onChange={e => setMachineType(e.target.value)}
                                    placeholder="例：TYPE_A" maxLength={100} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">説明（任意）</label>
                            <textarea className="form-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <EventRows events={events} onChange={setEvents} eventMasters={eventMasters} />
                        </div>
                    </form>
                    {error && <div className="error-state" style={{ margin: '0 0 8px' }}>{error}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>キャンセル</button>
                    <button type="submit" form="mp-form" className="btn btn-primary" disabled={saving}>
                        {saving ? '保存中…' : isEdit ? '変更を保存' : '作成'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DeleteReasonModal({ pattern, onClose, onDeleted }) {
    const [reason,   setReason]   = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error,    setError]    = useState('');

    const handleDelete = async () => {
        setDeleting(true); setError('');
        try {
            await deleteMilestonePattern(pattern.id, reason.trim() || null);
            onDeleted(pattern.id);
        } catch (err) {
            setError(err?.data?.message || err?.message || '削除に失敗しました。');
            setDeleting(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 420 }}>
                <div className="modal-header">
                    <h2 className="modal-title">パターンを削除</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div style={{ padding: '16px 24px' }}>
                    <p style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                        「<strong>{pattern.pattern_name}</strong>」を論理削除します。
                    </p>
                    <div className="form-group">
                        <label className="form-label">削除理由（任意）</label>
                        <textarea className="form-input" rows={2} value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="例：使用終了、統合により不要" autoFocus />
                    </div>
                    {error && <div className="error-state" style={{ marginBottom: 8 }}>{error}</div>}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>キャンセル</button>
                    <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                        onClick={handleDelete} disabled={deleting}>
                        {deleting ? '削除中…' : '削除する'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function MilestonePatternAdmin() {
    const [patterns,      setPatterns]      = useState([]);
    const [eventMasters,  setEventMasters]  = useState([]);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState('');
    const [showInactive,  setShowInactive]  = useState(false);
    const [expanded,      setExpanded]      = useState(new Set());
    const [editTarget,    setEditTarget]    = useState(null);
    const [showCreate,    setShowCreate]    = useState(false);
    const [deleteTarget,  setDeleteTarget]  = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetchMilestonePatternsList(true),
            fetchEventMasterList(),
        ])
            .then(([pats, ems]) => { setPatterns(pats); setEventMasters(ems); })
            .catch(() => setError('読み込みに失敗しました。'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const visible = showInactive ? patterns : patterns.filter(p => p.is_active);

    const toggleExpand = (id) => setExpanded(prev => {
        const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });

    const handleToggleActive = async (pattern) => {
        try {
            const updated = await toggleMilestonePattern(pattern.id);
            setPatterns(prev => prev.map(p => p.id === updated.id ? { ...p, is_active: updated.is_active } : p));
        } catch {
            alert('更新に失敗しました。');
        }
    };

    const handleSaved = () => {
        setShowCreate(false);
        setEditTarget(null);
        load();
    };

    const handleDeleted = (id) => {
        setDeleteTarget(null);
        setPatterns(prev => prev.filter(p => p.id !== id));
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">マイルストーンパターン管理</h1>
                    <p className="page-sub">全 {patterns.length} 件 / 有効 {patterns.filter(p => p.is_active).length} 件</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
                        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                        無効も表示
                    </label>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        ＋ 新規パターン
                    </button>
                </div>
            </div>

            <div className="card">
                {loading && <div className="loading-state">読み込み中…</div>}
                {error   && <div className="error-state" style={{ margin: 16 }}>{error}</div>}

                {!loading && !error && visible.length === 0 && (
                    <div className="empty-state">マイルストーンパターンがありません</div>
                )}

                {!loading && visible.map(p => (
                    <div key={p.id} style={{
                        borderBottom: '1px solid #f3f4f6',
                        padding: '14px 20px',
                        opacity: p.is_active ? 1 : 0.5,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.pattern_name}</span>
                                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280', background: '#f3f4f6', borderRadius: 3, padding: '1px 5px' }}>
                                        {p.pattern_code}
                                    </span>
                                    {p.machine_type && (
                                        <span style={{ fontSize: 11, color: '#6b7280', background: '#fef9c3', borderRadius: 3, padding: '1px 5px' }}>
                                            {p.machine_type}
                                        </span>
                                    )}
                                    {!p.is_active && (
                                        <span style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', borderRadius: 3, padding: '1px 5px' }}>無効</span>
                                    )}
                                </div>
                                {p.description && (
                                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{p.description}</div>
                                )}
                                <div style={{ marginBottom: 4 }}>
                                    <EventList events={p.events} />
                                </div>
                                {p.events?.length > 0 && (
                                    <button
                                        onClick={() => toggleExpand(p.id)}
                                        style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
                                    >
                                        {expanded.has(p.id) ? '▲ 折りたたむ' : `▼ 詳細（${p.events.length} イベント）`}
                                    </button>
                                )}
                                {expanded.has(p.id) && p.events?.length > 0 && (
                                    <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 60px 140px 48px 48px', gap: 0, background: '#f9fafb', padding: '5px 12px', fontSize: 10, color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                                            <span>#</span><span>イベント名</span><span>部門</span><span>offset</span><span>基準</span><span>M</span><span>必須</span>
                                        </div>
                                        {p.events.map((e, i) => (
                                            <div key={i} style={{
                                                display: 'grid',
                                                gridTemplateColumns: '32px 1fr 80px 60px 140px 48px 48px',
                                                gap: 0, padding: '6px 12px', fontSize: 12,
                                                borderBottom: i < p.events.length - 1 ? '1px solid #f9fafb' : undefined,
                                                background: i % 2 === 0 ? '#ffffff' : '#fafafa',
                                            }}>
                                                <span style={{ color: '#9ca3af' }}>{i + 1}</span>
                                                <span style={{ fontWeight: 500 }}>{e.event_name}</span>
                                                <span style={{ color: '#6b7280' }}>{e.owner_department || '—'}</span>
                                                <span style={{ color: '#6b7280' }}>{e.offset_days >= 0 ? `+${e.offset_days}` : e.offset_days}日</span>
                                                <span style={{ color: '#6b7280', fontSize: 11 }}>{OFFSET_BASE_LABEL[e.offset_base] || e.offset_base}</span>
                                                <span style={{ color: e.is_milestone ? '#2563eb' : '#d1d5db' }}>{e.is_milestone ? '●' : '○'}</span>
                                                <span style={{ color: e.is_required ? '#059669' : '#d1d5db' }}>{e.is_required ? '●' : '○'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setEditTarget(p)}
                                    style={{ fontSize: 12 }}
                                >
                                    編集
                                </button>
                                <button
                                    className={`btn btn-sm ${p.is_active ? 'btn-secondary' : 'btn-primary'}`}
                                    onClick={() => handleToggleActive(p)}
                                    style={{ fontSize: 12 }}
                                >
                                    {p.is_active ? '無効化' : '有効化'}
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setDeleteTarget(p)}
                                    style={{ color: '#dc2626', fontSize: 12 }}
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showCreate && (
                <PatternModal
                    pattern={null}
                    eventMasters={eventMasters}
                    onClose={() => setShowCreate(false)}
                    onSaved={handleSaved}
                />
            )}
            {editTarget && (
                <PatternModal
                    pattern={editTarget}
                    eventMasters={eventMasters}
                    onClose={() => setEditTarget(null)}
                    onSaved={handleSaved}
                />
            )}
            {deleteTarget && (
                <DeleteReasonModal
                    pattern={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    );
}
