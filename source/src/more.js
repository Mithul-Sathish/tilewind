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
  { id:'new',     name:'New to Mahjong',     line:'Larger tiles, a full coach, a gentle table.',          set:{ coach:2, labels:true,  difficulty:0, big:true,  length:4 } },
  { id:'casual',  name:'I play now and then', line:'Short nudges, a steady table, four-hand matches.',     set:{ coach:1, labels:true,  difficulty:1, big:false, length:4 } },
  { id:'veteran', name:'I grew up with it',  line:'No coach, no numerals, three old hands, a full game.', set:{ coach:0, labels:false, difficulty:3, big:false, length:16 } }
];
function setKind(id){
  const k = KINDS.find(k => k.id === id); if (!k) return;
  profile.kind = id; Object.assign(settings, k.set);
  profile.intro = id === 'new' ? Math.max(1, Math.min(profile.intro || 1, 4)) : 4;
  save(); V.resize();
}
/* hands two, three and four each open with one idea */
async function introIdea(){
  if (S.mode !== 'play' || S.introShown || !(profile.intro >= 1 && profile.intro <= 3)) return;
  S.introShown = true;
  if (profile.intro === 1) await tutSay('New this hand: calls. When someone throws a tile that finishes one of your sets, buttons rise above your rack. Pung takes three of a kind from anyone. Chow takes a run, but only from the player on your left.', 'rack');
  else if (profile.intro === 2) await tutSay('New this hand: value. Every scoring pattern is worth fan, and each fan doubles what the others pay. Dragons, your own wind and a hand in one suit are the usual sources. Tap any tile to see what it is worth to you.', 'rack');
  else { if (settings.coach === 2){ settings.coach = 1; save(); } await tutSay('You know the whole turn now: draw, throw, call, win. From here the coach only speaks before a costly throw. Menu, then Settings, brings the full coach back.', 'rack'); }
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
    line = `${seasonName(profile.season)} is closed and its seal is kept: ${ri.name}. ${ri.i > 0 ? 'You start ' + seasonName(id) + ' one rank back, at ' + RANKS[ri.i - 1].name + '.' : ''}`;
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
  for (const k in COS) for (const it of COS[k]) if (it.need > profile.cosPts - n && it.need <= profile.cosPts) out.push(`New for the table: ${it.name} ${COS_NAME[k].toLowerCase()}. Find it under Tables.`);
  if (out.length === 1 && before) out[0] += ` ${before.it.need - profile.cosPts} more to ${before.it.name} ${COS_NAME[before.k].toLowerCase()}.`;
  return out;
}
let sitHands = 0;
function sitting(){
  sitHands++;
  const i = [3, 5, 10].indexOf(sitHands); if (i < 0) return [];
  return cosGain(i === 2 ? 2 : 1, ['Third', 'Fifth', 'Tenth'][i] + ' hand this sitting.');
}

/* ---------- the weekly challenge: one fixed deal, one condition, the usual rules ---------- */
function weekKey(d = new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0');
}
const suitIx = t => t < 27 ? Math.floor(t / 9) : 3;
const WEEKLY = [
  { id:'suit',  name:'One suit',          text:'Win with a hand built from a single suit, with or without winds and dragons.', test:w => w.res.items.some(i => /Flush$/.test(i.name)),
    fit:h => { const n = [0,0,0,0]; h.forEach(t => n[suitIx(t)]++); return Math.max(n[0], n[1], n[2]) + n[3] * .8; } },
  { id:'door',  name:'Closed door',       text:'Win without claiming a single discard.', test:w => w.res.concealed, fit:h => -shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'three', name:'Three fan',         text:'Win a hand worth three fan or more.', test:w => w.res.fan >= 3, fit:h => h.filter(t => t >= 31).length * 2 - shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'self',  name:'Own draw',          text:'Win on a tile you draw yourself.', test:w => w.selfDrawn, fit:h => -shanten(countsOf(h.map(t => ({ t }))), 0) },
  { id:'pungs', name:'No runs',           text:'Win with sets of three only: no Chows.', test:w => w.res.items.some(i => /All Pungs|All Honors/.test(i.name)),
    fit:h => { const c = {}; h.forEach(t => c[t] = (c[t] || 0) + 1); return Object.values(c).reduce((a, n) => a + (n >= 3 ? 3 : n === 2 ? 1.6 : 0), 0); } },
  { id:'honor', name:'Winds and dragons', text:'Win with a Pung of dragons, your seat wind or the round wind.', test:w => w.res.items.some(i => /Dragon pung|wind pung/.test(i.name)),
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
  if (w.pi !== 0){ out.push(`This week's challenge is still open: ${ch.text.charAt(0).toLowerCase() + ch.text.slice(1)}`); return out; }
  if (!ch.test(w)){ out.push(`A win, but not the week's hand. ${ch.text}`); return out; }
  profile.weekly[wk] = Math.max(profile.weekly[wk] || 0, w.pay[0]);
  if (!profile.weeklyDone[wk]){ profile.weeklyDone[wk] = dayKey(); out.push(...cosGain(2, `Weekly challenge done: ${ch.name}.`)); }
  else out.push(`Weekly challenge: ${ch.name}. Your best this week +${profile.weekly[wk]}.`);
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
  if (sh > 0) return `<div class="nearmiss far"><span>You were ${sh === 1 ? 'one tile' : sh + ' tiles'} from a ready hand when it ended.</span></div>`;
  const ts = waitsOf(c, me.melds.length); if (!ts.length) return '';
  const rows = ts.map(t => {
    const wi = S.wall.findIndex(x => x.t === t), bits = [];
    if (wi === 0) bits.push('the very next tile in the wall'); else if (wi > 0) bits.push(`${wi + 1} tiles down the wall`);
    for (let q = 1; q < 4; q++){ const n = S.players[q].hand.filter(x => x.t === t).length; if (n) bits.push(`${n === 1 ? 'one' : n} in ${S.players[q].name}'s hand`); }
    return `<div>${tileHTML(t)}<span>${tName(t)}: ${bits.length ? bits.join(', ') : 'none left anywhere'}.</span></div>`;
  }).join('');
  return `<div class="nearmiss"><b>You were one tile away.</b>${rows}</div>`;
}

/* ---------- a rare pattern, the first time: its own moment ---------- */
function rareReveal(c){
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'rare';
    el.innerHTML = `<div class="rin"><span class="rstamp">印</span><h2>${c.name}</h2>${rowHTML(c.ex)}<p>${c.fan} fan. ${c.hint}</p><small>First time. Stamped ${niceDate(dayKey())}.</small></div>`;
    document.body.appendChild(el); snd('kong'); haptic([20, 80, 30]);
    let done = false; const end = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 260); };
    el.onclick = end; setTimeout(end, settings.fast ? 1500 : 2600);
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
  g.fillText(mine ? `Won with ${w.res.fan} fan` : w.pi < 0 ? 'Drawn hand' : 'No win today', 96, 790);
  g.fillStyle = pay > 0 ? '#23745A' : pay < 0 ? '#A8281E' : '#5c4c37'; g.font = "600 120px TWserif"; g.fillText((pay > 0 ? '+' : '') + pay, 96, 920);
  g.fillStyle = '#5c4c37'; g.font = "500 36px TWserif";
  if (mine) g.fillText(w.res.items.map(i => i.name).slice(0, 4).join(', '), 96, 980);
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
  const modeName = { play:'Match', daily:'Daily', weekly:'Weekly', tut:'Guided' };
  const hist = profile.history.map(h => `<details class="hrow ${h.r}"><summary><span>${niceDate(h.d)}</span><span>${modeName[h.m] || ''}</span><b>${h.r === 'w' ? 'Won, ' + h.f + ' fan' : h.r === 'd' ? 'Drawn' : h.r === 'p' ? 'Paid' : (h.by >= 0 ? SEAT[h.by].name + ' won' : '')}</b><i>${h.pay > 0 ? '+' : ''}${h.pay}</i></summary>${h.g.length ? `<p>${h.r === 'w' ? '' : SEAT[h.by].name + ' held: '}${h.g.join(', ')}. ${h.n.join(', ')}.</p>` : `<p>${h.r === 'd' ? 'The wall ran out.' : h.r === 'p' ? 'Your discard finished the hand, or the winner drew it.' : 'You paid nothing.'}</p>`}</details>`).join('');
  return `<div class="rankbig"><span class="rseal">${ri.seal}</span><div><b>${ri.name}</b><div class="bar"><i style="width:${Math.round(ri.frac * 100)}%"></i></div><small>${seasonName(profile.season || seasonId())} season. ${ri.next ? `${ri.into} of ${ri.need} to ${ri.next}` : 'The top rank'}</small></div></div>
    ${seals ? `<div class="ladder seals">${seals}</div>` : '<p class="blead">Each month is a season. When it closes you keep a seal of the rank you reached and start the next one a single rank back.</p>'}
    <h3>At a glance</h3><div class="recs">${cell(pct(st.wins, st.hands), 'hands won')}${cell(st.wins ? Math.round(st.ptsSum / st.wins) : '–', 'average win')}${cell(st.wins ? (st.fanSum / st.wins).toFixed(1) : '–', 'average fan')}${cell(pct(st.dealIns, st.hands), 'deal-in rate')}${cell(pct(st.selfWins, st.wins), 'wins self-drawn')}${cell(pct(st.ready, st.hands), 'hands reached ready')}${cell(profile.rec.bestPay ? '+' + profile.rec.bestPay : '–', 'best single hand')}${cell(profile.rec.bestRun || '–', 'longest winning run')}${cell(profile.bestFan || '–', 'most fan')}${cell(profile.games, 'matches')}${cell(profile.dailyDays, 'daily hands')}${cell(Object.keys(profile.weeklyDone).length, 'weekly challenges')}</div>
    <p class="blead">${fav ? 'Favourite winning pattern: ' + fav + '.' : 'Win a few hands and your favourite pattern shows here.'} ${st.hands ? `Counted over ${st.hands} ${st.hands === 1 ? 'hand' : 'hands'}.` : ''}</p>
    <h3>Recent hands</h3>${hist ? `<div class="hist">${hist}</div>` : '<p class="blead">Your last thirty hands are kept here.</p>'}
    <h3>Scoring table</h3><div class="stable">${COLLECTION.map(c => `<div><span>${c.name}</span><b>${c.fan}</b></div>`).join('')}</div>
    <div class="ptable"><div><span>Fan</span>${[1,2,3,4,5,6,7,8].map(f => `<b>${f}${f === 8 ? '+' : ''}</b>`).join('')}</div><div><span>Points</span>${[1,2,3,4,5,6,7,8].map(f => `<b>${handValue(f)}</b>`).join('')}</div></div>
    <p class="blead">Self-drawn: each of the three pays the points. Won on a discard: the thrower alone pays double.</p>`;
}
function weeklyHTML(){
  const ch = weeklyNow(), wk = weekKey(), done = profile.weeklyDone[wk];
  return `<h3>This week's challenge</h3><div class="weekly ${done ? 'done' : ''}"><div><b>${ch.name}</b><small>${ch.text} One fixed deal all week, the usual rules, as many tries as you like.${done ? ' Done. Best +' + profile.weekly[wk] + '.' : ''}</small></div><button class="tbtn ${done ? '' : 'prime'}" id="wkPlay">${done ? 'Play again' : 'Play'}</button></div>`;
}
function cosHTML(){
  const nx = nextCos(), hex = n => '#' + n.toString(16).padStart(6, '0');
  const row = k => `<div class="cosrow"><span>${COS_NAME[k]}</span><div>${COS[k].map(it => {
    const open = cosOpen(it), on = profile.cos[k] === it.id, col = it.css || (it.col != null ? hex(it.col) : 'transparent');
    return `<button class="chip ${on ? 'on' : ''} ${open ? '' : 'lock'}" data-cos="${k}:${it.id}" title="${it.name}"><i style="background:${col}" class="${it.col == null && !it.css ? 'auto' : ''}"></i>${it.name}${open ? '' : `<small>${it.need - profile.cosPts} more</small>`}</button>`; }).join('')}</div></div>`;
  return `<h3>On the table</h3><p class="blead">Earned by playing: the third, fifth and tenth hand of a sitting, and each weekly challenge. ${nx ? `Next: ${nx.it.name} ${COS_NAME[nx.k].toLowerCase()}, ${profile.cosPts} of ${nx.it.need}.` : 'Everything is open.'} Tap any of them to see it on the real table first.</p>${row('back')}${row('wood')}${row('lamp')}`;
}
/* look at the table with the book out of the way */
function peek(label, over, canUse, onUse, th){
  const ov = $('#overlayRoot .overlay'); if (!ov) return;
  if (th) V.applyTheme(themeOf(th)); applyCos(over); ov.classList.add('peek'); document.body.classList.add('peeking');
  if (!S && over.wood) label += ' It shows at the table, during a hand.';
  const bar = document.createElement('div'); bar.className = 'peekbar paper';
  bar.innerHTML = `<span>${label}</span>${canUse ? '<button class="tbtn prime" data-use>Use it</button>' : ''}<button class="tbtn" data-back>Back</button>`;
  document.body.appendChild(bar);
  const end = use => { bar.remove(); ov.classList.remove('peek'); document.body.classList.remove('peeking'); if (use) onUse(); V.applyTheme(themeOf(profile.theme)); applyCos(); drawTab(); };
  bar.querySelector('[data-back]').onclick = () => end(false);
  const u = bar.querySelector('[data-use]'); if (u) u.onclick = () => end(true);
  (u || bar.querySelector('[data-back]')).focus({ preventScroll:true });
}
