import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useProjectMutations } from '../hooks/useProjects';
import CreateProjectModal from '../components/CreateProjectModal';

const EFFECTIVE_STATUS_MAP = {
    not_started: { label: '未着手', cls: 'badge-pending'   },
    in_progress: { label: '作業中', cls: 'badge-active'    },
    completed:   { label: '完了',   cls: 'badge-completed' },
    on_hold:     { label: '保留',   cls: 'badge-on_hold'   },
    cancelled:   { label: '中止',   cls: 'badge-cancelled' },
};

const HEALTH_STATUS_MAP = {
    healthy: { label: '計画通り', cls: 'badge-active'    },
    caution: { label: '注意',     cls: 'badge-on_hold'   },
    danger:  { label: '遅延',     cls: 'badge-cancelled' },
};

const MANUAL_STATUSES = new Set(['on_hold', 'cancelled']);

const fmtDate = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export default function ProjectList() {
    const navigate = useNavigate();
    const [searchInput, setSearchInput] = useState('');
    const [query, setQuery]             = useState({});
    const [showCreate, setShowCreate]   = useState(false);

    const { data, total, loading, error, reload } = useProjects(query);
    const { create, loading: creating, error: createError } = useProjectMutations(reload);

    const handleSearch = (e) => {
        e.preventDefault();
        const s = searchInput.trim();
        setQuery(s ? { search: s } : {});
    };

    const handleClear = () => {
        setSearchInput('');
        setQuery({});
    };

    const handleCreate = useCallback(async (body) => {
        await create(body);
        setShowCreate(false);
    }, [create]);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">案件一覧</h1>
                    <p className="page-sub">全 {total} 件</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    ＋ 新規案件
                </button>
            </div>

            <div className="card">
                <form className="toolbar" onSubmit={handleSearch}>
                    <input
                        className="input-search"
                        placeholder="案件No・案件名・品名で検索…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <button type="submit" className="btn btn-secondary">検索</button>
                    {Object.keys(query).length > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>
                            クリア
                        </button>
                    )}
                </form>

                <div className="table-wrap">
                    {loading && <div className="loading-state">読み込み中…</div>}
                    {error   && <div className="error-state" style={{ margin: '0 16px 16px' }}>{error}</div>}

                    {!loading && !error && (
                        <table className="table table-click">
                            <thead>
                                <tr>
                                    <th>案件No</th>
                                    <th>案件名</th>
                                    <th>状態</th>
                                    <th>健全性</th>
                                    <th style={{ textAlign: 'center' }}>アラーム</th>
                                    <th>最終更新日</th>
                                    <th>ロック状態</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className="empty-state">案件がありません</div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((p) => {
                                        const st = EFFECTIVE_STATUS_MAP[p.effective_status] || { label: p.effective_status, cls: 'badge-pending' };
                                        const hl = HEALTH_STATUS_MAP[p.health_status]       || { label: '—', cls: '' };
                                        const showProgress = !MANUAL_STATUSES.has(p.effective_status);
                                        const alarmCount   = Number(p.alarm_count) || 0;

                                        return (
                                            <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                                                <td>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#374151' }}>
                                                        {p.project_no}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 500 }}>{p.project_name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className={`badge ${st.cls}`}>{st.label}</span>
                                                        {showProgress && (
                                                            <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                                                {p.progress_done}/{p.progress_total}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {hl.cls
                                                        ? <span className={`badge ${hl.cls}`}>{hl.label}</span>
                                                        : <span style={{ color: '#9ca3af' }}>—</span>}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ fontSize: 13, color: alarmCount > 0 ? '#374151' : '#d1d5db' }}>
                                                        {alarmCount}件
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 13, color: '#6b7280' }}>
                                                    {fmtDate(p.updated_at)}
                                                </td>
                                                <td>
                                                    {p.is_locked
                                                        ? <span style={{ fontSize: 13, color: '#dc2626' }}>
                                                            🔒 {p.current_locked_by}
                                                          </span>
                                                        : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {total > 50 && (
                    <div className="pagination">{total} 件中 50 件表示</div>
                )}
            </div>

            {showCreate && (
                <CreateProjectModal
                    onClose={() => setShowCreate(false)}
                    onSubmit={handleCreate}
                    loading={creating}
                    serverError={createError}
                />
            )}
        </div>
    );
}
