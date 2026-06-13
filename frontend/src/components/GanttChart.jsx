import { useMemo, useState } from 'react';

const SCALE_CFG = {
    month: { dayW: 8,  hdrH: 30, label: '月' },
    week:  { dayW: 18, hdrH: 46, label: '週' },
    day:   { dayW: 42, hdrH: 46, label: '日' },
};

const ROW_H  = 40;
const LEFT_W = 440;
const MRK    = 10;

const STATUS_LABEL = {
    pending:     '未着手',
    in_progress: '着手中',
    completed:   '完了',
    delayed:     '遅延',
};

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

const generateMonths = (startDate, totalDays, dayW) => {
    const totalWidth = totalDays * dayW;
    const result = [];
    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMs = startDate.getTime() + totalDays * 86400000;
    while (cur.getTime() < endMs) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        const left  = Math.max(0, Math.floor((cur.getTime() - startDate.getTime()) / 86400000)) * dayW;
        const right = Math.min(totalWidth, Math.floor((next.getTime() - startDate.getTime()) / 86400000) * dayW);
        if (right > left) {
            result.push({
                label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`,
                left, width: right - left,
            });
        }
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
        if (right > left) {
            result.push({
                label: `${cur.getMonth() + 1}/${String(cur.getDate()).padStart(2, '0')}`,
                left, width: right - left,
            });
        }
        cur = new Date(cur.getTime() + 7 * 86400000);
    }
    return result;
};

const generateDays = (startDate, totalDays, dayW) => {
    const result = [];
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dow = d.getDay();
        result.push({
            label: String(d.getDate()),
            left: i * dayW, width: dayW,
            isWeekend:    dow === 0 || dow === 6,
            isMonthStart: d.getDate() === 1,
        });
    }
    return result;
};

export default function GanttChart({ events }) {
    const [scale, setScale] = useState('month');
    const { dayW, hdrH } = SCALE_CFG[scale];
    const today = useMemo(() => toDay0(new Date()), []);

    const sorted = useMemo(
        () => [...events].sort((a, b) =>
            (Number(a.sort_order) - Number(b.sort_order)) || (a.id - b.id)
        ),
        [events]
    );

    const { startDate, totalDays } = useMemo(() => {
        const pts = [today];
        sorted.forEach(e => {
            if (e.plan_date)   pts.push(toDay0(new Date(e.plan_date)));
            if (e.actual_date) pts.push(toDay0(new Date(e.actual_date)));
        });
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
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return { startDate: start, totalDays: Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1 };
    }, [sorted, today, scale]);

    const cx = (dateStr) => {
        if (!dateStr) return null;
        const d = toDay0(new Date(dateStr));
        return Math.floor((d.getTime() - startDate.getTime()) / 86400000) * dayW + dayW / 2;
    };

    const totalWidth = totalDays * dayW;
    const todayX     = Math.floor((today.getTime() - startDate.getTime()) / 86400000) * dayW + dayW / 2;

    const months     = useMemo(() => generateMonths(startDate, totalDays, dayW), [startDate, totalDays, dayW]);
    const weeks      = useMemo(() => scale === 'week' ? generateWeeks(startDate, totalDays, dayW) : [], [scale, startDate, totalDays, dayW]);
    const dayHeaders = useMemo(() => scale === 'day'  ? generateDays(startDate, totalDays, dayW)  : [], [scale, startDate, totalDays, dayW]);

    const halfH = Math.floor(hdrH / 2);

    if (sorted.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>イベントがありません</div>;
    }

    const planOnlyEvents = sorted.filter(e => !e.plan_date);

    return (
        <div>
            {/* スケール切替ボタン */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'flex-end' }}>
                {Object.entries(SCALE_CFG).map(([key, cfg]) => (
                    <button
                        key={key}
                        className={`btn btn-xs ${scale === key ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setScale(key)}
                    >
                        {cfg.label}
                    </button>
                ))}
            </div>

            {/* ガント本体 */}
            <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', fontSize: 12 }}>

                {/* 左パネル（固定） */}
                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '2px solid #e5e7eb', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', height: hdrH, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', alignItems: 'flex-end', paddingBottom: 5 }}>
                        <div style={{ flex: 1, padding: '0 10px', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>イベント名</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>予定日</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>実績日</div>
                        <div style={{ width: 52, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>差異</div>
                        <div style={{ width: 56, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>状態</div>
                    </div>

                    {sorted.map((ev) => {
                        const color = markerColor(ev, today);
                        const diff  = Number(ev.diff_days ?? null);
                        const diffLabel = (() => {
                            if (ev.actual_date == null && ev.plan_date) {
                                const od = Math.floor((today.getTime() - toDay0(new Date(ev.plan_date)).getTime()) / 86400000);
                                if (od > 0) return { text: `+${od}日`, color: '#ea580c' };
                                return { text: '—', color: '#9ca3af' };
                            }
                            if (ev.diff_days == null) return { text: '—', color: '#9ca3af' };
                            if (diff < 0) return { text: `${diff}日`, color: '#059669' };
                            if (diff === 0) return { text: '±0', color: '#9ca3af' };
                            return { text: `+${diff}日`, color: '#ea580c' };
                        })();

                        return (
                            <div key={ev.id} style={{ display: 'flex', height: ROW_H, alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ flex: 1, padding: '0 10px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {ev.event_name}
                                    {ev.is_custom && (
                                        <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>固有</span>
                                    )}
                                </div>
                                <div style={{ width: 64, textAlign: 'center', color: '#374151' }}>{fmtShort(ev.plan_date)}</div>
                                <div style={{ width: 64, textAlign: 'center', color: ev.actual_date ? color : '#9ca3af' }}>{fmtShort(ev.actual_date)}</div>
                                <div style={{ width: 52, textAlign: 'center', fontSize: 11, color: diffLabel.color }}>{diffLabel.text}</div>
                                <div style={{ width: 56, textAlign: 'center' }}>
                                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 9999, background: `${color}22`, color }}>
                                        {STATUS_LABEL[ev.status] || ev.status}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 右パネル（横スクロール） */}
                <div style={{ flex: 1, overflowX: 'auto' }}>
                    <div style={{ width: totalWidth, position: 'relative' }}>

                        {/* ヘッダー */}
                        <div style={{ height: hdrH, position: 'relative', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {/* 月ラベル（月モードは全高、週/日モードは上半分） */}
                            {months.map((m, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: m.left, width: m.width,
                                    top: 0, height: scale === 'month' ? hdrH : halfH,
                                    display: 'flex', alignItems: 'center', paddingLeft: 6,
                                    borderRight: '1px solid #e5e7eb',
                                    borderBottom: scale !== 'month' ? '1px solid #d1d5db' : undefined,
                                    fontSize: 11, fontWeight: 600, color: '#6b7280',
                                    whiteSpace: 'nowrap', overflow: 'hidden',
                                }}>
                                    {m.label}
                                </div>
                            ))}

                            {/* 週ラベル（下半分） */}
                            {scale === 'week' && weeks.map((w, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: w.left, width: w.width,
                                    top: halfH, height: hdrH - halfH,
                                    display: 'flex', alignItems: 'center', paddingLeft: 4,
                                    borderRight: '1px solid #f3f4f6',
                                    fontSize: 10, color: '#9ca3af',
                                    whiteSpace: 'nowrap', overflow: 'hidden',
                                }}>
                                    {w.label}
                                </div>
                            ))}

                            {/* 日ラベル（下半分） */}
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
                                }}>
                                    {d.label}
                                </div>
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

                        {/* イベント行 */}
                        {sorted.map((ev) => {
                            const planX   = cx(ev.plan_date);
                            const actualX = cx(ev.actual_date);
                            const color   = markerColor(ev, today);
                            const cyPos   = ROW_H / 2;

                            let barL = null, barW = null;
                            if (planX !== null && actualX !== null) {
                                barL = Math.min(planX, actualX);
                                barW = Math.max(1, Math.abs(actualX - planX));
                            }

                            return (
                                <div key={ev.id} style={{ height: ROW_H, position: 'relative', borderBottom: '1px solid #f3f4f6' }}>
                                    {barL !== null && (
                                        <div style={{
                                            position: 'absolute', left: barL, width: barW,
                                            height: 2, top: cyPos - 1,
                                            background: color, opacity: 0.45, zIndex: 1,
                                        }} />
                                    )}
                                    {planX !== null && (
                                        <div style={{
                                            position: 'absolute',
                                            left: planX - MRK / 2, top: cyPos - MRK / 2,
                                            width: MRK, height: MRK,
                                            background: actualX !== null ? '#9ca3af' : color,
                                            transform: 'rotate(45deg)', borderRadius: 2, zIndex: 2,
                                        }} />
                                    )}
                                    {actualX !== null && (
                                        <div style={{
                                            position: 'absolute',
                                            left: actualX - MRK / 2, top: cyPos - MRK / 2,
                                            width: MRK, height: MRK,
                                            background: color, borderRadius: '50%', zIndex: 3,
                                            boxShadow: `0 0 0 2px ${color}44`,
                                        }} />
                                    )}
                                </div>
                            );
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
                    <span style={{ display: 'inline-block', width: 1, height: 14, background: '#dc2626', opacity: 0.55 }} />
                    今日
                </span>
            </div>

            {planOnlyEvents.length > 0 && (
                <p style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                    ※ 予定日未設定の {planOnlyEvents.length} 件はガントに表示されません
                </p>
            )}
        </div>
    );
}
