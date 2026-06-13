import { useState } from 'react';

const REASON_PRESETS = ['テストデータ', '重複登録', '誤登録', 'その他'];

export default function DeleteProjectModal({ project, onClose, onConfirm, loading }) {
    const [reason, setReason] = useState('');

    const handlePreset = (p) => setReason(prev => prev === p ? '' : p);

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(reason.trim() || null);
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 420 }}>
                <div className="modal-header">
                    <h2 className="modal-title">案件をゴミ箱へ移動</h2>
                    <button className="modal-close" onClick={onClose} type="button">×</button>
                </div>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 16, lineHeight: 1.6 }}>
                    <strong>{project.project_name}</strong>（{project.project_no}）をゴミ箱へ移動します。<br />
                    関連データ（イベント・アラーム）は保持されます。ゴミ箱から復元可能です。
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">削除理由（任意）</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {REASON_PRESETS.map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    className={`btn btn-xs ${reason === p ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => handlePreset(p)}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                        <input
                            className="form-control"
                            placeholder="または自由記述…"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            キャンセル
                        </button>
                        <button type="submit" className="btn btn-danger" disabled={loading}>
                            {loading ? '処理中…' : 'ゴミ箱へ移動'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
