import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProjects, useProjectMutations } from '../hooks/useProjects';
import CreateProjectModal   from '../components/CreateProjectModal';
import DeleteProjectModal   from '../components/DeleteProjectModal';

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

function RemainingDays({ days }) {
    if (days == null) return <span style={{ color: 'var(--color-subtle)' }}>—</span>;
    const n = Number(days);
    if (n > 3)  return <span style={{ color: 'var(--color-success)', fontSize: 13 }}>あと{n}日</span>;
    if (n >= 0) return <span style={{ color: 'var(--color-warning)', fontSize: 13, fontWeight: 600 }}>{n === 0 ? '今日' : `あと${n}日`}</span>;
    return <span style={{ color: 'var(--color-danger)', fontSize: 13, fontWeight: 600 }}>超過{Math.abs(n)}日</span>;
}

export default function ProjectList() {
    const navigate = useNavigate();
    const [searchInput, setSearchInput] = useState('');
    const [query, setQuery]             = useState({});
    const [showCreate, setShowCreate]   = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // project object

    const { data, total, trashCount, loading, error, reload } = useProjects(query);
    const { create, remove, loading: mutating, error: mutError } = useProjectMutations(reload);

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

    const handleDeleteConfirm = useCallback(async (reason) => {
        await remove(deleteTarget.id, reason);
        setDeleteTarget(null);
    }, [remove, deleteTarget]);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">案件一覧</h1>
                    <p className="page-sub">全 {total} 件</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Link
                        to="/trash"
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#6b7280' }}
                    >
                        ゴミ箱{trashCount > 0 ? `（${trashCount}）` : ''}
                    </Link>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        ＋ 新規案件
                    </button>
                    <Link to="/gantt" className="btn btn-secondary">
                        プログラムガント
                    </Link>
                </div>
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

                {mutError && (
                    <div className="error-state" style={{ margin: '0 16px 8px' }}>{mutError}</div>
                )}

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
                                    <th>次イベント</th>
                                    <th>残日数</th>
                                    <th>ロック</th>
                                    <th style={{ width: 48 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={9}>
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
                                                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                                                        {p.project_no}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 600, color: 'var(--color-text)' }}>{p.project_name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                        <span className={`badge ${st.cls}`}>{st.label}</span>
                                                        {showProgress && (
                                                            <span style={{ fontSize: 11, color: 'var(--color-subtle)', whiteSpace: 'nowrap' }}>
                                                                {p.progress_done}/{p.progress_total}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {hl.cls
                                                        ? <span className={`badge ${hl.cls}`}>{hl.label}</span>
                                                        : <span style={{ color: 'var(--color-subtle)' }}>—</span>}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {alarmCount > 0
                                                        ? <span className="count-badge">{alarmCount}</span>
                                                        : <span style={{ color: 'var(--color-border)', fontSize: 12 }}>—</span>}
                                                </td>
                                                <td style={{ fontSize: 13, color: 'var(--color-text)' }}>
                                                    {p.next_event_name
                                                        ? p.next_event_name
                                                        : <span style={{ color: 'var(--color-subtle)' }}>
                                                            {p.effective_status === 'completed' ? '完了' : '—'}
                                                          </span>}
                                                </td>
                                                <td>
                                                    {p.next_event_name
                                                        ? <RemainingDays days={p.remaining_days} />
                                                        : <span style={{ color: 'var(--color-subtle)' }}>—</span>}
                                                </td>
                                                <td>
                                                    {p.is_locked
                                                        ? <span style={{ fontSize: 12, color: 'var(--color-warning)', whiteSpace: 'nowrap' }}>
                                                            🔒 {p.current_locked_by}
                                                          </span>
                                                        : <span style={{ color: 'var(--color-border)', fontSize: 12 }}>—</span>}
                                                </td>
                                                <td onClick={e => e.stopPropagation()}>
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        style={{ color: 'var(--color-subtle)' }}
                                                        title="ゴミ箱へ移動"
                                                        disabled={mutating}
                                                        onClick={() => setDeleteTarget(p)}
                                                    >
                                                        🗑
                                                    </button>
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
                    loading={mutating}
                    serverError={mutError}
                />
            )}
            {deleteTarget && (
                <DeleteProjectModal
                    project={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={handleDeleteConfirm}
                    loading={mutating}
                />
            )}
        </div>
    );
}
