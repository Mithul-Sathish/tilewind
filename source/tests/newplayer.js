// A first-time player: fresh browser, real clicks only. Screenshots on a clock so the first minute can be judged.
// Throws by tapping a rack tile twice (the game's own rule), using the tile the coach suggests about half the time.
const { chromium } = require('playwright');
const [,, FILE, OUT, W = '1280', H = '800', PHONE = ''] = process.argv;
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: !!PHONE, isMobile: !!PHONE });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(1);
  await p.goto('file://' + FILE);
  await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
  const tReady = T();
  await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/00-title.png' });
  const tap = async (x, y) => PHONE ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  const playBtn = await p.$('#hPlay'); const bb = await playBtn.boundingBox(); await tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const tPlay = Date.now();
  const since = () => ((Date.now() - tPlay) / 1000).toFixed(1);
  const notes = [`ready ${tReady}s after load`];
  let shot = 1, lastShot = 0, throws = 0, firstThrow = null, prompts = 0;
  for (let k = 0; k < 900; k++){
    const st = await p.evaluate(() => { const S = TW_state(); const sl = document.querySelector('.slip'); const co = document.querySelector('#callout:not([hidden]) p'); const coach = document.querySelector('#coach'); const lesson = document.querySelector('#lesson:not([hidden])');
      return { slip: !!sl, mode: S && S.ui && S.ui.mode, callout: co ? co.textContent : '', coach: coach ? coach.textContent.trim() : '', lesson: lesson ? lesson.textContent.trim().slice(0, 140) : '', hand: S ? S.handNo : -1, over: !S }; });
    const el = (Date.now() - tPlay) / 1000;
    if (el - lastShot >= (el < 70 ? 6 : 30)){ lastShot = el; await p.screenshot({ path: `${OUT}/${String(shot++).padStart(2, '0')}-t${Math.round(el)}.png` }); notes.push(`t=${Math.round(el)}s mode=${st.mode} callout="${st.callout}" coach="${st.coach}" lesson="${st.lesson}"`); }
    if (st.slip){ await p.waitForTimeout(4000); await p.screenshot({ path: `${OUT}/slip-${st.hand}.png` }); notes.push(`hand ${st.hand} ended at ${since()}s`);
      const nx = await p.$('.slip .prime') || await p.$('.slip [data-kind]'); if (!nx) break; const r = await nx.boundingBox(); await tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(1500);
      if (st.hand >= +(process.env.HANDS || 1) - 1) break; continue; }
    if (st.mode === 'read'){ const c = await p.$('#callout [data-more]'); if (c){ const r = await c.boundingBox(); await tap(r.x + r.width / 2, r.y + r.height / 2); prompts++; } await p.waitForTimeout(400); continue; }
    if (st.mode === 'chowpick'){ prompts++; await p.waitForTimeout(900); const c = await p.$('#actions .call.k-chow'); if (c){ const r = await c.boundingBox(); if (r) await tap(r.x + r.width / 2, r.y + r.height / 2); } await p.waitForTimeout(500); continue; }
    if (st.mode === 'claim'){ prompts++; const btns = await p.$$('#actions .call'); const pick = btns.length ? btns[0] : null; await p.waitForTimeout(1200); if (pick){ const r = await pick.boundingBox(); if (r) await tap(r.x + r.width / 2, r.y + r.height / 2); } await p.waitForTimeout(600); continue; }
    if (st.mode === 'discard'){
      const win = await p.$('#actions .call.k-win'); if (win){ const r = await win.boundingBox(); await tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(800); continue; }
      const xy = await p.evaluate(() => { const S = TW_state(), ui = S.ui, me = S.players[0]; let id = ui.only != null ? ui.only : null;
        if (id == null){ const c = TW_test.analyzeDiscards(0, {}); const pick = Math.random() < .5 ? c[0] : c[Math.min(c.length - 1, 1 + Math.floor(Math.random() * 2))]; id = TW_test.pickDiscardTile(0, pick.t); }
        const q = TW_api.V.handXY(id); return q ? { x: q.x, y: q.y, id } : null; });
      await p.waitForTimeout(900);
      if (xy){ await tap(xy.x, xy.y); await p.waitForTimeout(250); await tap(xy.x, xy.y); throws++; if (!firstThrow) firstThrow = since(); }
      await p.waitForTimeout(700); continue;
    }
    await p.waitForTimeout(500);
  }
  notes.push(`first throw at ${firstThrow}s after Play; ${throws} throws; ${prompts} prompts; errors: ${errs.join(' | ') || 'none'}`);
  fs.writeFileSync(OUT + '/notes.txt', notes.join('\n'));
  console.log(notes.join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
