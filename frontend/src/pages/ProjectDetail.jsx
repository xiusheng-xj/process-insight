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
import {
    fetchProjectProcessSteps,
    deleteProjectProcessStep,
} from '../api/processPatterns';
import SaveAsPatternModal        from '../components/SaveAsPatternModal';
import ProcessStepModal          from '../components/ProcessStepModal';
import ProcessStepEditModal      from '../components/ProcessStepEditModal';
import SaveProcessPatternModal   from '../components/SaveProcessPatternModal';
import { reorderEvents }         from '../api/events';
import { fetchLocations }        from '../api/locations';
import { fetchResources }        from '../api/resources';
import EventFormModal            from '../components/EventFormModal';
import ProcessPlanningReview     from '../components/ProcessPlanningReview';
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

const DEPT_LABEL = { A: 'A部門', SELF: '自部門', B: 'B部門', C: 'C部門', D: 'D部門' };

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
    return <span className="diff diff-late">+{diffDays}日（遅延）</span>;
}

/* ── 工程ステップ 差異表示 ── */
function StepDiffCell({ diffDays, latestActualDate }) {
    if (!latestActualDate) return <span style={{ color: 'var(--color-subtle)' }}>—</span>;
    if (diffDays == null)  return <span style={{ color: 'var(--color-subtle)' }}>—</span>;
    if (diffDays < 0)  return <span className="diff diff-early">{diffDays}日（前倒し）</span>;
    if (diffDays === 0) return <span className="diff diff-ontime">0日（計画通り）</span>;
    return <span className="diff diff-late">+{diffDays}日（遅延）</span>;
}

/* ── 工程ステップ サブ行（マイルストーン行と列を揃える） ── */
function ProcessStepSubRow({ step, editMode, onDelete, onEdit }) {
    const isDone = !!step.latest_actual_date;
    const cell = {
        borderBottom: '1px solid #bfdbfe',
        background: '#eff6ff',
        fontSize: 12,
        paddingTop: 5,
        paddingBottom: 5,
    };

    return (
        <tr>
            {/* ドラッグ列の代わりにインデント記号 */}
            {editMode && (
                <td style={{ ...cell, textAlign: 'center', color: '#93c5fd', fontSize: 13 }}>
                    └
                </td>
            )}
            {/* 工程名 */}
            <td style={{ ...cell, paddingLeft: editMode ? 10 : 28 }}>
                {!editMode && <span style={{ color: '#93c5fd', marginRight: 4 }}>└</span>}
                <span style={{ fontWeight: 500, color: isDone ? 'var(--color-subtle)' : 'var(--color-text)' }}>
                    {step.process_name}
                </span>
                {step.is_custom && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>
                        カスタム
                    </span>
                )}
                {(step.location_name || step.resource_name) && (
                    <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--color-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {step.location_name && <span>📍 {step.location_name}</span>}
                        {step.resource_name && <span>🔧 {step.resource_name}</span>}
                    </div>
                )}
            </td>
            {/* 担当部門 */}
            <td style={{ ...cell, color: 'var(--color-muted)' }}>
                {DEPT_LABEL[step.department_code] || step.department_code || '—'}
            </td>
            {/* 予定日 */}
            <td style={cell}>
                {step.plan_date ? step.plan_date.slice(0, 10) : '—'}
            </td>
            {/* 最新実績 */}
            <td style={{ ...cell, color: isDone ? 'var(--color-success)' : 'var(--color-subtle)' }}>
                {step.latest_actual_date ? step.latest_actual_date.slice(0, 10) : '未入力'}
            </td>
            {/* 前回実績 */}
            <td style={{ ...cell, color: 'var(--color-muted)', fontSize: 11 }}>
                {step.previous_actual_date ? step.previous_actual_date.slice(0, 10) : '—'}
            </td>
            {/* 前々回実績 */}
            <td style={{ ...cell, color: 'var(--color-subtle)', fontSize: 11 }}>
                {step.pre_previous_actual_date ? step.pre_previous_actual_date.slice(0, 10) : '—'}
            </td>
            {/* 差異 */}
            <td style={cell}>
                <StepDiffCell diffDays={step.diff_days} latestActualDate={step.latest_actual_date} />
            </td>
            {/* 状態バッジ (latest_actual_date の有無で判定) */}
            <td style={cell}>
                <span className={`badge ${isDone ? 'badge-completed' : 'badge-pending'}`} style={{ fontSize: 10 }}>
                    {isDone ? '完了' : '未完了'}
                </span>
            </td>
            {/* 操作: 編集・削除のみ */}
            {editMode && (
                <td style={cell}>
                    <div className="btn-group">
                        <button
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--color-muted)', fontSize: 11 }}
                            onClick={() => onEdit(step)}
                        >
                            編集
                        </button>
                        <button
                            className="btn btn-danger btn-xs"
                            style={{ fontSize: 11 }}
                            onClick={() => onDelete(step)}
                        >
                            削除
                        </button>
                    </div>
                </td>
            )}
        </tr>
    );
}

/* ── ソート可能イベント行 ── */
function SortableRow({ ev, editMode, eMutating, onEdit, onDelete, stepCount, isStepsExpanded, onToggleSteps, onManageSteps }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ev.id });

    const esi = EVENT_STATUS[ev.status] || { label: ev.status, cls: 'badge-pending' };
    const isOverdue = !ev.actual_date && ev.plan_date && new Date(ev.plan_date) < new Date();
    const hasSteps  = stepCount > 0;

    const rowStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging
            ? { background: 'var(--color-primary-bg)', opacity: 0.85, boxShadow: 'var(--shadow-md)', position: 'relative', zIndex: 10 }
            : hasSteps
            ? { background: 'var(--color-primary-bg)', borderLeft: '3px solid var(--color-primary)' }
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
                        style={{ display: 'inline-block', cursor: 'grab', color: 'var(--color-subtle)', fontSize: 18, lineHeight: 1, padding: '4px 2px' }}
                    >
                        ≡
                    </span>
                </td>
            )}
            <td style={{ fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>
                        {ev.event_name}
                        {ev.is_custom && (
                            <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>固有</span>
                        )}
                    </span>
                    <button
                        onClick={onToggleSteps}
                        style={{
                            fontSize: 10, background: 'none', cursor: 'pointer', padding: '1px 5px',
                            border:       `1px solid ${hasSteps ? '#93c5fd' : '#d1d5db'}`,
                            borderRadius: 3,
                            color:        hasSteps ? '#2563eb' : '#9ca3af',
                            whiteSpace:   'nowrap',
                            fontWeight:   hasSteps ? 600 : 400,
                        }}
                    >
                        {isStepsExpanded ? '▲' : '▼'} 工程{hasSteps ? `(${stepCount})` : ''}
                    </button>
                </div>
            </td>
            <td style={{ color: 'var(--color-muted)' }}>{ev.owner_department || '—'}</td>
            <td>{ev.plan_date ? ev.plan_date.slice(0, 10) : '—'}</td>
            <td>
                {ev.actual_date
                    ? ev.actual_date.slice(0, 10)
                    : <span style={{ color: 'var(--color-subtle)' }}>未入力</span>}
            </td>
            <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                {ev.actual_date_prev1 ? ev.actual_date_prev1.slice(0, 10) : '—'}
            </td>
            <td style={{ color: 'var(--color-subtle)', fontSize: 12 }}>
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
                            style={{ color: '#6366f1', fontSize: 11 }}
                            onClick={onManageSteps}
                            disabled={eMutating}
                            title="工程パターンを適用"
                        >
                            工程
                        </button>
                        <button
                            className="btn btn-danger btn-xs"
                            style={{ fontSize: 11 }}
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
    const [showMasterSelect, setShowMasterSelect]   = useState(false);
    const [showSavePattern, setShowSavePattern]     = useState(false);
    const [savePatternResult, setSavePatternResult] = useState(null);
    const [localEvents, setLocalEvents]             = useState([]);

    // 工程ステップ関連
    const [processStepsMap, setProcessStepsMap]         = useState({});
    const [expandedStepRows, setExpandedStepRows]       = useState(new Set());
    const [processStepModal, setProcessStepModal]       = useState(null); // { event, initialTab? }
    const [saveProcessPatModal, setSaveProcessPatModal] = useState(null); // { event }
    const [editStepModal, setEditStepModal]             = useState(null); // step object

    const { data: project, loading: pLoading, error: pError, reload: reloadProject } = useProject(id);
    const { data: events,  loading: eLoading, error: eError, reload: reloadEvents } = useEvents(id);
    const { data: alerts,  reload: reloadAlerts, resolve: resolveAlert } = useAlerts(id, { is_resolved: false });
    const { locked, lockedBy, myLock, lockError, acquire, release } = useLock(id);
    const { create, update, remove, loading: eMutating, error: eMutError } = useEventMutations(id, reloadEvents);

    /* ── 工程計画レビュー再評価トリガー（工程変更時に増分） ── */
    const [reviewKey, setReviewKey] = useState(0);
    const bumpReview = useCallback(() => setReviewKey((k) => k + 1), []);
    const [reviewSummary, setReviewSummary] = useState(null);

    /* ── ロケーション / リソース マスタ（工程編集用） ── */
    const [locations, setLocations] = useState([]);
    const [resources, setResources] = useState([]);
    useEffect(() => {
        fetchLocations({ active: true }).then(setLocations).catch(() => {});
        fetchResources({ active: true }).then(setResources).catch(() => {});
    }, []);

    /* ── マイルストーンパターン ── */
    const [patterns, setPatterns]         = useState([]);
    const [patternModal, setPatternModal] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [applyResult, setApplyResult]   = useState(null);

    /* ── サーバー取得イベントをローカル状態に同期 ── */
    useEffect(() => { setLocalEvents(events); }, [events]);

    /* ── 工程ステップ読み込み ── */
    const loadProcessSteps = useCallback(() => {
        if (!id) return;
        fetchProjectProcessSteps(id)
            .then(steps => {
                const map = {};
                for (const s of steps) {
                    if (!map[s.parent_event_id]) map[s.parent_event_id] = [];
                    map[s.parent_event_id].push(s);
                }
                setProcessStepsMap(map);
            })
            .catch(() => {});
    }, [id]);

    useEffect(() => { loadProcessSteps(); }, [loadProcessSteps]);

    /* ── DnD センサー ── */
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    /* ── 並び替え保存 ── */
    const saveReorder = useCallback(async (newOrder) => {
        setLocalEvents(newOrder);
        const payload = newOrder.map((e, i) => ({ id: e.id, sort_order: (i + 1) * 10 }));
        try {
            await reorderEvents(id, payload);
            reloadEvents();
        } catch {
            setLocalEvents(events);
            alert('並び替えの保存に失敗しました。');
        }
    }, [events, id, reloadEvents]);

    /* ── DnD 完了 ── */
    const handleDragEnd = useCallback(async ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIdx = localEvents.findIndex(e => e.id === active.id);
        const newIdx = localEvents.findIndex(e => e.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        await saveReorder(arrayMove(localEvents, oldIdx, newIdx));
    }, [localEvents, saveReorder]);

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
            setApplyResult({
                generated:   result.event_count,
                archived:    result.archived_count,
                carried:     result.carried_count          ?? 0,
                restored:    result.restored_count         ?? 0,
                calculated:  result.calculated_count       ?? 0,
                removed:     result.removed_count          ?? 0,
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

    /* ── パターン保存完了 ── */
    const handleSavePatternDone = useCallback((newPattern) => {
        setShowSavePattern(false);
        setSavePatternResult(newPattern.pattern_name);
        fetchMilestonePatterns().then(setPatterns).catch(() => {});
        setTimeout(() => setSavePatternResult(null), 5000);
    }, []);

    /* ── イベント保存 ── */
    const handleEventSubmit = useCallback(async (body) => {
        if (eventModal?.mode === 'create') {
            await create(body);
        } else {
            await update(eventModal.event.id, body);
        }
        setEventModal(null);
        reloadAlerts();
        bumpReview();
    }, [eventModal, create, update, reloadAlerts, bumpReview]);

    /* ── イベント削除 ── */
    const handleDeleteEvent = useCallback(async (ev) => {
        if (!window.confirm(`「${ev.event_name}」を削除しますか？`)) return;
        await remove(ev.id);
        bumpReview();
    }, [remove, bumpReview]);

    /* ── 工程ステップ 展開/折りたたみ ── */
    const toggleStepExpand = useCallback((eventId) => {
        setExpandedStepRows(prev => {
            const s = new Set(prev);
            s.has(eventId) ? s.delete(eventId) : s.add(eventId);
            return s;
        });
    }, []);

    /* ── 工程ステップ 削除 ── */
    const handleDeleteProcessStep = useCallback(async (step) => {
        if (!window.confirm(`「${step.process_name}」を削除しますか？`)) return;
        try {
            await deleteProjectProcessStep(id, step.id);
            loadProcessSteps();
        } catch (err) {
            alert(err?.data?.message || err?.message || '工程ステップの削除に失敗しました。');
        }
    }, [id, loadProcessSteps]);

    /* ── 工程ステップ 編集モーダル ── */
    const handleEditStep  = useCallback((step) => setEditStepModal(step), []);
    const handleSaveStep  = useCallback(() => {
        setEditStepModal(null);
        loadProcessSteps();
    }, [loadProcessSteps]);

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
    // 列数: edit=10 (drag+8data+actions), view=8
    const colCount = editMode ? 10 : 8;

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
                    <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{lockError}</span>
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

            {/* ── 工程計画レビュー アラート（要調整時） ── */}
            {reviewSummary?.overall_verdict === 'adjust' && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                    padding: '12px 16px', marginBottom: 14,
                }}>
                    <span style={{ fontSize: 18, lineHeight: 1, color: '#dc2626' }}>⚠</span>
                    <div style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.7 }}>
                        <div style={{ fontWeight: 700 }}>工程計画レビュー：Resource重複があります</div>
                        {(reviewSummary.guidance || []).map((g, i) => <div key={i}>{g}</div>)}
                    </div>
                </div>
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
                                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-muted)', marginLeft: 8 }}>
                                        {localEvents.length} 件
                                    </span>
                                )}
                            </h2>
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
                        {appliedPatternName ? (
                            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                                適用済み: {appliedPatternName}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--color-subtle)' }}>
                                パターン未適用
                            </div>
                        )}
                        {applyResult && applyResult.generated === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 3 }}>
                                ⚠ このパターンには工程が登録されていないため、イベントは生成されませんでした。
                            </div>
                        )}
                        {applyResult && applyResult.generated > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 3 }}>
                                ✓ 適用完了 — {applyResult.generated} 件生成
                                {applyResult.carried    > 0 && ` / ${applyResult.carried} 件引き継ぎ`}
                                {applyResult.restored   > 0 && ` / ${applyResult.restored} 件復元`}
                                {applyResult.calculated > 0 && ` / ${applyResult.calculated} 件新規計算`}
                                {applyResult.removed    > 0 && ` / ${applyResult.removed} 件除外`}
                                {applyResult.customKept > 0 && ` / ${applyResult.customKept} 件固有保持`}
                            </div>
                        )}
                        {savePatternResult && (
                            <div style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 3 }}>
                                ✓ パターン「{savePatternResult}」を保存しました
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {editMode && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowSavePattern(true)}
                                title="現在のイベント構成を新規マイルストーンパターンとして保存"
                            >
                                構成を保存
                            </button>
                        )}
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
                    <GanttChart
                        events={localEvents}
                        processStepsMap={processStepsMap}
                        editMode={editMode}
                        onReorder={saveReorder}
                    />
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
                                            {editMode && <th style={{ width: 110 }}>操作</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {localEvents.length === 0 ? (
                                            <tr>
                                                <td colSpan={colCount}>
                                                    <div className="empty-state">
                                                        {editMode
                                                            ? '「＋ イベント追加」からイベントを登録してください'
                                                            : 'イベントがありません'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            localEvents.flatMap((ev) => {
                                                const steps      = processStepsMap[ev.id] || [];
                                                const isExpanded = expandedStepRows.has(ev.id);
                                                const subColSpan = colCount - (editMode ? 2 : 0);
                                                const rows = [
                                                    <SortableRow
                                                        key={ev.id}
                                                        ev={ev}
                                                        editMode={editMode}
                                                        eMutating={eMutating}
                                                        stepCount={steps.length}
                                                        isStepsExpanded={isExpanded}
                                                        onToggleSteps={() => toggleStepExpand(ev.id)}
                                                        onManageSteps={() => setProcessStepModal({ event: ev, initialTab: 'apply' })}
                                                        onEdit={(e) => setEventModal({ mode: 'edit', event: e })}
                                                        onDelete={handleDeleteEvent}
                                                    />,
                                                ];

                                                if (isExpanded) {
                                                    if (steps.length === 0) {
                                                        rows.push(
                                                            <tr key={`empty-steps-${ev.id}`} style={{ background: '#eff6ff' }}>
                                                                {editMode && <td style={{ borderBottom: '1px solid #bfdbfe' }} />}
                                                                <td colSpan={subColSpan} style={{
                                                                    paddingLeft: 40, fontSize: 12, color: 'var(--color-subtle)',
                                                                    paddingTop: 6, paddingBottom: 6,
                                                                    borderBottom: '1px solid #bfdbfe',
                                                                }}>
                                                                    工程ステップなし
                                                                </td>
                                                                {editMode && <td style={{ borderBottom: '1px solid #bfdbfe' }} />}
                                                            </tr>
                                                        );
                                                    } else {
                                                        steps.forEach(s => {
                                                            rows.push(
                                                                <ProcessStepSubRow
                                                                    key={`s-${s.id}`}
                                                                    step={s}
                                                                    editMode={editMode}
                                                                    onDelete={handleDeleteProcessStep}
                                                                    onEdit={handleEditStep}
                                                                />
                                                            );
                                                        });
                                                    }

                                                    // 展開時のアクション行（edit モードのみ）
                                                    if (editMode) {
                                                        rows.push(
                                                            <tr key={`step-actions-${ev.id}`} style={{ background: '#eff6ff' }}>
                                                                <td style={{ borderBottom: '1px solid #bfdbfe' }} />
                                                                <td colSpan={subColSpan} style={{
                                                                    paddingLeft: 40, paddingTop: 6, paddingBottom: 8,
                                                                    borderBottom: '1px solid #bfdbfe',
                                                                }}>
                                                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                                        <button
                                                                            className="btn btn-ghost btn-xs"
                                                                            style={{ color: '#6366f1', fontSize: 11 }}
                                                                            onClick={() => setProcessStepModal({ event: ev, initialTab: 'custom' })}
                                                                        >
                                                                            ＋ 任意工程を追加
                                                                        </button>
                                                                        {steps.length > 0 && (
                                                                            <button
                                                                                className="btn btn-ghost btn-xs"
                                                                                style={{ color: 'var(--color-muted)', fontSize: 11 }}
                                                                                onClick={() => setSaveProcessPatModal({ event: ev })}
                                                                            >
                                                                                工程パターンとして保存
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ borderBottom: '1px solid #bfdbfe' }} />
                                                            </tr>
                                                        );
                                                    }
                                                }

                                                return rows;
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* ── 工程計画レビュー ── */}
            <ProcessPlanningReview projectId={id} refreshKey={reviewKey} onReview={setReviewSummary} />

            {/* ── モーダル ── */}
            {eventModal && (
                <EventFormModal
                    mode={eventModal.mode}
                    event={eventModal.event}
                    locations={locations}
                    resources={resources}
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
            {showSavePattern && (
                <SaveAsPatternModal
                    projectId={id}
                    localEvents={localEvents}
                    onClose={() => setShowSavePattern(false)}
                    onSaved={handleSavePatternDone}
                />
            )}
            {processStepModal && (
                <ProcessStepModal
                    projectId={id}
                    event={processStepModal.event}
                    locations={locations}
                    resources={resources}
                    initialTab={processStepModal.initialTab || 'apply'}
                    onClose={() => setProcessStepModal(null)}
                    onApplied={() => { loadProcessSteps(); setProcessStepModal(null); }}
                    onAdded={() => { loadProcessSteps(); }}
                />
            )}
            {saveProcessPatModal && (
                <SaveProcessPatternModal
                    projectId={id}
                    event={saveProcessPatModal.event}
                    steps={processStepsMap[saveProcessPatModal.event.id] || []}
                    onClose={() => setSaveProcessPatModal(null)}
                    onSaved={() => { setSaveProcessPatModal(null); }}
                />
            )}
            {editStepModal && (
                <ProcessStepEditModal
                    step={editStepModal}
                    projectId={id}
                    locations={locations}
                    resources={resources}
                    onClose={() => setEditStepModal(null)}
                    onSaved={handleSaveStep}
                />
            )}
        </div>
    );
}
