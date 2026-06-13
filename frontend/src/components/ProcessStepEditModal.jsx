import { useState } from 'react';
import {
    updateProjectProcessStep,
    addProcessStepActual,
    cancelLatestProcessStepActual,
} from '../api/processPatterns';

const DEPT_LABEL = { A: 'A部門', SELF: '自部門', B: 'B部門', C: 'C部門', D: 'D部門' };

export default function ProcessStepEditModal({ step, projectId, onClose, onSaved }) {
    // 基本情報
    const [processName, setProcessName] = useState(step.process_name || '');
    const [deptCode,    setDeptCode]    = useState(step.department_code || '');
    const [planDate,    setPlanDate]    = useState(step.plan_date?.slice(0, 10) || '');
    const [notes,       setNotes]       = useState(step.notes || '');

    // 実績追加
    const [newActualDate,  setNewActualDate]  = useState('');
    const [newActualNotes, setNewActualNotes] = useState('');

    // UI状態
    const [saving,          setSaving]          = useState(false);
    const [addingActual,    setAddingActual]    = useState(false);
    const [cancelingActual, setCancelingActual] = useState(false);
    const [error,           setError]           = useState('');

    const busy = saving || addingActual || cancelingActual;

    /* 基本情報保存 */
    const handleSaveBasic = async (e) => {
        e.preventDefault();
        if (!processName.trim()) { setError('工程名は必須です。'); return; }
        setSaving(true); setError('');
        try {
            await updateProjectProcessStep(projectId, step.id, {
                process_name:    processName.trim(),
                department_code: deptCode    || null,
                planned_date:    planDate    || null,
                note:            notes.trim() || null,
            });
            onSaved();
        } catch (err) {
            setError(err?.data?.message || err?.message || '更新に失敗しました。');
            setSaving(false);
        }
    };

    /* 実績追加 */
    const handleAddActual = async () => {
        if (!newActualDate) { setError('実績日を入力してください。'); return; }
        setAddingActual(true); setError('');
        try {
            await addProcessStepActual(projectId, step.id, {
                actual_date: newActualDate,
                notes:       newActualNotes.trim() || null,
            });
            onSaved();
        } catch (err) {
            setError(err?.data?.message || err?.message || '実績の追加に失敗しました。');
            setAddingActual(false);
        }
    };

    /* 最新実績取消 */
    const handleCancelActual = async () => {
        if (!window.confirm('最新の実績を取り消しますか？（論理削除）')) return;
        setCancelingActual(true); setError('');
        try {
            await cancelLatestProcessStepActual(projectId, step.id);
            onSaved();
        } catch (err) {
            setError(err?.data?.message || err?.message || '実績の取消に失敗しました。');
            setCancelingActual(false);
        }
    };

    const latestActual   = step.latest_actual_date?.slice(0, 10)        || null;
    const prevActual     = step.previous_actual_date?.slice(0, 10)      || null;
    const prevPrevActual = step.pre_previous_actual_date?.slice(0, 10)  || null;

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 520, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        工程ステップ編集
                        {step.is_custom && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '2px 6px', fontWeight: 400 }}>
                                カスタム
                            </span>
                        )}
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

                    {/* ── 基本情報 ── */}
                    <div style={{ marginBottom: 24 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                            基本情報
                        </p>
                        <form id="step-basic-form" onSubmit={handleSaveBasic}>
                            <div className="form-group">
                                <label className="form-label">工程名 <span style={{ color: '#dc2626' }}>*</span></label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={processName}
                                    onChange={e => setProcessName(e.target.value)}
                                    maxLength={255}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">担当部門</label>
                                <select className="form-input" value={deptCode} onChange={e => setDeptCode(e.target.value)}>
                                    <option value="">— 未設定 —</option>
                                    {Object.entries(DEPT_LABEL).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">予定日</label>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={planDate}
                                    onChange={e => setPlanDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">メモ</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="備考・詳細"
                                />
                            </div>
                        </form>
                    </div>

                    {/* ── 実績管理 ── */}
                    <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                            実績管理
                        </p>

                        {/* 現在の実績一覧 */}
                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 0, flexDirection: 'column', fontSize: 12 }}>
                                <ActualRow label="最新実績" value={latestActual}   color={latestActual ? '#059669' : '#9ca3af'} />
                                <ActualRow label="前回実績" value={prevActual}     color="#6b7280" />
                                <ActualRow label="前々回"   value={prevPrevActual} color="#9ca3af" />
                            </div>
                        </div>

                        {/* 実績追加フォーム */}
                        <div className="form-group">
                            <label className="form-label">新しい実績日を追加</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={newActualDate}
                                    onChange={e => setNewActualDate(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAddActual}
                                    disabled={busy || !newActualDate}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {addingActual ? '追加中…' : '実績を追加'}
                                </button>
                            </div>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="実績メモ（任意）"
                                value={newActualNotes}
                                onChange={e => setNewActualNotes(e.target.value)}
                                style={{ marginTop: 6, fontSize: 12 }}
                            />
                        </div>

                        {/* 最新実績取消 */}
                        {latestActual && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#d97706', fontSize: 12, marginTop: 4 }}
                                onClick={handleCancelActual}
                                disabled={busy}
                            >
                                {cancelingActual ? '取消中…' : `最新実績を取消（${latestActual}）`}
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="error-state" style={{ marginTop: 12 }}>{error}</div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
                        キャンセル
                    </button>
                    <button
                        type="submit"
                        form="step-basic-form"
                        className="btn btn-primary"
                        disabled={busy}
                    >
                        {saving ? '保存中…' : '基本情報を保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActualRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span style={{ fontWeight: 500, color }}>{value || '—'}</span>
        </div>
    );
}
