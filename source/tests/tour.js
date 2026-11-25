// Every screen, at three sizes: desktop, phone portrait, phone landscape. For before/after pictures and the polish pass.
const { chromium } = require('playwright');
const [,, FILE, OUT, PRE] = process.argv;
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const SIZES = process.env.SIZES ? JSON.parse(process.env.SIZES) : [['desk', 1280, 800, false], ['phone', 390, 844, true], ['land', 844, 390, true]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [nm, w, h, mob] of SIZES){
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mob, isMobile: mob });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 8) & 0xffffff) / 16777216; };
      const today = new Date(); const k = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'casual', intro: 9, hands: 14, wins: 5, games: 3, xp: 420, themePts: 3, cosPts: 2, days: { last: k, run: 3, best: 4 }, quests: { day: k, done: {}, hands: 2 } })); });
    await p.goto('file://' + FILE + (FILE.includes('?') ? '&' : '?') + 'online=ws://localhost:8799');
    await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
    const snap = async n => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${PRE}-${nm}-${n}.png` }); };
    await p.waitForTimeout(1500); await snap('1home');
    await p.evaluate(() => TW_api.openBook('menu')); await snap('2menu');
    await p.evaluate(() => TW_api.openBook('settings')); await snap('3settings');
    await p.evaluate(() => TW_api.openBook('hands')); await snap('4collection');
    await p.evaluate(() => { const t = document.querySelector('[data-tab="today"]'); t && t.click(); }); await snap('5today');
    await p.evaluate(() => { const t = document.querySelector('[data-tab="records"]'); t && t.click(); }); await snap('6records');
    await p.evaluate(() => { document.querySelector('[data-close]') && document.querySelector('[data-close]').click(); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.TW_fast = true; TW_api.startGame('play'); });
    await p.waitForFunction(() => { const S = TW_state(); return S && S.ui && S.ui.mode === 'discard'; }, null, { timeout: 120000 });
    await p.evaluate(() => { window.TW_fast = false; }); await p.waitForTimeout(2500); await snap('7play');
    // play on quickly until the hand ends, then show the slip
    for (let i = 0; i < 600; i++){
      const st = await p.evaluate(() => { const S = TW_state(); if (document.querySelector('.slip')) return 'slip'; return S && S.ui && S.ui.mode || 'wait'; });
      if (st === 'slip') break;
      if (st === 'claim'){ if (!fs.existsSync(`${OUT}/${PRE}-${nm}-8claim.png`)){ await p.evaluate(() => { window.TW_fast = false; }); await snap('8claim'); await p.evaluate(() => { window.TW_fast = true; }); } await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'win') || ui.actions.find(a => a.kind === 'pung'); ui.resolve(a ? a.value : null); }); }
      else if (st === 'discard') await p.evaluate(() => { window.TW_fast = true; const S = TW_state(), ui = S.ui; const a = (ui.actions || []).find(a => a.kind === 'win'); if (a) return ui.resolve(a.value); const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); });
      else if (st === 'read' || st === 'chowpick') await p.evaluate(() => { const ui = TW_state().ui; ui.mode === 'chowpick' ? ui.resolve(ui.starts[0]) : ui.resolve(); });
      else await p.waitForTimeout(150);
    }
    await p.evaluate(() => { window.TW_fast = false; }); await p.waitForTimeout(3500); await p.evaluate(() => { const S = TW_state(); S && S.slipSkip && S.slipSkip(); }); await snap('9slip');
    console.log(nm, 'errors:', errs.join(' | ') || 'none');
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
