// lookdev server: load game, play to mid hand, then eval cmd files and screenshot
const { chromium } = require('playwright'); const fs = require('fs');
const [,, FILE, SIZE] = process.argv; const D = '/home/user/w2/q';
const ALL = { desk: [1280, 800, false], phone: [390, 844, true], land: [844, 390, true] };
(async () => {
  fs.mkdirSync(D, { recursive: true });
  const [w, h, mob] = ALL[SIZE || 'desk'];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mob, isMobile: mob });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error' || m.text().startsWith('LD')) console.log(m.text()); });
  await p.addInitScript(() => { let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 8) & 0xffffff) / 16777216; };
    const today = new Date(); const k = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    localStorage.setItem('tilewind.v1', JSON.stringify({ tut: 1, asked: 1, kind: 'casual', intro: 9, hands: 14, wins: 5, games: 3, xp: 420, themePts: 3, cosPts: 2, days: { last: k, run: 3, best: 4 }, quests: { day: k, done: {}, hands: 2 } })); });
  await p.goto('file://' + FILE);
  await p.waitForFunction(() => window.TW_ready, null, { timeout: 240000 });
  await p.evaluate(t => TW_api.V.setTier(t), +(process.env.TIER || 1));
  console.log('READY'); fs.writeFileSync(D + '/ready', '1');
  let n = 0;
  for (;;){
    const fsx = fs.readdirSync(D).filter(f => f.endsWith('.js')).sort();
    if (!fsx.length){ await new Promise(r => setTimeout(r, 300)); continue; }
    const f = fsx[0], code = fs.readFileSync(D + '/' + f, 'utf8'); fs.unlinkSync(D + '/' + f);
    const out = f.replace('.js', '');
    try {
      if (code.startsWith('//NODE')) { await eval('(async()=>{' + code + '})()'); }
      else { const r = await p.evaluate(code); if (r !== undefined) console.log(out, JSON.stringify(r).slice(0, 2000)); }
      if (!code.includes('//NOSHOT')){ await p.waitForTimeout(+(process.env.WAIT || 1500)); await p.screenshot({ path: D + '/' + out + '.png', timeout: 180000 }); }
      console.log('DONE', out);
    } catch (e) { console.log('FAIL', out, e.message.slice(0, 500)); }
    fs.writeFileSync(D + '/' + out + '.done', '1');
    if (code.includes('//QUIT')) break;
  }
  await b.close();
})();
