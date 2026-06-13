import { useMemo, useState, useEffect, useCallback } from 'react';
import {
    DndContext, closestCenter,
    PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy,
    useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ── 定数 ── */
const SCALE_CFG = {
    month: { dayW: 8,  hdrH: 30, label: '月' },
    week:  { dayW: 18, hdrH: 46, label: '週' },
    day:   { dayW: 42, hdrH: 46, label: '日' },
};
const ROW_H  = 40;
const LEFT_W = 440;
const MRK    = 10;  // milestone marker size
const SMRK   = 7;   // step marker size (smaller)

const STATUS_LABEL = {
    pending:     '未着手',
    in_progress: '着手中',
    completed:   '完了',
    delayed:     '遅延',
};

/* ── カラーヘルパー ── */
const markerColor = (ev, today) => {
    if (!ev.actual_date) {
        if (ev.plan_date && new Date(ev.plan_date) < today) return '#dc2626';
        return '#9ca3af';
    }
    const diff = Number(ev.diff_days ?? 0);
    if (diff < 0)  return '#059669';
    if (diff === 0) return '#2563eb';
    return '#ea580c';
};

// 工程ステップ用（マイルストーンより薄め）
const stepMarkerColor = (step, today) => {
    if (!step.latest_actual_date) {
        if (step.plan_date && new Date(step.plan_date) < today) return '#fca5a5';
        return '#d1d5db';
    }
    const diff = Number(step.diff_days ?? 0);
    if (diff < 0)  return '#86efac';
    if (diff === 0) return '#93c5fd';
    return '#fdba74';
};

/* ── フォーマットヘルパー ── */
const fmtShort = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
};

const toDay0 = (d) => { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; };

const getMonday = (date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
};

/* ── ヘッダー生成 ── */
const generateMonths = (startDate, totalDays, dayW) => {
    const totalWidth = totalDays * dayW;
    const result = [];
    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMs = startDate.getTime() + totalDays * 86400000;
    while (cur.getTime() < endMs) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        const left  = Math.max(0, Math.floor((cur.getTime() - startDate.getTime()) / 86400000)) * dayW;
        const right = Math.min(totalWidth, Math.floor((next.getTime() - startDate.getTime()) / 86400000) * dayW);
        if (right > left) result.push({ label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`, left, width: right - left });
        cur = next;
    }
    return result;
};

const generateWeeks = (startDate, totalDays, dayW) => {
    const totalWidth = totalDays * dayW;
    const endMs = startDate.getTime() + totalDays * 86400000;
    const result = [];
    let cur = getMonday(startDate);
    if (cur.getTime() > startDate.getTime()) cur.setDate(cur.getDate() - 7);
    while (cur.getTime() < endMs) {
        const rawLeft  = Math.floor((cur.getTime() - startDate.getTime()) / 86400000) * dayW;
        const rawRight = rawLeft + 7 * dayW;
        const left  = Math.max(0, rawLeft);
        const right = Math.min(totalWidth, rawRight);
        if (right > left) result.push({ label: `${cur.getMonth() + 1}/${String(cur.getDate()).padStart(2, '0')}`, left, width: right - left });
        cur = new Date(cur.getTime() + 7 * 86400000);
    }
    return result;
};

const generateDays = (startDate, totalDays, dayW) => {
    const result = [];
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dow = d.getDay();
        result.push({ label: String(d.getDate()), left: i * dayW, width: dayW, isWeekend: dow === 0 || dow === 6, isMonthStart: d.getDate() === 1 });
    }
    return result;
};

/* ── diff ラベル (マイルストーン用) ── */
const makeDiffLabel = (ev, today) => {
    if (ev.actual_date == null && ev.plan_date) {
        const od = Math.floor((today.getTime() - toDay0(new Date(ev.plan_date)).getTime()) / 86400000);
        if (od > 0) return { text: `+${od}日`, color: '#ea580c' };
        return { text: '—', color: '#9ca3af' };
    }
    const diff = Number(ev.diff_days ?? null);
    if (ev.diff_days == null) return { text: '—', color: '#9ca3af' };
    if (diff < 0) return { text: `${diff}日`, color: '#059669' };
    if (diff === 0) return { text: '±0', color: '#9ca3af' };
    return { text: `+${diff}日`, color: '#ea580c' };
};

/* ── diff ラベル (工程ステップ用) ── */
const makeStepDiffLabel = (step, today) => {
    if (!step.latest_actual_date) {
        if (step.plan_date && new Date(step.plan_date) < today) {
            const od = Math.floor((today.getTime() - toDay0(new Date(step.plan_date)).getTime()) / 86400000);
            if (od > 0) return { text: `+${od}日`, color: '#fca5a5' };
        }
        return { text: '—', color: '#d1d5db' };
    }
    const diff = Number(step.diff_days ?? null);
    if (diff == null) return { text: '—', color: '#d1d5db' };
    if (diff < 0)  return { text: `${diff}日`, color: '#86efac' };
    if (diff === 0) return { text: '±0', color: '#93c5fd' };
    return { text: `+${diff}日`, color: '#fdba74' };
};

/* ── マイルストーン左パネル行（ソータブル） ── */
function SortableGanttLeftRow({ ev, today, editMode, hasSteps, stepCount, isExpanded, onToggle }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: ev.id, disabled: !editMode });

    const color     = markerColor(ev, today);
    const diffLabel = makeDiffLabel(ev, today);

    return (
        <div
            ref={setNodeRef}
            style={{
                display: 'flex', height: ROW_H, alignItems: 'center',
                borderBottom: '1px solid #f3f4f6',
                transform: CSS.Transform.toString(transform),
                transition,
                ...(isDragging ? { background: '#eff6ff', opacity: 0.85, position: 'relative', zIndex: 10 } : {}),
                ...(hasSteps && !isDragging ? { borderLeft: '3px solid #93c5fd' } : {}),
            }}
            {...attributes}
        >
            {editMode && (
                <div
                    {...listeners}
                    title="ドラッグして並び替え"
                    style={{ width: 28, flexShrink: 0, textAlign: 'center', cursor: 'grab', userSelect: 'none', color: '#9ca3af', fontSize: 17, lineHeight: 1 }}
                >
                    ≡
                </div>
            )}
            <div style={{ flex: 1, padding: '0 6px 0 10px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.event_name}
                    {ev.is_custom && (
                        <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>固有</span>
                    )}
                </span>
                {hasSteps && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        style={{
                            flexShrink: 0, fontSize: 9, padding: '1px 5px',
                            border: `1px solid ${isExpanded ? '#93c5fd' : '#d1d5db'}`,
                            borderRadius: 3, background: 'none', cursor: 'pointer',
                            color: isExpanded ? '#2563eb' : '#9ca3af',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {isExpanded ? '▼' : '▶'} 工程({stepCount})
                    </button>
                )}
            </div>
            <div style={{ width: 64, textAlign: 'center', color: '#374151', fontSize: 12 }}>{fmtShort(ev.plan_date)}</div>
            <div style={{ width: 64, textAlign: 'center', color: ev.actual_date ? color : '#9ca3af', fontSize: 12 }}>{fmtShort(ev.actual_date)}</div>
            <div style={{ width: 52, textAlign: 'center', fontSize: 11, color: diffLabel.color }}>{diffLabel.text}</div>
            <div style={{ width: 56, textAlign: 'center' }}>
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 9999, background: `${color}22`, color }}>
                    {STATUS_LABEL[ev.status] || ev.status}
                </span>
            </div>
        </div>
    );
}

/* ── 工程ステップ左パネル行（非ソータブル） ── */
function GanttStepLeftRow({ step, editMode, today }) {
    const isDone    = !!step.latest_actual_date;
    const color     = stepMarkerColor(step, today);
    const diffLabel = makeStepDiffLabel(step, today);

    return (
        <div style={{
            display: 'flex', height: ROW_H, alignItems: 'center',
            borderBottom: '1px solid #e0f2fe', background: '#f0f9ff',
        }}>
            {editMode && <div style={{ width: 28, flexShrink: 0 }} />}
            <div style={{
                flex: 1, padding: '0 6px 0 26px', fontSize: 11,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                <span style={{ color: '#93c5fd', marginRight: 3 }}>└</span>
                <span style={{ color: isDone ? '#94a3b8' : '#374151' }}>{step.process_name}</span>
                {step.is_custom && (
                    <span style={{ marginLeft: 3, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 3px' }}>カスタム</span>
                )}
            </div>
            <div style={{ width: 64, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>{fmtShort(step.plan_date)}</div>
            <div style={{ width: 64, textAlign: 'center', fontSize: 11, color: isDone ? color : '#9ca3af' }}>
                {fmtShort(step.latest_actual_date)}
            </div>
            <div style={{ width: 52, textAlign: 'center', fontSize: 10, color: diffLabel.color }}>{diffLabel.text}</div>
            <div style={{ width: 56, textAlign: 'center' }}>
                <span style={{
                    fontSize: 9, padding: '1px 4px', borderRadius: 9999,
                    background: isDone ? '#d1fae5' : '#f3f4f6',
                    color:      isDone ? '#059669' : '#9ca3af',
                }}>
                    {isDone ? '完了' : '未完了'}
                </span>
            </div>
        </div>
    );
}

/* ── メインコンポーネント ── */
/**
 * @param {{ events: object[], processStepsMap?: Record<number,object[]>, editMode?: boolean, onReorder?: (newOrder: object[]) => void }} props
 */
export default function GanttChart({ events, processStepsMap = {}, editMode = false, onReorder }) {
    const [scale, setScale] = useState('month');
    const [expandedSteps, setExpandedSteps] = useState(new Set());
    const { dayW, hdrH } = SCALE_CFG[scale];
    const today = useMemo(() => toDay0(new Date()), []);

    const toggleStepExpand = useCallback((eventId) => {
        setExpandedSteps(prev => {
            const s = new Set(prev);
            s.has(eventId) ? s.delete(eventId) : s.add(eventId);
            return s;
        });
    }, []);

    /* ── ローカルソート ── */
    const [localSorted, setLocalSorted] = useState([]);
    useEffect(() => { setLocalSorted([...events]); }, [events]);

    /* ── フラット行リスト（nextEv / nextStep を含む：バー計算用） ── */
    const flatRows = useMemo(() => {
        const result = [];
        localSorted.forEach((ev, evIdx) => {
            const steps    = processStepsMap[ev.id] || [];
            const hasSteps = steps.length > 0;
            const nextEv   = localSorted[evIdx + 1] || null;
            result.push({ type: 'event', ev, hasSteps, stepCount: steps.length, nextEv });
            if (hasSteps && expandedSteps.has(ev.id)) {
                steps.forEach((s, sIdx) => {
                    result.push({ type: 'step', s, nextStep: steps[sIdx + 1] || null });
                });
            }
        });
        return result;
    }, [localSorted, expandedSteps, processStepsMap]);

    /* ── DnD ── */
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const handleGanttDragEnd = useCallback(({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIdx = localSorted.findIndex(e => e.id === active.id);
        const newIdx = localSorted.findIndex(e => e.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const newOrder = arrayMove(localSorted, oldIdx, newIdx);
        setLocalSorted(newOrder);
        onReorder?.(newOrder);
    }, [localSorted, onReorder]);

    /* ── 日付レンジ（ステップ日程も含める） ── */
    const { startDate, totalDays } = useMemo(() => {
        const pts = [today];
        localSorted.forEach(e => {
            if (e.plan_date)   pts.push(toDay0(new Date(e.plan_date)));
            if (e.actual_date) pts.push(toDay0(new Date(e.actual_date)));
            (processStepsMap[e.id] || []).forEach(s => {
                if (s.plan_date)          pts.push(toDay0(new Date(s.plan_date)));
                if (s.latest_actual_date) pts.push(toDay0(new Date(s.latest_actual_date)));
            });
        });
        if (pts.length === 1) pts.push(today);

        const minMs = Math.min(...pts.map(d => d.getTime()));
        const maxMs = Math.max(...pts.map(d => d.getTime()));
        let start, end;
        if (scale === 'month') {
            start = new Date(minMs); start.setDate(1); start.setMonth(start.getMonth() - 1);
            end   = new Date(maxMs); end.setMonth(end.getMonth() + 2); end.setDate(0);
        } else if (scale === 'week') {
            start = getMonday(new Date(minMs)); start.setDate(start.getDate() - 14);
            end   = new Date(maxMs); end.setDate(end.getDate() + 14);
        } else {
            start = new Date(minMs); start.setDate(start.getDate() - 7);
            end   = new Date(maxMs); end.setDate(end.getDate() + 7);
        }
        start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
        return { startDate: start, totalDays: Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1 };
    }, [localSorted, processStepsMap, today, scale]);

    /* ── 座標計算 ── */
    const cx = useCallback((dateStr) => {
        if (!dateStr) return null;
        return Math.floor((toDay0(new Date(dateStr)).getTime() - startDate.getTime()) / 86400000) * dayW + dayW / 2;
    }, [startDate, dayW]);

    const totalWidth = totalDays * dayW;
    const todayX     = Math.floor((today.getTime() - startDate.getTime()) / 86400000) * dayW + dayW / 2;
    const halfH      = Math.floor(hdrH / 2);

    /* ── ヘッダーデータ ── */
    const months     = useMemo(() => generateMonths(startDate, totalDays, dayW), [startDate, totalDays, dayW]);
    const weeks      = useMemo(() => scale === 'week' ? generateWeeks(startDate, totalDays, dayW) : [], [scale, startDate, totalDays, dayW]);
    const dayHeaders = useMemo(() => scale === 'day'  ? generateDays(startDate, totalDays, dayW)  : [], [scale, startDate, totalDays, dayW]);

    const planOnlyEvents = localSorted.filter(e => !e.plan_date);

    if (localSorted.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>イベントがありません</div>;
    }

    return (
        <div>
            {/* スケール切替 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'flex-end' }}>
                {Object.entries(SCALE_CFG).map(([key, cfg]) => (
                    <button key={key} className={`btn btn-xs ${scale === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScale(key)}>
                        {cfg.label}
                    </button>
                ))}
            </div>

            {/* ガント本体 */}
            <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', fontSize: 12 }}>

                {/* 左パネル（固定幅） */}
                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '2px solid #e5e7eb', overflow: 'hidden' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', height: hdrH, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', alignItems: 'flex-end', paddingBottom: 5 }}>
                        {editMode && <div style={{ width: 28, flexShrink: 0 }} />}
                        <div style={{ flex: 1, padding: '0 10px', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>イベント / 工程</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>予定日</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>実績日</div>
                        <div style={{ width: 52, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>差異</div>
                        <div style={{ width: 56, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>状態</div>
                    </div>

                    {/* 行（DnD ソータブル、ステップ行は非ソータブルで混在） */}
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGanttDragEnd}>
                        <SortableContext items={localSorted.map(e => e.id)} strategy={verticalListSortingStrategy}>
                            {flatRows.map(row =>
                                row.type === 'event'
                                    ? <SortableGanttLeftRow
                                        key={row.ev.id}
                                        ev={row.ev}
                                        today={today}
                                        editMode={editMode}
                                        hasSteps={row.hasSteps}
                                        stepCount={row.stepCount}
                                        isExpanded={expandedSteps.has(row.ev.id)}
                                        onToggle={() => toggleStepExpand(row.ev.id)}
                                      />
                                    : <GanttStepLeftRow
                                        key={`s-${row.s.id}`}
                                        step={row.s}
                                        today={today}
                                        editMode={editMode}
                                      />
                            )}
                        </SortableContext>
                    </DndContext>
                </div>

                {/* 右パネル（横スクロール） */}
                <div style={{ flex: 1, overflowX: 'auto' }}>
                    <div style={{ width: totalWidth, position: 'relative' }}>

                        {/* 右ヘッダー */}
                        <div style={{ height: hdrH, position: 'relative', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {months.map((m, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: m.left, width: m.width,
                                    top: 0, height: scale === 'month' ? hdrH : halfH,
                                    display: 'flex', alignItems: 'center', paddingLeft: 6,
                                    borderRight: '1px solid #e5e7eb',
                                    borderBottom: scale !== 'month' ? '1px solid #d1d5db' : undefined,
                                    fontSize: 11, fontWeight: 600, color: '#6b7280',
                                    whiteSpace: 'nowrap', overflow: 'hidden',
                                }}>{m.label}</div>
                            ))}
                            {scale === 'week' && weeks.map((w, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: w.left, width: w.width,
                                    top: halfH, height: hdrH - halfH,
                                    display: 'flex', alignItems: 'center', paddingLeft: 4,
                                    borderRight: '1px solid #f3f4f6',
                                    fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden',
                                }}>{w.label}</div>
                            ))}
                            {scale === 'day' && dayHeaders.map((d, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: d.left, width: d.width,
                                    top: halfH, height: hdrH - halfH,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRight: '1px solid #f3f4f6',
                                    fontSize: 10,
                                    color: d.isWeekend ? '#9ca3af' : '#374151',
                                    background: d.isWeekend ? '#f3f4f6' : undefined,
                                    fontWeight: d.isMonthStart ? 700 : undefined,
                                }}>{d.label}</div>
                            ))}
                        </div>

                        {/* 今日線 */}
                        {todayX >= 0 && todayX <= totalWidth && (
                            <div style={{
                                position: 'absolute', left: todayX, top: 0, bottom: 0,
                                width: 1, background: '#dc2626', opacity: 0.55, zIndex: 10,
                                pointerEvents: 'none',
                            }} />
                        )}

                        {/* ガントバー行（期間バー方式） */}
                        {flatRows.map(row => {
                            const cyPos = ROW_H / 2;

                            if (row.type === 'event') {
                                const ev      = row.ev;
                                const nextEv  = row.nextEv;
                                const EVT_H   = 8;  // イベントバー高さ

                                // 計画バー: ev.plan_date → nextEv.plan_date
                                const planStartX = cx(ev.plan_date);
                                const planEndX   = nextEv ? cx(nextEv.plan_date) : null;

                                // 実績バー: ev.actual_date → nextEv.actual_date
                                const actualStartX = cx(ev.actual_date);
                                const actualEndX   = nextEv ? cx(nextEv.actual_date) : null;

                                // 色: 自身のマーカー色（計画 vs 実績の比較）
                                const markerCol    = markerColor(ev, today);
                                // 実績バー色: 終端イベント（nextEv）の状態を使う
                                const actualBarCol = nextEv ? markerColor(nextEv, today) : markerCol;

                                const showPlanBar   = planStartX   !== null && planEndX   !== null;
                                const showActualBar = actualStartX !== null && actualEndX !== null;

                                return (
                                    <div key={ev.id} style={{ height: ROW_H, position: 'relative', borderBottom: '1px solid #f3f4f6' }}>
                                        {/* 計画バー (グレー, 8px) */}
                                        {showPlanBar && (
                                            <div style={{
                                                position: 'absolute',
                                                left: Math.min(planStartX, planEndX),
                                                width: Math.max(2, Math.abs(planEndX - planStartX)),
                                                height: EVT_H, top: cyPos - EVT_H / 2,
                                                background: '#d1d5db',
                                                borderRadius: 2, zIndex: 1,
                                            }} />
                                        )}
                                        {/* 実績バー (カラー, 8px, 半透明) */}
                                        {showActualBar && (
                                            <div style={{
                                                position: 'absolute',
                                                left: Math.min(actualStartX, actualEndX),
                                                width: Math.max(2, Math.abs(actualEndX - actualStartX)),
                                                height: EVT_H, top: cyPos - EVT_H / 2,
                                                background: actualBarCol,
                                                opacity: 0.72,
                                                borderRadius: 2, zIndex: 2,
                                            }} />
                                        )}
                                        {/* 予定点 ◆ */}
                                        {planStartX !== null && (
                                            <div style={{
                                                position: 'absolute',
                                                left: planStartX - MRK / 2, top: cyPos - MRK / 2,
                                                width: MRK, height: MRK,
                                                background: '#9ca3af',
                                                transform: 'rotate(45deg)', borderRadius: 2, zIndex: 4,
                                            }} />
                                        )}
                                        {/* 実績点 ● */}
                                        {actualStartX !== null && (
                                            <div style={{
                                                position: 'absolute',
                                                left: actualStartX - MRK / 2, top: cyPos - MRK / 2,
                                                width: MRK, height: MRK,
                                                background: markerCol,
                                                borderRadius: '50%', zIndex: 5,
                                                boxShadow: `0 0 0 2px ${markerCol}44`,
                                            }} />
                                        )}
                                    </div>
                                );
                            } else {
                                const s        = row.s;
                                const nextStep = row.nextStep;
                                const STP_H    = 4;  // 工程バー高さ（イベントより細い）

                                const planStartX  = cx(s.plan_date);
                                const planEndX    = nextStep ? cx(nextStep.plan_date) : null;

                                const actualStartX = cx(s.latest_actual_date);
                                const actualEndX   = nextStep ? cx(nextStep.latest_actual_date) : null;

                                const markerCol    = stepMarkerColor(s, today);
                                const actualBarCol = nextStep ? stepMarkerColor(nextStep, today) : markerCol;

                                const showPlanBar   = planStartX   !== null && planEndX   !== null;
                                const showActualBar = actualStartX !== null && actualEndX !== null;

                                return (
                                    <div key={`s-${s.id}`} style={{ height: ROW_H, position: 'relative', borderBottom: '1px solid #e0f2fe', background: '#f0f9ff' }}>
                                        {/* 計画バー (薄いグレー, 4px) */}
                                        {showPlanBar && (
                                            <div style={{
                                                position: 'absolute',
                                                left: Math.min(planStartX, planEndX),
                                                width: Math.max(2, Math.abs(planEndX - planStartX)),
                                                height: STP_H, top: cyPos - STP_H / 2,
                                                background: '#e2e8f0',
                                                borderRadius: 1, zIndex: 1,
                                            }} />
                                        )}
                                        {/* 実績バー (カラー, 4px) */}
                                        {showActualBar && (
                                            <div style={{
                                                position: 'absolute',
                                                left: Math.min(actualStartX, actualEndX),
                                                width: Math.max(2, Math.abs(actualEndX - actualStartX)),
                                                height: STP_H, top: cyPos - STP_H / 2,
                                                background: actualBarCol,
                                                opacity: 0.72,
                                                borderRadius: 1, zIndex: 2,
                                            }} />
                                        )}
                                        {/* 予定点 ◆ (小) */}
                                        {planStartX !== null && (
                                            <div style={{
                                                position: 'absolute',
                                                left: planStartX - SMRK / 2, top: cyPos - SMRK / 2,
                                                width: SMRK, height: SMRK,
                                                background: '#d1d5db',
                                                transform: 'rotate(45deg)', borderRadius: 1, zIndex: 4,
                                            }} />
                                        )}
                                        {/* 実績点 ● (小) */}
                                        {actualStartX !== null && (
                                            <div style={{
                                                position: 'absolute',
                                                left: actualStartX - SMRK / 2, top: cyPos - SMRK / 2,
                                                width: SMRK, height: SMRK,
                                                background: markerCol,
                                                borderRadius: '50%', zIndex: 5,
                                            }} />
                                        )}
                                    </div>
                                );
                            }
                        })}
                    </div>
                </div>
            </div>

            {/* 凡例 */}
            <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 11, color: '#6b7280', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#9ca3af', transform: 'rotate(45deg)', borderRadius: 2 }} />
                    予定日
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#059669' }} />
                    前倒し
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#2563eb' }} />
                    計画通り
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ea580c' }} />
                    遅れ
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
                    未完了遅れ
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, color: '#9ca3af', fontSize: 10 }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, background: '#d1d5db', transform: 'rotate(45deg)', borderRadius: 1 }} />
                    工程予定
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#9ca3af', fontSize: 10 }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#86efac' }} />
                    工程実績
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
                    <span style={{ display: 'inline-block', width: 1, height: 14, background: '#dc2626', opacity: 0.55 }} />
                    今日
                </span>
                {editMode && (
                    <span style={{ marginLeft: 8, color: '#6366f1', fontSize: 11 }}>≡ ドラッグで並び替え可</span>
                )}
            </div>

            {planOnlyEvents.length > 0 && (
                <p style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                    ※ 予定日未設定の {planOnlyEvents.length} 件はガントに表示されません
                </p>
            )}
        </div>
    );
}
