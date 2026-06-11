import { useState } from 'react';

const INITIAL = {
    project_no: '', pattern_no: '', machine_type: '',
    project_name: '', product_name: '',
    quantity: '', status: 'active', comment: '',
};

export default function CreateProjectModal({ onClose, onSubmit, loading, serverError }) {
    const [form, setForm] = useState(INITIAL);
    const [err, setErr]   = useState('');

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!form.project_no.trim())   { setErr('案件Noは必須です。');  return; }
        if (!form.project_name.trim()) { setErr('案件名は必須です。'); return; }
        try {
            await onSubmit({
                ...form,
                quantity: form.quantity !== '' ? Number(form.quantity) : 0,
            });
        } catch (ex) {
            setErr(ex.message || '作成に失敗しました。');
        }
    };

    const displayErr = err || serverError;

    return (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal">
                <div className="modal-header">
                    <h2 className="modal-title">新規案件作成</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {displayErr && (
                    <div className="error-state" style={{ marginBottom: 14 }}>{displayErr}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label req">案件No</label>
                            <input
                                className="form-control"
                                value={form.project_no}
                                onChange={set('project_no')}
                                placeholder="例: PRJ-2026-001"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">パターンNo</label>
                            <input
                                className="form-control"
                                value={form.pattern_no}
                                onChange={set('pattern_no')}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label req">案件名</label>
                        <input
                            className="form-control"
                            value={form.project_name}
                            onChange={set('project_name')}
                            placeholder="例: ○○設備 製造案件"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">機種</label>
                            <input
                                className="form-control"
                                value={form.machine_type}
                                onChange={set('machine_type')}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">品名</label>
                            <input
                                className="form-control"
                                value={form.product_name}
                                onChange={set('product_name')}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">数量</label>
                            <input
                                className="form-control"
                                type="number"
                                min="0"
                                value={form.quantity}
                                onChange={set('quantity')}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">状態</label>
                            <select className="form-control" value={form.status} onChange={set('status')}>
                                <option value="active">進行中</option>
                                <option value="on_hold">保留</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">備考</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={form.comment}
                            onChange={set('comment')}
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            キャンセル
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? '作成中…' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
