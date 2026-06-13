import { useState, useEffect } from 'react';
import { fetchEventMasters } from '../api/events';

const DEPT_INFO = {
    A:    { label: 'A部門', color: '#3b82f6' },
    SELF: { label: '自部門', color: '#059669' },
    B:    { label: 'B部門', color: '#8b5cf6' },
    C:    { label: 'C部門', color: '#f59e0b' },
    D:    { label: 'D部門', color: '#ef4444' },
};

const FILTER_TABS = [
    { key: 'all',  label: 'すべて' },
    { key: 'A',    label: 'A部門'  },
    { key: 'SELF', label: '自部門' },
    { key: 'B',    label: 'B部門'  },
    { key: 'C',    label: 'C部門'  },
    { key: 'D',    label: 'D部門'  },
];

const DEPT_OPTIONS = [
    { value: 'A部門',  label: 'A部門'  },
    { value: '自部門', label: '自部門' },
    { value: 'B部門',  label: 'B部門'  },
    { value: 'C部門',  label: 'C部門'  },
    { value: 'D部門',  label: 'D部門'  },
];

const FORM_INIT = { name: '', dept: '', planDate: '', actualDate: '', notes: '' };

/* ── タブボタン ── */
function TabBtn({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#2563eb' : '#6b7280',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
            }}
        >
            {label}
        </button>
    );
}

export default function EventMasterSelectModal({ projectEvents, onClose, onAdd }) {

    /* マスタータブ状態 */
    const [masters,  setMasters]  = useState([]);
    const [mLoading, setMLoading] = useState(true);
    const [filter,   setFilter]   = useState('all');
    const [adding,   setAdding]   = useState(null);
    const [addedIds, setAddedIds] = useState(new Set());

    /* タブ切替 */
    const [tab, setTab] = useState('master');

    /* 任意イベントフォーム状態 */
    const [form,         setForm]         = useState(FORM_INIT);
    const [customSaving, setCustomSaving] = useState(false);
    const [customError,  setCustomError]  = useState('');
    const [customDone,   setCustomDone]   = useState(false);

    useEffect(() => {
        fetchEventMasters()
            .then(setMasters)
            .catch(() => {})
            .finally(() => setMLoading(false));
    }, []);

    /* 既にプロジェクトに存在する event_master_id のセット（削除済み除く） */
    const existingIds = new Set(
        projectEvents
            .filter(e => !e.deleted_at && e.event_master_id != null)
            .map(e => Number(e.event_master_id))
    );

    const filtered = filter === 'all'
        ? masters
        : masters.filter(m => m.department_code === filter);

    /* マスター追加 */
    const handleAddMaster = async (master) => {
        if (adding || existingIds.has(master.id) || addedIds.has(master.id)) return;
        setAdding(master.id);
        try {
            await onAdd({
                event_master_id:  master.id,
                event_type:       master.event_type,
                event_name:       master.event_name,
                owner_department: master.owner_department || '',
                updated_by:       sessionStorage.getItem('userName') || 'anonymous',
            });
            setAddedIds(prev => new Set([...prev, master.id]));
        } catch {
            // エラーは呼び出し元で処理
        } finally {
            setAdding(null);
        }
    };

    /* 任意イベント追加 */
    const handleCustomSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { setCustomError('イベント名は必須です。'); return; }

        setCustomSaving(true);
        setCustomError('');
        setCustomDone(false);
        try {
            await onAdd({
                event_name:       form.name.trim(),
                event_type:       'other',
                owner_department: form.dept || null,
                plan_date:        form.planDate   || null,
                actual_date:      form.actualDate || null,
                notes:            form.notes.trim() || null,
                updated_by:       sessionStorage.getItem('userName') || 'anonymous',
            });
            setForm(FORM_INIT);
            setCustomDone(true);
            setTimeout(() => setCustomDone(false), 3000);
        } catch (err) {
            setCustomError(err.response?.data?.error || '追加に失敗しました。');
        } finally {
            setCustomSaving(false);
        }
    };

    const setField = (key, val) => {
        setCustomDone(false);
        setCustomError('');
        setForm(prev => ({ ...prev, [key]: val }));
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 560, display: 'flex', flexDirection: 'column', maxHeight: '86vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">イベント追加</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                {/* タブ切替 */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 14 }}>
                    <TabBtn label="マスターから選択" active={tab === 'master'} onClick={() => setTab('master')} />
                    <TabBtn label="任意イベント追加" active={tab === 'custom'} onClick={() => setTab('custom')} />
                </div>

                {/* ── マスタータブ ── */}
                {tab === 'master' && (
                    <>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                            {FILTER_TABS.map(t => (
                                <button
                                    key={t.key}
                                    className={`btn btn-xs ${filter === t.key ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setFilter(t.key)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                            {mLoading && (
                                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>読み込み中…</div>
                            )}
                            {!mLoading && filtered.length === 0 && (
                                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>該当するイベントがありません</div>
                            )}
                            {!mLoading && filtered.map((m) => {
                                const di       = DEPT_INFO[m.department_code];
                                const isExist  = existingIds.has(m.id);
                                const isAdded  = addedIds.has(m.id);
                                const isAdding = adding === m.id;
                                const disabled = isExist || isAdded || !!adding;

                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            display: 'flex', alignItems: 'center',
                                            padding: '10px 14px',
                                            borderBottom: '1px solid #f3f4f6',
                                            background: (isExist || isAdded) ? '#f9fafb' : '#fff',
                                            opacity: isExist ? 0.5 : 1,
                                        }}
                                    >
                                        {di && (
                                            <span style={{
                                                flexShrink: 0, fontSize: 10, padding: '2px 7px',
                                                borderRadius: 9999, marginRight: 10,
                                                background: di.color + '22', color: di.color, fontWeight: 600,
                                            }}>
                                                {di.label}
                                            </span>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {m.event_name}
                                            </div>
                                            {m.owner_department && (
                                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.owner_department}</div>
                                            )}
                                        </div>
                                        <button
                                            className={`btn btn-xs ${isAdded ? 'btn-success' : 'btn-primary'}`}
                                            style={{ flexShrink: 0, marginLeft: 10 }}
                                            onClick={() => handleAddMaster(m)}
                                            disabled={disabled}
                                        >
                                            {isExist  ? '追加済'
                                             : isAdded  ? '✓ 追加済'
                                             : isAdding ? '…'
                                             : '追加'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* ── 任意イベントタブ ── */}
                {tab === 'custom' && (
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#075985' }}>
                            案件固有のイレギュラーなマイルストーンを追加します。<br />
                            パターン切替・再適用後も削除されません。
                        </div>

                        <form id="custom-event-form" onSubmit={handleCustomSubmit}>
                            <div className="form-group">
                                <label className="form-label">
                                    イベント名 <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={form.name}
                                    onChange={e => setField('name', e.target.value)}
                                    placeholder="例：検収確認、顧客立会検査"
                                    maxLength={255}
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">担当部門（任意）</label>
                                <select
                                    className="form-input"
                                    value={form.dept}
                                    onChange={e => setField('dept', e.target.value)}
                                >
                                    <option value="">選択なし</option>
                                    {DEPT_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">予定日（任意）</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={form.planDate}
                                        onChange={e => setField('planDate', e.target.value)}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">実績日（任意）</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={form.actualDate}
                                        onChange={e => setField('actualDate', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">メモ（任意）</label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    value={form.notes}
                                    onChange={e => setField('notes', e.target.value)}
                                    placeholder="案件固有の背景・経緯など"
                                />
                            </div>
                        </form>

                        {customDone && (
                            <div style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 14px', fontSize: 13 }}>
                                ✓ イベントを追加しました。続けて追加できます。
                            </div>
                        )}
                        {customError && (
                            <div className="error-state" style={{ marginTop: 8 }}>{customError}</div>
                        )}
                    </div>
                )}

                <div className="modal-footer" style={{ marginTop: 14 }}>
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                    {tab === 'custom' && (
                        <button
                            type="submit"
                            form="custom-event-form"
                            className="btn btn-primary"
                            disabled={customSaving || !form.name.trim()}
                        >
                            {customSaving ? '追加中…' : 'イベントを追加'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
