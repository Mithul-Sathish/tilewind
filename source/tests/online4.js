// Four real browser windows (separate profiles, separate WebSocket connections) play online through the real buttons.
// Window 1 quits mid-hand by leaving the page, then comes back; window 3 lets its turns run out until it is marked away.
const { chromium } = require('playwright');
const FILE = process.argv[2], OUT = process.argv[3] || '/tmp/on4', MODE = process.env.MODE || 'four';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const N = MODE === 'three' ? 3 : 4, W = [];
  const errs = [];
  for (let i = 0; i < N; i++){
    const ctx = await b.newContext({ viewport: i === 0 ? { width: 1100, height: 760 } : { width: 700, height: 520 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => { errs.push('W' + i + ' ' + e.message); log('W' + i, 'PAGEERROR', e.message); });
    await p.addInitScript(() => { localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'old', intro: 9 })); });
    W.push({ i, ctx, p, url: 'file://' + FILE + (i === 0 ? '' : '?nogl=1') });
  }
  await Promise.all(W.map(w => w.p.goto(w.url)));
  await Promise.all(W.map(w => w.p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 })));
  log('all windows ready');
  // each window answers its own prompts the way a quick player would; window 2 stops answering for a while
  const autoplay = async w => w.p.evaluate(idx => {
    if (window.__auto) return; window.__auto = true;
    window.__mute = false; window.__leaks = 0; window.__results = [];
    setInterval(() => {
      const S = TW_state(); if (!S || S.mode !== 'net') return;
      for (let r = 1; r < 4; r++) if (S.turn !== -1 && S.players[r].hand.some(x => x.t !== -1)) window.__leaks++;
      if (window.__mute || !S.ui || !S.ui.resolve) return;
      if (S.ui._seen) return; S.ui._seen = true;
      const ui = S.ui;
      setTimeout(() => {
        if (S.ui !== ui) return;
        if (ui.mode === 'discard'){ const a = (ui.actions || []).find(a => a.kind === 'win'); if (a) return ui.resolve(a.value); const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); }
        else if (ui.mode === 'claim'){ const a = ui.actions.find(a => a.kind === 'win') || ui.actions.find(a => a.kind === 'pung'); ui.resolve(a ? a.value : null); }
        else if (ui.mode === 'chowpick') ui.resolve(ui.starts[0]);
        else if (ui.mode === 'read') ui.resolve();
      }, 300 + Math.random() * 500);
    }, 200);
    // the end-of-hand slip: press Next hand like a person
    setInterval(() => { const btn = document.querySelector('.slip [data-r="next"]:not([disabled])'); if (btn){ const S = TW_state(); window.__results.push(S.players.map(p => p.score).join(',')); btn.click(); } }, 1500);
  }, w.i);
  // press Play online on the title screen, a couple of seconds apart
  for (const w of W){
    await w.p.click('#hOnline'); log('W' + w.i, 'pressed Play online');
    if (w.i === 0){ await w.p.waitForTimeout(1200); await w.p.screenshot({ path: OUT + '/wait-1.png' }); }
    await w.p.waitForTimeout(MODE === 'three' ? 2500 : 1500);
  }
  if (MODE === 'three'){ await W[0].p.waitForTimeout(4000); await W[0].p.screenshot({ path: OUT + '/wait-3.png' }); }
  else await W[0].p.screenshot({ path: OUT + '/wait-4.png' });
  await Promise.all(W.map(w => w.p.waitForFunction(() => { const S = TW_state(); return S && S.mode === 'net'; }, null, { timeout: 60000 })));
  log('all windows seated');
  for (const w of W) await autoplay(w);
  const names = await W[0].p.evaluate(() => TW_net.table.seats.map(s => s.name + (s.kind === 'bot' ? ' (computer)' : '')));
  log('table:', names.join(' | '));
  await W[0].p.waitForTimeout(9000); await W[0].p.screenshot({ path: OUT + '/play.png' });
  // window 1 quits mid-hand by leaving the page
  await W[1].p.waitForTimeout(6000);
  const w1name = await W[1].p.evaluate(() => TW_net.store.oname);
  await W[1].p.goto('about:blank'); log('W1', w1name, 'left the page mid-hand');
  await W[0].p.waitForTimeout(3000); await W[0].p.screenshot({ path: OUT + '/after-quit.png' });
  const seenLeft = await W[0].p.evaluate(() => TW_net.table.seats.map(s => s.name + ':' + (s.on ? 'on' : 'off')).join(' '));
  log('W0 sees', seenLeft);
  // window 3 stops answering: after two turns run out the computer plays its seat until it taps back in
  if (W[3]){ await W[3].p.evaluate(() => { window.__mute = true; }); log('W3 stops answering'); }
  await W[0].p.waitForTimeout(25000);
  // window 1 comes back: opening the game again sits it back down
  await W[1].p.goto(W[1].url); await W[1].p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
  await W[1].p.waitForFunction(() => { const S = TW_state(); return S && S.mode === 'net'; }, null, { timeout: 60000 });
  W[1].p.removeAllListeners('pageerror'); W[1].p.on('pageerror', e => { errs.push('W1 ' + e.message); log('W1 PAGEERROR', e.message); });
  await autoplay(W[1]); log('W1 is back at its seat');
  if (W[3]){
    await W[3].p.waitForFunction(() => !document.querySelector('#awayCard').hidden, null, { timeout: 120000 }).then(() => log('W3 sees the away card')).catch(() => log('W3 never saw the away card'));
    await W[3].p.screenshot({ path: OUT + '/away.png' });
    await W[3].p.evaluate(() => { window.__mute = false; const b = document.querySelector('#awayBack'); if (b) b.click(); });
    log('W3 pressed I\'m back');
  }
  // play to the end of the game
  await Promise.all(W.map(w => w.p.waitForFunction(() => !!document.querySelector('.slip [data-r="online"]'), null, { timeout: 1500000, polling: 1000 })));
  log('game over in every window');
  await W[0].p.waitForTimeout(2500); await W[0].p.screenshot({ path: OUT + '/final.png' });
  const finals = await Promise.all(W.map(w => w.p.evaluate(() => ({ seat: TW_net.me, scores: TW_state().players.map(p => p.score), name: TW_net.store.oname, rated: document.querySelector('#nRated') && document.querySelector('#nRated').textContent.replace(/\s+/g, ' ').trim(), leaks: window.__leaks, results: window.__results }))));
  // turn every window's scores back to table seats and compare
  const abs = finals.map(f => { const a = []; f.scores.forEach((s, r) => a[(r + f.seat) & 3] = s); return a.join(','); });
  for (const f of finals) log(f.name, 'seat', f.seat, 'leaks', f.leaks, '|', f.rated);
  log('final scores by table seat, per window:', abs.join(' / '), new Set(abs).size === 1 ? 'AGREE' : 'DISAGREE');
  log('page errors:', errs.length ? errs.join('; ') : 'none');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
