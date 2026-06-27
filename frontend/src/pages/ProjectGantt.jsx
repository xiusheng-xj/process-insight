import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjectsGantt } from '../api/projects';
import { fetchProjectProcessSteps } from '../api/processPatterns';

/* ── Scale configuration ── */
const SCALE_CFG = {
    month: { dayW: 7  },
    week:  { dayW: 18 },
    day:   { dayW: 36 },
};
const SCALE_LABEL = { month: '月', week: '週', day: '日' };

/* ── Layout constants ── */
const ROW_H    = 80;
const SUB_ROW_H = 28;   // ドリルダウン（イベント / 工程ステップ）行の高さ
const LEFT_W   = 224;
const HEADER_H = 34;
const PAD_X    = 20;
const PLAN_Y   = 18;   // top of plan bar
const PLAN_H   = 6;
const ACTUAL_Y = 50;   // top of actual bar (increased to give room for labels)
const ACTUAL_H = 8;
const DIAMOND  = 5;    // half-size of ◆ element (10×10 square rotated 45°)
const DOT_R    = 5;    // ● radius
// derived: plan bar vertical center
const PLAN_CY    = PLAN_Y + PLAN_H / 2;         // = 21
const LBL_ABOVE  = PLAN_CY - DIAMOND - 12;      // = 4  (label top, even index)
const LBL_BELOW  = PLAN_CY + DIAMOND + 3;       // = 29 (label top, odd index)

/* ── Colors ── */
const HC = {
    healthy:     '#10b981',
    caution:     '#f59e0b',
    danger:      '#ef4444',
    completed:   '#3b82f6',
    not_started: '#d1d5db',
    on_hold:     '#9ca3af',
    cancelled:   '#9ca3af',
};
const HL = {
    healthy:     '計画通り',
    caution:     '注意',
    danger:      '遅延',
    completed:   '完了',
    not_started: '未着手',
    on_hold:     '保留',
    cancelled:   '中止',
};

function getActualColor(p) {
    if (p.effective_status === 'completed')   return HC.completed;
    if (p.effective_status === 'not_started') return HC.not_started;
    if (p.effective_status === 'on_hold' || p.effective_status === 'cancelled') return HC.on_hold;
    return HC[p.health_status] || HC.healthy;
}

/* ── Date utilities ── */
function dayDiff(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}

function dateToX(dateStr, minDate, dayW) {
    if (!dateStr || !minDate) return null;
    const d = dayDiff(minDate, String(dateStr).slice(0, 10));
    return PAD_X + d * dayW;
}

function fmtJP(d) {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    return `${s.slice(0, 4)}/${s.slice(5, 7)}/${s.slice(8, 10)}`;
}

/* ── Header generators (return [{ label, x }]) ── */
function genMonthHeaders(minDate, maxDate, dayW) {
    const headers = [];
    const end = new Date(maxDate);
    let cur = new Date(minDate);
    cur.setDate(1);
    while (cur <= end) {
        headers.push({
            label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`,
            x: dateToX(cur.toISOString().slice(0, 10), minDate, dayW),
        });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return headers;
}

function genWeekHeaders(minDate, maxDate, dayW) {
    const headers = [];
    const end = new Date(maxDate);
    let cur = new Date(minDate);
    while (cur <= end) {
        const s = cur.toISOString().slice(0, 10);
        headers.push({
            label: `${cur.getMonth() + 1}/${String(cur.getDate()).padStart(2, '0')}週`,
            x: dateToX(s, minDate, dayW),
        });
        cur.setDate(cur.getDate() + 7);
    }
    return headers;
}

function genDayHeaders(minDate, maxDate, dayW) {
    const headers = [];
    const end = new Date(maxDate);
    let cur = new Date(minDate);
    while (cur <= end) {
        const s = cur.toISOString().slice(0, 10);
        headers.push({
            label: `${cur.getMonth() + 1}/${cur.getDate()}`,
            x: dateToX(s, minDate, dayW),
        });
        cur.setDate(cur.getDate() + 1);
    }
    return headers;
}

function genHeaders(scale, minDate, maxDate, dayW) {
    if (scale === 'week') return genWeekHeaders(minDate, maxDate, dayW);
    if (scale === 'day')  return genDayHeaders(minDate, maxDate, dayW);
    return genMonthHeaders(minDate, maxDate, dayW);
}

/* ── Tooltip components ── */
function ProjectTooltip({ p }) {
    const pct = p.progress_total > 0 ? Math.round(p.progress_done / p.progress_total * 100) : 0;
    return (
        <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{p.project_name}</div>
            <div style={{ color: '#9ca3af', marginBottom: 6, fontSize: 11 }}>{p.project_no}</div>
            <div>進捗: {p.progress_done}/{p.progress_total} 件（{pct}%）</div>
            <div>遅延: {p.overdue_count} 件{Number(p.max_overdue_days) > 0 ? `（最大 ${p.max_overdue_days} 日）` : ''}</div>
            <div>計画: {fmtJP(p.plan_start)} 〜 {fmtJP(p.plan_end)}</div>
            <div>実績: {fmtJP(p.actual_start)} 〜 {fmtJP(p.actual_latest)}</div>
            <div>健全性: {HL[p.health_status] || '—'}</div>
        </div>
    );
}

function MilestoneTooltip({ m }) {
    const overdueDays = m.is_overdue
        ? Math.round((Date.now() - new Date(m.plan_date)) / 86_400_000)
        : null;
    return (
        <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{m.event_name}</div>
            <div>予定: {fmtJP(m.plan_date)}</div>
            <div>実績: {fmtJP(m.actual_date)}{m.diff_days != null ? `（${m.diff_days > 0 ? '+' : ''}${m.diff_days} 日）` : ''}</div>
            {overdueDays != null && (
                <div style={{ color: '#fca5a5', marginTop: 2 }}>⚠ {overdueDays} 日超過</div>
            )}
        </div>
    );
}

function ConflictTooltip({ c }) {
    return (
        <div>
            <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: 3 }}>⚠ Resource重複</div>
            <div>{fmtJP(c.plan_date)}</div>
            <div>{c.resource_name}</div>
            <div>{c.count} 件 / capacity {c.capacity}</div>
            <div style={{ color: '#fca5a5', marginTop: 2 }}>{c.department_code}部門と日程確認を行ってください。</div>
        </div>
    );
}

/* ── 共通: サブ行の罫線＋今日線 ── */
function SubRowGrid({ headers, todayX }) {
    return (
        <>
            {headers.map((h, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: h.x, width: 1, background: 'var(--color-border-light)', pointerEvents: 'none' }} />
            ))}
            {todayX != null && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 2, background: '#ef4444', opacity: 0.4, pointerEvents: 'none' }} />
            )}
        </>
    );
}

/* ── イベント（マイルストーン）サブ行 ── */
function EventSubRow({ m, minDate, dayW, todayX, headers, hasSteps, isStepsOpen, onToggleSteps, onTip, onMove, onHide }) {
    const px = dateToX(m.plan_date, minDate, dayW);
    const ax = m.actual_date ? dateToX(m.actual_date, minDate, dayW) : null;
    const conflict = !!m.is_conflict;
    const cy = SUB_ROW_H / 2;
    const diamondColor = conflict ? '#dc2626' : (m.is_overdue ? '#ef4444' : '#6b7280');
    const evTip = conflict ? <ConflictTooltip c={m.conflict} /> : <MilestoneTooltip m={m} />;
    return (
        <div style={{ display: 'flex', height: SUB_ROW_H, borderBottom: '1px solid var(--color-border-light)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: conflict ? '#fef2f2' : '#f8fafc', borderRight: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 18, fontSize: 11 }}>
                <span style={{ color: '#93c5fd' }}>└</span>
                {conflict && <span style={{ color: '#dc2626' }}>⚠</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: conflict ? '#b91c1c' : 'var(--color-text)' }}>{m.event_name}</span>
                {hasSteps && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleSteps(); }} style={{ marginLeft: 'auto', marginRight: 8, fontSize: 9, border: '1px solid #d1d5db', borderRadius: 3, background: 'none', cursor: 'pointer', color: '#6b7280', padding: '0 4px' }}>
                        {isStepsOpen ? '▼' : '▶'} 工程
                    </button>
                )}
            </div>
            <div style={{ flex: 1, position: 'relative', background: conflict ? '#fef2f2' : undefined }}>
                <SubRowGrid headers={headers} todayX={todayX} />
                {px != null && (
                    <div
                        style={{ position: 'absolute', left: px - DIAMOND, top: cy - DIAMOND, width: DIAMOND * 2, height: DIAMOND * 2, background: diamondColor, transform: 'rotate(45deg)', zIndex: 5, boxShadow: conflict ? '0 0 0 2px #fecaca' : undefined }}
                        onMouseEnter={e => onTip(e, evTip)}
                        onMouseMove={onMove}
                        onMouseLeave={onHide}
                    />
                )}
                {ax != null && m.is_completed && (
                    <div style={{ position: 'absolute', left: ax - DOT_R, top: cy - DOT_R, width: DOT_R * 2, height: DOT_R * 2, background: '#3b82f6', borderRadius: '50%', border: '1.5px solid #fff', zIndex: 5 }} />
                )}
            </div>
        </div>
    );
}

/* ── 工程ステップ サブ行 ── */
function StepSubRow({ s, minDate, dayW, todayX, headers, onTip, onMove, onHide }) {
    const px = dateToX(s.plan_date, minDate, dayW);
    const ax = s.latest_actual_date ? dateToX(s.latest_actual_date, minDate, dayW) : null;
    const conflict = !!s.is_conflict;
    const cy = SUB_ROW_H / 2;
    const meta = [s.location_name && `📍${s.location_name}`, s.resource_name && `🔧${s.resource_name}`].filter(Boolean).join(' ');
    const stepTip = conflict
        ? <ConflictTooltip c={s.conflict} />
        : (
            <div>
                <div style={{ fontWeight: 600 }}>{s.process_name}</div>
                <div>予定: {fmtJP(s.plan_date)}</div>
                {meta && <div>{meta}</div>}
            </div>
        );
    return (
        <div style={{ display: 'flex', height: SUB_ROW_H, borderBottom: '1px solid var(--color-border-light)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: conflict ? '#fef2f2' : '#eff6ff', borderRight: conflict ? '2px solid #dc2626' : '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 30, fontSize: 10.5 }}>
                <span style={{ color: '#bfdbfe' }}>└</span>
                {conflict && <span style={{ color: '#dc2626' }}>⚠</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: conflict ? '#b91c1c' : 'var(--color-muted)' }}>
                    {s.process_name}{meta && <span style={{ color: 'var(--color-subtle)' }}>　{meta}</span>}
                </span>
            </div>
            <div style={{ flex: 1, position: 'relative', background: conflict ? '#fef2f2' : '#f0f9ff' }}>
                <SubRowGrid headers={headers} todayX={todayX} />
                {px != null && (
                    <div
                        style={{ position: 'absolute', left: px - 4, top: cy - 4, width: 8, height: 8, background: conflict ? '#dc2626' : '#9ca3af', transform: 'rotate(45deg)', zIndex: 5, boxShadow: conflict ? '0 0 0 2px #fecaca' : undefined }}
                        onMouseEnter={e => onTip(e, stepTip)}
                        onMouseMove={onMove}
                        onMouseLeave={onHide}
                    />
                )}
                {ax != null && (
                    <div style={{ position: 'absolute', left: ax - 4, top: cy - 4, width: 8, height: 8, background: '#3b82f6', borderRadius: '50%', border: '1.5px solid #fff', zIndex: 5 }} />
                )}
            </div>
        </div>
    );
}

/* ── GanttRow ── */
function GanttRow({ project: p, minDate, dayW, todayX, headers, onTooltipShow, onTooltipMove, onTooltipHide, onNavigate }) {
    const actualColor = getActualColor(p);
    const planX1 = dateToX(p.plan_start,    minDate, dayW);
    const planX2 = dateToX(p.plan_end,      minDate, dayW);
    const actX1  = dateToX(p.actual_start,  minDate, dayW);
    const actX2  = dateToX(p.actual_latest, minDate, dayW);

    return (
        <div
            style={{ position: 'relative', height: ROW_H, borderBottom: '1px solid var(--color-border-light)', cursor: 'pointer' }}
            onClick={onNavigate}
        >
            {/* Period grid lines */}
            {headers.map((h, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: h.x, width: 1, background: 'var(--color-border-light)', pointerEvents: 'none' }} />
            ))}

            {/* Today line */}
            {todayX != null && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 2, background: '#ef4444', opacity: 0.5, pointerEvents: 'none', zIndex: 4 }} />
            )}

            {/* Plan bar */}
            {planX1 != null && planX2 != null && (
                <div style={{ position: 'absolute', left: planX1, top: PLAN_Y, width: Math.max(planX2 - planX1, 3), height: PLAN_H, background: '#d1d5db', borderRadius: 3 }} />
            )}

            {/* Actual bar */}
            {actX1 != null && actX2 != null && (
                <div style={{ position: 'absolute', left: actX1, top: ACTUAL_Y, width: Math.max(actX2 - actX1, 3), height: ACTUAL_H, background: actualColor, borderRadius: 3 }} />
            )}

            {/* Milestones */}
            {(p.milestones || []).map((m, i) => {
                const px          = dateToX(m.plan_date,   minDate, dayW);
                const ax          = m.actual_date ? dateToX(m.actual_date, minDate, dayW) : null;
                const isEven      = i % 2 === 0;
                const diamondColor = m.is_overdue ? '#ef4444' : '#6b7280';
                const dotColor     = m.is_overdue ? '#ea580c' : actualColor;
                const labelColor   = m.is_overdue ? '#ef4444' : '#4b5563';
                const labelTop     = isEven ? LBL_ABOVE : LBL_BELOW;

                return (
                    <span key={m.id ?? i}>
                        {px != null && (
                            <>
                                {/* ◆ 予定点 */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: px - DIAMOND, top: PLAN_CY - DIAMOND,
                                        width: DIAMOND * 2, height: DIAMOND * 2,
                                        background: diamondColor,
                                        transform: 'rotate(45deg)',
                                        zIndex: 5, cursor: 'default',
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    onMouseEnter={e => { e.stopPropagation(); onTooltipShow(e, <MilestoneTooltip m={m} />); }}
                                    onMouseMove={e => { e.stopPropagation(); onTooltipMove(e); }}
                                    onMouseLeave={e => { e.stopPropagation(); onTooltipHide(); }}
                                />
                                {/* マイルストーン名称（常時表示） */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: px + DIAMOND + 3,
                                        top: labelTop,
                                        maxWidth: 80,
                                        fontSize: 10,
                                        lineHeight: '12px',
                                        color: labelColor,
                                        fontWeight: m.is_overdue ? 600 : 400,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                        zIndex: 4,
                                    }}
                                >
                                    {m.event_name}
                                </div>
                            </>
                        )}

                        {/* ● 実績点（完了時のみ） */}
                        {ax != null && m.is_completed && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: ax - DOT_R, top: ACTUAL_Y + ACTUAL_H / 2 - DOT_R,
                                    width: DOT_R * 2, height: DOT_R * 2,
                                    background: dotColor,
                                    borderRadius: '50%',
                                    border: '1.5px solid #fff',
                                    zIndex: 5, cursor: 'default',
                                }}
                                onClick={e => e.stopPropagation()}
                                onMouseEnter={e => { e.stopPropagation(); onTooltipShow(e, <MilestoneTooltip m={m} />); }}
                                onMouseMove={e => { e.stopPropagation(); onTooltipMove(e); }}
                                onMouseLeave={e => { e.stopPropagation(); onTooltipHide(); }}
                            />
                        )}
                    </span>
                );
            })}
        </div>
    );
}

/* ── Main page ── */
export default function ProjectGantt() {
    const navigate = useNavigate();

    const [projects,    setProjects]    = useState([]);
    const [dateRange,   setDateRange]   = useState({ min_date: null, max_date: null });
    const [total,       setTotal]       = useState(0);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [search,      setSearch]      = useState('');
    const [scale,       setScale]       = useState('month');
    const [tooltip,     setTooltip]     = useState(null);

    /* スクロールコンテナと、モード切替時に中央へ戻す「表示中心日付」 */
    const containerRef   = useRef(null);
    const pendingViewRef = useRef(null);   // { date, top }

    const load = useCallback(async (params) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchProjectsGantt(params);
            setProjects(result.data);
            setDateRange(result.date_range);
            setTotal(result.total);
        } catch {
            setError('データの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(search ? { search } : {}); }, [load, search]);

    /* date range + scale → gantt geometry */
    const { minDate, ganttW, headers, todayX, dayW } = useMemo(() => {
        const { min_date, max_date } = dateRange;
        if (!min_date || !max_date) {
            return { minDate: null, ganttW: 0, headers: [], todayX: null, dayW: SCALE_CFG.month.dayW };
        }

        const dW = SCALE_CFG[scale].dayW;

        /* snap to full month boundaries */
        const mnD = new Date(min_date);
        mnD.setDate(1);
        const mxD = new Date(max_date);
        mxD.setMonth(mxD.getMonth() + 1, 0);

        const minStr = mnD.toISOString().slice(0, 10);
        const maxStr = mxD.toISOString().slice(0, 10);
        const days   = dayDiff(minStr, maxStr) + 1;
        const w      = PAD_X * 2 + days * dW;
        const hdrs   = genHeaders(scale, minStr, maxStr, dW);

        const todayStr = new Date().toISOString().slice(0, 10);
        const tx = dateToX(todayStr, minStr, dW);

        return { minDate: minStr, ganttW: w, headers: hdrs, todayX: tx, dayW: dW };
    }, [dateRange, scale]);

    /* ── モード切替: 表示中心日付（と縦スクロール）を保持 ── */
    // 可視ガント領域（左パネル LEFT_W を除く）の中心が指す日付を維持する
    const changeScale = useCallback((next) => {
        const el = containerRef.current;
        if (el && minDate) {
            const d = (el.scrollLeft + (el.clientWidth - LEFT_W) / 2 - PAD_X) / dayW;
            const dt = new Date(minDate);
            dt.setDate(dt.getDate() + Math.round(d));
            pendingViewRef.current = { date: dt.toISOString().slice(0, 10), top: el.scrollTop };
        }
        setScale(next);
    }, [minDate, dayW]);

    // 再描画（新しい dayW / ganttW）後に、保持した中心日付が中央へ来るようスクロール
    useLayoutEffect(() => {
        const el = containerRef.current;
        const pv = pendingViewRef.current;
        if (el && pv && minDate) {
            const d = dayDiff(minDate, pv.date);
            el.scrollLeft = PAD_X + d * dayW - (el.clientWidth - LEFT_W) / 2;
            el.scrollTop  = pv.top;          // 縦スクロール位置も復元
            pendingViewRef.current = null;
        }
    }, [scale, dayW, ganttW, minDate]);

    /* tooltip helpers */
    const showTooltip = useCallback((e, content) => {
        setTooltip({ x: e.clientX + 14, y: e.clientY + 14, content });
    }, []);
    const moveTooltip = useCallback((e) => {
        setTooltip(prev => prev ? { ...prev, x: e.clientX + 14, y: e.clientY + 14 } : null);
    }, []);
    const hideTooltip = useCallback(() => setTooltip(null), []);

    /* ── ドリルダウン展開 ── */
    const [expandedProjects, setExpandedProjects] = useState(new Set());
    const [expandedEvents,   setExpandedEvents]   = useState(new Set()); // `${pid}:${eid}`
    const [stepsByProject,   setStepsByProject]   = useState({});        // pid -> steps[]

    const toggleProject = useCallback((pid) => {
        setExpandedProjects(prev => {
            const s = new Set(prev);
            s.has(pid) ? s.delete(pid) : s.add(pid);
            return s;
        });
        // 初回展開時に工程ステップを取得（任意展開・オンデマンド）
        setStepsByProject(prev => {
            if (prev[pid] !== undefined) return prev;
            fetchProjectProcessSteps(pid)
                .then(steps => setStepsByProject(p2 => ({ ...p2, [pid]: steps })))
                .catch(() => setStepsByProject(p2 => ({ ...p2, [pid]: [] })));
            return { ...prev, [pid]: undefined };
        });
    }, []);

    const toggleEvent = useCallback((pid, eid) => {
        setExpandedEvents(prev => {
            const k = `${pid}:${eid}`;
            const s = new Set(prev);
            s.has(k) ? s.delete(k) : s.add(k);
            return s;
        });
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
    };

    return (
        <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>

            {/* Page header */}
            <div className="page-header" style={{ flexShrink: 0 }}>
                <div>
                    <h1 className="page-title">プログラムガント</h1>
                    <p className="page-sub">全 {total} 件</p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Scale toggle */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['month', 'week', 'day'].map(s => (
                            <button
                                key={s}
                                className={`gantt-scale-btn${scale === s ? ' active' : ''}`}
                                onClick={() => changeScale(s)}
                            >
                                {SCALE_LABEL[s]}
                            </button>
                        ))}
                    </div>
                    {/* Search */}
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="input-search"
                            placeholder="案件No・案件名で検索…"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                        />
                        <button type="submit" className="btn btn-secondary">検索</button>
                        {search && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setSearch(''); }}>
                                クリア
                            </button>
                        )}
                    </form>
                </div>
            </div>

            {/* States */}
            {loading && <div className="loading-state">読み込み中…</div>}
            {error   && <div className="error-state" style={{ margin: '0 0 12px' }}>{error}</div>}

            {/* Gantt table */}
            {!loading && !error && (
                <div ref={containerRef} className="gantt-container" style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
                    {!minDate ? (
                        <div className="empty-state">表示できる案件がありません</div>
                    ) : (
                        <div style={{ minWidth: LEFT_W + ganttW }}>

                            {/* Sticky header row */}
                            <div style={{ display: 'flex', height: HEADER_H, position: 'sticky', top: 0, zIndex: 20 }}>
                                {/* Corner cell */}
                                <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 30, background: '#f8fafc', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>案件</span>
                                </div>
                                {/* Period labels */}
                                <div style={{ flex: 1, position: 'relative', background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                                    {headers.map((h, i) => (
                                        <div key={i} style={{ position: 'absolute', left: h.x, top: 0, bottom: 0, display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--color-border)', paddingLeft: 5 }}>
                                            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h.label}</span>
                                        </div>
                                    ))}
                                    {/* Today line in header */}
                                    {todayX != null && (
                                        <div style={{ position: 'absolute', left: todayX - 1, top: 0, bottom: 0, width: 2, background: 'var(--color-danger)', opacity: 0.5 }} />
                                    )}
                                </div>
                            </div>

                            {/* Data rows */}
                            {projects.length === 0 ? (
                                <div className="empty-state">案件がありません</div>
                            ) : (
                                projects.map(p => {
                                    const pct = p.progress_total > 0
                                        ? Math.round(p.progress_done / p.progress_total * 100)
                                        : 0;
                                    const hc = HC[p.health_status] || '#d1d5db';
                                    const hl = HL[p.health_status] || '—';
                                    const borderColor = p.health_status === 'danger'
                                        ? 'var(--color-danger)'
                                        : p.health_status === 'caution'
                                        ? 'var(--color-warning)'
                                        : 'transparent';
                                    const healthCls = p.effective_status === 'completed' ? 'health-completed'
                                        : { healthy: 'health-healthy', caution: 'health-caution', danger: 'health-danger' }[p.health_status] || '';

                                    const isAdjust   = p.review_verdict === 'adjust';
                                    const isExpanded = expandedProjects.has(p.id);
                                    const stripColor = isAdjust ? 'var(--color-danger)' : borderColor;
                                    const steps      = stepsByProject[p.id];   // undefined=loading, []=none
                                    const stepsByEvent = {};
                                    if (Array.isArray(steps)) {
                                        for (const s of steps) {
                                            if (!stepsByEvent[s.parent_event_id]) stepsByEvent[s.parent_event_id] = [];
                                            stepsByEvent[s.parent_event_id].push(s);
                                        }
                                    }

                                    return (
                                        <Fragment key={p.id}>
                                        <div style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid var(--color-border-light)' }}>
                                            {/* Left panel — sticky */}
                                            <div
                                                className="gantt-left-row"
                                                style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: isAdjust ? '#fff5f5' : 'var(--color-card)', borderRight: '1px solid var(--color-border)', display: 'flex', cursor: 'pointer' }}
                                                onClick={() => navigate(`/projects/${p.id}`)}
                                                onMouseEnter={e => showTooltip(e, <ProjectTooltip p={p} />)}
                                                onMouseMove={moveTooltip}
                                                onMouseLeave={hideTooltip}
                                            >
                                                {/* Drill-down toggle */}
                                                <div
                                                    onClick={e => { e.stopPropagation(); toggleProject(p.id); }}
                                                    title="イベント / 工程ステップを展開"
                                                    style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9ca3af', fontSize: 10 }}
                                                >
                                                    {isExpanded ? '▼' : '▶'}
                                                </div>
                                                {/* Health indicator strip */}
                                                <div style={{ width: 3, flexShrink: 0, background: stripColor }} />
                                                <div style={{ flex: 1, padding: '8px 10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {isAdjust && <span style={{ color: '#dc2626', marginRight: 3 }}>⚠</span>}
                                                        {p.project_name}
                                                    </div>
                                                    <div style={{ fontSize: 10.5, color: 'var(--color-subtle)', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>{p.project_no}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <div className="progress-bar-wrap" style={{ width: 50 }}>
                                                            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: hc }} />
                                                        </div>
                                                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{pct}%</span>
                                                        <span className={`health-badge ${healthCls}`}>{hl}</span>
                                                        {isAdjust && (
                                                            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: 9999, padding: '1px 6px' }}>要調整</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Gantt area */}
                                            <GanttRow
                                                project={p}
                                                minDate={minDate}
                                                dayW={dayW}
                                                todayX={todayX}
                                                headers={headers}
                                                onTooltipShow={showTooltip}
                                                onTooltipMove={moveTooltip}
                                                onTooltipHide={hideTooltip}
                                                onNavigate={() => navigate(`/projects/${p.id}`)}
                                            />
                                        </div>

                                        {/* ドリルダウン: イベント → 工程ステップ */}
                                        {isExpanded && (p.milestones || []).filter(m => m.plan_date).map(m => {
                                            const evSteps = stepsByEvent[m.id] || [];
                                            const evOpen  = expandedEvents.has(`${p.id}:${m.id}`);
                                            return (
                                                <Fragment key={`ev-${m.id}`}>
                                                    <EventSubRow
                                                        m={m} minDate={minDate} dayW={dayW} todayX={todayX} headers={headers}
                                                        hasSteps={evSteps.length > 0} isStepsOpen={evOpen}
                                                        onToggleSteps={() => toggleEvent(p.id, m.id)}
                                                        onTip={showTooltip} onMove={moveTooltip} onHide={hideTooltip}
                                                    />
                                                    {evOpen && evSteps.map(s => (
                                                        <StepSubRow
                                                            key={`st-${s.id}`} s={s}
                                                            minDate={minDate} dayW={dayW} todayX={todayX} headers={headers}
                                                            onTip={showTooltip} onMove={moveTooltip} onHide={hideTooltip}
                                                        />
                                                    ))}
                                                </Fragment>
                                            );
                                        })}
                                        </Fragment>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Floating tooltip */}
            {tooltip && (
                <div style={{
                    position: 'fixed', zIndex: 9999,
                    left: tooltip.x, top: tooltip.y,
                    background: '#1f2937', color: '#f9fafb',
                    borderRadius: 6, padding: '8px 12px',
                    fontSize: 12, lineHeight: 1.7,
                    pointerEvents: 'none',
                    maxWidth: 280,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}>
                    {tooltip.content}
                </div>
            )}
        </div>
    );
}
