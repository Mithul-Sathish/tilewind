// quick look: home + mid-hand at desk and phone. node shoot.js FILE OUTPREFIX [sizes]
const { chromium } = require('playwright');
const [,, FILE, OUT, WHICH] = process.argv;
const ALL = { desk: [1280, 800, false], phone: [390, 844, true], land: [844, 390, true], wide: [1600, 900, false] };
const SIZES = (WHICH || 'desk,phone').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const nm of SIZES){
    const [w, h, mob] = ALL[nm]; const t0 = Date.now();
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mob, isMobile: mob });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 8) & 0xffffff) / 16777216; };
      const today = new Date(); const k = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'casual', intro: 9, hands: 14, wins: 5, games: 3, xp: 420, themePts: 3, cosPts: 2, days: { last: k, run: 3, best: 4 }, quests: { day: k, done: {}, hands: 2 } })); });
    await p.goto('file://' + FILE);
    await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
    if (process.env.TIER) await p.evaluate(t => TW_api.V.setTier(t), +process.env.TIER);
    const snap = async n => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}-${nm}-${n}.png`, timeout: 180000 }); };
    if (!process.env.NOHOME){ await p.waitForTimeout(2500); await snap('home'); }
    if (process.env.ONLYHOME){ console.log(nm, (Date.now()-t0)/1000+'s', errs.join(' | ') || 'ok'); await ctx.close(); continue; }
    await p.evaluate(() => { window.TW_fast = true; TW_api.startGame('play'); });
    let turns = 0;
    for (let i = 0; i < 800 && turns < (+process.env.TURNS || 9); i++){
      const st = await p.evaluate(() => { const S = TW_state(); return S && S.ui && S.ui.mode || 'wait'; });
      if (st === 'discard'){ turns++; if (turns >= (+process.env.TURNS || 9)) break; await p.evaluate(() => { const ui = TW_state().ui; const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); }); }
      else if (st === 'claim') await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'pung'); ui.resolve(a ? a.value : null); });
      else if (st === 'read' || st === 'chowpick') await p.evaluate(() => { const ui = TW_state().ui; ui.mode === 'chowpick' ? ui.resolve(ui.starts[0]) : ui.resolve(); });
      else await p.waitForTimeout(100);
    }
    await p.evaluate(() => { window.TW_fast = false; }); await p.waitForTimeout(3000); await snap('play');
    if (process.env.SLIP){
      for (let i = 0; i < 900; i++){
        const st = await p.evaluate(() => { const S = TW_state(); if (document.querySelector('.slip')) return 'slip'; return S && S.ui && S.ui.mode || 'wait'; });
        if (st === 'slip') break;
        if (st === 'claim') await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'win') || ui.actions.find(a => a.kind === 'pung'); ui.resolve(a ? a.value : null); });
        else if (st === 'discard') await p.evaluate(() => { window.TW_fast = true; const S = TW_state(), ui = S.ui; const a = (ui.actions || []).find(a => a.kind === 'win'); if (a) return ui.resolve(a.value); const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); });
        else if (st === 'read' || st === 'chowpick') await p.evaluate(() => { const ui = TW_state().ui; ui.mode === 'chowpick' ? ui.resolve(ui.starts[0]) : ui.resolve(); });
        else await p.waitForTimeout(150);
      }
      await p.evaluate(() => { window.TW_fast = false; }); await p.waitForTimeout(1600); await snap('win0');
      await p.waitForTimeout(2500); await p.evaluate(() => { const S = TW_state(); S && S.slipSkip && S.slipSkip(); }); await snap('slip');
    }
    console.log(nm, (Date.now()-t0)/1000+'s', errs.join(' | ') || 'ok');
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
