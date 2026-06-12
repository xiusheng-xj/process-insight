import { useState, useCallback } from 'react';
import { updateProject } from '../api/projects';

/* ─── helper components ──────────────────────────────────── */
const SUB_LABEL_STYLE = {
    fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em',
    marginTop: 20, marginBottom: 8, paddingBottom: 4,
    borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase',
};
function SubLabel({ children }) {
    return <div style={SUB_LABEL_STYLE}>{children}</div>;
}
function InfoVal({ label, value, mono = false }) {
    const display = value !== null && value !== undefined && String(value) !== '' ? value : '—';
    return (
        <div className="info-item">
            <div className="label">{label}</div>
            <div className="value" style={mono ? { fontFamily: 'monospace' } : undefined}>{display}</div>
        </div>
    );
}
function Field({ label, children }) {
    return (
        <div className="info-item">
            <div className="label">{label}</div>
            {children}
        </div>
    );
}

/* ─── constants ──────────────────────────────────────────── */
const OWNER_OPTIONS = [
    '', '田中 太郎', '鈴木 一郎', '佐藤 花子', '山田 二郎', '伊藤 三郎',
];
const DLVR_STATUSES = [
    { v: '',    l: '— 未設定 —' },
    { v: '暫定',  l: '暫定' },
    { v: '調整中', l: '調整中' },
    { v: '済み',  l: '済み' },
];
const MGMT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

/* ─── utils ──────────────────────────────────────────────── */
function fmtPattern(patterns, appliedId) {
    const p = patterns.find((p) => p.id === appliedId);
    if (!p) return '—';
    const m = p.pattern_name.match(/パターン(\d+)（(.+)）/);
    return m ? `${m[1]}：${m[2]}` : p.pattern_name;
}
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ja-JP');
}
function fmtAmount(v) {
    if (v == null || v === '') return '----';
    return Number(v).toLocaleString('ja-JP') + '円';
}
function initForm(p) {
    return {
        owner_name:              p.owner_name              || '',
        dept_a_owner:            p.dept_a_owner            || '',
        dept_b_owner:            p.dept_b_owner            || '',
        dept_c_owner:            p.dept_c_owner            || '',
        manual_status:           ['on_hold', 'cancelled'].includes(p.status) ? p.status : '',
        order_date:              p.order_date?.slice(0, 10)              || '',
        estimated_price:         p.estimated_price         ?? '',
        final_price:             p.final_price             ?? '',
        required_delivery_date:  p.required_delivery_date?.slice(0, 10)  || '',
        promised_delivery_date:  p.promised_delivery_date?.slice(0, 10)  || '',
        confirmed_delivery_date: p.confirmed_delivery_date?.slice(0, 10) || '',
        delivery_status:         p.delivery_status         || '',
        machine_type:            p.machine_type            || '',
        project_name:            p.project_name            || '',
        product_name:            p.product_name            || '',
        quantity:                p.quantity                ?? '',
        management_no_a:         p.management_no_a         || '',
        management_no_b:         p.management_no_b         || '',
        management_no_c:         p.management_no_c         || '',
        management_no_d:         p.management_no_d         || '',
        management_no_e:         p.management_no_e         || '',
        management_no_f:         p.management_no_f         || '',
        comment:                 p.comment                 || '',
    };
}

/* ─── main component ─────────────────────────────────────── */
export default function ProjectInfoCard({ project, patterns, onSaved }) {
    const [collapsed, setCollapsed] = useState(false);
    const [editing,   setEditing]   = useState(false);
    const [saving,    setSaving]    = useState(false);
    const [saveError, setSaveError] = useState('');
    const [form,      setForm]      = useState({});

    const startEdit = useCallback(() => {
        setForm(initForm(project));
        setSaveError('');
        setEditing(true);
    }, [project]);

    const cancelEdit = useCallback(() => {
        setEditing(false);
        setSaveError('');
    }, []);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError('');
        try {
            const toNum = (v) => (v !== '' && v != null) ? Number(v) : null;
            await updateProject(project.id, {
                ...form,
                quantity:                toNum(form.quantity),
                estimated_price:         toNum(form.estimated_price),
                final_price:             toNum(form.final_price),
                order_date:              form.order_date              || null,
                required_delivery_date:  form.required_delivery_date  || null,
                promised_delivery_date:  form.promised_delivery_date  || null,
                confirmed_delivery_date: form.confirmed_delivery_date || null,
                status:                  form.manual_status           || 'active',
            });
            setEditing(false);
            onSaved();
        } catch (err) {
            setSaveError(err.message || '保存に失敗しました。');
        } finally {
            setSaving(false);
        }
    }, [form, project.id, onSaved]);

    const patternDisplay = fmtPattern(patterns, project.applied_milestone_pattern_id);
    const registDate     = new Date(project.created_at).toLocaleDateString('ja-JP');

    return (
        <div className="section">
            {/* ── ヘッダー ── */}
            <div className="section-header">
                <h2
                    className="section-title"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setCollapsed((c) => !c)}
                >
                    {collapsed ? '▶' : '▼'}&nbsp;案件情報
                </h2>
                {!collapsed && (
                    editing ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={cancelEdit}
                                disabled={saving}
                            >キャンセル</button>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                            >{saving ? '保存中…' : '保存'}</button>
                        </div>
                    ) : (
                        <button className="btn btn-sm btn-secondary" onClick={startEdit}>
                            編集
                        </button>
                    )
                )}
            </div>

            {!collapsed && saveError && (
                <div className="error-state" style={{ marginBottom: 12 }}>{saveError}</div>
            )}

            {!collapsed && (
                <>
                    {/* ── 基本情報 ── */}
                    <SubLabel>基本情報</SubLabel>
                    <div className="info-grid">
                        <InfoVal label="No" value={project.project_no} mono />
                        <InfoVal label="パターン" value={patternDisplay} />
                        {editing ? (
                            <>
                                <Field label="自部門担当者">
                                    <OwnerSelect value={form.owner_name} onChange={set('owner_name')} />
                                </Field>
                                <Field label="A部門担当者">
                                    <OwnerSelect value={form.dept_a_owner} onChange={set('dept_a_owner')} />
                                </Field>
                                <Field label="B部門担当者">
                                    <OwnerSelect value={form.dept_b_owner} onChange={set('dept_b_owner')} />
                                </Field>
                                <Field label="C部門担当者">
                                    <OwnerSelect value={form.dept_c_owner} onChange={set('dept_c_owner')} />
                                </Field>
                                <Field label="案件状態">
                                    <select
                                        className="form-control"
                                        value={form.manual_status}
                                        onChange={set('manual_status')}
                                    >
                                        <option value="">自動判定</option>
                                        <option value="on_hold">保留</option>
                                        <option value="cancelled">中止</option>
                                    </select>
                                </Field>
                            </>
                        ) : (
                            <>
                                <InfoVal label="自部門担当者" value={project.owner_name} />
                                <InfoVal label="A部門担当者"  value={project.dept_a_owner} />
                                <InfoVal label="B部門担当者"  value={project.dept_b_owner} />
                                <InfoVal label="C部門担当者"  value={project.dept_c_owner} />
                            </>
                        )}
                    </div>

                    {/* ── 工程管理情報 ── */}
                    <SubLabel>工程管理情報</SubLabel>
                    <div className="info-grid">
                        <InfoVal label="初回登録日" value={registDate} />
                        {editing ? (
                            <>
                                <Field label="受注日">
                                    <input type="date" className="form-control" value={form.order_date} onChange={set('order_date')} />
                                </Field>
                                <Field label="概算価格">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={form.estimated_price}
                                        onChange={set('estimated_price')}
                                        placeholder="0"
                                        min="0"
                                    />
                                </Field>
                                <Field label="確定価格">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={form.final_price}
                                        onChange={set('final_price')}
                                        placeholder="0"
                                        min="0"
                                    />
                                </Field>
                                <Field label="要求納期">
                                    <input type="date" className="form-control" value={form.required_delivery_date} onChange={set('required_delivery_date')} />
                                </Field>
                                <Field label="回答納期">
                                    <input type="date" className="form-control" value={form.promised_delivery_date} onChange={set('promised_delivery_date')} />
                                </Field>
                                <Field label="確定納期">
                                    <input type="date" className="form-control" value={form.confirmed_delivery_date} onChange={set('confirmed_delivery_date')} />
                                </Field>
                                <Field label="納期調整状況">
                                    <select className="form-control" value={form.delivery_status} onChange={set('delivery_status')}>
                                        {DLVR_STATUSES.map((o) => (
                                            <option key={o.v} value={o.v}>{o.l}</option>
                                        ))}
                                    </select>
                                </Field>
                            </>
                        ) : (
                            <>
                                <InfoVal label="受注日"      value={fmtDate(project.order_date)} />
                                <div className="info-item">
                                    <div className="label">価格</div>
                                    <div className="value" style={{ lineHeight: 1.9 }}>
                                        <div>概算：{fmtAmount(project.estimated_price)}</div>
                                        <div>確定：{fmtAmount(project.final_price)}</div>
                                    </div>
                                </div>
                                <InfoVal label="要求納期"    value={fmtDate(project.required_delivery_date)} />
                                <InfoVal label="回答納期"    value={fmtDate(project.promised_delivery_date)} />
                                <InfoVal label="確定納期"    value={fmtDate(project.confirmed_delivery_date)} />
                                <InfoVal label="納期調整状況" value={project.delivery_status} />
                            </>
                        )}
                    </div>

                    {/* ── 案件情報 ── */}
                    <SubLabel>案件情報</SubLabel>
                    <div className="info-grid">
                        {editing ? (
                            <>
                                <Field label="機種">
                                    <input type="text" className="form-control" value={form.machine_type} onChange={set('machine_type')} />
                                </Field>
                                <Field label="案件名">
                                    <input type="text" className="form-control" value={form.project_name} onChange={set('project_name')} />
                                </Field>
                                <Field label="製品名">
                                    <input type="text" className="form-control" value={form.product_name} onChange={set('product_name')} />
                                </Field>
                                <Field label="数量">
                                    <input type="number" className="form-control" value={form.quantity} onChange={set('quantity')} min="0" />
                                </Field>
                            </>
                        ) : (
                            <>
                                <InfoVal label="機種"  value={project.machine_type} />
                                <InfoVal label="案件名" value={project.project_name} />
                                <InfoVal label="製品名" value={project.product_name} />
                                <InfoVal label="数量"   value={project.quantity} />
                            </>
                        )}
                    </div>

                    <div className="info-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                        {MGMT_KEYS.map((x) =>
                            editing ? (
                                <Field key={x} label={`管理番号${x.toUpperCase()}`}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={form[`management_no_${x}`]}
                                        onChange={set(`management_no_${x}`)}
                                    />
                                </Field>
                            ) : (
                                <InfoVal key={x} label={`管理番号${x.toUpperCase()}`} value={project[`management_no_${x}`]} />
                            )
                        )}
                    </div>

                    {/* その他 */}
                    <div style={{ marginTop: 16 }}>
                        <div className="label" style={{ display: 'block', marginBottom: 6 }}>その他</div>
                        {editing ? (
                            <textarea
                                className="form-control"
                                value={form.comment}
                                onChange={set('comment')}
                                rows={3}
                                style={{ resize: 'vertical', fontSize: 13 }}
                            />
                        ) : (
                            <div style={{
                                padding: '10px 14px', background: '#f9fafb', borderRadius: 6,
                                fontSize: 13, color: project.comment ? '#374151' : '#9ca3af',
                                lineHeight: 1.6, minHeight: 36,
                            }}>
                                {project.comment || '—'}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function OwnerSelect({ value, onChange }) {
    return (
        <select className="form-control" value={value} onChange={onChange}>
            {OWNER_OPTIONS.map((o) => (
                <option key={o} value={o}>{o || '— 未設定 —'}</option>
            ))}
        </select>
    );
}
