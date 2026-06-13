import { useState, useMemo } from 'react';
import { saveAsPattern } from '../api/projects';

export default function SaveAsPatternModal({ projectId, localEvents, onClose, onSaved }) {
    const [patternName, setPatternName] = useState('');
    const [patternCode, setPatternCode] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving]           = useState(false);
    const [error, setError]             = useState('');

    /* 保存対象 / 対象外 / 重複 の分類 */
    const { saveable, excluded, duplicates } = useMemo(() => {
        const active = localEvents.filter(e => !e.deleted_at);
        const withId = active.filter(e => e.event_master_id != null);
        const noId   = active.filter(e => e.event_master_id == null);

        const seen = new Set();
        const deduped = [];
        const dups    = [];
        for (const e of withId) {
            const mid = Number(e.event_master_id);
            if (seen.has(mid)) { dups.push(e); } else { seen.add(mid); deduped.push(e); }
        }
        return { saveable: deduped, excluded: noId, duplicates: dups };
    }, [localEvents]);

    const hasWarning = excluded.length > 0 || duplicates.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!patternName.trim()) { setError('パターン名は必須です。'); return; }
        if (saveable.length === 0) { setError('保存対象のイベントがありません。'); return; }

        setSaving(true);
        setError('');
        try {
            const result = await saveAsPattern(projectId, {
                pattern_name: patternName.trim(),
                pattern_code: patternCode.trim() || undefined,
                description:  description.trim() || undefined,
            });
            onSaved(result.pattern);
        } catch (err) {
            let message =
                err?.data?.message ||
                err?.message       ||
                err?.data?.error   ||
                '保存に失敗しました。';

            if (err?.error === 'DUPLICATE_PATTERN') {
                message = '同じコードまたは名前のマイルストーンパターンが既に存在します。別の名前またはコードで保存してください。';
            } else if (err?.error === 'DUPLICATE_PATTERN_STRUCTURE') {
                message = err.existing_pattern
                    ? `同じイベント構成のマイルストーンパターンが既に存在します。既存パターン：${err.existing_pattern}`
                    : '同じイベント構成のマイルストーンパターンが既に存在します。既存パターンをご利用ください。';
            }

            setError(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 600, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
                <div className="modal-header">
                    <h2 className="modal-title">この構成をパターンとして保存</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>

                    {/* ── 保存対象イベント一覧 ── */}
                    <section style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            保存対象イベント（{saveable.length} 件）
                        </div>
                        {saveable.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>
                                保存対象のイベントがありません。event_master_id が設定されているイベントが必要です。
                            </div>
                        ) : (
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                {saveable.map((ev, i) => (
                                    <div key={ev.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 12px',
                                        borderBottom: i < saveable.length - 1 ? '1px solid #f3f4f6' : undefined,
                                        fontSize: 12,
                                    }}>
                                        <span style={{ color: '#9ca3af', width: 24, textAlign: 'right', flexShrink: 0 }}>
                                            {(i + 1) * 10}
                                        </span>
                                        <span style={{ flex: 1, fontWeight: 500 }}>
                                            {ev.event_name}
                                            {ev.is_custom && (
                                                <span style={{ marginLeft: 4, fontSize: 9, color: '#6366f1', background: '#eef2ff', borderRadius: 3, padding: '1px 4px' }}>固有</span>
                                            )}
                                        </span>
                                        <span style={{ color: '#6b7280', flexShrink: 0 }}>
                                            {ev.plan_date ? ev.plan_date.slice(0, 10) : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── 警告表示 ── */}
                    {hasWarning && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: 18, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠ 注意</div>
                            {excluded.length > 0 && (
                                <div style={{ color: '#78350f', marginBottom: excluded.length > 0 && duplicates.length > 0 ? 4 : 0 }}>
                                    event_master_id が未設定のイベント {excluded.length} 件はパターンに含まれません：
                                    {excluded.map(e => ` 「${e.event_name}」`).join('、')}
                                </div>
                            )}
                            {duplicates.length > 0 && (
                                <div style={{ color: '#78350f' }}>
                                    同一マスターが重複している {duplicates.length} 件は先着1件のみ保存されます：
                                    {duplicates.map(e => ` 「${e.event_name}」`).join('、')}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── offset_days 説明 ── */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '8px 12px', marginBottom: 18, fontSize: 11, color: '#075985' }}>
                        📅 offset_days は最初のイベントの予定日を基準（day 0）として計算します。<br />
                        パターン適用時に指定した基準日からの相対日数で各予定日が算出されます。
                    </div>

                    {/* ── 入力フォーム ── */}
                    <form id="save-pattern-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">
                                パターン名 <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                className="form-input"
                                type="text"
                                value={patternName}
                                onChange={e => setPatternName(e.target.value)}
                                placeholder="例：○○案件標準構成"
                                maxLength={255}
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">パターンコード（任意・省略時は自動生成）</label>
                            <input
                                className="form-input"
                                type="text"
                                value={patternCode}
                                onChange={e => setPatternCode(e.target.value)}
                                placeholder="例：STANDARD_V2"
                                maxLength={100}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">説明（任意）</label>
                            <textarea
                                className="form-input"
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="このパターンの用途・特徴など"
                            />
                        </div>
                    </form>

                    {error && (
                        <div className="error-state" style={{ marginTop: 8 }}>{error}</div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        キャンセル
                    </button>
                    <button
                        type="submit"
                        form="save-pattern-form"
                        className="btn btn-primary"
                        disabled={saving || saveable.length === 0}
                    >
                        {saving ? '保存中…' : `パターンを保存（${saveable.length} 件）`}
                    </button>
                </div>
            </div>
        </div>
    );
}
