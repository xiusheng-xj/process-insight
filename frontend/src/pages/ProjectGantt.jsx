import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjectsGantt } from '../api/projects';

/* ── Scale configuration ── */
const SCALE_CFG = {
    month: { dayW: 7  },
    week:  { dayW: 18 },
    day:   { dayW: 36 },
};
const SCALE_LABEL = { month: '月', week: '週', day: '日' };

/* ── Layout constants ── */
const ROW_H    = 80;
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

/* ── GanttRow ── */
function GanttRow({ project: p, minDate, dayW, todayX, headers, onTooltipShow, onTooltipMove, onTooltipHide, onNavigate }) {
    const actualColor = getActualColor(p);
    const planX1 = dateToX(p.plan_start,    minDate, dayW);
    const planX2 = dateToX(p.plan_end,      minDate, dayW);
    const actX1  = dateToX(p.actual_start,  minDate, dayW);
    const actX2  = dateToX(p.actual_latest, minDate, dayW);

    return (
        <div
            style={{ position: 'relative', height: ROW_H, borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
            onClick={onNavigate}
        >
            {/* Period grid lines */}
            {headers.map((h, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: h.x, width: 1, background: '#f3f4f6', pointerEvents: 'none' }} />
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

    /* tooltip helpers */
    const showTooltip = useCallback((e, content) => {
        setTooltip({ x: e.clientX + 14, y: e.clientY + 14, content });
    }, []);
    const moveTooltip = useCallback((e) => {
        setTooltip(prev => prev ? { ...prev, x: e.clientX + 14, y: e.clientY + 14 } : null);
    }, []);
    const hideTooltip = useCallback(() => setTooltip(null), []);

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
                    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 6, padding: 2, gap: 2 }}>
                        {['month', 'week', 'day'].map(s => (
                            <button
                                key={s}
                                onClick={() => setScale(s)}
                                style={{
                                    padding: '4px 14px',
                                    fontSize: 13,
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: scale === s ? '#fff' : 'transparent',
                                    color: scale === s ? '#1d4ed8' : '#6b7280',
                                    fontWeight: scale === s ? 600 : 400,
                                    boxShadow: scale === s ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                                    transition: 'all 0.12s',
                                }}
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
                <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', marginBottom: 16 }}>
                    {!minDate ? (
                        <div className="empty-state">表示できる案件がありません</div>
                    ) : (
                        <div style={{ minWidth: LEFT_W + ganttW }}>

                            {/* Sticky header row */}
                            <div style={{ display: 'flex', height: HEADER_H, position: 'sticky', top: 0, zIndex: 20 }}>
                                {/* Corner cell */}
                                <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 30, background: '#f9fafb', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>案件</span>
                                </div>
                                {/* Period labels */}
                                <div style={{ flex: 1, position: 'relative', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {headers.map((h, i) => (
                                        <div key={i} style={{ position: 'absolute', left: h.x, top: 0, bottom: 0, display: 'flex', alignItems: 'center', borderLeft: '1px solid #e5e7eb', paddingLeft: 5 }}>
                                            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{h.label}</span>
                                        </div>
                                    ))}
                                    {/* Today line in header */}
                                    {todayX != null && (
                                        <div style={{ position: 'absolute', left: todayX - 1, top: 0, bottom: 0, width: 2, background: '#ef4444', opacity: 0.5 }} />
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
                                        ? '#ef4444'
                                        : p.health_status === 'caution'
                                        ? '#f59e0b'
                                        : 'transparent';

                                    return (
                                        <div key={p.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #f3f4f6' }}>
                                            {/* Left panel — sticky */}
                                            <div
                                                style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', cursor: 'pointer' }}
                                                onClick={() => navigate(`/projects/${p.id}`)}
                                                onMouseEnter={e => showTooltip(e, <ProjectTooltip p={p} />)}
                                                onMouseMove={moveTooltip}
                                                onMouseLeave={hideTooltip}
                                            >
                                                {/* Health indicator strip */}
                                                <div style={{ width: 3, flexShrink: 0, background: borderColor }} />
                                                <div style={{ flex: 1, padding: '8px 10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {p.project_name}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 5 }}>{p.project_no}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <div style={{ width: 64, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                                                            <div style={{ width: `${pct}%`, height: '100%', background: hc, borderRadius: 2 }} />
                                                        </div>
                                                        <span style={{ fontSize: 10, color: '#6b7280' }}>{pct}%</span>
                                                        <span style={{ fontSize: 10, background: hc + '22', color: hc, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{hl}</span>
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
