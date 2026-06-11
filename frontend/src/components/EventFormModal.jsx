import { useState } from 'react';

const EVENT_STATUSES = [
    { value: 'pending',     label: '未着手' },
    { value: 'in_progress', label: '着手中' },
    { value: 'completed',   label: '完了' },
    { value: 'delayed',     label: '遅延' },
];

export default function EventFormModal({ mode, event, onClose, onSubmit, loading }) {
    const isEdit = mode === 'edit';

    const [form, setForm] = useState({
        event_type:       event?.event_type                      || 'design',
        event_name:       event?.event_name                      || '',
        plan_date:        event?.plan_date?.slice(0, 10)         || '',
        actual_date:      event?.actual_date?.slice(0, 10)       || '',
        status:           event?.status                          || 'pending',
        owner_department: event?.owner_department                || '',
    });
    const [err, setErr] = useState('');

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    /* プレビュー差異計算（入力中リアルタイム表示） */
    const previewDiff = (() => {
        if (!form.plan_date || !form.actual_date) return null;
        const d = Math.floor(
            (new Date(form.actual_date) - new Date(form.plan_date)) / 86400000
        );
        if (d < 0) return { label: `${d}日（前倒）`, cls: 'diff-early' };
        if (d === 0) return { label: '±0日', cls: 'diff-ontime' };
        return { label: `+${d}日`, cls: 'diff-late' };
    })();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!form.event_name.trim()) { setErr('イベント名は必須です。'); return; }
        try {
            await onSubmit({
                event_type:       form.event_type,
                event_name:       form.event_name.trim(),
                plan_date:        form.plan_date        || null,
                actual_date:      form.actual_date      || null,
                status:           form.status,
                owner_department: form.owner_department || null,
                updated_by:       sessionStorage.getItem('userName') || 'anonymous',
            });
        } catch (ex) {
            setErr(ex.message || '保存に失敗しました。');
        }
    };

    return (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal">
                <div className="modal-header">
                    <h2 className="modal-title">{isEdit ? 'イベント編集' : 'イベント追加'}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {err && <div className="error-state" style={{ marginBottom: 14 }}>{err}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">状態</label>
                        <select className="form-control" value={form.status} onChange={set('status')}>
                            {EVENT_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label req">イベント名</label>
                        <input
                            className="form-control"
                            value={form.event_name}
                            onChange={set('event_name')}
                            placeholder="例: 設計レビュー完了"
                            autoFocus={!isEdit}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">担当部門</label>
                        <input
                            className="form-control"
                            value={form.owner_department}
                            onChange={set('owner_department')}
                            placeholder="例: 設計部"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">予定日</label>
                            <input
                                className="form-control"
                                type="date"
                                value={form.plan_date}
                                onChange={set('plan_date')}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">実績日</label>
                            <input
                                className="form-control"
                                type="date"
                                value={form.actual_date}
                                onChange={set('actual_date')}
                            />
                        </div>
                    </div>

                    {/* リアルタイム差異プレビュー */}
                    {previewDiff && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                            差異プレビュー：
                            <span className={`diff ${previewDiff.cls}`} style={{ marginLeft: 6 }}>
                                {previewDiff.label}
                            </span>
                        </div>
                    )}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            キャンセル
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? '保存中…' : isEdit ? '更新' : '追加'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
