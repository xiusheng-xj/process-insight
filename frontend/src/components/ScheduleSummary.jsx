const ITEMS = [
    { key: 'eval_ahead',   label: '前倒し',    cls: 'eval-ahead'   },
    { key: 'eval_on_time', label: '計画通り',  cls: 'eval-ontime'  },
    { key: 'eval_delayed', label: '遅れ',      cls: 'eval-delayed' },
    { key: 'eval_overdue', label: '未完了遅れ', cls: 'eval-overdue' },
    { key: 'eval_pending', label: '未着手',    cls: 'eval-pending' },
];

export default function ScheduleSummary({ project }) {
    const hasData = ITEMS.some(({ key }) => Number(project[key]) > 0);
    if (!hasData) return null;

    return (
        <div className="schedule-summary">
            {ITEMS.map(({ key, label, cls }) => {
                const count = Number(project[key]) || 0;
                return (
                    <div key={key} className={`eval-chip ${cls}`}>
                        <span className="eval-label">{label}</span>
                        <span className="eval-count">{count}件</span>
                    </div>
                );
            })}
        </div>
    );
}
