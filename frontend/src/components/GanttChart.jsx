import { useMemo } from 'react';

const DAY_W   = 8;   // px per day
const ROW_H   = 40;  // px per event row
const HDR_H   = 28;  // month header height
const LEFT_W  = 440; // left info panel width
const MRK     = 10;  // marker size (px)

const STATUS_LABEL = {
    pending:     '未着手',
    in_progress: '着手中',
    completed:   '完了',
    delayed:     '遅延',
};

/* 実績マーカーの色 */
const markerColor = (ev, today) => {
    if (!ev.actual_date) {
        if (ev.plan_date && new Date(ev.plan_date) < today) return '#dc2626'; // 未完了遅れ
        return '#9ca3af'; // 未着手（将来）
    }
    const diff = Number(ev.diff_days ?? 0);
    if (diff < 0)  return '#059669'; // 前倒し（緑）
    if (diff === 0) return '#2563eb'; // 計画通り（青）
    return '#ea580c'; // 遅れ（橙）
};

const fmtShort = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
};

const toDay0 = (d) => { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; };

export default function GanttChart({ events }) {
    const today = useMemo(() => toDay0(new Date()), []);

    /* sort_order 順に並べ、plan_date のないものは末尾 */
    const sorted = useMemo(
        () => [...events].sort((a, b) =>
            (Number(a.sort_order) - Number(b.sort_order)) || (a.id - b.id)
        ),
        [events]
    );

    /* 日付レンジ: イベント日 + 今日を含めて前後 1 ヶ月余白 */
    const { startDate, totalDays } = useMemo(() => {
        const pts = [today];
        sorted.forEach(e => {
            if (e.plan_date)   pts.push(toDay0(new Date(e.plan_date)));
            if (e.actual_date) pts.push(toDay0(new Date(e.actual_date)));
        });
        const minMs = Math.min(...pts.map(d => d.getTime()));
        const maxMs = Math.max(...pts.map(d => d.getTime()));

        const start = new Date(minMs);
        start.setDate(1);
        start.setMonth(start.getMonth() - 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(maxMs);
        end.setMonth(end.getMonth() + 2);
        end.setDate(0);
        end.setHours(0, 0, 0, 0);

        return {
            startDate: start,
            totalDays: Math.ceil((end - start) / 86400000) + 1,
        };
    }, [sorted, today]);

    /* 日付 → 中心 x 座標 */
    const cx = (dateStr) => {
        const d = toDay0(new Date(dateStr));
        return Math.floor((d - startDate) / 86400000) * DAY_W + DAY_W / 2;
    };

    const totalWidth = totalDays * DAY_W;
    const todayX     = Math.floor((today - startDate) / 86400000) * DAY_W + DAY_W / 2;

    /* 月ヘッダー生成 */
    const months = useMemo(() => {
        const result = [];
        let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endDate = new Date(startDate.getTime() + totalDays * 86400000);
        while (cur < endDate) {
            const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            const left  = Math.max(0, Math.floor((cur - startDate) / 86400000)) * DAY_W;
            const right = Math.min(totalWidth, Math.floor((next - startDate) / 86400000) * DAY_W);
            result.push({
                label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`,
                left,
                width: right - left,
            });
            cur = next;
        }
        return result;
    }, [startDate, totalDays, totalWidth]);

    if (sorted.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                イベントがありません
            </div>
        );
    }

    const planOnlyEvents = sorted.filter(e => !e.plan_date);
    const chartEvents    = sorted.filter(e =>  e.plan_date);

    return (
        <div>
            {/* ── ガント本体 ── */}
            <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', fontSize: 12 }}>

                {/* 左パネル（固定） */}
                <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '2px solid #e5e7eb', overflow: 'hidden' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', height: HDR_H, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', alignItems: 'center' }}>
                        <div style={{ flex: 1, padding: '0 10px', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>イベント名</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>予定日</div>
                        <div style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>実績日</div>
                        <div style={{ width: 52, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>差異</div>
                        <div style={{ width: 56, fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>状態</div>
                    </div>

                    {/* イベント行 */}
                    {sorted.map((ev) => {
                        const color = markerColor(ev, today);
                        const diff  = Number(ev.diff_days ?? null);

                        const diffLabel = (() => {
                            if (ev.actual_date == null && ev.plan_date) {
                                const od = Math.floor((today - toDay0(new Date(ev.plan_date))) / 86400000);
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
                                <div style={{ width: 64, textAlign: 'center', color: ev.actual_date ? color : '#9ca3af' }}>
                                    {fmtShort(ev.actual_date)}
                                </div>
                                <div style={{ width: 52, textAlign: 'center', fontSize: 11, color: diffLabel.color }}>
                                    {diffLabel.text}
                                </div>
                                <div style={{ width: 56, textAlign: 'center' }}>
                                    <span style={{
                                        fontSize: 10, padding: '1px 5px', borderRadius: 9999,
                                        background: `${color}22`, color,
                                    }}>
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

                        {/* 月ヘッダー */}
                        <div style={{ height: HDR_H, position: 'relative', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {months.map((m, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: m.left, width: m.width, height: HDR_H,
                                    display: 'flex', alignItems: 'center', paddingLeft: 6,
                                    borderRight: '1px solid #e5e7eb',
                                    fontSize: 11, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden',
                                }}>
                                    {m.label}
                                </div>
                            ))}
                        </div>

                        {/* 今日線（全行スパン） */}
                        {todayX >= 0 && todayX <= totalWidth && (
                            <div style={{
                                position: 'absolute', left: todayX, top: 0, bottom: 0,
                                width: 1, background: '#dc2626', opacity: 0.55, zIndex: 10,
                                pointerEvents: 'none',
                            }} />
                        )}

                        {/* イベント行（ガントバー） */}
                        {sorted.map((ev) => {
                            const planX   = ev.plan_date   ? cx(ev.plan_date)   : null;
                            const actualX = ev.actual_date ? cx(ev.actual_date) : null;
                            const color   = markerColor(ev, today);
                            const cy      = ROW_H / 2;

                            /* 連結バー（plan ↔ actual） */
                            let barL = null, barW = null;
                            if (planX !== null && actualX !== null) {
                                barL = Math.min(planX, actualX);
                                barW = Math.max(1, Math.abs(actualX - planX));
                            }

                            return (
                                <div key={ev.id} style={{ height: ROW_H, position: 'relative', borderBottom: '1px solid #f3f4f6' }}>
                                    {/* 連結バー */}
                                    {barL !== null && (
                                        <div style={{
                                            position: 'absolute', left: barL, width: barW,
                                            height: 2, top: cy - 1,
                                            background: color, opacity: 0.45, zIndex: 1,
                                        }} />
                                    )}
                                    {/* 予定マーカー（ダイアモンド） */}
                                    {planX !== null && (
                                        <div style={{
                                            position: 'absolute',
                                            left: planX - MRK / 2, top: cy - MRK / 2,
                                            width: MRK, height: MRK,
                                            background: actualX !== null ? '#9ca3af' : color,
                                            transform: 'rotate(45deg)',
                                            borderRadius: 2, zIndex: 2,
                                        }} />
                                    )}
                                    {/* 実績マーカー（円） */}
                                    {actualX !== null && (
                                        <div style={{
                                            position: 'absolute',
                                            left: actualX - MRK / 2, top: cy - MRK / 2,
                                            width: MRK, height: MRK,
                                            background: color,
                                            borderRadius: '50%', zIndex: 3,
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

            {/* plan_date なしイベントの注記 */}
            {planOnlyEvents.length > 0 && (
                <p style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                    ※ 予定日未設定の {planOnlyEvents.length} 件はガントに表示されません
                </p>
            )}
        </div>
    );
}
