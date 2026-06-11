import { useState, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject } from '../hooks/useProjects';
import { useEvents, useEventMutations } from '../hooks/useEvents';
import { useAlerts } from '../hooks/useAlerts';
import { useLock } from '../hooks/useLock';
import { fetchMilestonePatterns, applyMilestonePattern } from '../api/projects';
import EventFormModal from '../components/EventFormModal';
import ApplyPatternModal from '../components/ApplyPatternModal';
import AlertBanner from '../components/AlertBanner';

/* ── 定数 ── */
const PROJECT_STATUS = {
    active:    { label: '進行中',     cls: 'badge-active' },
    completed: { label: '完了',       cls: 'badge-completed' },
    on_hold:   { label: '保留',       cls: 'badge-on_hold' },
    cancelled: { label: 'キャンセル', cls: 'badge-cancelled' },
};

const EVENT_STATUS = {
    pending:     { label: '未着手', cls: 'badge-pending' },
    in_progress: { label: '着手中', cls: 'badge-in_progress' },
    completed:   { label: '完了',   cls: 'badge-completed' },
    delayed:     { label: '遅延',   cls: 'badge-delayed' },
};

/* ── 差異表示 ── */
function DiffCell({ diffDays, planDate, actualDate }) {
    if (actualDate == null && planDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const plan  = new Date(planDate);
        const overdue = Math.floor((today - plan) / 86400000);
        if (overdue > 0) return <span className="diff diff-overdue">未入力（+{overdue}日超過）</span>;
        return <span className="diff diff-ontime">—</span>;
    }
    if (diffDays == null)   return <span className="diff diff-ontime">—</span>;
    if (diffDays < 0)       return <span className="diff diff-early">{diffDays}日（前倒）</span>;
    if (diffDays === 0)     return <span className="diff diff-ontime">±0日</span>;
    return <span className="diff diff-late">+{diffDays}日</span>;
}

/* ── メインコンポーネント ── */
export default function ProjectDetail() {
    const { id } = useParams();
    const [editMode, setEditMode] = useState(false);
    const [eventModal, setEventModal] = useState(null); // { mode:'create'|'edit', event? }

    const { data: project, loading: pLoading, error: pError, reload: reloadProject } = useProject(id);
    const { data: events,  loading: eLoading, error: eError, reload: reloadEvents } = useEvents(id);
    const { data: alerts,  reload: reloadAlerts, resolve: resolveAlert } = useAlerts(id, { is_resolved: false });
    const { locked, lockedBy, myLock, lockError, acquire, release } = useLock(id);
    const { create, update, remove, loading: eMutating, error: eMutError } = useEventMutations(id, reloadEvents);

    /* ── マイルストーンパターン ── */
    const [patterns, setPatterns]         = useState([]);
    const [patternModal, setPatternModal] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [applyResult, setApplyResult]   = useState(null); // { generated, archived }

    useEffect(() => {
        fetchMilestonePatterns().then(setPatterns).catch(() => {});
    }, []);

    const appliedPatternName = patterns.find(
        (p) => p.id === project?.applied_milestone_pattern_id
    )?.pattern_name;

    /* ── 編集モード切替 ── */
    const handleEditToggle = useCallback(async () => {
        if (editMode) {
            await release();
            setEditMode(false);
        } else {
            const ok = await acquire();
            if (ok) setEditMode(true);
        }
    }, [editMode, acquire, release]);

    /* ── パターン適用 ── */
    const handlePatternApply = useCallback(async ({ pattern_id, base_date }) => {
        setApplyLoading(true);
        try {
            const result = await applyMilestonePattern(id, { pattern_id, base_date });
            console.log('[pattern-apply] 完了:', result);
            setApplyResult({
                generated:   result.event_count,
                archived:    result.archived_count,
                carried:     result.carried_count    ?? 0,
                restored:    result.restored_count   ?? 0,
                calculated:  result.calculated_count ?? 0,
                removed:     result.removed_count    ?? 0,
            });
            setPatternModal(false);
            reloadProject();
            reloadEvents();
        } finally {
            setApplyLoading(false);
        }
    }, [id, reloadProject, reloadEvents]);

    /* ── イベント保存 ── */
    const handleEventSubmit = useCallback(async (body) => {
        if (eventModal?.mode === 'create') {
            await create(body);
        } else {
            await update(eventModal.event.id, body);
        }
        setEventModal(null);
        reloadAlerts();
    }, [eventModal, create, update, reloadAlerts]);

    /* ── イベント削除 ── */
    const handleDeleteEvent = useCallback(async (ev) => {
        if (!window.confirm(`「${ev.event_name}」を削除しますか？`)) return;
        await remove(ev.id);
    }, [remove]);

    /* ── ローディング / エラー ── */
    if (pLoading) return <div className="page"><div className="loading-state">読み込み中…</div></div>;
    if (pError || !project) return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>
            <div className="error-state">{pError || '案件が見つかりません'}</div>
        </div>
    );

    const psi = PROJECT_STATUS[project.status] || { label: project.status, cls: 'badge-pending' };

    return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>

            {/* ── ページヘッダー ── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">{project.project_name}</h1>
                    <p className="page-sub">{project.project_no}</p>
                </div>
                <span className={`badge ${psi.cls}`} style={{ fontSize: 13, padding: '4px 14px' }}>
                    {psi.label}
                </span>
            </div>

            {/* ── ロック状態バー ── */}
            <div className={`lock-bar ${myLock ? 'locked-mine' : locked ? 'locked-other' : ''}`}>
                <span style={{ fontSize: 20 }}>
                    {myLock ? '🟢' : locked ? '🔒' : '🔓'}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>
                    {myLock
                        ? `編集中 — あなた（${sessionStorage.getItem('userName')}）がロックを保持しています`
                        : locked
                        ? `${lockedBy} が編集中のため、編集できません`
                        : 'ロックなし — 編集モードで変更できます'}
                </span>
                {lockError && (
                    <span style={{ fontSize: 12, color: '#dc2626' }}>{lockError}</span>
                )}
                <button
                    className={`btn btn-sm ${editMode ? 'btn-danger' : 'btn-primary'}`}
                    onClick={handleEditToggle}
                    disabled={locked && !myLock}
                >
                    {editMode ? '編集を終了' : '編集モード'}
                </button>
            </div>

            {/* ── アラートバナー ── */}
            {alerts.length > 0 && (
                <AlertBanner alerts={alerts} onResolve={resolveAlert} />
            )}

            {/* ── 案件情報 ── */}
            <div className="section">
                <div className="section-header">
                    <h2 className="section-title">案件情報</h2>
                </div>
                <div className="info-grid">
                    <div className="info-item">
                        <div className="label">案件No</div>
                        <div className="value" style={{ fontFamily: 'monospace' }}>{project.project_no}</div>
                    </div>
                    <div className="info-item">
                        <div className="label">パターンNo</div>
                        <div className="value">{project.pattern_no || '—'}</div>
                    </div>
                    <div className="info-item">
                        <div className="label">機種</div>
                        <div className="value">{project.machine_type || '—'}</div>
                    </div>
                    <div className="info-item">
                        <div className="label">品名</div>
                        <div className="value">{project.product_name || '—'}</div>
                    </div>
                    <div className="info-item">
                        <div className="label">数量</div>
                        <div className="value">{project.quantity ?? '—'}</div>
                    </div>
                    <div className="info-item">
                        <div className="label">更新日時</div>
                        <div className="value">{new Date(project.updated_at).toLocaleString('ja-JP')}</div>
                    </div>
                </div>
                {project.comment && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: '#f9fafb', borderRadius: 6, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                        {project.comment}
                    </div>
                )}
            </div>

            {/* ── イベント一覧 ── */}
            <div className="section">
                <div className="section-header">
                    <div>
                        <h2 className="section-title">
                            イベント一覧
                            {events.length > 0 && (
                                <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                                    {events.length} 件
                                </span>
                            )}
                        </h2>
                        {/* 適用済みパターン表示 */}
                        {appliedPatternName ? (
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                適用済み: {appliedPatternName}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                パターン未適用
                            </div>
                        )}
                        {/* 適用完了メッセージ */}
                        {applyResult && (
                            <div style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                                ✓ 適用完了 — {applyResult.generated} 件生成
                                {applyResult.carried    > 0 && ` / ${applyResult.carried} 件引き継ぎ`}
                                {applyResult.restored   > 0 && ` / ${applyResult.restored} 件復元`}
                                {applyResult.calculated > 0 && ` / ${applyResult.calculated} 件新規計算`}
                                {applyResult.removed    > 0 && ` / ${applyResult.removed} 件除外`}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setApplyResult(null); setPatternModal(true); }}
                        >
                            パターン適用
                        </button>
                        {editMode && (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setEventModal({ mode: 'create' })}
                                disabled={eMutating}
                            >
                                ＋ イベント追加
                            </button>
                        )}
                    </div>
                </div>

                {eMutError && (
                    <div className="error-state" style={{ marginBottom: 12 }}>{eMutError}</div>
                )}

                {eLoading && <div className="loading-state">読み込み中…</div>}
                {eError   && <div className="error-state">{eError}</div>}

                {!eLoading && !eError && (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>イベント名</th>
                                    <th>担当部門</th>
                                    <th>予定日</th>
                                    <th>最新実績</th>
                                    <th>前回実績</th>
                                    <th>前々回実績</th>
                                    <th>差異</th>
                                    <th>状態</th>
                                    {editMode && <th style={{ width: 100 }}>操作</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {events.length === 0 ? (
                                    <tr>
                                        <td colSpan={editMode ? 9 : 8}>
                                            <div className="empty-state">
                                                {editMode
                                                    ? '「＋ イベント追加」からイベントを登録してください'
                                                    : 'イベントがありません'}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    events.map((ev) => {
                                        const esi = EVENT_STATUS[ev.status] || { label: ev.status, cls: 'badge-pending' };
                                        const isOverdue = !ev.actual_date && ev.plan_date
                                            && new Date(ev.plan_date) < new Date();

                                        return (
                                            <tr key={ev.id} style={isOverdue ? { background: '#fff9f9' } : {}}>
                                                <td style={{ fontWeight: 500 }}>{ev.event_name}</td>
                                                <td style={{ color: '#6b7280' }}>{ev.owner_department || '—'}</td>
                                                <td>{ev.plan_date ? ev.plan_date.slice(0, 10) : '—'}</td>
                                                <td>
                                                    {ev.actual_date
                                                        ? ev.actual_date.slice(0, 10)
                                                        : <span style={{ color: '#9ca3af' }}>未入力</span>}
                                                </td>
                                                <td style={{ color: '#6b7280', fontSize: 12 }}>
                                                    {ev.actual_date_prev1 ? ev.actual_date_prev1.slice(0, 10) : '—'}
                                                </td>
                                                <td style={{ color: '#9ca3af', fontSize: 12 }}>
                                                    {ev.actual_date_prev2 ? ev.actual_date_prev2.slice(0, 10) : '—'}
                                                </td>
                                                <td>
                                                    <DiffCell
                                                        diffDays={ev.diff_days}
                                                        planDate={ev.plan_date}
                                                        actualDate={ev.actual_date}
                                                    />
                                                </td>
                                                <td><span className={`badge ${esi.cls}`}>{esi.label}</span></td>
                                                {editMode && (
                                                    <td>
                                                        <div className="btn-group">
                                                            <button
                                                                className="btn btn-secondary btn-xs"
                                                                onClick={() => setEventModal({ mode: 'edit', event: ev })}
                                                                disabled={eMutating}
                                                            >
                                                                編集
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-xs"
                                                                style={{ color: '#dc2626' }}
                                                                onClick={() => handleDeleteEvent(ev)}
                                                                disabled={eMutating}
                                                            >
                                                                削除
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── モーダル ── */}
            {eventModal && (
                <EventFormModal
                    mode={eventModal.mode}
                    event={eventModal.event}
                    onClose={() => setEventModal(null)}
                    onSubmit={handleEventSubmit}
                    loading={eMutating}
                />
            )}
            {patternModal && (
                <ApplyPatternModal
                    patterns={patterns}
                    currentEventCount={events.length}
                    onClose={() => setPatternModal(false)}
                    onSubmit={handlePatternApply}
                    loading={applyLoading}
                />
            )}
        </div>
    );
}
