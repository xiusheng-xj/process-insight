/**
 * D部門 工程整合エラー UI 確認 + 工程ステップモーダル表示
 * sessionStorage を直接セットしてログインモーダルをスキップ
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:6100';
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

  // sessionStorage を直接セットしてログインをスキップ
  await page.goto(BASE, { timeout: 15000 });
  await wait(800);
  await page.evaluate(() => {
    sessionStorage.setItem('userName', 'E2Eテスト担当者');
  });
  await page.goto(`${BASE}/projects/11`, { timeout: 10000 });
  await wait(2500);

  // ロックバナーが出ていればログイン済み
  const locked = await page.locator('text=編集モード').count();
  console.log(`編集モードボタン存在: ${locked > 0 ? 'YES' : 'NO'}`);
  await shot(page, 'deptd-ui-01-loaded');

  // 編集モード ON
  await page.locator('button:has-text("編集モード")').first().click();
  await wait(1000);
  await shot(page, 'deptd-ui-02-edit-mode');
  console.log('✅ 編集モード ON');

  // イベント一覧タブ
  const listTabBtn = page.locator('button:has-text("一覧")').first();
  if (await listTabBtn.count() > 0) {
    await listTabBtn.click();
    await wait(1000);
  }
  await shot(page, 'deptd-ui-03-list-tab');

  // D部門 開始日 の行を探す（text マッチ）
  const dRow = page.locator('tr').filter({ hasText: 'D部門' }).filter({ hasText: '開始日' }).first();
  const dRowCount = await dRow.count();
  console.log(`D部門 開始日 行: ${dRowCount}件`);

  if (dRowCount > 0) {
    await shot(page, 'deptd-ui-04-dept-d-row');

    // 工程ボタンを探す
    const btnLabels = [];
    for (const btn of await dRow.locator('button').all()) {
      btnLabels.push((await btn.textContent().catch(() => '')).trim());
    }
    console.log(`  D部門開始日行のボタン: [${btnLabels.join('] [')}]`);

    // 工程/工 を含むボタン
    const stepBtn = dRow.locator('button').filter({ hasText: /^工/ }).first();
    if (await stepBtn.count() > 0) {
      await stepBtn.scrollIntoViewIfNeeded();
      await stepBtn.click();
      await wait(1500);
      await shot(page, 'deptd-ui-05-step-modal');
      console.log('✅ 工程ステップモーダルを開いた');

      // モーダルのタブを確認
      const modalTabs = await page.locator('[role="dialog"] button, .modal button, [class*="modal"] button').all();
      const modalBtnTxts = [];
      for (const b of modalTabs) { modalBtnTxts.push((await b.textContent().catch(() => '')).trim()); }
      console.log(`  モーダルボタン: [${modalBtnTxts.join('] [')}]`);

      // 「パターン適用」タブ
      const applyTabBtn = page.locator('button:has-text("パターン適用"), [role="tab"]:has-text("適用")').first();
      if (await applyTabBtn.count() > 0) {
        await applyTabBtn.click();
        await wait(800);
        await shot(page, 'deptd-ui-06-apply-tab');
        console.log('✅ パターン適用タブ');
      }

      // セレクトボックスから最初のパターンを選択（標準工程 = 20日オフセット > 13日ウィンドウ）
      const selects = await page.locator('select').all();
      let patternSelected = false;
      for (const sel of selects) {
        const opts = await sel.locator('option').allTextContents();
        console.log(`  セレクト選択肢: ${opts.join(', ')}`);
        if (opts.length > 1) {
          // 標準工程を選択（最初の非空選択肢）
          const nonEmpty = opts.filter(o => o.trim() && !o.includes('選択'));
          if (nonEmpty.length > 0) {
            await sel.selectOption({ label: nonEmpty[0] });
            await wait(500);
            patternSelected = true;
            console.log(`  パターン選択: "${nonEmpty[0]}"`);
            break;
          }
        }
      }

      // 適用ボタン
      if (patternSelected) {
        const applyExecBtn = page.locator('button:has-text("適用"), button[type="submit"]').last();
        if (await applyExecBtn.count() > 0) {
          await applyExecBtn.click();
          await wait(2000);
          await shot(page, 'deptd-ui-07-apply-result');

          // エラー表示を探す
          const body = await page.locator('body').textContent();
          const errorKeywords = ['範囲', '超過', 'エラー', 'OUT_OF_RANGE', '完了日', 'PROCESS_SCHEDULE'];
          const hasError = errorKeywords.some(k => body.includes(k));

          // 画面上のアラート/エラー要素
          const errEls = page.locator('[class*="error"], [class*="alert"], [role="alert"], .toast, [class*="toast"], [class*="warning"]');
          const errCount = await errEls.count();
          console.log(`  エラー要素数: ${errCount}, エラーキーワードあり: ${hasError}`);

          if (errCount > 0) {
            for (let i = 0; i < Math.min(errCount, 3); i++) {
              const t = await errEls.nth(i).textContent().catch(() => '');
              if (t.trim()) console.log(`  エラーメッセージ[${i}]: "${t.trim().substring(0, 200)}"`);
            }
          }

          if (captured409.length > 0) {
            console.log('✅ HTTP 409 キャプチャ済み:');
            captured409.forEach(r => console.log(`    ${JSON.stringify(r).substring(0, 200)}`));
          } else if (hasError) {
            console.log('✅ エラーキーワードが画面上に存在');
          } else {
            console.log('⚠️  エラー表示が確認できない（正常適用の可能性）');
          }
        }
      }
    } else {
      console.log('⚠️  工程ボタンが見つからない');
      await shot(page, 'deptd-ui-no-step-btn');
    }
  } else {
    console.log('⚠️  D部門 開始日 行が見つからない');
    await shot(page, 'deptd-ui-no-dept-d');
  }

  await browser.close();
  console.log('\n完了');
})();
