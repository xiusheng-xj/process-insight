import { useState, useEffect } from 'react';
import { fetchEventMasters } from '../api/events';

const TYPE_INFO = {
    design:        { label: '設計',   color: '#3b82f6' },
    manufacturing: { label: '製造',   color: '#059669' },
    inspection:    { label: '検査',   color: '#8b5cf6' },
    delivery:      { label: '納品',   color: '#f59e0b' },
    other:         { label: 'その他', color: '#6b7280' },
};

const FILTER_TABS = [{ key: 'all', label: 'すべて' }, ...Object.entries(TYPE_INFO).map(([key, v]) => ({ key, label: v.label }))];

export default function EventMasterSelectModal({ projectEvents, onClose, onAdd }) {
    const [masters, setMasters]   = useState([]);
    const [mLoading, setMLoading] = useState(true);
    const [filter, setFilter]     = useState('all');
    const [adding, setAdding]     = useState(null);  // master.id 追加中
    const [addedIds, setAddedIds] = useState(new Set()); // 今セッションで追加済み

    useEffect(() => {
        fetchEventMasters()
            .then(setMasters)
            .catch(() => {})
            .finally(() => setMLoading(false));
    }, []);

    // 既にプロジェクトに存在する event_master_id のセット（論理削除済み含まず）
    const existingIds = new Set(
        projectEvents
            .filter(e => !e.deleted_at && e.event_master_id != null)
            .map(e => Number(e.event_master_id))
    );

    const filtered = filter === 'all' ? masters : masters.filter(m => m.event_type === filter);

    const handleAdd = async (master) => {
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

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 560, display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">イベント追加（マスターから選択）</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                {/* フィルタータブ */}
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

                {/* イベントリスト */}
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    {mLoading && (
                        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>読み込み中…</div>
                    )}
                    {!mLoading && filtered.length === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>該当するイベントがありません</div>
                    )}
                    {!mLoading && filtered.map((m) => {
                        const ti        = TYPE_INFO[m.event_type] || TYPE_INFO.other;
                        const isExist   = existingIds.has(m.id);
                        const isAdded   = addedIds.has(m.id);
                        const isAdding  = adding === m.id;
                        const disabled  = isExist || isAdded || !!adding;

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
                                <span style={{
                                    flexShrink: 0, fontSize: 10, padding: '2px 7px',
                                    borderRadius: 9999, marginRight: 10,
                                    background: ti.color + '22', color: ti.color, fontWeight: 600,
                                }}>
                                    {ti.label}
                                </span>
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
                                    onClick={() => handleAdd(m)}
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

                <div className="modal-footer" style={{ marginTop: 14 }}>
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
}
