import { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    DndContext, closestCenter,
    PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy,
    useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../hooks/useProjects';
import { useEvents, useEventMutations } from '../hooks/useEvents';
import { useAlerts } from '../hooks/useAlerts';
import { useLock } from '../hooks/useLock';
import { fetchMilestonePatterns, applyMilestonePattern, deleteProject } from '../api/projects';
import { reorderEvents } from '../api/events';
import EventFormModal            from '../components/EventFormModal';
import ApplyPatternModal         from '../components/ApplyPatternModal';
import ProjectInfoCard           from '../components/ProjectInfoCard';
import AlertBanner               from '../components/AlertBanner';
import ScheduleSummary           from '../components/ScheduleSummary';
import DeleteProjectModal        from '../components/DeleteProjectModal';
import GanttChart                from '../components/GanttChart';
import EventMasterSelectModal    from '../components/EventMasterSelectModal';

/* ── 定数 ── */
const PROJECT_STATUS = {
    not_started: { label: '未着手', cls: 'badge-pending'   },
    in_progress: { label: '作業中', cls: 'badge-active'    },
    completed:   { label: '完了',   cls: 'badge-completed' },
    on_hold:     { label: '保留',   cls: 'badge-on_hold'   },
    cancelled:   { label: '中止',   cls: 'badge-cancelled' },
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

/* ── ソート可能イベント行 ── */
function SortableRow({ ev, editMode, eMutating, onEdit, onDelete }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ev.id });

    const esi = EVENT_STATUS[ev.status] || { label: ev.status, cls: 'badge-pending' };
    const isOverdue = !ev.actual_date && ev.plan_date && new Date(ev.plan_date) < new Date();

    const rowStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging
            ? { background: '#eff6ff', opacity: 0.85, boxShadow: '0 4px 14px rgba(0,0,0,0.1)', position: 'relative', zIndex: 10 }
            : isOverdue
            ? { background: '#fff9f9' }
            : {}),
    };

    return (
        <tr ref={setNodeRef} style={rowStyle} {...attributes}>
            {editMode && (
                <td style={{ width: 32, textAlign: 'center', userSelect: 'none' }}>
                    <span
                        {...listeners}
                        title="ドラッグして並び替え"
                        style={{ display: 'inline-block', cursor: 'grab', color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: '4px 2px' }}
                    >
                        ≡
                    </span>
                </td>
            )}
            <td style={{ fontWeight: 500 }}>
                {ev.event_name}
                {ev.is_custom && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>固有</span>
                )}
            </td>
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
                <DiffCell diffDays={ev.diff_days} planDate={ev.plan_date} actualDate={ev.actual_date} />
            </td>
            <td><span className={`badge ${esi.cls}`}>{esi.label}</span></td>
            {editMode && (
                <td>
                    <div className="btn-group">
                        <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => onEdit(ev)}
                            disabled={eMutating}
                        >
                            編集
                        </button>
                        <button
                            className="btn btn-ghost btn-xs"
                            style={{ color: '#dc2626' }}
                            onClick={() => onDelete(ev)}
                            disabled={eMutating}
                        >
                            削除
                        </button>
                    </div>
                </td>
            )}
        </tr>
    );
}

/* ── メインコンポーネント ── */
export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [editMode, setEditMode]                 = useState(false);
    const [eventModal, setEventModal]             = useState(null);
    const [showDelete, setShowDelete]             = useState(false);
    const [deleting, setDeleting]                 = useState(false);
    const [eventTab, setEventTab]                 = useState('list');
    const [showMasterSelect, setShowMasterSelect] = useState(false);
    const [localEvents, setLocalEvents]           = useState([]);

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

    /* ── サーバー取得イベントをローカル状態に同期 ── */
    useEffect(() => { setLocalEvents(events); }, [events]);

    /* ── DnD センサー（5px 以上移動でドラッグ開始） ── */
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    /* ── ドラッグ完了: 楽観更新 → API 保存 ── */
    const handleDragEnd = useCallback(async ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIdx = localEvents.findIndex(e => e.id === active.id);
        const newIdx = localEvents.findIndex(e => e.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;

        const newOrder = arrayMove(localEvents, oldIdx, newIdx);
        setLocalEvents(newOrder);

        const payload = newOrder.map((e, i) => ({ id: e.id, sort_order: (i + 1) * 10 }));
        try {
            await reorderEvents(id, payload);
            reloadEvents();
        } catch {
            setLocalEvents(events); // 失敗時はロールバック
            alert('並び替えの保存に失敗しました。');
        }
    }, [localEvents, events, id, reloadEvents]);

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
                carried:     result.carried_count         ?? 0,
                restored:    result.restored_count        ?? 0,
                calculated:  result.calculated_count      ?? 0,
                removed:     result.removed_count         ?? 0,
                customKept:  result.custom_preserved_count ?? 0,
            });
            setPatternModal(false);
            reloadProject();
            reloadEvents();
        } finally {
            setApplyLoading(false);
        }
    }, [id, reloadProject, reloadEvents]);

    /* ── 論理削除 ── */
    const handleDelete = useCallback(async (reason) => {
        setDeleting(true);
        try {
            await deleteProject(id, {
                reason,
                deletedBy: sessionStorage.getItem('userName') || null,
            });
            navigate('/projects');
        } catch (err) {
            alert(`削除に失敗しました: ${err.message}`);
        } finally {
            setDeleting(false);
            setShowDelete(false);
        }
    }, [id, navigate]);

    /* ── マスターからイベント追加 ── */
    const handleAddFromMaster = useCallback(async (body) => {
        await create(body);
    }, [create]);

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
    if (pError)   return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>
            <div className="error-state">案件情報の取得に失敗しました: {pError}</div>
        </div>
    );
    if (!project) return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>
            <div className="error-state">案件情報が見つかりません</div>
        </div>
    );

    const psi = PROJECT_STATUS[project.effective_status] || { label: project.effective_status, cls: 'badge-pending' };

    return (
        <div className="page">
            <Link to="/projects" className="back-link">← 案件一覧へ戻る</Link>

            {/* ── ページヘッダー ── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">{project.project_name}</h1>
                    <p className="page-sub">{project.project_no}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`badge ${psi.cls}`} style={{ fontSize: 13, padding: '4px 14px' }}>
                        {psi.label}
                    </span>
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#9ca3af' }}
                        title="ゴミ箱へ移動"
                        onClick={() => setShowDelete(true)}
                    >
                        🗑 削除
                    </button>
                </div>
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
            <ProjectInfoCard
                project={project}
                patterns={patterns}
                onSaved={reloadProject}
            />

            {/* ── スケジュール評価サマリー ── */}
            <ScheduleSummary project={project} />

            {/* ── イベント一覧 / ガントチャート ── */}
            <div className="section">
                <div className="section-header">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <h2 className="section-title" style={{ margin: 0 }}>
                                {eventTab === 'list' ? 'イベント一覧' : 'ガントチャート'}
                                {localEvents.length > 0 && (
                                    <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                                        {localEvents.length} 件
                                    </span>
                                )}
                            </h2>
                            {/* タブ切替 */}
                            <div style={{ display: 'flex', gap: 3 }}>
                                <button
                                    className={`btn btn-xs ${eventTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setEventTab('list')}
                                >
                                    一覧
                                </button>
                                <button
                                    className={`btn btn-xs ${eventTab === 'gantt' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setEventTab('gantt')}
                                >
                                    ガント
                                </button>
                            </div>
                        </div>
                        {/* 適用済みパターン表示 */}
                        {appliedPatternName ? (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                適用済み: {appliedPatternName}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>
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
                                {applyResult.customKept > 0 && ` / ${applyResult.customKept} 件固有保持`}
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
                        {editMode && eventTab === 'list' && (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setShowMasterSelect(true)}
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

                {/* ── ガントチャートタブ ── */}
                {!eLoading && !eError && eventTab === 'gantt' && (
                    <GanttChart events={localEvents} />
                )}

                {/* ── イベント一覧タブ（DnD ソータブル） ── */}
                {!eLoading && !eError && eventTab === 'list' && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={localEvents.map(e => e.id)} strategy={verticalListSortingStrategy}>
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            {editMode && <th style={{ width: 32 }} title="並び替え" />}
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
                                        {localEvents.length === 0 ? (
                                            <tr>
                                                <td colSpan={editMode ? 10 : 8}>
                                                    <div className="empty-state">
                                                        {editMode
                                                            ? '「＋ イベント追加」からイベントを登録してください'
                                                            : 'イベントがありません'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            localEvents.map((ev) => (
                                                <SortableRow
                                                    key={ev.id}
                                                    ev={ev}
                                                    editMode={editMode}
                                                    eMutating={eMutating}
                                                    onEdit={(e) => setEventModal({ mode: 'edit', event: e })}
                                                    onDelete={handleDeleteEvent}
                                                />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </SortableContext>
                    </DndContext>
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
            {showDelete && (
                <DeleteProjectModal
                    project={project}
                    onClose={() => setShowDelete(false)}
                    onConfirm={handleDelete}
                    loading={deleting}
                />
            )}
            {showMasterSelect && (
                <EventMasterSelectModal
                    projectEvents={events}
                    onClose={() => setShowMasterSelect(false)}
                    onAdd={handleAddFromMaster}
                />
            )}
        </div>
    );
}
