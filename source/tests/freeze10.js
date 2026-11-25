// Ten full games (the default 4-hand game) through the real screens: deal, turns, calls, result slips, next game.
// Watches the page the whole time: any main-thread task over 200 ms, the longest gap between frames, and any stall of 60 s.
const { chromium } = require('playwright');
const [,, FILE, N = '10', W = '1366', H = '768'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +W, height: +H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'casual', intro: 9, settings: { difficulty: 1, calls: 'standard', pace: 'fast' } }));
    window.TW_long = []; window.TW_gap = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.TW_long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch(e){}
    let last = 0; const f = t => { if (last && window.TW_ready) window.TW_gap = Math.max(window.TW_gap, t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.goto('file://' + FILE + '?nogl=1'); await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
  const rows = []; let stuck = 0, hands = 0; const t0 = Date.now();
  for (let g = 0; g < +N; g++){
    await p.evaluate(() => { window.TW_fast = true; TW_api.startGame('play'); });
    let lastChange = Date.now(), lastKey = '', done = false;
    while (!done){
      const st = await p.evaluate(() => { const S = TW_state(), sl = document.querySelector('.slip'); return { slip: !!sl, last: !!(sl && !sl.querySelector('[data-r="next"]')), mode: S && S.ui && S.ui.mode, key: S ? S.handNo + ':' + S.wall.length + ':' + (S.ui && S.ui.mode) : 'none' }; });
      if (st.key !== lastKey){ lastKey = st.key; lastChange = Date.now(); }
      if (Date.now() - lastChange > 60000){ stuck++; rows.push(`game ${g + 1}: STUCK at ${st.key}`); break; }
      if (st.slip){ await p.waitForTimeout(600); hands++; await p.evaluate(() => { const S = TW_state(); S && S.slipSkip && S.slipSkip(); });
        await p.waitForTimeout(300);
        if (st.last){ done = true; await p.evaluate(() => { const h = document.querySelector('.slip [data-r="home"]'); h && h.click(); }); await p.waitForTimeout(800); break; }
        await p.evaluate(() => { const n = document.querySelector('.slip [data-r="next"]'); n && n.click(); }); await p.waitForTimeout(800); continue; }
      if (st.mode === 'claim') await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'win') || (Math.random() < .5 && ui.actions.find(a => a.kind !== 'pass')); ui.resolve(a ? a.value : null); });
      else if (st.mode === 'discard') await p.evaluate(() => { const ui = TW_state().ui; const a = (ui.actions || []).find(a => a.kind === 'win'); if (a) return ui.resolve(a.value); const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); });
      else if (st.mode === 'chowpick') await p.evaluate(() => TW_state().ui.resolve(TW_state().ui.starts[0]));
      else if (st.mode === 'read') await p.evaluate(() => TW_state().ui.resolve());
      else await p.waitForTimeout(100);
    }
    const m = await p.evaluate(() => { const l = window.TW_long.splice(0), g = window.TW_gap; window.TW_gap = 0; return { over200: l.filter(x => x > 200).length, longest: l.length ? Math.max(...l) : 0, gap: Math.round(g) }; });
    rows.push(`game ${g + 1}: done; tasks over 200 ms: ${m.over200}; longest task ${m.longest} ms; longest gap between frames ${m.gap} ms`);
  }
  rows.push(`${N} games, ${hands} hands, stuck ${stuck}, errors ${errs.join(' | ') || 'none'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  console.log(rows.join('\n')); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
