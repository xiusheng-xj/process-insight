/* ============================================================
 * scripts/seed-demo.js
 * ------------------------------------------------------------
 * Process Insight デモ動画撮影用「デモ環境」構築スクリプト。
 *
 * 目的: 一般的なテストデータではなく、デモシナリオ1〜5を
 *       そのまま画面操作・撮影できる状態を再現する。
 *
 * 特徴:
 *   - 案件 No プレフィックス 'PIDEMO-' で完全に隔離。
 *     既存案件（DEMO-% / 実データ / テストデータ）には一切触れない。
 *   - 冪等: 実行ごとに PIDEMO-% を削除してから再投入する（CASCADE）。
 *   - 全日付を CURRENT_DATE 基準で計算 → いつ実行しても同じ見た目。
 *   - マイルストーンパターン3(リピート)/4(EOL) のイベント定義が
 *     未登録（=シーン4が成立しない）ため、べき等に補完する。
 *
 * 実行: backend ディレクトリから  npm run seed:demo
 *       または リポジトリルートから  node scripts/seed-demo.js
 * ============================================================ */

const path = require('path');

// pg / dotenv は backend 配下の node_modules を参照する（cwd 非依存）
const BACKEND = path.join(__dirname, '..', 'backend');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({
    path: path.join(BACKEND, '.env'),
});
const { Pool, types } = require(path.join(BACKEND, 'node_modules', 'pg'));

// DATE(OID 1082) は文字列のまま扱う（TZ ずれ防止 / db/index.js と同一方針）
types.setTypeParser(1082, (v) => v);

const PREFIX = 'PIDEMO-';

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'process_schedule',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

/* ── 日付ユーティリティ ───────────────────────────── */
function addDays(baseStr, n) {
    const [y, m, d] = baseStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/* ── 工程テンプレート ([code, name, type, dept, offset, isMilestone]) ── */
// 標準（パターン1: 16工程）
const STD = [
    ['SCHEDULE_A',      '日程表A',          'other',          'A',    0,   false],
    ['SCHEDULE_B',      '日程表B',          'other',          'A',    7,   false],
    ['MEETING_1',       '全体会議①',        'other',          'A',    14,  false],
    ['DOC_A_INITIAL',   '書類A初版提出日',  'other',          'A',    14,  false],
    ['KK_DATE',         'KK日',             'design',         'C',    14,  true],   // ★設計
    ['MEETING_2',       '全体会議②',        'other',          'A',    30,  false],
    ['MEETING_3',       '全体会議③',        'other',          'A',    60,  false],
    ['MEETING_4',       '全体会議④',        'other',          'A',    90,  false],
    ['SELF_COMPLETE',   '対応完了日',       'other',          'SELF', 90,  false],
    ['DEPT_B_COMPLETE', '対応完了日',       'manufacturing',  'B',    90,  false],
    ['DEPT_B_DELIVERY', '納期',             'delivery',       'B',    105, true],
    ['VERIFICATION',    '照合日',           'inspection',     'C',    110, false],
    ['DEPT_D_START',    '開始日',           'manufacturing',  'D',    115, false],
    ['MEETING_5',       '全体会議⑤',        'other',          'A',    120, false],
    ['DEPT_D_COMPLETE', '完了日',           'manufacturing',  'D',    130, true],
    ['FINAL_CONFIRM',   '確認日',           'other',          'SELF', 135, true],
];
// 簡易（パターン2: 13工程）
const SIMPLE = [
    ['SCHEDULE_A',      '日程表A',          'other',          'A',    0,   false],
    ['SCHEDULE_B',      '日程表B',          'other',          'A',    7,   false],
    ['MEETING_1',       '全体会議①',        'other',          'A',    14,  false],
    ['DOC_A_INITIAL',   '書類A初版提出日',  'other',          'A',    14,  false],
    ['KK_DATE',         'KK日',             'design',         'C',    14,  true],
    ['MEETING_5',       '全体会議⑤',        'other',          'A',    75,  false],
    ['SELF_COMPLETE',   '対応完了日',       'other',          'SELF', 90,  false],
    ['DEPT_B_COMPLETE', '対応完了日',       'manufacturing',  'B',    90,  false],
    ['DEPT_B_DELIVERY', '納期',             'delivery',       'B',    105, true],
    ['VERIFICATION',    '照合日',           'inspection',     'C',    110, false],
    ['DEPT_D_START',    '開始日',           'manufacturing',  'D',    115, false],
    ['DEPT_D_COMPLETE', '完了日',           'manufacturing',  'D',    130, true],
    ['FINAL_CONFIRM',   '確認日',           'other',          'SELF', 135, true],
];
// リピート（パターン3: 6工程）— event_master ベース
const REPEAT = [
    ['SCHEDULE_A',      '日程表A',          'other',          'A',    0,   false],
    ['KK_DATE',         'KK日',             'design',         'C',    7,   true],
    ['MEETING_1',       '全体会議①',        'other',          'A',    10,  false],
    ['DEPT_B_COMPLETE', '対応完了日',       'manufacturing',  'B',    40,  false],
    ['DEPT_B_DELIVERY', '納期',             'delivery',       'B',    55,  true],
    ['FINAL_CONFIRM',   '確認日',           'other',          'SELF', 60,  true],
];
// EOL（パターン4: 6工程）— event_master ベース（apply-template 自動生成用）
const EOL = [
    ['SCHEDULE_A',      '日程表A',          'other',          'A',    0,   false],
    ['MEETING_1',       '全体会議①',        'other',          'A',    14,  false],
    ['KK_DATE',         'KK日',             'design',         'C',    20,  true],
    ['DEPT_B_COMPLETE', '対応完了日',       'manufacturing',  'B',    45,  false],
    ['DEPT_B_DELIVERY', '納期',             'delivery',       'B',    80,  true],
    ['FINAL_CONFIRM',   '確認日',           'other',          'SELF', 100, true],
];
// EOL 案件の表示用カスタム工程（event_master 非依存 / is_custom=true）
const EOL_CUSTOM = [
    ['EOL通知受領',    'other',         'A', 0],
    ['代替品検討開始', 'design',        'C', 10],
    ['代替品選定完了', 'design',        'C', 30],
    ['最終発注',       'manufacturing', 'B', 45],
    ['最終入庫',       'manufacturing', 'B', 80],
    ['EOL移行完了',    'delivery',      'B', 100],
];

const TEMPLATES = { STD, SIMPLE, REPEAT, EOL };

/* ── デモ案件定義（10件） ─────────────────────────────
 * base        : project_start の CURRENT_DATE からのオフセット日数（負=過去着手）
 * template    : 工程テンプレート名（EOL案件のみ EOL_CUSTOM を使う）
 * leavePending: 過去工程のうち「実績未入力のまま放置」する event_code（=遅延/overdue化）
 * lateMap     : 完了済みだが遅延した工程の遅れ日数（予実ズレ演出）
 * completeAll : 全工程を実績入力済みにする（完了案件用）
 * alerts      : [{severity, type, message}]
 */
const PROJECTS = [
    {
        scene: '正常', no: '01', name: '半導体製造装置 搬送ユニット', machine: 'SMT-3000',
        product: 'WAFER-CONV-A', qty: 1, status: 'active', type: 'standard',
        owner: '田中 太郎', deptA: '田中 太郎', deptB: '鈴木 一郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -45,
        orderOff: -50, reqOff: 70, promOff: 65, confOff: null, delivery: '暫定',
        leavePending: [], lateMap: {}, alerts: [],
    },
    {
        scene: '注意', no: '02', name: '車載電池 検査ライン', machine: 'EV-BAT-INSP',
        product: 'BAT-LINE-2', qty: 2, status: 'active', type: 'standard',
        owner: '鈴木 一郎', deptA: '鈴木 一郎', deptB: '山田 二郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -50,
        orderOff: -55, reqOff: 40, promOff: 38, confOff: null, delivery: '暫定',
        leavePending: ['DOC_A_INITIAL'], lateMap: { KK_DATE: 3 },
        alerts: [{ severity: 'warning', type: 'schedule_delay', message: '書類A初版提出が予定日を超過しています。' }],
    },
    {
        scene: '遅延', no: '03', name: '産業用ロボット 組立セル', machine: 'ROBO-CELL-X',
        product: 'ASSY-CELL-7', qty: 1, status: 'active', type: 'standard',
        owner: '佐藤 花子', deptA: '佐藤 花子', deptB: '山田 二郎', deptC: '伊藤 三郎',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -100,
        orderOff: -105, reqOff: 20, promOff: 15, confOff: null, delivery: '暫定',
        leavePending: ['MEETING_3', 'SELF_COMPLETE', 'DEPT_B_COMPLETE'],
        lateMap: { MEETING_1: 6, DOC_A_INITIAL: 5, KK_DATE: 10, MEETING_2: 8 },
        alerts: [
            { severity: 'critical', type: 'milestone_delay', message: '対応完了・全体会議③が大幅遅延。納期影響リスク大。' },
            { severity: 'warning',  type: 'schedule_delay',  message: '設計フェーズで累積遅延が発生しています。' },
        ],
    },
    {
        scene: '完了', no: '04', name: '食品包装 充填機', machine: 'FOOD-FILL-500',
        product: 'FILLER-Y1', qty: 3, status: 'active', type: 'standard',
        owner: '山田 二郎', deptA: '山田 二郎', deptB: '鈴木 一郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_2_SIMPLE', template: 'SIMPLE', base: -170,
        orderOff: -175, reqOff: -15, promOff: -18, confOff: -12, delivery: '済み',
        completeAll: true, leavePending: [], lateMap: { DEPT_B_DELIVERY: 2 }, alerts: [],
    },
    {
        scene: '保留', no: '05', name: 'プレス成形 金型設備', machine: 'PRESS-MOLD-9',
        product: 'MOLD-SET-3', qty: 1, status: 'on_hold', type: 'standard',
        owner: '伊藤 三郎', deptA: '伊藤 三郎', deptB: '山田 二郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -30,
        orderOff: -35, reqOff: 90, promOff: 88, confOff: null, delivery: '暫定',
        comment: '客先都合により一時保留中（再開時期未定）。',
        leavePending: [], lateMap: {}, alerts: [],
    },
    {
        scene: '正常(リピート/設計集中)', no: '06', name: '標準コンベヤ リピート生産', machine: 'CONV-STD',
        product: 'CONV-R-12', qty: 5, status: 'active', type: 'standard',
        owner: '田中 太郎', deptA: '田中 太郎', deptB: '鈴木 一郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_3_REPEAT', template: 'REPEAT', base: 3,
        orderOff: -2, reqOff: 70, promOff: 68, confOff: null, delivery: '暫定',
        patternNo: 'PT-REPEAT', cluster: true, leavePending: [], lateMap: {}, alerts: [],
    },
    {
        scene: '注意(EOL)', no: '07', name: '旧型制御盤 EOL対応改造', machine: 'CTRL-PANEL-EOL',
        product: 'PANEL-Z1', qty: 1, status: 'active', type: 'eol',
        owner: '佐藤 花子', deptA: '佐藤 花子', deptB: '山田 二郎', deptC: '伊藤 三郎',
        pattern: 'PATTERN_4_EOL', template: 'EOL_CUSTOM', base: -30,
        orderOff: -35, reqOff: 100, promOff: 95, confOff: null, delivery: '暫定',
        leavePending: ['代替品検討開始'], lateMap: {},
        alerts: [{ severity: 'warning', type: 'eol', message: '代替品の選定が予定より遅延しています。' }],
    },
    {
        scene: '正常(設計集中)', no: '08', name: '精密加工 マシニングセンタ', machine: 'MC-PRECISION',
        product: 'MC-5AX-1', qty: 1, status: 'active', type: 'standard',
        owner: '鈴木 一郎', deptA: '鈴木 一郎', deptB: '山田 二郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -4,
        orderOff: -8, reqOff: 120, promOff: 118, confOff: null, delivery: '暫定',
        cluster: true, leavePending: [], lateMap: {}, alerts: [],
    },
    {
        scene: '遅延(納期逼迫)', no: '09', name: '半導体洗浄装置 量産対応', machine: 'WET-CLEAN-PRO',
        product: 'CLEAN-X9', qty: 2, status: 'active', type: 'standard',
        owner: '山田 二郎', deptA: '山田 二郎', deptB: '鈴木 一郎', deptC: '伊藤 三郎',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -60,
        orderOff: -65, reqOff: 5, promOff: 3, confOff: null, delivery: '暫定',
        leavePending: ['MEETING_2'], lateMap: { MEETING_1: 4 },
        alerts: [{ severity: 'critical', type: 'delivery_risk', message: '納期まで残りわずか。未完了工程が多数あります。' }],
    },
    {
        scene: '正常(新規/設計集中)', no: '10', name: '次世代 自動倉庫システム', machine: 'AUTO-WH-NX',
        product: 'AS-RS-1', qty: 1, status: 'active', type: 'standard',
        owner: '田中 太郎', deptA: '田中 太郎', deptB: '鈴木 一郎', deptC: '佐藤 花子',
        pattern: 'PATTERN_1_STANDARD', template: 'STD', base: -4,
        orderOff: -6, reqOff: 150, promOff: 148, confOff: null, delivery: '暫定',
        cluster: true, leavePending: [], lateMap: {}, alerts: [],
    },
];

/* ── パターン3/4 のイベント定義をべき等補完 ───────────── */
async function ensurePatternEvents(client, patternCode, def) {
    const { rows } = await client.query(
        'SELECT id FROM milestone_pattern WHERE pattern_code = $1', [patternCode]);
    if (!rows[0]) { console.warn(`  ! pattern ${patternCode} not found, skip`); return 0; }
    const pid = rows[0].id;
    let added = 0;
    for (let i = 0; i < def.length; i++) {
        const [code, , , , off, ms] = def[i];
        const r = await client.query(
            `INSERT INTO milestone_pattern_events
                (pattern_id, event_master_id, sort_order, offset_days, offset_base, is_milestone, is_required)
             SELECT $1, em.id, $2, $3, 'project_start', $4, true
             FROM event_master em WHERE em.event_code = $5
             ON CONFLICT (pattern_id, event_master_id) DO NOTHING`,
            [pid, i + 1, off, ms, code]);
        added += r.rowCount;
    }
    return added;
}

async function main() {
    const client = await pool.connect();
    try {
        const { rows: [{ today }] } = await client.query('SELECT CURRENT_DATE::text AS today');
        console.log(`基準日 (CURRENT_DATE) = ${today}\n`);

        await client.query('BEGIN');

        // 0. event_code → id, pattern_code → id マップ
        const emRows = (await client.query('SELECT id, event_code FROM event_master')).rows;
        const emByCode = new Map(emRows.map((r) => [r.event_code, r.id]));
        const mpRows = (await client.query('SELECT id, pattern_code FROM milestone_pattern')).rows;
        const mpByCode = new Map(mpRows.map((r) => [r.pattern_code, r.id]));

        // resources（schema_v18）。未適用環境では空マップにフォールバックし resource 割当をスキップ
        let resByCode = new Map();
        try {
            const resRows = (await client.query(
                'SELECT id, resource_code, home_location_id FROM resources')).rows;
            resByCode = new Map(resRows.map((r) => [r.resource_code, r]));
        } catch { /* resources 未作成（schema_v18 未適用）→ resource_id は NULL のまま */ }
        const REVIEW_D = resByCode.get('REVIEW-D') || null;

        // 1. パターン3(リピート)/4(EOL) のイベント定義を補完（シーン4成立のため）
        const a3 = await ensurePatternEvents(client, 'PATTERN_3_REPEAT', REPEAT);
        const a4 = await ensurePatternEvents(client, 'PATTERN_4_EOL', EOL);
        console.log(`マイルストーンパターン補完: リピート +${a3} 件 / EOL +${a4} 件\n`);

        // 2. 既存 PIDEMO-% を削除
        // project_events / project_alerts 等は ON DELETE CASCADE だが、
        // project_process_steps（schema_v17）は CASCADE 未設定のため明示削除する。
        const idSub = `SELECT id FROM projects WHERE project_no LIKE $1`;
        await client.query(
            `DELETE FROM project_process_step_actuals
             WHERE project_process_step_id IN (
                 SELECT id FROM project_process_steps WHERE project_id IN (${idSub}))`,
            [`${PREFIX}%`]);
        await client.query(
            `DELETE FROM project_process_steps WHERE project_id IN (${idSub})`,
            [`${PREFIX}%`]);
        const del = await client.query(
            "DELETE FROM projects WHERE project_no LIKE $1", [`${PREFIX}%`]);
        console.log(`既存 ${PREFIX}% 案件を削除: ${del.rowCount} 件\n`);

        // 3. 案件 + 工程 + アラート投入
        for (const p of PROJECTS) {
            const projNo = `${PREFIX}${p.no}`;
            const patternId = mpByCode.get(p.pattern) ?? null;

            const { rows: [proj] } = await client.query(
                `INSERT INTO projects
                    (project_no, pattern_no, machine_type, project_name, product_name, quantity,
                     status, comment, owner_name, dept_a_owner, dept_b_owner, dept_c_owner,
                     order_date, required_delivery_date, promised_delivery_date, confirmed_delivery_date,
                     delivery_status, project_type, applied_milestone_pattern_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                 RETURNING id`,
                [
                    projNo, p.patternNo || null, p.machine, p.name, p.product, p.qty,
                    p.status, p.comment || null, p.owner, p.deptA, p.deptB, p.deptC,
                    addDays(today, p.orderOff),
                    addDays(today, p.reqOff),
                    addDays(today, p.promOff),
                    p.confOff != null ? addDays(today, p.confOff) : null,
                    p.delivery, p.type, patternId,
                ]);
            const projectId = proj.id;

            // 工程イベント生成
            const eventIdByCode = {};
            if (p.template === 'EOL_CUSTOM') {
                let so = 1;
                for (const [name, etype, dept, off] of EOL_CUSTOM) {
                    const plan = addDays(today, p.base + off);
                    const isPast = (p.base + off) < 0;
                    const pending = p.leavePending.includes(name);
                    const actual = (!pending && isPast) ? plan : null;
                    const status = actual ? 'completed' : 'pending';
                    const { rows: [ev] } = await client.query(
                        `INSERT INTO project_events
                            (project_id, event_master_id, event_type, event_name, plan_date, actual_date,
                             status, owner_department, sort_order, is_custom)
                         VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id`,
                        [projectId, etype, name, plan, actual, status, `${dept}部門`, so++]);
                    eventIdByCode[name] = ev.id;
                }
            } else {
                const tpl = TEMPLATES[p.template];
                let so = 1;
                for (const [code, name, etype, dept, off] of tpl) {
                    const plan = addDays(today, p.base + off);
                    const isPast = (p.base + off) < 0;
                    let actual = null, status = 'pending';
                    if (p.completeAll) {
                        actual = addDays(plan, p.lateMap[code] || 0); status = 'completed';
                    } else if (p.leavePending.includes(code)) {
                        actual = null; status = 'pending';
                    } else if (isPast) {
                        actual = addDays(plan, p.lateMap[code] || 0); status = 'completed';
                    }
                    // 設計集中クラスタの KK日（設計系）に REVIEW-D を割当
                    //   → PIDEMO-06/08/10 が同一日程・同一resourceになり、後続Phaseの重複検出データ状態を作る
                    const assignReview = p.cluster && code === 'KK_DATE' && REVIEW_D;
                    const evResourceId = assignReview ? REVIEW_D.id : null;
                    const evLocationId = assignReview ? (REVIEW_D.home_location_id ?? null) : null;
                    const { rows: [ev] } = await client.query(
                        `INSERT INTO project_events
                            (project_id, event_master_id, event_type, event_name, plan_date, actual_date,
                             status, owner_department, sort_order, is_custom, location_id, resource_id)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11) RETURNING id`,
                        [projectId, emByCode.get(code) || null, etype, name, plan, actual,
                         status, `${dept}部門`, so++, evLocationId, evResourceId]);
                    eventIdByCode[code] = ev.id;
                }
            }

            // アラート
            for (const al of (p.alerts || [])) {
                await client.query(
                    `INSERT INTO project_alerts (project_id, alert_type, severity, message, is_resolved)
                     VALUES ($1,$2,$3,$4,FALSE)`,
                    [projectId, al.type, al.severity, al.message]);
            }

            // 設計集中クラスタ: KK日 配下に設計工程ステップを投入（同週集中の実データ化）
            if (p.cluster && eventIdByCode['KK_DATE']) {
                const kkOff = TEMPLATES[p.template].find((e) => e[0] === 'KK_DATE')[4];
                const kkPlan = addDays(today, p.base + kkOff);
                const steps = [
                    ['構想設計',   -3, 1],
                    ['詳細設計',    0, 2],
                    ['設計レビュー', 3, 3],
                ];
                for (const [sname, soff, sorder] of steps) {
                    await client.query(
                        `INSERT INTO project_process_steps
                            (project_id, parent_event_id, process_name, department_code, plan_date,
                             sort_order, offset_days, offset_base, source, is_custom)
                         VALUES ($1,$2,$3,'C',$4,$5,$6,'parent_event','demo',TRUE)`,
                        [projectId, eventIdByCode['KK_DATE'], sname, addDays(kkPlan, soff), sorder, soff]);
                }
            }

            console.log(`  ✓ ${projNo}  ${p.name}  [${p.scene}]`);
        }

        await client.query('COMMIT');
        console.log('\nコミット完了。\n');

        // 4. 動作確認: app と同一ロジックで状態を再計算して表示
        await verify(client);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ROLLBACK:', err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

/* ── 検証: backend/src/routes/projects.js と同一の分類ロジック ── */
async function verify(client) {
    const { rows } = await client.query(`
        SELECT p.project_no, p.project_name, p.status,
            CASE
                WHEN p.status = 'on_hold'   THEN 'on_hold'
                WHEN p.status = 'cancelled' THEN 'cancelled'
                WHEN ec.done = 0            THEN 'not_started'
                WHEN ec.done = ec.total AND ec.total > 0
                    AND p.project_name IS NOT NULL AND p.owner_name IS NOT NULL
                    AND p.order_date IS NOT NULL AND p.required_delivery_date IS NOT NULL
                    AND p.confirmed_delivery_date IS NOT NULL
                    THEN 'completed'
                ELSE 'in_progress'
            END AS effective_status,
            CASE
                WHEN ov.overdue_count >= 3 OR al.critical_count > 0 THEN 'danger'
                WHEN ov.overdue_count >= 1 OR al.alarm_count    >= 1 THEN 'caution'
                ELSE 'healthy'
            END AS health_status,
            ec.done, ec.total, ov.overdue_count, al.alarm_count, al.critical_count
        FROM projects p
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS total, COUNT(actual_date) AS done
            FROM project_events WHERE project_id = p.id
        ) ec ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS overdue_count FROM project_events
            WHERE project_id = p.id AND actual_date IS NULL AND plan_date < CURRENT_DATE
        ) ov ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS alarm_count,
                   COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
            FROM project_alerts WHERE project_id = p.id AND is_resolved = FALSE
        ) al ON TRUE
        WHERE p.project_no LIKE $1
        ORDER BY p.project_no`, [`${PREFIX}%`]);

    const EFF = { not_started: '未着手', in_progress: '作業中', completed: '完了', on_hold: '保留', cancelled: '中止' };
    const HLT = { healthy: '計画通り', caution: '注意', danger: '遅延' };

    console.log('=== 動作確認（画面表示と同一ロジック） ===');
    console.log('案件No      effective    health    工程(done/total)  overdue  alert(crit)');
    console.log('------------------------------------------------------------------------');
    for (const r of rows) {
        const no  = r.project_no.padEnd(11);
        const eff = `${r.effective_status}(${EFF[r.effective_status]})`.padEnd(18);
        const hlt = `${r.health_status}(${HLT[r.health_status] || '-'})`.padEnd(13);
        const prog = `${r.done}/${r.total}`.padEnd(15);
        console.log(`${no} ${eff} ${hlt} ${prog} ${String(r.overdue_count).padEnd(7)} ${r.alarm_count}(${r.critical_count})`);
    }
    console.log('------------------------------------------------------------------------');
    console.log(`合計 ${rows.length} 件`);

    // 設計集中クラスタの resource 割当確認（後続Phaseの重複検出データ状態）
    const { rows: rc } = await client.query(`
        SELECT p.project_no, e.event_name, e.plan_date, r.resource_name, r.capacity
        FROM project_events e
        JOIN projects p ON p.id = e.project_id
        LEFT JOIN resources r ON r.id = e.resource_id
        WHERE p.project_no LIKE $1 AND e.resource_id IS NOT NULL
        ORDER BY e.plan_date, p.project_no`, [`${PREFIX}%`]);
    if (rc.length) {
        console.log('\n=== resource 割当（重複検出デモ用） ===');
        for (const r of rc) {
            console.log(`  ${r.project_no}  ${r.event_name}  ${r.plan_date}  → ${r.resource_name}(capacity ${r.capacity})`);
        }
        const byDate = rc.reduce((m, r) => ((m[r.plan_date] = (m[r.plan_date] || 0) + 1), m), {});
        for (const [d, n] of Object.entries(byDate)) {
            console.log(`  ※ ${d}: 同一resourceに ${n} 件割当（capacity 2 → ${n > 2 ? '将来Phaseで衝突検出対象' : '範囲内'}）`);
        }
    }
}

main();
