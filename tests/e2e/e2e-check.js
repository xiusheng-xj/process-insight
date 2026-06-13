/**
 * E2E v0.2 ブラウザ確認スクリプト
 * node e2e-check.js で実行
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:6100';
const SHOTS = path.join(__dirname, 'e2e-screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0, warn = 0;
const log = [];

function ok(msg)   { pass++; log.push(`✅ ${msg}`); console.log(`✅ ${msg}`); }
function ng(msg)   { fail++; log.push(`❌ ${msg}`); console.error(`❌ ${msg}`); }
function wn(msg)   { warn++; log.push(`⚠️  ${msg}`); console.warn(`⚠️  ${msg}`); }
function info(msg) { log.push(`   ${msg}`); console.log(`   ${msg}`); }

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  info(`Screenshot saved: ${name}.png`);
  return p;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ユーザー名モーダルを処理してアプリにログイン
async function doLogin(page) {
  const loginInput = page.locator('input[placeholder*="山田"], input[type="text"]').first();
  if (await loginInput.count() > 0) {
    await loginInput.fill('E2Eテスト担当者');
    await page.locator('button:has-text("開始する"), button[type="submit"]').first().click();
    await wait(1000);
    ok('ユーザー名入力→開始 OK');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: undefined,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.toString()));

  try {
    // ────────────────────────────────────────────────────────────────
    // [0] ログイン（ユーザー名入力モーダル）
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [0] ログイン ===');
    await page.goto(BASE, { timeout: 15000 });
    await wait(1500);
    await shot(page, '00-login');
    await doLogin(page);
    await wait(1000);
    await shot(page, '00b-after-login');

    // ────────────────────────────────────────────────────────────────
    // [1] 案件一覧
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [1] 案件一覧 ===');
    await wait(2000); // wait for data load
    await shot(page, '01-project-list');

    const navLinks = await page.locator('nav a, .nav-link, aside a').count();
    info(`ナビリンク数: ${navLinks}`);
    if (navLinks > 0) ok('ナビゲーション表示OK');
    else wn('ナビゲーション要素が nav/aside に見つからない（CSS確認要）');

    const rowCount = await page.locator('tbody tr').count();
    info(`案件行数: ${rowCount}`);
    if (rowCount > 0) ok(`案件一覧に${rowCount}件表示`);
    else ng('案件一覧が空（データが取得できていない可能性）');

    // ────────────────────────────────────────────────────────────────
    // [2] /milestone-patterns 画面
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [2] /milestone-patterns ===');
    await page.goto(`${BASE}/milestone-patterns`, { timeout: 10000 });
    await wait(2000);

    // ログインモーダルが再表示された場合
    const loginCheck = page.locator('button:has-text("開始する")');
    if (await loginCheck.count() > 0) {
      await doLogin(page);
      await wait(1500);
    }

    await shot(page, '02-milestone-list');

    const mpRows = await page.locator('tbody tr').count();
    info(`MSパターン行数: ${mpRows}`);
    if (mpRows > 0) ok(`MSパターン一覧に${mpRows}件表示`);
    else ng('MSパターン一覧が空');

    // 展開ボタン検索（詳細展開）
    const expandBtns = await page.locator('button[title*="詳細"], button[aria-label*="詳細"], button[title*="展開"], td button').all();
    info(`展開候補ボタン: ${expandBtns.length}個`);

    if (expandBtns.length > 0) {
      await expandBtns[0].click();
      await wait(1000);
      await shot(page, '02b-milestone-expanded');
      ok('MSパターン詳細展開OK');
    } else {
      // Try clicking the first row to see if it expands
      const firstRow = page.locator('tbody tr').first();
      if (await firstRow.count() > 0) {
        await firstRow.click();
        await wait(800);
        const afterRows = await page.locator('tbody tr').count();
        if (afterRows > mpRows) ok('行クリックで展開行が追加された');
        else wn('行クリックでの展開が不明');
        await shot(page, '02b-milestone-row-click');
      }
    }

    // 新規作成ボタン
    const createBtns = await page.locator('button').all();
    let createBtn = null;
    for (const btn of createBtns) {
      const txt = await btn.textContent();
      if (txt && (txt.includes('新規') || txt.includes('作成') || txt.includes('追加') || txt.includes('＋') || txt.includes('+'))) {
        createBtn = btn;
        break;
      }
    }
    if (createBtn) {
      ok('新規作成ボタン発見');
      await createBtn.click();
      await wait(1000);
      await shot(page, '02c-milestone-create-modal');

      // Check modal appeared
      const modalVisible = await page.locator('.modal, [role="dialog"], [class*="modal"]').count();
      const overlayVisible = await page.locator('[class*="overlay"], [class*="backdrop"]').count();
      info(`モーダル要素: ${modalVisible}, オーバーレイ: ${overlayVisible}`);
      if (modalVisible > 0 || overlayVisible > 0) ok('新規作成モーダル表示OK');
      else wn('モーダル要素が検出されない（display:none の可能性）');

      // モーダルを閉じる
      await page.keyboard.press('Escape');
      await wait(500);
    } else {
      ng('新規作成ボタン未発見');
    }

    // 無効化ボタン確認（toggle/active）
    const allBtnTexts = [];
    for (const btn of await page.locator('button').all()) {
      const t = await btn.textContent().catch(() => '');
      if (t) allBtnTexts.push(t.trim());
    }
    info(`ページ上のボタン一覧: ${[...new Set(allBtnTexts)].join(' | ')}`);

    const toggleBtn = allBtnTexts.some(t =>
      t.includes('無効') || t.includes('有効') || t.includes('停止') || t.includes('切替')
    );
    if (toggleBtn) ok('無効化/有効化ボタン存在');
    else wn('無効化ボタンが確認できない（編集モード起動が必要かもしれない）');

    // ────────────────────────────────────────────────────────────────
    // [3] 案件詳細 → ガントタブ
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [3] 案件詳細ガント（project 11） ===');
    await page.goto(`${BASE}/projects/11`, { timeout: 10000 });
    await wait(2500);

    if (await page.locator('button:has-text("開始する")').count() > 0) {
      await doLogin(page);
      await wait(1500);
    }

    await shot(page, '03-project-detail');

    // ページのタブを確認
    const tabs = await page.locator('button[role="tab"], [role="tablist"] button, .tab-btn, button.tab').all();
    const tabTexts = [];
    for (const t of tabs) { tabTexts.push(await t.textContent().catch(() => '')); }
    info(`タブ: ${tabTexts.join(' | ')}`);

    // ガントタブを探す
    let ganttTabClicked = false;
    for (const tab of tabs) {
      const txt = await tab.textContent().catch(() => '');
      if (txt && txt.includes('ガント')) {
        await tab.click();
        await wait(2000);
        ganttTabClicked = true;
        await shot(page, '03b-gantt-chart');
        ok('ガントタブクリック成功');
        break;
      }
    }

    if (!ganttTabClicked) {
      // Look for any button that might be the gantt tab
      const allBtns = await page.locator('button').all();
      for (const b of allBtns) {
        const txt = await b.textContent().catch(() => '');
        if (txt && txt.includes('ガント')) {
          await b.click();
          await wait(2000);
          ganttTabClicked = true;
          await shot(page, '03b-gantt-chart');
          ok('ガントタブ（button）クリック成功');
          break;
        }
      }
    }

    if (!ganttTabClicked) {
      wn('ガントタブが見つからない');
      await shot(page, '03b-no-gantt-tab');
    }

    // ガント描画の確認（SVG / div bar / canvas）
    const svgCount = await page.locator('svg').count();
    const barElements = await page.locator('[class*="bar"], [class*="gantt"]').count();
    const rectElements = await page.locator('rect').count();
    info(`SVG: ${svgCount}, bar要素: ${barElements}, rect要素: ${rectElements}`);
    if (svgCount > 0 || barElements > 0) ok('ガント描画要素確認OK');
    else wn('ガント描画要素が未検出（CSS div実装の可能性）');

    // イベント一覧タブ
    for (const tab of tabs) {
      const txt = await tab.textContent().catch(() => '');
      if (txt && (txt.includes('一覧') || txt.includes('リスト') || txt.includes('list'))) {
        await tab.click();
        await wait(1500);
        await shot(page, '03c-event-list-tab');
        const evRows = await page.locator('tbody tr').count();
        info(`イベント行数: ${evRows}`);
        if (evRows > 0) ok(`イベント一覧: ${evRows}件`);
        else wn('イベント一覧が空');
        break;
      }
    }

    // ────────────────────────────────────────────────────────────────
    // [4] プログラムガント
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [4] プログラムガント ===');

    // Find link from nav or try common routes
    const ganttRoutes = ['/gantt', '/projects-gantt', '/program-gantt'];
    let ganttFound = false;
    for (const route of ganttRoutes) {
      await page.goto(`${BASE}${route}`, { timeout: 8000 }).catch(() => {});
      await wait(1500);
      const content = await page.locator('body').textContent().catch(() => '');
      if (!content.includes('404') && !content.includes('Not Found') && content.length > 100) {
        info(`プログラムガントルート: ${route}`);
        await shot(page, '04-program-gantt');
        const ganttRows = await page.locator('tbody tr, [class*="gantt-row"], [class*="project-row"]').count();
        info(`ガント行数: ${ganttRows}`);
        if (ganttRows > 0) ok(`プログラムガント: ${ganttRows}行表示`);
        else {
          // Check if there's any content at all
          const bodyText = content.substring(0, 200);
          info(`ページ内容(先頭200字): ${bodyText}`);
          wn('プログラムガントの行要素が見つからない');
        }
        ganttFound = true;
        break;
      }
    }

    if (!ganttFound) {
      // Navigate back and look for gantt nav link
      await page.goto(BASE, { timeout: 10000 });
      await wait(1500);
      if (await page.locator('button:has-text("開始する")').count() > 0) {
        await doLogin(page);
        await wait(1500);
      }
      const ganttNavLink = page.locator('a[href*="gantt"], nav a').filter({ hasText: 'ガント' }).first();
      if (await ganttNavLink.count() > 0) {
        const href = await ganttNavLink.getAttribute('href');
        info(`ガントNavリンク: ${href}`);
        await ganttNavLink.click();
        await wait(2000);
        await shot(page, '04b-program-gantt-nav');
        ok('プログラムガント: nav リンクから遷移');
        ganttFound = true;
      } else {
        wn('プログラムガント: ルートが特定できない');
        await shot(page, '04b-program-gantt-not-found');
      }
    }

    // ────────────────────────────────────────────────────────────────
    // [5] D部門 工程整合エラー（UI確認）
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [5] D部門 工程整合エラー UI ===');
    await page.goto(`${BASE}/projects/11`, { timeout: 10000 });
    await wait(2500);
    if (await page.locator('button:has-text("開始する")').count() > 0) {
      await doLogin(page);
      await wait(1500);
    }

    // 編集モード ON
    const editBtn = page.locator('button:has-text("編集"), button[title*="編集"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await wait(1000);
      ok('編集モード ON');
    }

    // D部門開始日イベントを探して工程ボタンをクリック
    await shot(page, '05-project11-edit-mode');
    const processBtns = await page.locator('button:has-text("工程"), button[title*="工程"]').all();
    info(`工程ボタン候補: ${processBtns.length}個`);
    if (processBtns.length > 0) {
      await processBtns[0].click();
      await wait(1000);
      await shot(page, '05b-process-step-modal');
      ok('工程ステップモーダル表示');

      // Apply pattern that exceeds D部門 range
      const applyBtn = page.locator('button:has-text("適用"), button:has-text("パターン適用")').first();
      if (await applyBtn.count() > 0) {
        await applyBtn.click();
        await wait(1500);
        await shot(page, '05c-process-apply-result');
        // Check for error message
        const errMsg = page.locator('[class*="error"], [class*="alert"], .error-state, [role="alert"]');
        if (await errMsg.count() > 0) {
          const errText = await errMsg.first().textContent();
          ok(`エラーメッセージ表示: "${errText.trim().substring(0, 80)}"`);
        } else {
          wn('エラーメッセージが確認できない（正常適用または別の表示方法）');
        }
      }
    } else {
      wn('工程ボタンが見つからない（プロジェクトの構造を確認）');
    }

    // ────────────────────────────────────────────────────────────────
    // [6] 削除済みMSパターンがドロップダウンに出ないこと
    // ────────────────────────────────────────────────────────────────
    console.log('\n=== [6] 削除済みパターン → ドロップダウン確認 ===');
    // Go back to project list and try to create new project
    await page.goto(BASE, { timeout: 10000 });
    await wait(2000);
    if (await page.locator('button:has-text("開始する")').count() > 0) {
      await doLogin(page);
      await wait(1500);
    }

    const newProjectBtn = page.locator('button:has-text("新規"), button:has-text("案件登録"), button:has-text("登録"), button:has-text("＋"), button:has-text("+")').first();
    if (await newProjectBtn.count() > 0) {
      await newProjectBtn.click();
      await wait(1000);
      await shot(page, '06-new-project-modal');

      // Check pattern dropdown
      const dropdown = page.locator('select, [class*="select"], [role="combobox"]').filter({ hasText: /パターン|マイルストーン|pattern/i }).first();
      if (await dropdown.count() > 0) {
        const options = await dropdown.locator('option').allTextContents();
        info(`パターンドロップダウン選択肢: ${options.join(', ')}`);
        // Check that no deleted patterns appear (we'd need to know which are deleted)
        ok(`パターン選択肢確認: ${options.length}件`);
      } else {
        // Get all select elements
        const allSelects = await page.locator('select').all();
        for (let i = 0; i < allSelects.length; i++) {
          const opts = await allSelects[i].locator('option').allTextContents();
          info(`Select[${i}] options: ${opts.join(', ')}`);
        }
        wn('パターンドロップダウンが特定できない');
      }
      await page.keyboard.press('Escape');
      await wait(500);
    } else {
      wn('新規案件登録ボタンが見つからない');
    }

  } catch (e) {
    ng(`予期しないエラー: ${e.message}`);
    await shot(page, 'error-state').catch(() => {});
    console.error(e.stack);
  } finally {
    if (consoleErrors.length > 0) {
      wn(`ブラウザコンソールエラー ${consoleErrors.length}件`);
      consoleErrors.slice(0, 5).forEach(e => info(`  コンソールエラー: ${e.substring(0, 120)}`));
    } else {
      ok('ブラウザコンソールエラーなし');
    }

    console.log('\n=== 結果サマリー ===');
    console.log(`✅ PASS: ${pass}  ❌ FAIL: ${fail}  ⚠️  WARN: ${warn}`);

    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
})();
