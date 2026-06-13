/**
 * MSパターン 削除フロー専用確認スクリプト
 * E2E_DEL_TEST パターンを論理削除して、ドロップダウンから消えることを確認
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SHOTS = path.join(__dirname, '..', '..', 'e2e-screenshots');
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `del-${name}.png`), fullPage: true });
  console.log(`  📸 del-${name}.png`);
}
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // まず API でテスト用パターンが存在するか確認・なければ再作成
  const http = require('http');
  const getPatterns = () => new Promise((resolve, reject) => {
    http.get('http://localhost:6101/api/milestone-patterns?include_inactive=true', res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
    }).on('error', reject);
  });
  const post = (path, body) => new Promise((resolve, reject) => {
    const s = JSON.stringify(body);
    const req = http.request({ hostname: 'localhost', port: 6101, method: 'POST', path,
      headers: { 'Content-Type': 'application/json', 'x-user-name': 'E2E%E3%83%86%E3%82%B9%E3%83%88', 'Content-Length': Buffer.byteLength(s) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    req.on('error', reject); req.write(s); req.end();
  });

  const all = await getPatterns();
  const arr = Array.isArray(all) ? all : (all || []);
  let testPat = arr.find(p => p.pattern_code === 'E2E_DEL_TEST' && !p.deleted_at);
  if (!testPat) {
    const r = await post('/api/milestone-patterns', {
      pattern_name: 'E2Eテスト用パターン（削除確認）',
      pattern_code: 'E2E_DEL_TEST',
      description: 'E2E削除確認用', is_active: true, events: []
    });
    testPat = r.body;
    console.log(`✅ テスト用パターン再作成: id=${testPat.id}`);
  } else {
    console.log(`✅ テスト用パターン確認: id=${testPat.id}`);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // sessionStorage でログインスキップ
  await page.goto('http://localhost:6100', { timeout: 15000 });
  await wait(800);
  await page.evaluate(() => sessionStorage.setItem('userName', 'E2Eテスト担当者'));
  await page.goto('http://localhost:6100/milestone-patterns', { timeout: 10000 });
  await wait(2000);
  await shot(page, '01-list');

  // ページ内にテスト用パターンが表示されているか確認
  const bodyText = await page.locator('body').textContent();
  if (!bodyText.includes('E2Eテスト用パターン')) {
    console.log('⚠️  テスト用パターンが画面上に見つからない - ページを再読み込み');
    await page.reload();
    await wait(2000);
  }

  // テスト用パターンの行（含む E2Eテスト用パターン）のすべてのボタンをJSで取得
  const deleteClicked = await page.evaluate((targetName) => {
    // すべての「削除」ボタンを探し、その近くにターゲット名のテキストがある行を特定
    const allBtns = Array.from(document.querySelectorAll('button'));
    const deleteBtns = allBtns.filter(b => b.textContent.trim() === '削除');

    for (const btn of deleteBtns) {
      // 親要素をたどってターゲット名を含む要素を探す
      let el = btn;
      for (let i = 0; i < 10; i++) {
        if (el.textContent.includes(targetName)) {
          btn.click();
          return { clicked: true, parentText: el.textContent.substring(0, 80) };
        }
        if (!el.parentElement) break;
        el = el.parentElement;
      }
    }
    return { clicked: false, total: deleteBtns.length };
  }, 'E2Eテスト用パターン');

  console.log(`  削除ボタンクリック: ${JSON.stringify(deleteClicked)}`);
  await wait(1500);
  await shot(page, '02-delete-modal');

  // 削除モーダルが表示されたか確認
  const modalTitle = await page.locator('body').textContent();
  const hasDeleteModal = modalTitle.includes('削除する') || modalTitle.includes('削除理由') || modalTitle.includes('理由');
  console.log(`  削除モーダル表示: ${hasDeleteModal}`);

  if (hasDeleteModal) {
    console.log('✅ 削除確認モーダル表示');

    // 削除理由テキストエリアに入力
    const ta = page.locator('textarea').last();
    if (await ta.count() > 0) {
      await ta.fill('E2Eテスト自動削除 — 削除フロー確認用');
      await wait(300);
      console.log('✅ 削除理由入力');
    }
    await shot(page, '03-reason-filled');

    // 「削除する」ボタンをJSで直接クリック
    const confirmResult = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b =>
        b.textContent.trim() === '削除する' ||
        b.textContent.trim() === '論理削除する' ||
        (b.textContent.includes('削除') && !b.textContent.includes('キャンセル') && b.classList.toString().includes('danger'))
      );
      if (target) { target.click(); return { clicked: true, text: target.textContent.trim() }; }
      // fallback: 赤いボタンを探す
      const redBtn = btns.find(b => {
        const style = b.getAttribute('class') || '';
        return (style.includes('danger') || style.includes('red')) && b.textContent.includes('削除');
      });
      if (redBtn) { redBtn.click(); return { clicked: true, text: redBtn.textContent.trim(), type: 'red' }; }
      return { clicked: false, available: btns.map(b => b.textContent.trim()).filter(t => t).join(' | ') };
    });
    console.log(`  削除確定クリック: ${JSON.stringify(confirmResult)}`);
    await wait(2000);
    await shot(page, '04-after-delete');

    // テスト用パターンが消えたか確認
    const afterText = await page.locator('body').textContent();
    const gone = !afterText.includes('E2Eテスト用パターン');
    if (gone) console.log('✅ 削除後、テスト用パターンが一覧から消えた');
    else console.log('⚠️  削除後もリストに残っている（非表示フラグが必要？）');
  } else {
    console.log('⚠️  削除確認モーダルが表示されなかった');
    // ページ上のモーダル要素を確認
    const modals = await page.locator('[class*="modal"], [role="dialog"]').all();
    for (const m of modals) {
      const t = await m.textContent().catch(() => '');
      if (t.trim()) console.log(`  モーダル: ${t.trim().substring(0, 100)}`);
    }
  }

  // [5] 案件登録ドロップダウン確認
  console.log('\n=== [5] 削除後ドロップダウン確認 ===');
  await page.goto('http://localhost:6100', { timeout: 10000 });
  await wait(2000);

  await page.evaluate(() => sessionStorage.setItem('userName', 'E2Eテスト担当者'));
  await wait(500);
  await page.goto('http://localhost:6100', { timeout: 10000 });
  await wait(2000);

  const newProjBtn = page.locator('button').filter({ hasText: '新規案件' }).first();
  if (await newProjBtn.count() > 0) {
    await newProjBtn.click({ force: true });
    await wait(1000);
    await shot(page, '05-new-project-modal');

    const selects = await page.locator('select').all();
    for (const sel of selects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o.includes('標準') || o.includes('簡易') || o.includes('EOL'))) {
        console.log(`  フローパターン選択肢: ${opts.join(', ')}`);
        const hasE2E = opts.some(o => o.includes('E2Eテスト'));
        if (!hasE2E) console.log('✅ 削除済みパターンがドロップダウンに表示されない');
        else console.log('❌ 削除済みパターンがまだドロップダウンに存在');
        break;
      }
    }
  }

  await browser.close();

  // DB確認
  console.log('\n=== DB確認: 論理削除状態 ===');
  const allAfter = await getPatterns();
  const arrAfter = Array.isArray(allAfter) ? allAfter : (allAfter || []);
  const e2ePat = arrAfter.find(p => p.pattern_code === 'E2E_DEL_TEST');
  if (e2ePat) {
    console.log(`  id=${e2ePat.id}, deleted_at=${e2ePat.deleted_at}, reason=${e2ePat.deleted_reason}`);
    if (e2ePat.deleted_at) console.log('✅ 論理削除 confirmed: deleted_at セット済み');
    else console.log('⚠️  deleted_at が未設定');
  } else {
    console.log('  取得できず（include_inactive=true でも見えない）');
  }
  console.log('完了');
})();
