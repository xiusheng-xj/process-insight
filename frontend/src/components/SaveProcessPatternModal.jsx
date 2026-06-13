import { useState } from 'react';
import { saveProcessPattern } from '../api/processPatterns';

const DEPT_LABEL = { A: 'A部門', SELF: '自部門', B: 'B部門', C: 'C部門', D: 'D部門' };

export default function SaveProcessPatternModal({ projectId, event, steps, onClose, onSaved }) {
    const [patternName, setPatternName] = useState('');
    const [patternCode, setPatternCode] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving]           = useState(false);
    const [error, setError]             = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!patternName.trim()) { setError('パターン名は必須です。'); return; }
        if (steps.length === 0) { setError('保存対象の工程ステップがありません。'); return; }

        setSaving(true);
        setError('');
        try {
            const result = await saveProcessPattern(projectId, event.id, {
                pattern_name: patternName.trim(),
                pattern_code: patternCode.trim() || undefined,
                description:  description.trim() || undefined,
            });
            onSaved(result.pattern);
        } catch (err) {
            let msg = err?.data?.message || err?.message || '保存に失敗しました。';
            if (err?.error === 'DUPLICATE_PATTERN') {
                msg = err?.data?.message || '同じコードまたは名前の工程パターンが既に存在します。';
            } else if (err?.error === 'DUPLICATE_PATTERN_STRUCTURE') {
                const existing = err?.data?.existing_pattern;
                msg = existing
                    ? `同じ工程構成のパターンが既に存在します。既存パターン：${existing}`
                    : '同じ工程構成のパターンが既に存在します。';
            }
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 580, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">工程構成をパターンとして保存</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
                    {/* ステップ一覧 */}
                    <section style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            保存対象ステップ（{steps.length} 件）
                        </div>
                        {steps.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#dc2626' }}>保存対象のステップがありません。</div>
                        ) : (
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                {steps.map((s, i) => (
                                    <div key={s.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 12px', fontSize: 12,
                                        borderBottom: i < steps.length - 1 ? '1px solid #f3f4f6' : undefined,
                                    }}>
                                        <span style={{ color: '#9ca3af', width: 24, textAlign: 'right', flexShrink: 0 }}>
                                            {(i + 1) * 10}
                                        </span>
                                        <span style={{ flex: 1, fontWeight: 500 }}>
                                            {s.process_name}
                                            {s.is_custom && (
                                                <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>カスタム</span>
                                            )}
                                        </span>
                                        {s.department_code && (
                                            <span style={{ fontSize: 10, background: '#f3f4f6', borderRadius: 3, padding: '1px 5px', color: '#6b7280' }}>
                                                {DEPT_LABEL[s.department_code] || s.department_code}
                                            </span>
                                        )}
                                        <span style={{ color: '#6b7280', fontSize: 11 }}>
                                            {s.offset_days >= 0 ? `+${s.offset_days}日` : `${s.offset_days}日`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* 入力フォーム */}
                    <form id="save-proc-pattern-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">パターン名 <span style={{ color: '#dc2626' }}>*</span></label>
                            <input
                                className="form-input"
                                type="text"
                                value={patternName}
                                onChange={e => setPatternName(e.target.value)}
                                placeholder="例：標準製造工程"
                                maxLength={255}
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">パターンコード（任意）</label>
                            <input
                                className="form-input"
                                type="text"
                                value={patternCode}
                                onChange={e => setPatternCode(e.target.value)}
                                placeholder="例：STD_PROCESS_V2"
                                maxLength={100}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">説明（任意）</label>
                            <textarea
                                className="form-input"
                                rows={2}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="このパターンの用途・特徴"
                            />
                        </div>
                    </form>

                    {error && <div className="error-state" style={{ marginTop: 8 }}>{error}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>キャンセル</button>
                    <button
                        type="submit"
                        form="save-proc-pattern-form"
                        className="btn btn-primary"
                        disabled={saving || steps.length === 0}
                    >
                        {saving ? '保存中…' : `パターンを保存（${steps.length} ステップ）`}
                    </button>
                </div>
            </div>
        </div>
    );
}
