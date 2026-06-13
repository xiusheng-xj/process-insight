const SEVERITY = {
    critical: { cls: 'critical', icon: '🚨' },
    warning:  { cls: 'warning',  icon: '⚠️' },
    info:     { cls: 'info',     icon: 'ℹ️' },
};

export default function AlertBanner({ alerts, onResolve }) {
    if (!alerts?.length) return null;

    return (
        <div className="alert-list">
            {alerts.map((a) => {
                const { cls, icon } = SEVERITY[a.severity] || SEVERITY.warning;
                return (
                    <div key={a.id} className={`alert-item ${cls}`}>
                        <span style={{ flex: 1 }}>
                            {icon}&ensp;{a.message}
                        </span>
                        <button
                            onClick={() => onResolve(a.id)}
                            title="確認済みにする"
                            className="btn btn-xs btn-secondary"
                            style={{ flexShrink: 0 }}
                        >
                            確認済み
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
