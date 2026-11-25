// Computer-only matches on the real rules code, as fast as the machine allows.
//   node sim.mjs levels 10   -> hard (Tough) against easy, two of each, seats rotated each match
//   node sim.mjs soak 50     -> full 16-hand games at mixed levels; checks every game ends, scores always add up, no errors
import { createGame } from './game.mjs';
const [mode = 'soak', N = '10'] = process.argv.slice(2);
const L = { easy: { diff: 0, style: 'quick' }, steady: { diff: 1, style: 'careful' }, hard: { diff: 2, style: 'flush' } };
function play(seats, length = 16){
  return new Promise((res, rej) => {
    const g = createGame({ fast: true }); const N2 = g.NET; let hands = 0, bad = [];
    N2.open({ code: 'SIM', pace: 'fast', calls: 'standard', length, seats: seats.map((s, i) => Object.assign({ kind: 'bot', name: 'S' + i }, s)) });
    const dog = setTimeout(() => { g.stop(); rej(new Error('stuck: no end after 120 s, hand ' + (g.state() && g.state().handNo))); }, 120000);
    const origResult = g.state;
    N2.onOver = order => { clearTimeout(dog); const S = g.state(); const sum = S.players.reduce((a, p) => a + p.score, 0);
      res({ scores: S.players.map(p => p.score), sum, handNo: S.handNo, bad: g.window.TW_bad || [], log: g.window.TW_log || [] }); g.NET.close(); };
    N2.start().catch(e => { clearTimeout(dog); rej(e); });
  });
}
const t0 = Date.now();
if (mode === 'levels'){
  let hardWins = 0; const rows = [];
  for (let m = 0; m < +N; m++){
    const hardSeats = m % 2 ? [1, 3] : [0, 2];
    const seats = [0, 1, 2, 3].map(i => hardSeats.includes(i) ? L.hard : L.easy);
    const r = await play(seats);
    const h = hardSeats.reduce((a, i) => a + r.scores[i], 0), e = r.sum - h;
    const wins = r.log.filter(x => !x.draw); const hw = wins.filter(x => hardSeats.includes(x.w)).length;
    if (h > e) hardWins++;
    rows.push(`match ${m + 1}: hard ${h} vs easy ${e} (${h > e ? 'hard' : 'easy'} ahead); hands won hard ${hw}, easy ${wins.length - hw}, no winner ${r.log.length - wins.length}`);
  }
  console.log(rows.join('\n')); console.log(`HARD AHEAD IN ${hardWins} OF ${N} MATCHES (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
} else {
  let ok = 0, hands = 0; const fails = [];
  const mix = [['easy', 'steady', 'hard', 'easy'], ['hard', 'hard', 'steady', 'easy'], ['steady', 'steady', 'steady', 'steady'], ['easy', 'easy', 'hard', 'steady']];
  for (let m = 0; m < +N; m++){
    try {
      const r = await play(mix[m % 4].map(k => L[k]));
      const probs = [];
      if (r.sum !== 4000) probs.push('scores add to ' + r.sum);
      if (r.log.length !== 16) probs.push('hands ' + r.log.length);
      if (r.bad.length) probs.push('tile count wrong ' + JSON.stringify(r.bad.slice(0, 2)));
      for (const x of r.log) if (!x.draw && !(x.fan >= 1)) probs.push('win with fan ' + x.fan);
      hands += r.log.length;
      if (probs.length) fails.push(`game ${m + 1}: ${probs.join('; ')}`); else ok++;
    } catch(e){ fails.push(`game ${m + 1}: ${e.message}`); }
  }
  console.log(fails.join('\n')); console.log(`${ok} OF ${N} GAMES CLEAN, ${hands} hands (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
process.exit(0);
