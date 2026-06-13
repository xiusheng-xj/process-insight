import { useState, useEffect } from 'react';
import { fetchAlertSettings, updateAlertSettings } from '../api/alerts';

function SettingRow({ label, description, value, onChange }) {
    return (
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{description}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="number"
                    className="form-control"
                    style={{ width: 80 }}
                    min="1"
                    max="365"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
                <span style={{ fontSize: 14, color: '#374151' }}>日後に発報</span>
            </div>
        </div>
    );
}

export default function AlertSettings() {
    const [settings, setSettings] = useState({
        event_delay_enabled:             'true',
        schedule_missing_days:           '3',
        required_delivery_missing_days:  '3',
        confirmed_delivery_missing_days: '5',
    });
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetchAlertSettings()
            .then(setSettings)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        setError('');
        try {
            const updated = await updateAlertSettings(settings);
            setSettings(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            setError(e.message || '保存に失敗しました');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="page"><div className="loading-state">読み込み中…</div></div>;

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">アラート設定</h1>
            </div>

            {error && (
                <div className="error-state" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <div className="section" style={{ maxWidth: 560 }}>
                {/* イベント遅延 */}
                <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>イベント遅延アラート</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        予定日を超過しているが実績未入力のイベントを検出します
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={settings.event_delay_enabled === 'true'}
                            onChange={(e) => set('event_delay_enabled', e.target.checked ? 'true' : 'false')}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 14 }}>有効にする</span>
                    </label>
                </div>

                <SettingRow
                    label="予定未登録アラート"
                    description="案件登録後 N 日経過してもイベント予定日が設定されていない場合に発報します"
                    value={settings.schedule_missing_days}
                    onChange={(v) => set('schedule_missing_days', v)}
                />

                <SettingRow
                    label="要求納期未入力アラート"
                    description="案件登録後 N 日経過しても要求納期が入力されていない場合に発報します"
                    value={settings.required_delivery_missing_days}
                    onChange={(v) => set('required_delivery_missing_days', v)}
                />

                <SettingRow
                    label="確定納期未入力アラート"
                    description="案件登録後 N 日経過しても確定納期が入力されていない場合に発報します"
                    value={settings.confirmed_delivery_missing_days}
                    onChange={(v) => set('confirmed_delivery_missing_days', v)}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? '保存中…' : '保存'}
                    </button>
                    {saved && (
                        <span style={{ color: '#059669', fontSize: 13 }}>✓ 保存しました</span>
                    )}
                </div>
            </div>
        </div>
    );
}
