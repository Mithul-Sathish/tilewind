// deterministic rules check: Math.random seeded, N full computer-only matches, records every hand result + final scores
const { chromium } = require('playwright');
const [,, file, outf, n] = process.argv;
(async () => {
  const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport:{ width:640, height:480 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.addInitScript(() => {
    let s = 12345; Math.random = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 8) & 0xffffff) / 16777216; };
    localStorage.setItem('tilewind.v1', JSON.stringify({ tut:1, asked:1, kind:'casual' }));
  });
  await p.goto('file://' + file + '?q=2&nogl=1');
  await p.waitForFunction(() => window.TW_ready, null, { timeout: 180000 });
  const res = await p.evaluate(async (n) => {
    window.TW_fast = true; window.TW_v8ai = true; const out = [];
    for (let m = 0; m < n; m++){
      window.TW_log = [];
      const r = await TW_autotest(1);
      const S = TW_state();
      out.push({ errors: r.errors, log: window.TW_log, bad: window.TW_bad || null });
    }
    return out;
  }, +n);
  require('fs').writeFileSync(outf, res.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log('hands', res.reduce((a, x) => a + x.log.length, 0), 'errors', res.reduce((a, x) => a + x.errors, 0));
  await b.close();
})();
