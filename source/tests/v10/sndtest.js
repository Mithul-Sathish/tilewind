// renders each effect offline and reports length, peak and where the energy sits
const { chromium } = require('playwright'); const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  const out = await p.evaluate(async (src) => {
    const settings = { sfx: .8, sfxOn: true, music: 0, musicOn: false, haptics: false }; let autotest = false;
    const res = {};
    for (const kind of ['pick', 'draw', 'place', 'pung', 'kong', 'tick', 'press']){
      const oac = new OfflineAudioContext(1, 44100 * 1.2, 44100);
      const f = new Function('settings', 'autotest', 'OAC', 'kind', src.replace("actx = new (window.AudioContext || window.webkitAudioContext)();", "actx = OAC;").replace("document.addEventListener('pointerdown', arm, { once:true });", '').replace("document.addEventListener('keydown', arm, { once:true });", '') + '\n;armed = true; snd(kind); return actx;');
      try { f(settings, autotest, oac, kind); } catch(e){ res[kind] = 'ERR ' + e.message; continue; }
      const buf = await oac.startRendering(), d = buf.getChannelData(0);
      let peak = 0, last = 0, e = 0, zc = 0; for (let i = 0; i < d.length; i++){ const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > .003) last = i; e += d[i] * d[i]; if (i && (d[i] > 0) !== (d[i - 1] > 0)) zc++; }
      // crude brightness: zero crossings per second over the audible part
      res[kind] = { peak: +peak.toFixed(3), ms: Math.round(last / 44.1), rms: +Math.sqrt(e / Math.max(1, last)).toFixed(4), zcHz: Math.round(zc / 2 / (last / 44100 || 1)) };
    }
    return res;
  }, src);
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
