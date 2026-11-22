/* =========================================================
   MORE. The three kinds of player, the record and hand history, seasons,
   things earned for the table, the weekly challenge, near misses and the
   daily result card. Nothing here touches how a hand is played or scored.
   ========================================================= */
(() => { // new fields on an older save
  const d = { stats:{}, history:[], seals:{}, cos:{}, weekly:{}, weeklyDone:{}, rec:{} };
  for (const k in d) if (!profile[k] || typeof profile[k] !== 'object') profile[k] = d[k];
  profile.stats = Object.assign({ hands:0, wins:0, dealIns:0, draws:0, selfWins:0, ptsSum:0, fanSum:0, ready:0, patterns:{} }, profile.stats);
  profile.cos = Object.assign({ back:'table', wood:'walnut', lamp:'table' }, profile.cos);
  profile.rec = Object.assign({ bestPay:0, bestRun:0 }, profile.rec);
  if (profile.cosPts == null) profile.cosPts = 0;
  if (profile.bestRank == null) profile.bestRank = 0;
  if (profile.kind === undefined) profile.kind = null;
  if (profile.intro == null) profile.intro = profile.tut ? 4 : 0; // people already playing skip the taught hands
  if (settings.big == null) settings.big = false;
  if (settings.quality == null) settings.quality = 'auto';
})();

/* ---------- three kinds of player: asked once, changed any time ---------- */
const KINDS = [
  { id:'new',     name:'New to Mahjong',     line:'Tile numbers on, every choice explained, full coach, easy opponents.',   set:{ coach:2, helpers:true,  calls:'guided',   difficulty:0, big:true,  length:4 } },
  { id:'casual',  name:'I play now and then', line:'Tile numbers on, warnings before bad throws, steady opponents.',       set:{ coach:1, helpers:true,  calls:'standard', difficulty:1, big:false, length:4 } },
  { id:'veteran', name:'I know it well',  line:'No helpers, no coach, tough opponents, sixteen-hand games.', set:{ coach:0, helpers:false, calls:'standard', difficulty:3, big:false, length:16 } }
];
function setKind(id){
  const k = KINDS.find(k => k.id === id); if (!k) return;
  profile.kind = id; Object.assign(settings, k.set);
  profile.intro = id === 'new' ? Math.max(1, Math.min(profile.intro || 1, 4)) : 4;
  save(); V.resize(); V.setHelpers(settings.helpers);
}
/* hands two, three and four each open with one idea */
async function introIdea(){
  if (S.mode !== 'play' || S.introShown || !(profile.intro >= 1 && profile.intro <= 3)) return;
  S.introShown = true;
  if (profile.intro === 1) await tutSay('New this hand: taking tiles. When someone throws a tile that finishes one of your sets, buttons appear above your rack. You can take a Pung from anyone, but a Chow only from the player on your left.', 'rack');
  else if (profile.intro === 2) await tutSay('New this hand: points. Some hands score extra, counted in faan. Each faan doubles what the others pay you. Three Dragons, three of your own wind, or a hand in one suit all score faan.', 'rack');
  else { if (settings.coach === 2){ settings.coach = 1; save(); } await tutSay('You know the whole game now: draw, throw, take sets, win. From now on the coach only speaks up before a bad throw. You can change that in Menu, Settings.', 'rack'); }
}

/* ---------- seasons: one a month. A new one sets you back a single rank and keeps a seal of the old one ---------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const seasonId = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const seasonName = id => MONTHS[+id.split('-')[1] - 1] + ' ' + id.split('-')[0];
function seasonTick(){
  const id = seasonId(); if (profile.season === id) return null;
  let line = null;
  if (profile.season){
    const ri = rankInfo(); profile.seals[profile.season] = ri.i; profile.bestRank = Math.max(profile.bestRank, ri.i);
    if (ri.i > 0) profile.xp = RANKS[ri.i - 1].xp;
    line = `${seasonName(profile.season)} is over. You keep its seal: ${ri.name}. ${ri.i > 0 ? 'You start ' + seasonName(id) + ' one rank lower, at ' + RANKS[ri.i - 1].name + '.' : ''}`;
  }
  profile.season = id; save(); return line;
}

/* ---------- things for the table, earned by sitting down and playing ---------- */
const COS = {
  back: [ { id:'table', name:'Matches the table', need:0 }, { id:'jade', name:'Jade', need:1, col:0x2C6B4F }, { id:'oxblood', name:'Oxblood', need:3, col:0x8E2A20 },
          { id:'indigo', name:'Indigo', need:6, col:0x234E9C }, { id:'amber', name:'Amber', need:10, col:0xB8791A }, { id:'ink', name:'Ink', need:15, col:0x1A1C22 } ],
  wood: [ { id:'walnut', name:'Walnut', need:0, tint:0xffffff, css:'#7a4e2c' }, { id:'rosewood', name:'Rosewood', need:2, tint:0xD9887A, css:'#7c3a30' },
          { id:'maple', name:'Maple', need:5, tint:0xffffff, light:true, css:'#c49e6c' }, { id:'ebony', name:'Ebony', need:9, tint:0x5c5650, css:'#2a2622' } ],
  lamp: [ { id:'table', name:'Matches the table', need:0 }, { id:'candle', name:'Candle', need:4, col:0xFFC98A }, { id:'paper', name:'Paper lantern', need:7, col:0xFFEBD2 },
          { id:'window', name:'North window', need:12, col:0xEEF2FF } ]
};
const COS_NAME = { back:'Tile backs', wood:'Rack', lamp:'Lamp' };
const cosOpen = it => profile.cosPts >= it.need;
const cosItem = (kind, id) => COS[kind].find(i => i.id === id) || COS[kind][0];
function nextCos(){ let best = null; for (const k in COS) for (const it of COS[k]) if (!cosOpen(it) && (!best || it.need < best.it.need)) best = { k, it }; return best; }
function applyCos(over = {}){
  const c = Object.assign({}, profile.cos, over), b = cosItem('back', c.back), w = cosItem('wood', c.wood), l = cosItem('lamp', c.lamp);
  V.setCos({ back: b.col != null ? b.col : null, lamp: l.col != null ? l.col : null, tint: w.tint, light: !!w.light });
}
function cosGain(n, why){
  const before = nextCos(); profile.cosPts += n; const out = [why];
  for (const k in COS) for (const it of COS[k]) if (it.need > profile.cosPts - n && it.need <= profile.cosPts) out.push(`New for your table: ${it.name} ${COS_NAME[k].toLowerCase()}. Pick it in Collection, Tables.`);
  if (out.length === 1 && before) out[0] += ` ${before.it.need - profile.cosPts} more to ${before.it.name} ${COS_NAME[before.k].toLowerCase()}.`;
  return out;
}
let sitHands = 0;
function sitting(){
  sitHands++;
  const i = [3, 5, 10].indexOf(sitHands); if (i < 0) return [];
  return cosGain(i === 2 ? 2 : 1, `You played ${['3', '5', '10'][i]} hands in a row.`);
}

/* ---------- the weekly challenge: one fixed deal, one condition, the usual rules ---------- */
function weekKey(d = new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0');
}
const suitIx = t => t < 27 ? Math.floor(t / 9) : 3;
const WEEKLY = [
  { id:'suit',  name:'One suit',          text:'Win with tiles from one suit. Winds and Dragons are allowed.', test:w => w.res.items.some(i => /Flush$/.test(i.name)),
    fit:h => { const n = [0,0,0,0]; h.forEach(t => n[suitIx(t)]++); return Math.max(n[0], n[1], n[2]) + n[3] * .8; } },
  { id:'door',  name:'Hidden hand',       text:'Win without taking any tiles from others.', test:w => w.res.concealed, fit:h => -shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'three', name:'Three faan',        text:'Win a hand worth 3 faan or more.', test:w => w.res.fan >= 3, fit:h => h.filter(t => t >= 31).length * 2 - shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'self',  name:'Own draw',          text:'Win on a tile you draw yourself.', test:w => w.selfDrawn, fit:h => -shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'pungs', name:'No runs',           text:'Win with Pungs only, no Chows.', test:w => w.res.items.some(i => /All Pungs|All Honors/.test(i.name)),
    fit:h => { const c = {}; h.forEach(t => c[t] = (c[t] || 0) + 1); return Object.values(c).reduce((a, n) => a + (n >= 3 ? 3 : n === 2 ? 1.6 : 0), 0); } },
  { id:'honor', name:'Winds and Dragons', text:'Win with a Pung of Dragons, your seat wind or the round wind.', test:w => w.res.items.some(i => /Dragon pung|wind pung/.test(i.name)),
    fit:h => { const c = {}; h.forEach(t => c[t] = (c[t] || 0) + 1); return [27, 31, 32, 33].reduce((a, t) => a + (c[t] >= 2 ? c[t] * 2 : 0), 0) - shanten(countsOf(h.map(t => ({ t }))), 0) * .5; } }
];
const weeklyNow = () => WEEKLY[hashStr('w' + weekKey()) % WEEKLY.length];
/* the week's deal is picked from forty honest shuffles: the one whose opening hand suits the challenge best */
function weeklySeed(){
  const ch = weeklyNow(), base = hashStr('weekly' + weekKey()); let best = base, bestFit = -1e9;
  for (let k = 0; k < 40; k++){
    const seed = (base + k * 2654435761) | 0; S.rs = seed;
    const w = shuffle(allTiles()), h = []; for (let i = 0; i < 52; i += 4) if (w[i].t < 34) h.push(w[i].t);
    const f = ch.fit(h); if (f > bestFit){ bestFit = f; best = seed; }
  }
  return best;
}
function weeklyResult(w){
  const ch = weeklyNow(), wk = weekKey(), out = [];
  if (w.pi !== 0){ out.push(`This week's challenge is still open: ${ch.text}`); return out; }
  if (!ch.test(w)){ out.push(`You won, but not the way this week's challenge asks. ${ch.text}`); return out; }
  profile.weekly[wk] = Math.max(profile.weekly[wk] || 0, w.pay[0]);
  if (!profile.weeklyDone[wk]){ profile.weeklyDone[wk] = dayKey(); out.push(...cosGain(2, `Weekly challenge done: ${ch.name}.`)); }
  else out.push(`Weekly challenge: ${ch.name}. Your best this week: +${profile.weekly[wk]}.`);
  return out;
}

/* ---------- the record ---------- */
function recordHand(w, parts){
  const st = profile.stats, win = w.pi >= 0, mine = w.pi === 0;
  st.hands++; if (!win) st.draws++; if (S.everReady) st.ready++;
  if (mine){
    st.wins++; st.ptsSum += w.val; st.fanSum += w.res.fan; if (w.selfDrawn) st.selfWins++;
    for (const it of w.res.items){ const c = COLLECTION.find(c => c.re.test(it.name)); if (c && c.id !== 'win') st.patterns[c.id] = (st.patterns[c.id] || 0) + 1; }
  }
  if (win && !mine && !w.selfDrawn && w.ctx.from === 0) st.dealIns++;
  profile.rec.bestPay = Math.max(profile.rec.bestPay, w.pay[0]); profile.rec.bestRun = Math.max(profile.rec.bestRun, profile.winRun);
  profile.history.unshift({ d:dayKey(), m:S.mode, r: mine ? 'w' : !win ? 'd' : w.pay[0] < 0 ? 'p' : 'l', f: win ? w.res.fan : 0, pay:w.pay[0], by:w.pi,
    g: win ? parts.groups.map(g => g.label) : [], n: win ? w.res.items.map(i => i.name) : [] });
  if (profile.history.length > 30) profile.history.length = 30;
}
function favPattern(){ let b = null; for (const id in profile.stats.patterns) if (!b || profile.stats.patterns[id] > profile.stats.patterns[b]) b = id; const c = b && COLLECTION.find(c => c.id === b); return c ? c.name : null; }

/* ---------- near misses, told straight ---------- */
function nearMiss(w){
  if (w.pi === 0 || S.mode === 'tut') return '';
  const me = S.players[0]; if (me.hand.length % 3 !== 1) return '';
  const c = countsOf(me.hand), sh = shanten(c, me.melds.length);
  if (sh > 0) return `<div class="nearmiss far"><span>You were ${sh + 1} tiles from winning when it ended.</span></div>`;
  const ts = waitsOf(c, me.melds.length); if (!ts.length) return '';
  const rows = ts.map(t => {
    const wi = S.wall.findIndex(x => x.t === t), bits = [];
    if (wi === 0) bits.push('it was the next tile in the wall'); else if (wi > 0) bits.push(`${wi + 1} tiles down the wall`);
    for (let q = 1; q < 4; q++){ const n = S.players[q].hand.filter(x => x.t === t).length; if (n) bits.push(`${n === 1 ? 'one' : n} in ${S.players[q].name}'s hand`); }
    return `<div>${tileHTML(t)}<span>${tName(t)}: ${bits.length ? bits.join(', ') : 'none were left'}.</span></div>`;
  }).join('');
  return `<div class="nearmiss"><b>You were one tile from winning. Here is where your tiles were:</b>${rows}</div>`;
}

/* ---------- a rare pattern, the first time: its own moment ---------- */
function rareReveal(c){
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'rare';
    el.innerHTML = `<div class="rin"><span class="rstamp">印</span><h2>${c.name}</h2>${rowHTML(c.ex)}<p>${c.fan} faan. ${c.hint}</p><small>Your first one. Stamped ${niceDate(dayKey())}.</small></div>`;
    document.body.appendChild(el); snd('kong'); haptic([20, 80, 30]);
    let done = false; const end = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 260); };
    el.onclick = end; setTimeout(end, settings.pace === 'fast' ? 1500 : 2600);
  });
}

/* ---------- the daily hand as a picture to send ---------- */
async function shareCard(w){
  ensureTiles();
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const g = c.getContext('2d');
  g.fillStyle = '#EFE6D2'; g.fillRect(0, 0, 1080, 1080);
  g.strokeStyle = '#B9A77F'; g.lineWidth = 2; g.strokeRect(36, 36, 1008, 1008); g.strokeRect(46, 46, 988, 988);
  g.fillStyle = '#2A2117'; g.textBaseline = 'alphabetic';
  g.font = "600 84px TWserif"; g.fillText('Tilewind', 96, 190);
  g.fillStyle = '#A8281E'; g.fillRect(884, 110, 100, 100); g.fillStyle = '#F6ECD8'; g.font = "72px TWbrush"; g.textAlign = 'center'; g.fillText('和', 934, 186); g.textAlign = 'left';
  g.fillStyle = '#5c4c37'; g.font = "500 40px TWserif"; g.fillText('Daily Hand, ' + niceDate(dayKey()), 96, 256);
  g.fillStyle = '#B9A77F'; g.fillRect(96, 296, 888, 2);
  const me = S.players[0], tiles = me.melds.flatMap(m => m.tiles.map(t => t.t)).concat(me.hand.map(t => t.t));
  const imgs = await Promise.all(tiles.map(t => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = V.IMG[t]; })));
  const per = Math.min(7, Math.ceil(tiles.length / 2)), tw = 112, th = tw * 1.36, x0 = 540 - per * (tw + 8) / 2;
  imgs.forEach((im, k) => { if (im) g.drawImage(im, x0 + (k % per) * (tw + 8), 350 + Math.floor(k / per) * (th + 14), tw, th); });
  const mine = w.pi === 0, pay = w.pay[0];
  g.fillStyle = '#2A2117'; g.font = "600 76px TWserif";
  g.fillText(mine ? `Won with ${w.res.fan} faan` : w.pi < 0 ? 'No winner' : 'No win today', 96, 790);
  g.fillStyle = pay > 0 ? '#23745A' : pay < 0 ? '#A8281E' : '#5c4c37'; g.font = "600 120px TWserif"; g.fillText((pay > 0 ? '+' : '') + pay, 96, 920);
  g.fillStyle = '#5c4c37'; g.font = "500 36px TWserif";
  if (mine) g.fillText(w.res.items.map(i => itemText(i.name).label).slice(0, 4).join(', '), 96, 980);
  g.textAlign = 'right'; g.fillText(`${profile.dailyDays} ${profile.dailyDays === 1 ? 'day' : 'days'} played`, 984, 920); g.textAlign = 'left';
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), name = 'tilewind-' + dayKey() + '.png';
  try {
    const file = new File([blob], name, { type:'image/png' });
    if (navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:'Tilewind Daily Hand' }); return; }
  } catch(e){ if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Result card saved', name);
}

/* ---------- the Records page ---------- */
function recordsHTML(){
  const st = profile.stats, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–', ri = rankInfo(), fav = favPattern();
  const cell = (v, l) => `<div><b>${v}</b>${l}</div>`;
  const seals = Object.keys(profile.seals).sort().reverse().slice(0, 12).map(id => `<span><i>${RANKS[profile.seals[id]].seal}</i>${seasonName(id)}</span>`).join('');
  const modeName = { play:'Game', daily:'Daily', weekly:'Weekly', tut:'Guided' };
  const hist = profile.history.map(h => `<details class="hrow ${h.r}"><summary><span>${niceDate(h.d)}</span><span>${modeName[h.m] || ''}</span><b>${h.r === 'w' ? 'Won, ' + h.f + ' faan' : h.r === 'd' ? 'No winner' : h.r === 'p' ? 'You paid' : (h.by >= 0 ? SEAT[h.by].name + ' won' : '')}</b><i>${h.pay > 0 ? '+' : ''}${h.pay}</i></summary>${h.g.length ? `<p>${h.r === 'w' ? '' : SEAT[h.by].name + ' had: '}${h.g.join(', ')}. ${h.n.map(n => itemText(n).label).join(', ')}.</p>` : `<p>${h.r === 'd' ? 'The wall ran out.' : h.r === 'p' ? 'Your discard won it for them, or they drew the winning tile.' : 'You paid nothing.'}</p>`}</details>`).join('');
  return `<div class="rankbig"><span class="rseal">${ri.seal}</span><div><b>${ri.name}</b><div class="bar"><i style="width:${Math.round(ri.frac * 100)}%"></i></div><small>${seasonName(profile.season || seasonId())} season. ${ri.next ? `${ri.into} of ${ri.need} points to ${ri.next}` : 'The top rank'}</small></div></div>
    ${seals ? `<div class="ladder seals">${seals}</div>` : '<p class="blead">Each month is a season. When it ends you keep a seal of the rank you reached, and start the next month one rank lower.</p>'}
    <h3>At a glance</h3><div class="recs">${cell(pct(st.wins, st.hands), 'hands won')}${cell(st.wins ? Math.round(st.ptsSum / st.wins) : '–', 'points per win')}${cell(st.wins ? (st.fanSum / st.wins).toFixed(1) : '–', 'faan per win')}${cell(pct(st.dealIns, st.hands), 'hands where your discard lost')}${cell(pct(st.selfWins, st.wins), 'wins on your own draw')}${cell(pct(st.ready, st.hands), 'hands you got one tile away')}${cell(profile.rec.bestPay ? '+' + profile.rec.bestPay : '–', 'best single hand')}${cell(profile.rec.bestRun || '–', 'most wins in a row')}${cell(profile.bestFan || '–', 'most faan')}${cell(profile.games, 'games')}${cell(profile.dailyDays, 'daily hands')}${cell(Object.keys(profile.weeklyDone).length, 'weekly challenges')}</div>
    <p class="blead">${fav ? 'You win most often with: ' + fav + '.' : 'Win a few hands and the way you win most often shows here.'} ${st.hands ? `From ${st.hands} ${st.hands === 1 ? 'hand' : 'hands'}.` : ''}</p>
    <h3>Recent hands</h3>${hist ? `<div class="hist">${hist}</div>` : '<p class="blead">Your last 30 hands will show here.</p>'}
    <h3>Scoring table</h3><div class="stable">${COLLECTION.map(c => `<div><span>${c.name}</span><b>${c.fan}</b></div>`).join('')}</div>
    <div class="ptable"><div><span>Faan</span>${[1,2,3,4,5,6,7,8].map(f => `<b>${f}${f === 8 ? '+' : ''}</b>`).join('')}</div><div><span>Points</span>${[1,2,3,4,5,6,7,8].map(f => `<b>${handValue(f)}</b>`).join('')}</div></div>
    <p class="blead">Won on your own draw: each of the other three pays the points. Won on a discard: the player who threw it pays double.</p>`;
}
function weeklyHTML(){
  const ch = weeklyNow(), wk = weekKey(), done = profile.weeklyDone[wk];
  return `<h3>This week's challenge</h3><div class="weekly ${done ? 'done' : ''}"><div><b>${ch.name}</b><small>${ch.text} The same deal all week. Try as often as you like.${done ? ' Done. Best: +' + profile.weekly[wk] + '.' : ''}</small></div><button class="tbtn ${done ? '' : 'prime'}" id="wkPlay">${done ? 'Play it again' : 'Play the challenge'}</button></div>`;
}
function cosHTML(){
  const nx = nextCos(), hex = n => '#' + n.toString(16).padStart(6, '0');
  const row = k => `<div class="cosrow"><span>${COS_NAME[k]}</span><div>${COS[k].map(it => {
    const open = cosOpen(it), on = profile.cos[k] === it.id, col = it.css || (it.col != null ? hex(it.col) : 'transparent');
    return `<button class="chip ${on ? 'on' : ''} ${open ? '' : 'lock'}" data-cos="${k}:${it.id}" title="${it.name}"><i style="background:${col}" class="${it.col == null && !it.css ? 'auto' : ''}"></i>${it.name}${open ? '' : `<small>in ${it.need - profile.cosPts}</small>`}</button>`; }).join('')}</div></div>`;
  return `<h3>Extras for your table</h3><p class="blead">You earn these by playing 3, 5 and 10 hands in a row, and by finishing weekly challenges. ${nx ? `Next: ${nx.it.name} ${COS_NAME[nx.k].toLowerCase()}, ${profile.cosPts} of ${nx.it.need}.` : 'You have them all.'} Tap one to see it on the table.</p>${row('back')}${row('wood')}${row('lamp')}`;
}
/* look at the table with the book out of the way */
function peek(label, over, canUse, onUse, th){
  const ov = overlayEl('.overlay'); if (!ov) return;
  if (th) V.applyTheme(themeOf(th)); applyCos(over); ov.classList.add('peek'); document.body.classList.add('peeking');
  if (!S && over.wood) label += ' You see the rack during a hand.';
  const bar = document.createElement('div'); bar.className = 'peekbar paper';
  bar.innerHTML = `<span>${label}</span>${canUse ? '<button class="tbtn prime" data-use>Use it</button>' : ''}<button class="tbtn" data-back>Go back</button>`;
  document.body.appendChild(bar);
  const end = use => { bar.remove(); ov.classList.remove('peek'); document.body.classList.remove('peeking'); if (use) onUse(); V.applyTheme(themeOf(profile.theme)); applyCos(); drawTab(); };
  bar.querySelector('[data-back]').onclick = () => end(false);
  const u = bar.querySelector('[data-use]'); if (u) u.onclick = () => end(true);
  (u || bar.querySelector('[data-back]')).focus({ preventScroll:true });
}
