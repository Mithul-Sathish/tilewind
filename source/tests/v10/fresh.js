// a brand-new player: no saved profile. Home, Play, then the first guided turns.
const { chromium } = require('playwright');
const [,, FILE, OUT, NM] = process.argv;
const ALL = { desk: [1280, 800, false], phone: [390, 844, true] };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const [w, h, mob] = ALL[NM || 'desk'];
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mob, isMobile: mob });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 8) & 0xffffff) / 16777216; }; });
  await p.goto('file://' + FILE);
  await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
  if (process.env.TIER) await p.evaluate(t => TW_api.V.setTier(t), +process.env.TIER);
  const snap = async n => { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}-${NM}-${n}.png`, timeout: 180000 }); };
  await p.waitForTimeout(2000); await snap('0home');
  await p.click('#hPlay'); await p.waitForTimeout(6000); await snap('1start');
  for (let k = 2; k < 7; k++){
    // wait until it is the player's turn or a prompt, then shoot, then act as the coach suggests
    await p.waitForFunction(() => { const S = TW_state(); return S && S.ui && ['discard', 'claim', 'read', 'chowpick'].includes(S.ui.mode); }, null, { timeout: 120000 });
    await p.waitForTimeout(2500); await snap(k + 'turn');
    await p.evaluate(() => { const ui = TW_state().ui; if (ui.mode === 'discard'){ const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); } else if (ui.mode === 'claim'){ ui.resolve(null); } else if (ui.mode === 'chowpick') ui.resolve(ui.starts[0]); else ui.resolve(); });
    await p.waitForTimeout(800);
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
