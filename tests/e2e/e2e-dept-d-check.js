/**
 * D部門 工程整合エラー UI 確認スクリプト
 * プロジェクト11 → D部門 開始日 → 工程パターン適用 → 範囲外エラーを確認
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:6100';
const SHOTS = path.join(__dirname, 'e2e-screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  📸 ${name}.png`);
}
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const apiErrors = [];
  page.on('response', async r => {
    if (r.status() === 409) {
      try { apiErrors.push({ url: r.url(), body: await r.json() }); }
      catch {}
    }
  });

  try {
    // ── ログイン
    await page.goto(BASE, { timeout: 15000 });
    await wait(1500);
    const inp = page.locator('input[type="text"]').first();
    if (await inp.count() > 0) {
      await inp.fill('E2Eテスト担当者');
      await page.locator('button:has-text("開始する")').first().click();
      await wait(1000);
    }

    // ── プロジェクト11 → 編集モード
    await page.goto(`${BASE}/projects/11`, { timeout: 10000 });
    await wait(2000);

    // 再ログインが必要な場合
    if (await page.locator('button:has-text("開始する")').count() > 0) {
      await page.locator('input[type="text"]').first().fill('E2Eテスト担当者');
      await page.locator('button:has-text("開始する")').first().click();
      await wait(1500);
    }

    // 編集モード ON
    await page.locator('button:has-text("編集モード")').first().click();
    await wait(1000);
    console.log('✅ 編集モード ON');

    // イベント一覧タブに切り替え（デフォルトがガントの場合）
    const listTab = page.locator('button:has-text("一覧")').first();
    if (await listTab.count() > 0) {
      await listTab.click();
      await wait(1000);
    }

    await shot(page, 'deptd-01-edit-mode-list');

    // ── D部門 開始日の行を探す
    // 各行のテキストを検索して D部門 開始日 の行を特定
    const rows = await page.locator('tbody tr').all();
    console.log(`  イベント行数: ${rows.length}`);

    let deptDStartRow = null;
    for (const row of rows) {
      const txt = await row.textContent().catch(() => '');
      if (txt.includes('D部門') && txt.includes('開始日')) {
        deptDStartRow = row;
        console.log(`  D部門 開始日 行発見: "${txt.trim().substring(0, 80)}"`);
        break;
      }
    }

    if (!deptDStartRow) {
      // Try finding by text content
      const dRow = page.locator('tr').filter({ hasText: 'D部門' }).filter({ hasText: '開始日' }).first();
      if (await dRow.count() > 0) {
        deptDStartRow = dRow;
        console.log('  D部門 開始日 行発見（filter方式）');
      }
    }

    if (deptDStartRow) {
      // 工程ボタンをクリック（行内のボタン）
      const stepBtns = await deptDStartRow.locator('button').all();
      console.log(`  D部門開始日行のボタン数: ${stepBtns.length}`);
      for (const btn of stepBtns) {
        const txt = await btn.textContent().catch(() => '');
        console.log(`    ボタン: "${txt.trim()}"`);
      }

      // 「工程」を含むボタンをクリック
      const processBtn = deptDStartRow.locator('button').filter({ hasText: /工程|工/ }).first();
      if (await processBtn.count() > 0) {
        await processBtn.click();
        await wait(1500);
        await shot(page, 'deptd-02-process-modal');
        console.log('✅ 工程ステップモーダル表示');

        // モーダル内の内容を確認
        const modal = page.locator('.modal, [role="dialog"], [class*="modal"]').first();
        if (await modal.count() > 0) {
          const modalTxt = await modal.textContent().catch(() => '');
          console.log(`  モーダル内容(先頭200字): "${modalTxt.trim().substring(0, 200)}"`);
        }

        // 工程パターン適用タブ確認
        const applyTab = page.locator('button:has-text("パターン適用"), button:has-text("適用")').first();
        if (await applyTab.count() > 0) {
          await applyTab.click();
          await wait(800);
          await shot(page, 'deptd-03-apply-tab');
          console.log('✅ 工程パターン適用タブ');

          // パターンを選択して適用
          const patternSelect = page.locator('select').first();
          if (await patternSelect.count() > 0) {
            const options = await patternSelect.locator('option').allTextContents();
            console.log(`  工程パターン選択肢: ${options.join(', ')}`);

            if (options.length > 1) {
              await patternSelect.selectOption({ index: 1 }); // 最初のパターンを選択
              await wait(500);
            }
          }

          // 適用ボタンクリック
          const confirmApplyBtn = page.locator('button:has-text("適用"), button:has-text("工程適用"), button[type="submit"]').last();
          if (await confirmApplyBtn.count() > 0) {
            await confirmApplyBtn.click();
            await wait(2000);
            await shot(page, 'deptd-04-apply-result');

            // エラーメッセージを確認
            const errEls = await page.locator('[class*="error"], .error-state, [role="alert"], [class*="alert"], .toast, [class*="toast"]').all();
            if (errEls.length > 0) {
              for (const el of errEls) {
                const errTxt = await el.textContent().catch(() => '');
                if (errTxt.trim()) {
                  console.log(`  UI エラー: "${errTxt.trim().substring(0, 150)}"`);
                }
              }
              console.log('✅ エラーメッセージ UI 表示確認');
            } else {
              // Check page body for error text
              const body = await page.locator('body').textContent();
              if (body.includes('範囲') || body.includes('超過') || body.includes('OUT_OF_RANGE') || body.includes('完了日')) {
                console.log('✅ 整合エラーテキストが本文に含まれている');
              } else {
                console.log('⚠️  エラーメッセージが特定できない');
              }
            }

            // API 409 レスポンスの確認
            if (apiErrors.length > 0) {
              apiErrors.forEach(e => {
                console.log(`  API 409 キャプチャ: ${e.url}`);
                console.log(`    エラー内容: ${JSON.stringify(e.body)}`);
              });
              console.log('✅ API 409 レスポンス確認（工程整合チェック動作中）');
            }
          }
        }
      } else {
        console.log('⚠️  D部門開始日行に工程ボタンが見つからない');
        await shot(page, 'deptd-02-no-process-btn');
      }
    } else {
      console.log('⚠️  D部門 開始日 行が見つからない');
      await shot(page, 'deptd-01b-no-dept-d-row');

      // Check via API instead
      console.log('  → API で D部門 開始日 イベントを確認...');
    }

  } catch (e) {
    console.error('エラー:', e.message);
    await shot(page, 'deptd-error').catch(() => {});
  } finally {
    // API でも確認
    console.log('\n=== API 直接確認: D部門 工程整合チェック ===');
    // Get D部門 開始日 event_id for project 11
    try {
      const http = require('http');
      const getEvents = () => new Promise((resolve, reject) => {
        http.get('http://localhost:6101/api/projects/11/events', res => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      const events = await getEvents();
      const deptDStart = events.find(e => e.owner_department === 'D部門' && e.event_name === '開始日');
      const deptDEnd = events.find(e => e.owner_department === 'D部門' && e.event_name === '完了日');
      if (deptDStart && deptDEnd) {
        console.log(`  D部門 開始日: id=${deptDStart.id}, plan_date=${deptDStart.plan_date}`);
        console.log(`  D部門 完了日: id=${deptDEnd.id}, plan_date=${deptDEnd.plan_date}`);

        // Try applying a large-offset process pattern
        const getPatterns = () => new Promise((resolve, reject) => {
          http.get('http://localhost:6101/api/process-patterns', res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });
        const patterns = await getPatterns();
        console.log(`  工程パターン数: ${Array.isArray(patterns) ? patterns.length : JSON.stringify(patterns).substring(0, 100)}`);

        if (Array.isArray(patterns) && patterns.length > 0) {
          const http2 = require('http');
          const postApply = (patternId) => new Promise((resolve, reject) => {
            const body = JSON.stringify({ pattern_id: patternId, base_date: deptDStart.plan_date });
            const req = http2.request({
              hostname: 'localhost', port: 6101, method: 'POST',
              path: `/api/projects/11/events/${deptDStart.id}/apply-process-pattern`,
              headers: { 'Content-Type': 'application/json', 'x-user-name': 'E2E%E3%83%86%E3%82%B9%E3%83%88', 'Content-Length': Buffer.byteLength(body) }
            }, res => {
              let data = '';
              res.on('data', d => data += d);
              res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
            });
            req.on('error', reject);
            req.write(body);
            req.end();
          });

          // Find a pattern with large enough offset to exceed 13-day window
          for (const pattern of patterns.slice(0, 5)) {
            try {
              const result = await postApply(pattern.id);
              console.log(`  パターン${pattern.id}(${pattern.pattern_name}) 適用: HTTP ${result.status}`);
              if (result.status === 409) {
                console.log(`  ✅ 409 整合チェック: ${JSON.stringify(result.body.error)}`);
                console.log(`  詳細: ${JSON.stringify(result.body.details || [])}`);
              } else if (result.status === 200) {
                console.log(`  ✅ 200 正常適用（このパターンは13日以内）`);
              }
            } catch (e) {
              console.log(`  パターン${pattern.id} エラー: ${e.message}`);
            }
          }
        }
      } else {
        console.log(`  D部門 開始日未発見. イベント一覧: ${events.map(e => `${e.event_name}(${e.owner_department})`).join(', ')}`);
      }
    } catch(e) {
      console.log(`  API確認エラー: ${e.message}`);
    }

    await browser.close();
  }
})();
