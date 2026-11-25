// Load timing: navigation start -> script start -> GL ready -> title screen ready. Optional CPU slowdown (school laptop ~4x).
const { chromium } = require('playwright');
const [,, FILE, RATE = '1', Q = ''] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = [];
  for (let run = 0; run < 3; run++){
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } }); const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +RATE });
    await p.goto('file://' + FILE + Q); await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000, polling: 50 }); const wall = await p.evaluate(() => Math.round(performance.now()));
    const m = await p.evaluate(() => { const g = n => { const e = performance.getEntriesByName(n)[0]; return e ? Math.round(e.startTime) : null; }; const nav = performance.getEntriesByType('navigation')[0]; const o = { domint: Math.round(nav.domInteractive) }; ['tw-boot','tw-i0','tw-fonts','tw-atlas','tw-env','tw-build','tw-tier','tw-gl','tw-ready'].forEach(n => o[n.slice(3)] = g(n)); return o; });
    m.wall = wall; out.push(m); await ctx.close();
  }
  console.log(JSON.stringify(out)); await b.close();
})();
