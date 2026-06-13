/**
 * D部門 工程整合エラー UI 確認 v2 - JS click でオーバーレイ回避
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SHOTS = path.join(__dirname, 'e2e-screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  console.log(`  📸 ${name}.png`);
}
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const captured409 = [];
  page.on('response', async r => {
    if (r.status() === 409) {
      try { captured409.push(await r.json()); } catch {}
    }
  });

  // sessionStorage セット → ログインスキップ
  await page.goto('http://localhost:6100', { timeout: 15000 });
  await wait(800);
  await page.evaluate(() => sessionStorage.setItem('userName', 'E2Eテスト担当者'));

  // プロジェクト11 ロードと編集モード
  await page.goto('http://localhost:6100/projects/11', { timeout: 10000 });
  await wait(2500);
  await shot(page, 'deptd2-01-loaded');

  // 編集モードボタンクリック（force=true）
  await page.locator('button:has-text("編集モード")').click({ force: true });
  await wait(1500);
  await shot(page, 'deptd2-02-edit-mode');
  console.log('✅ 編集モード ON（force click）');

  // 一覧タブ
  const listTab = page.locator('button:has-text("一覧")').first();
  if (await listTab.count() > 0) { await listTab.click({ force: true }); await wait(800); }

  // D部門 開始日 の行を見つけて工程ボタンをクリック
  const dRow = page.locator('tr').filter({ hasText: 'D部門' }).filter({ hasText: '開始日' }).first();
  if (await dRow.count() === 0) {
    console.log('⚠️  D部門 開始日 行が見つからない');
    await shot(page, 'deptd2-no-row');
    await browser.close(); return;
  }

  // 「工程」ボタン（▼工程(N) ではなく独立した工程ボタン）
  const stepBtn = dRow.locator('button').filter({ hasText: /^工程$/ }).first();
  if (await stepBtn.count() === 0) {
    console.log('⚠️  工程ボタンが見つからない');
    await shot(page, 'deptd2-no-stepbtn');
    await browser.close(); return;
  }
  await stepBtn.click({ force: true });
  await wait(1500);
  await shot(page, 'deptd2-03-step-modal');
  console.log('✅ 工程ステップモーダル表示');

  // モーダル内要素をJSで直接操作
  // まず select を確認
  const selects = await page.locator('select').all();
  console.log(`  select要素数: ${selects.length}`);
  for (let i = 0; i < selects.length; i++) {
    const opts = await selects[i].locator('option').allTextContents();
    console.log(`  Select[${i}]: ${opts.join(', ')}`);
  }

  // 工程パターンセレクトに「標準工程」を選択
  const patternSelect = page.locator('select').first();
  if (await patternSelect.count() > 0) {
    const opts = await patternSelect.locator('option').all();
    let chosen = null;
    for (const opt of opts) {
      const val = await opt.getAttribute('value');
      const txt = await opt.textContent();
      if (val && val !== '') {
        chosen = val;
        console.log(`  パターン選択: "${txt}" (value=${val})`);
        break;
      }
    }
    if (chosen) {
      await patternSelect.selectOption(chosen);
      await wait(500);
    }
  }

  await shot(page, 'deptd2-04-pattern-selected');

  // 「パターンを適用」ボタンをJS直接クリック
  const applyResult = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === 'パターンを適用') {
        btn.click();
        return { clicked: true, text: btn.textContent.trim() };
      }
    }
    return { clicked: false };
  });
  console.log(`  パターンを適用 JS click: ${JSON.stringify(applyResult)}`);

  await wait(2500);
  await shot(page, 'deptd2-05-apply-result');

  // エラー表示確認
  const bodyText = await page.locator('body').textContent();
  const errorKeywords = ['範囲', '超過', '完了日', 'OUT_OF_RANGE', 'スケジュール', '先に', '変更して'];
  const found = errorKeywords.filter(k => bodyText.includes(k));
  console.log(`  エラーキーワード検出: [${found.join(', ')}]`);

  // 画面上のエラー要素
  const errTexts = [];
  for (const sel of ['[class*="error"]', '[class*="alert"]', '[role="alert"]', '.toast', '[class*="toast"]', '[class*="warning"]', '[class*="danger"]']) {
    const els = await page.locator(sel).all();
    for (const el of els) {
      const t = (await el.textContent().catch(() => '')).trim();
      if (t && !errTexts.includes(t)) errTexts.push(t.substring(0, 200));
    }
  }

  if (errTexts.length > 0) {
    console.log('✅ UI エラーメッセージ:');
    errTexts.forEach(t => console.log(`    "${t}"`));
  }

  if (captured409.length > 0) {
    console.log('\n✅ HTTP 409 キャプチャ:');
    captured409.forEach(r => {
      console.log(`  error: ${r.error}`);
      console.log(`  message: ${r.message}`);
      if (r.details) r.details.forEach(d =>
        console.log(`  詳細: ${d.process_name} → ${d.plan_date} > ${d.limit_date}`));
    });
  }

  if (errTexts.length === 0 && captured409.length === 0 && found.length === 0) {
    console.log('⚠️  エラー表示が確認できない（正常適用された可能性）');
    // Check if the process steps were added
    const stepRows = await page.locator('[class*="step-row"], tr[class*="step"]').count();
    console.log(`  工程ステップ行数: ${stepRows}`);
  }

  await browser.close();
  console.log('\n完了');
})();
