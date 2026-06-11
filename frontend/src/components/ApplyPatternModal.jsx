import { useState } from 'react';

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * マイルストーンパターン適用モーダル
 * props:
 *   patterns          - GET /api/templates で取得済みのパターン一覧
 *   currentEventCount - 案件の現在のイベント件数（退避警告表示に使用）
 *   onClose           - キャンセル / 閉じる
 *   onSubmit(body)    - { pattern_id: number, base_date: string } を受け取る非同期関数
 *   loading           - 適用中フラグ
 */
export default function ApplyPatternModal({
    patterns,
    currentEventCount,
    onClose,
    onSubmit,
    loading,
}) {
    const [patternId, setPatternId] = useState(
        patterns.length > 0 ? String(patterns[0].id) : ''
    );
    const [baseDate, setBaseDate] = useState(todayStr());
    const [err, setErr] = useState('');

    const selectedPattern = patterns.find((p) => String(p.id) === patternId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!patternId) { setErr('パターンを選択してください。'); return; }
        if (!baseDate)  { setErr('基準日は必須です。'); return; }
        try {
            await onSubmit({ pattern_id: Number(patternId), base_date: baseDate });
        } catch (ex) {
            setErr(ex.message || '適用に失敗しました。');
        }
    };

    return (
        <div
            className="overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="modal">
                <div className="modal-header">
                    <h2 className="modal-title">マイルストーンパターン適用</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {currentEventCount > 0 && (
                    <div style={{
                        margin: '0 0 16px',
                        padding: '10px 14px',
                        background: '#fffbeb',
                        border: '1px solid #fbbf24',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#92400e',
                        lineHeight: 1.7,
                    }}>
                        ⚠️ 既存の <strong>{currentEventCount} 件</strong>のイベントは archive に退避してから再作成されます。<br />
                        実績日を含むすべてのデータは退避テーブルに保持されます。
                    </div>
                )}

                {err && (
                    <div className="error-state" style={{ marginBottom: 14 }}>{err}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label req">マイルストーンパターン</label>
                        {patterns.length === 0 ? (
                            <div style={{ fontSize: 13, color: '#6b7280' }}>
                                パターンが登録されていません
                            </div>
                        ) : (
                            <select
                                className="form-control"
                                value={patternId}
                                onChange={(e) => setPatternId(e.target.value)}
                            >
                                {patterns.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.pattern_name}
                                    </option>
                                ))}
                            </select>
                        )}
                        {selectedPattern && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                                {selectedPattern.event_count} 工程 ／
                                マイルストーン {selectedPattern.milestone_count} 件
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label req">基準日</label>
                        <input
                            className="form-control"
                            type="date"
                            value={baseDate}
                            onChange={(e) => setBaseDate(e.target.value)}
                            required
                        />
                        <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                            各イベントの予定日はこの日付からの相対日数で自動計算されます
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading || !patternId || !baseDate}
                        >
                            {loading ? '適用中…' : '適用する'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
