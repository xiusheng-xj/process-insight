import { useState, useEffect } from 'react';
import { fetchMilestonePatterns } from '../api/projects';

const OWNER_OPTIONS = [
    '', '田中 太郎', '鈴木 一郎', '佐藤 花子', '山田 二郎', '伊藤 三郎',
];

function fmtPattern(p) {
    const m = p.pattern_name.match(/パターン(\d+)（(.+)）/);
    return m ? `${m[1]}：${m[2]}` : p.pattern_name;
}

const INITIAL = {
    project_no:                   '',
    project_name:                 '',
    owner_name:                   '',
    applied_milestone_pattern_id: '',
};

export default function CreateProjectModal({ onClose, onSubmit, loading, serverError }) {
    const [form,     setForm]     = useState(INITIAL);
    const [err,      setErr]      = useState('');
    const [patterns, setPatterns] = useState([]);

    useEffect(() => {
        fetchMilestonePatterns().then(setPatterns).catch(() => {});
    }, []);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!form.project_no.trim())   { setErr('案件Noは必須です。');       return; }
        if (!form.project_name.trim()) { setErr('案件名は必須です。');       return; }
        if (!form.owner_name)          { setErr('自部門担当者は必須です。'); return; }
        try {
            await onSubmit({
                project_no:   form.project_no.trim(),
                project_name: form.project_name.trim(),
                owner_name:   form.owner_name,
                applied_milestone_pattern_id: form.applied_milestone_pattern_id
                    ? Number(form.applied_milestone_pattern_id)
                    : null,
            });
        } catch (ex) {
            setErr(ex.message || '作成に失敗しました。');
        }
    };

    const displayErr = err || serverError;

    return (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal">
                <div className="modal-header">
                    <h2 className="modal-title">新規案件作成</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {displayErr && (
                    <div className="error-state" style={{ marginBottom: 14 }}>{displayErr}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label req">案件No</label>
                        <input
                            className="form-control"
                            value={form.project_no}
                            onChange={set('project_no')}
                            placeholder="例: PRJ-2026-001"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label req">案件名</label>
                        <input
                            className="form-control"
                            value={form.project_name}
                            onChange={set('project_name')}
                            placeholder="例: ○○設備 製造案件"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label req">自部門担当者</label>
                        <select
                            className="form-control"
                            value={form.owner_name}
                            onChange={set('owner_name')}
                        >
                            {OWNER_OPTIONS.map((o) => (
                                <option key={o} value={o}>{o || '— 選択してください —'}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">フローパターン</label>
                        <select
                            className="form-control"
                            value={form.applied_milestone_pattern_id}
                            onChange={set('applied_milestone_pattern_id')}
                        >
                            <option value="">— 未選択 —</option>
                            {patterns.map((p) => (
                                <option key={p.id} value={p.id}>{fmtPattern(p)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            キャンセル
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? '作成中…' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
