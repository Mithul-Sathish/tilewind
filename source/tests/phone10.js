// Ten phone hands (5 portrait, 5 landscape) with real touch events. Before every throw the "player" fumbles:
// a stray single tap on a tile, a tap on a second tile, a sideways swipe along the rack, a tap on the felt.
// Any of those throwing a tile counts as an accidental discard. Then a deliberate throw: tap the tile twice.
const { chromium } = require('playwright');
const [,, FILE, OUT] = process.argv;
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = []; let accidents = 0, fumbles = 0, throws = 0, minRack = 99, minDisc = 99;
  for (const [nm, w, h] of [['portrait', 390, 844], ['landscape', 844, 390]].filter(x => !process.env.ONLY || x[0] === process.env.ONLY)){
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'new', intro: 9, settings: { coach: 2, helpers: true, calls: 'guided', difficulty: 0, big: true, pace: 'fast' } })));
    await p.goto('file://' + FILE + '?nogl=1');
    await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
    for (let hand = 0; hand < 5; hand++){
      await p.evaluate(() => TW_api.startGame('play'));
      let shot = false;
      for (let k = 0; k < 500; k++){
        const st = await p.evaluate(() => { const S = TW_state(); if (document.querySelector('.slip')) return { slip: 1 }; return { mode: S && S.ui && S.ui.mode, n: S ? S.players[0].hand.length : 0, d: S ? S.players[0].discards.length : 0 }; });
        if (st.slip) break;
        if (st.mode === 'claim'){ await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'win'); ui.resolve(a ? a.value : null); }); continue; }
        if (st.mode === 'read'){ await p.evaluate(() => TW_state().ui.resolve()); continue; }
        if (st.mode !== 'discard'){ await p.waitForTimeout(120); continue; }
        const win = await p.evaluate(() => { const ui = TW_state().ui; const a = (ui.actions || []).find(a => a.kind === 'win'); if (a){ ui.resolve(a.value); return true; } return false; }); if (win) continue;
        const pos = await p.evaluate(() => { const S = TW_state(), me = S.players[0]; const pts = me.hand.map(x => ({ id: x.id, q: TW_api.V.handXY(x.id) })).filter(o => o.q); pts.sort((a, b) => a.q.x - b.q.x);
          const gaps = []; for (let i = 1; i < pts.length; i++){ const dx = pts[i].q.x - pts[i - 1].q.x, dy = Math.abs(pts[i].q.y - pts[i - 1].q.y); if (dy < 5 && dx > 5) gaps.push(dx); }
          return { pts: pts.map(o => ({ id: o.id, x: o.q.x, y: o.q.y })), step: gaps.length ? Math.min(...gaps) : null }; });
        if (pos.step) minRack = Math.min(minRack, pos.step);
        if (!shot){ await p.screenshot({ path: `${OUT}/${nm}-${hand}.png` }); shot = true; }
        const before = await p.evaluate(() => TW_state().players[0].discards.length);
        const rnd = a => a[Math.floor(Math.random() * a.length)];
        const A = rnd(pos.pts), B = rnd(pos.pts.filter(o => o.id !== A.id)) || A;
        const dn = async () => p.evaluate(() => TW_state() && TW_state().players[0].discards.length); const step = [];
        await p.touchscreen.tap(A.x, A.y); await p.waitForTimeout(450); step.push(await dn());          // a stray tap
        await p.touchscreen.tap(B.x, B.y); await p.waitForTimeout(450); step.push(await dn());          // changed their mind
        const cdp = await ctx.newCDPSession(p);                                   // a sideways swipe along the rack
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: A.x, y: A.y }] });
        for (let s = 1; s <= 6; s++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: A.x + s * 9, y: A.y + (s % 2) * 3 }] }); await p.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(350); step.push(await dn());
        await p.touchscreen.tap(w / 2, h * .3); await p.waitForTimeout(350);    // a tap on the felt
        fumbles += 4;
        const after = await p.evaluate(() => TW_state() && TW_state().players[0].discards.length);
        if (after !== before){ accidents++; report.push(`${nm} hand ${hand + 1}: a fumble threw a tile (before ${before}, after steps ${step.join(',')},${after}; A ${A.id}@${Math.round(A.x)},${Math.round(A.y)} B ${B.id}@${Math.round(B.x)},${Math.round(B.y)})`); continue; }
        // the deliberate throw: tap the same tile twice
        const ok = await p.evaluate(() => { const S = TW_state(); return S && S.ui && S.ui.mode === 'discard'; }); if (!ok) continue;
        const P = await p.evaluate(() => { const S = TW_state(), c = TW_test.analyzeDiscards(0, {})[0], id = TW_test.pickDiscardTile(0, c.t), q = TW_api.V.handXY(id); return q && { x: q.x, y: q.y }; });
        if (!P) continue;
        await p.touchscreen.tap(P.x, P.y); await p.waitForTimeout(300); await p.touchscreen.tap(P.x, P.y); await p.waitForTimeout(500);
        const thrown = await p.evaluate(b => { const S = TW_state(); return S && S.players[0].discards.length > b; }, before);
        if (thrown) throws++; else report.push(`${nm} hand ${hand + 1}: two taps did not throw (mode ${await p.evaluate(() => TW_state() && TW_state().ui && TW_state().ui.mode)})`);
      }
      await p.evaluate(() => { const S = TW_state(); if (S) S.players.forEach(() => 0); });
      await p.evaluate(() => TW_api.goHome());
      await p.waitForTimeout(600);
    }
    report.push(`${nm}: errors ${errs.join(' | ') || 'none'}`);
    await ctx.close();
  }
  report.push(`fumbles ${fumbles}, accidental discards ${accidents}, deliberate throws ${throws}, smallest rack tile spacing ${minRack.toFixed(1)} px`);
  fs.writeFileSync(OUT + '/phone10.txt', report.join('\n'));
  console.log(report.join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
