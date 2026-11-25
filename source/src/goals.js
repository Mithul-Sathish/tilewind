/* =========================================================
   REASONS TO COME BACK, in plain sight: days in a row, three goals for today, three for the week,
   and what you earn next. All of it sits on the title screen as one quiet strip.
   ========================================================= */
(() => {
  if (!profile.days || typeof profile.days !== 'object') profile.days = { last: null, run: 0, best: 0 };
  if (!profile.week || typeof profile.week !== 'object') profile.week = { id: null, prog: {}, done: {} };
})();
/* a day counts once you finish a hand. Miss one day and the run waits for you; miss two and it starts again */
function dayPlayed(){
  const k = dayKey(), d = profile.days; if (d.last === k) return null;
  const y = new Date(); y.setDate(y.getDate() - 1); const k1 = dayKey(y); y.setDate(y.getDate() - 1); const k2 = dayKey(y);
  d.run = d.last === k1 || d.last === k2 ? d.run + 1 : 1; d.last = k; d.best = Math.max(d.best || 0, d.run);
  return d.run >= 2 ? `${d.run} days in a row.` : null;
}
const dayRun = () => { const d = profile.days, y = new Date(); y.setDate(y.getDate() - 2); return d.last && d.last >= dayKey(y) ? d.run : 0; };

/* the week's goals: bigger than a day's, and each one opens something */
const WEEK_GOALS = [
  { id: 'wins8',   text: n => `Win 8 hands`,                  need: 8, ev: e => e.kind === 'win' },
  { id: 'first2',  text: n => `Finish first in 2 games`,      need: 2, ev: e => e.kind === 'match' && e.place === 1 },
  { id: 'big3',    text: n => `Win 3 hands of 3 faan or more`, need: 3, ev: e => e.kind === 'win' && e.fan >= 3 },
  { id: 'daily4',  text: n => `Play the Daily Hand on 4 days`, need: 4, ev: e => e.kind === 'daily' },
  { id: 'calls10', text: n => `Take 10 tiles with calls`,      need: 10, ev: e => e.kind === 'claim' },
  { id: 'online2', text: n => `Finish 2 online games`,         need: 2, ev: e => e.kind === 'online' },
  { id: 'self3',   text: n => `Win 3 hands on your own draw`,  need: 3, ev: e => e.kind === 'win' && e.self },
  { id: 'hands20', text: n => `Play 20 hands`,                 need: 20, ev: e => e.kind === 'hand' },
  { id: 'safe6',   text: n => `Finish 6 hands without paying`, need: 6, ev: e => e.kind === 'hand' && e.paid === 0 }
];
function weekGoals(){
  const id = weekKey(), w = profile.week;
  if (w.id !== id){ w.id = id; w.prog = {}; w.done = {}; }
  let seed = hashStr('wk' + id); const pool = WEEK_GOALS.slice(), out = [];
  if (!NET.onlineURL()) pool.splice(pool.findIndex(g => g.id === 'online2'), 1);
  while (out.length < 3){ seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; out.push(pool.splice(seed % pool.length, 1)[0]); }
  return out;
}
function weekEvent(ev){
  if (autotest) return [];
  const news = [], w = profile.week;
  for (const g of weekGoals()){
    if (w.done[g.id] || !g.ev(ev)) continue;
    w.prog[g.id] = (w.prog[g.id] || 0) + 1;
    if (w.prog[g.id] >= g.need){ w.done[g.id] = true; profile.themePts += 2; news.push(...cosGain(2, 'Weekly goal done: ' + g.text().toLowerCase() + '.')); }
  }
  return news;
}
/* what you earn next, from tables and things for the table, whichever is closer */
function nextUnlock(){
  const t = nextTheme(), c = nextCos();
  const tl = t ? { name: t.name + ' table', left: t.need - profile.themePts, frac: Math.min(1, profile.themePts / t.need) } : null;
  const cl = c ? { name: c.it.name + ' ' + COS_NAME[c.k].toLowerCase().replace(/s$/, ''), left: c.it.need - profile.cosPts, frac: Math.min(1, profile.cosPts / c.it.need) } : null;
  if (!tl) return cl; if (!cl) return tl;
  return cl.left < tl.left ? cl : tl;
}
function todayStrip(){
  const qs = todaysQuests(), wk = weekGoals(), run = dayRun(), nu = nextUnlock();
  const qd = qs.filter(q => profile.quests.done[q.id]).length, wd = wk.filter(g => profile.week.done[g.id]).length;
  const goal = (txt, done, prog) => `<li class="${done ? 'done' : ''}"><i></i><span>${txt}</span>${prog ? `<small>${prog}</small>` : ''}</li>`;
  return `<div class="today" style="--i:4">
    <div class="tcol"><div class="th"><b>Today</b><small>${qd} of 3</small></div><ul>${qs.map(q => goal(q.text, profile.quests.done[q.id])).join('')}</ul></div>
    <div class="tcol"><div class="th"><b>This week</b><small>${wd} of 3</small></div><ul>${wk.map(g => goal(g.text(), profile.week.done[g.id], profile.week.done[g.id] ? '' : `${profile.week.prog[g.id] || 0}/${g.need}`)).join('')}</ul></div>
    <div class="tfoot">${run >= 1 ? `<span class="run"><b>${run}</b> day${run > 1 ? 's' : ''} in a row</span>` : '<span class="run">Play a hand to start a run of days</span>'}${nu ? `<span class="nu">Next: ${nu.name}<i><u style="width:${Math.round(nu.frac * 100)}%"></u></i></span>` : ''}</div>
  </div>`;
}
