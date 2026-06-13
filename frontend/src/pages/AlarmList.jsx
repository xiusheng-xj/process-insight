import { useState, useCallback, useEffect } from 'react';
import { fetchAlertsGlobal, resolveAlertGlobal, generateAlerts } from '../api/alerts';

const ALERT_TYPE_LABELS = {
    event_delay:                 'イベント遅延',
    schedule_missing:            '予定未登録',
    required_delivery_missing:   '要求納期未入力',
    confirmed_delivery_missing:  '確定納期未入力',
    delay:                       'イベント遅延',
};

const SEVERITY_MAP = {
    critical: { label: '緊急', cls: 'badge-cancelled' },
    warning:  { label: '警告', cls: 'badge-delayed'   },
    info:     { label: '情報', cls: 'badge-pending'   },
};

function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('ja-JP') : '—'; }
function fmtTs(d)    { return d ? new Date(d).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }

export default function AlarmList() {
    const [alerts,      setAlerts]      = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [generating,  setGenerating]  = useState(false);
    const [genMessage,  setGenMessage]  = useState('');
    const [statusFilter, setStatusFilter] = useState('unresolved');
    const [typeFilter,   setTypeFilter]   = useState('all');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { status: statusFilter };
            if (typeFilter !== 'all') params.alert_type = typeFilter;
            setAlerts(await fetchAlertsGlobal(params));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter]);

    useEffect(() => { load(); }, [load]);

    const handleResolve = async (id) => {
        const userName = sessionStorage.getItem('userName') || 'unknown';
        await resolveAlertGlobal(id, userName);
        load();
    };

    const handleGenerate = async () => {
        setGenerating(true);
        setGenMessage('');
        try {
            const result = await generateAlerts();
            setGenMessage(`${result.generated}件のアラームを新たに生成しました`);
            load();
        } catch (err) {
            setGenMessage('生成に失敗しました');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">アラーム一覧</h1>
                    <p className="page-sub">{alerts.length} 件</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={generating}
                >
                    {generating ? '生成中…' : 'アラーム生成'}
                </button>
            </div>

            {genMessage && (
                <div style={{
                    background: '#f0fdf4', color: '#166534', border: '1px solid #4ade80',
                    padding: '10px 16px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                }}>
                    {genMessage}
                </div>
            )}

            <div className="card">
                <div className="toolbar">
                    <select
                        className="form-control"
                        style={{ width: 140 }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="unresolved">未確認</option>
                        <option value="resolved">確認済み</option>
                        <option value="all">全て</option>
                    </select>
                    <select
                        className="form-control"
                        style={{ width: 200 }}
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option value="all">全種別</option>
                        <option value="event_delay">イベント遅延</option>
                        <option value="schedule_missing">予定未登録</option>
                        <option value="required_delivery_missing">要求納期未入力</option>
                        <option value="confirmed_delivery_missing">確定納期未入力</option>
                    </select>
                </div>

                <div className="table-wrap">
                    {loading && <div className="loading-state">読み込み中…</div>}
                    {!loading && (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>状態</th>
                                    <th>重要度</th>
                                    <th>種別</th>
                                    <th>案件</th>
                                    <th>イベント</th>
                                    <th>内容</th>
                                    <th>発生日</th>
                                    <th>確認者</th>
                                    <th>確認日時</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.length === 0 ? (
                                    <tr>
                                        <td colSpan={10}>
                                            <div className="empty-state">
                                                {statusFilter === 'unresolved'
                                                    ? '未確認のアラームはありません'
                                                    : 'アラームはありません'}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    alerts.map((a) => {
                                        const sev = SEVERITY_MAP[a.severity] || SEVERITY_MAP.warning;
                                        return (
                                            <tr key={a.id} style={a.is_resolved ? { opacity: 0.6, background: '#fafafa' } : {}}>
                                                <td>
                                                    <span className={`badge ${a.is_resolved ? 'badge-completed' : 'badge-on_hold'}`}>
                                                        {a.is_resolved ? '確認済み' : '未確認'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${sev.cls}`}>{sev.label}</span>
                                                </td>
                                                <td style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                                    {ALERT_TYPE_LABELS[a.alert_type] || a.alert_type}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500, fontSize: 13 }}>{a.project_name}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                                                        {a.project_no}
                                                    </div>
                                                </td>
                                                <td style={{ fontSize: 12, color: '#6b7280' }}>
                                                    {a.event_name || '—'}
                                                </td>
                                                <td style={{ fontSize: 13, maxWidth: 300 }}>{a.message}</td>
                                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                                    {fmtDate(a.created_at)}
                                                </td>
                                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                                    {a.resolved_by || '—'}
                                                </td>
                                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                                    {a.resolved_at ? fmtTs(a.resolved_at) : '—'}
                                                </td>
                                                <td>
                                                    {!a.is_resolved && (
                                                        <button
                                                            className="btn btn-xs btn-secondary"
                                                            onClick={() => handleResolve(a.id)}
                                                        >
                                                            確認済みにする
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
