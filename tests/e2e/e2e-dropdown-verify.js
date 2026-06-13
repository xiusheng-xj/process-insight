/**
 * 削除後ドロップダウン確認 + MSパターン一覧の最終確認
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SHOTS = path.join(__dirname, '..', '..', 'e2e-screenshots');
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `final-${name}.png`), fullPage: true });
  console.log(`  📸 final-${name}.png`);
}
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:6100', { timeout: 15000 });
  await wait(800);
  await page.evaluate(() => sessionStorage.setItem('userName', 'E2Eテスト担当者'));

  // [1] /milestone-patterns 一覧（削除済みE2Eパターンが消えているか）
  await page.goto('http://localhost:6100/milestone-patterns', { timeout: 10000 });
  await wait(2000);
  await shot(page, '01-mp-list-after-delete');
  const body1 = await page.locator('body').textContent();
  console.log('E2Eテスト用パターン一覧表示:', body1.includes('E2Eテスト用パターン') ? '❌ まだ表示されている' : '✅ 表示なし（正常）');
  console.log('パターン1（標準）一覧表示:', body1.includes('マイルストーンパターン1') ? '✅ 復元確認' : '⚠️  見えない');

  // 「無効も表示」トグルを確認
  const toggleLabel = await page.locator('label, input[type="checkbox"]').filter({ hasText: /無効|非表示|削除/ }).first();
  if (await toggleLabel.count() > 0) {
    await toggleLabel.click({ force: true });
    await wait(1000);
    await shot(page, '01b-mp-list-with-inactive');
    const body2 = await page.locator('body').textContent();
    console.log('非表示含む後のE2E表示:', body2.includes('E2Eテスト用パターン') ? '✅ 削除済みパターンが見える（期待通り）' : '⚠️  まだ見えない');
  }

  // [2] 案件登録 ドロップダウン確認
  await page.goto('http://localhost:6100', { timeout: 10000 });
  await wait(2000);
  await page.evaluate(() => sessionStorage.setItem('userName', 'E2Eテスト担当者'));
  await page.goto('http://localhost:6100', { timeout: 10000 });
  await wait(2000);

  const newBtn = page.locator('button').filter({ hasText: '新規案件' }).first();
  if (await newBtn.count() > 0) {
    await newBtn.click({ force: true });
    await wait(1000);
    await shot(page, '02-new-project-dropdown');

    const selects = await page.locator('select').all();
    for (const sel of selects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o.includes('標準') || o.includes('簡易') || o.includes('EOL'))) {
        console.log(`\nフローパターン選択肢:`);
        opts.forEach(o => console.log(`  - "${o}"`));
        const hasE2E = opts.some(o => o.includes('E2Eテスト'));
        const hasStd = opts.some(o => o.includes('標準') || o.includes('1：'));
        console.log(`\n削除済みパターン非表示: ${!hasE2E ? '✅' : '❌'}`);
        console.log(`パターン1（標準）が表示: ${hasStd ? '✅' : '⚠️'}`);
        break;
      }
    }
  }

  await browser.close();
  console.log('\n完了');
})();
