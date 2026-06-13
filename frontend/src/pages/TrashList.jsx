import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchTrash, restoreProject } from '../api/projects';

const fmtDateTime = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export default function TrashList() {
    const [data, setData]         = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [restoring, setRestoring] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchTrash();
            setData(res.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleRestore = async (p) => {
        if (!window.confirm(`「${p.project_name}」を復元しますか？`)) return;
        setRestoring(p.id);
        try {
            await restoreProject(p.id);
            await load();
        } catch (err) {
            alert(`復元に失敗しました: ${err.message}`);
        } finally {
            setRestoring(null);
        }
    };

    return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>
            <div className="page-header">
                <div>
                    <h1 className="page-title">ゴミ箱</h1>
                    <p className="page-sub">{data.length} 件</p>
                </div>
            </div>

            <div className="card">
                <div className="table-wrap">
                    {loading && <div className="loading-state">読み込み中…</div>}
                    {error   && <div className="error-state" style={{ margin: '0 16px 16px' }}>{error}</div>}

                    {!loading && !error && (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>案件No</th>
                                    <th>案件名</th>
                                    <th>削除日時</th>
                                    <th>削除理由</th>
                                    <th>最終更新日</th>
                                    <th style={{ width: 72 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <div className="empty-state">ゴミ箱は空です</div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.map(p => (
                                        <tr key={p.id}>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#374151' }}>
                                                    {p.project_no}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 500, color: '#6b7280' }}>{p.project_name}</td>
                                            <td style={{ fontSize: 13, color: '#dc2626' }}>{fmtDateTime(p.deleted_at)}</td>
                                            <td style={{ fontSize: 13, color: '#6b7280' }}>{p.deleted_reason || '—'}</td>
                                            <td style={{ fontSize: 13, color: '#6b7280' }}>{fmtDate(p.updated_at)}</td>
                                            <td>
                                                <button
                                                    className="btn btn-secondary btn-xs"
                                                    onClick={() => handleRestore(p)}
                                                    disabled={restoring === p.id}
                                                >
                                                    {restoring === p.id ? '処理中…' : '復元'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
