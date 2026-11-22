/* =========================================================
   TABLE TALK: the thin layer of type over the 3D table
   ========================================================= */
const $ = s => document.querySelector(s);
const helperMark = t => t < 27 ? `<i class="hm s${suitOf(t)}">${t % 9 + 1}</i>` : t < 31 ? `<i class="hm w">${'ESWN'[t - 27]}</i>` : '';
function tileHTML(t, cls = ''){ return `<span class="tile f${t} ${cls}" data-t="${t}" title="${tName(t)}" role="img" aria-label="${tName(t)}">${settings.helpers ? helperMark(t) : ''}</span>`; }
const rowHTML = (ts, cls = '') => `<div class="row">${ts.map(t => t === null ? '<span class="gap"></span>' : tileHTML(t, cls)).join('')}</div>`;
function injectTileCSS(){
  const st = document.createElement('style');
  st.textContent = V.IMG.map((u, t) => `.f${t}{background-image:url(${u})}`).join('');
  document.head.appendChild(st);
}
const GLYPH = { win:'和', pung:'碰', chow:'上', kong:'槓' };
let tenseNow = -1;
function render(){
  if (!S || autotest) return;
  const me = S.players[0], ui = S.ui || {};
  const canDiscard = ui.mode === 'discard';
  // the hand, mirrored as real buttons for keyboards and screen readers
  const hand = $('#hand');
  const focusedId = document.activeElement && document.activeElement.closest && document.activeElement.closest('#hand .tile') ? document.activeElement.dataset.id : null;
  const ord = handOrder(), byId = new Map(me.hand.map(x => [x.id, x]));
  const one = (x, extra) => `<button class="tile ${extra}" data-id="${x.id}" role="option" tabindex="${canDiscard || ui.mode === 'chowpick' ? 0 : -1}" aria-label="${tName(x.t)}" aria-selected="${S.selected === x.id}"></button>`;
  hand.innerHTML = S.turn === -1 ? '' : ord.ids.map((id, i) => one(byId.get(id), i >= ord.ids.length - ord.loose ? 'drawn' : '')).join('');
  if (focusedId){ const f = hand.querySelector(`[data-id="${focusedId}"]`); if (f) f.focus(); }
  // calls: a quiet row at the table edge. Pass and every call are the same size; nothing is chosen for you
  const acts = ui.actions || [], lvl = ui.level || callLevel(), showRec = (lvl === 'guided' && settings.coach === 2) || S.showRec || S.mode === 'tut';
  const whys = acts.filter(a => a.why), distinct = new Set(whys.map(a => a.why)), why = (distinct.size > 1 && lvl !== 'guided' ? whys.map(a => `<div>${a.label}: ${a.why.replace(/^./, m => m.toLowerCase())}</div>`) : [...distinct].map(w => `<div>${w}</div>`)).join('');
  const key = acts.map(a => a.label + (a.why || '')).join('|') + showRec + lvl + ui.mode;
  const box = $('#actions');
  if (box._k !== key){
    box._k = key;
    box.className = 'lv-' + lvl + (ui.mode === 'claim' ? ' claim' : '');
    box.innerHTML = (why && ui.mode === 'claim' ? `<div class="whyline">${why}</div>` : '') + `<div class="calls">${acts.map((a, i) => `<button class="call k-${a.kind} ${showRec && a.rec ? 'rec' : ''}" data-act="${i}"><span class="lb">${a.label}</span>${a.key && a.key.length === 1 && a.key !== ' ' ? `<kbd>${a.key.toUpperCase()}</kbd>` : a.key === ' ' ? '<kbd>Space</kbd>' : ''}</button>`).join('')}</div>`;
  }
  document.body.classList.toggle('moment', !!ui.moment);
  document.body.classList.toggle('picking', ui.mode === 'chowpick');
  // one quiet line, and the tiles you are waiting for
  let msg = S.say && S.say.until > Date.now() ? S.say.text : (ui.coach || '');
  // while the others play, name what was just thrown so the table is easy to follow
  if (!msg && S.turn > 0 && S.lastDiscard && S.lastDiscard.from > 0){ const d = S.players[S.lastDiscard.from].discards.slice(-1)[0]; if (d && d.id === S.lastDiscard.id) msg = `<i class="dot" style="background:${SEAT[S.lastDiscard.from].bright}"></i>${S.players[S.lastDiscard.from].name} threw ${tileHTML(d.t)} ${tName(d.t)}`; }
  $('#coach').innerHTML = msg ? `<span>${msg}</span>` : '';
  let g = '';
  if (S.turn !== -1 && S.mode !== 'lesson'){
    if (me.hand.length % 3 === 1) S.waits = myWaits();
    const w = S.waits || [];
    if (w.length && (me.hand.length % 3 === 1 || S.wasReady)) g = `<span class="near">Ready</span>` + w.map(x => `<span class="ghost ${x.left ? '' : 'none'}" title="${tName(x.t)}, ${x.left} unseen">${tileHTML(x.t)}<i>${x.left}</i></span>`).join('');
    else if (settings.coach === 2 && me.hand.length){ const st = stepsToWin(); if (st > 0 && st < 9) g = `<span class="near dim">${st} ${st === 1 ? 'tile' : 'tiles'} from ready</span>`; }
  }
  const gh = $('#ghosts'); if (gh._h !== g){ gh.innerHTML = g; gh._h = g; }
  $('#bPace').textContent = PACE_NAME[settings.pace] || 'Relaxed';
  $('#bView').classList.toggle('on', V.tableView); $('#bView').setAttribute('aria-pressed', V.tableView);
  $('#bSort').hidden = !manualRack();
  renderRecent();
  const tense = S.turn !== -1 && (S.wasReady || S.wall.length < 16) ? 1 : 0;
  if (tense !== tenseNow){ tenseNow = tense; setTension(tense); }
  V.sync();
  placeCallout();
}
function placeCallout(){
  const el = $('#callout'), c = S && S.callout;
  if (!c){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<p>${c.text}</p>${c.more ? '<button class="tbtn prime" data-more>Continue</button>' : ''}`;
  const cs = getComputedStyle(document.documentElement), hh = parseFloat(cs.getPropertyValue('--handH')) || 0, sh = parseFloat(cs.getPropertyValue('--stripH')) || 0;
  let x = innerWidth / 2, bottom = hh + sh + 14;
  if (c.at === 'tile' && innerWidth >= 720){ const p = V.handXY(c.id); if (p){ x = p.x; bottom = innerHeight - p.y + 12; } }
  else if (c.at === 'tile') bottom = hh + sh + 6;
  else if (c.at === 'actions') bottom = hh + sh + 92;
  else if (c.at === 'ghosts'){ x = Math.min(innerWidth / 2, 190); bottom = hh + sh + 8; }
  else if (c.at === 'rack') bottom = hh + sh * .5;
  const w = Math.min(320, innerWidth - 24); x = Math.max(12 + w / 2, Math.min(innerWidth - 12 - w / 2, x));
  el.style.width = w + 'px'; el.style.left = (x - w / 2) + 'px'; el.style.bottom = bottom + 'px';
  if (c.more){ const b = el.querySelector('[data-more]'); if (b && !document.activeElement.closest('#callout')) b.focus({ preventScroll:true }); }
}

/* a call, painted across the table in the caller's colour */
function callStroke(pi, type, ms = 950){
  if (autotest || !S) return;
  const p = V.seatXY(pi, pi === 0 ? 5 : 6.5), el = document.createElement('div');
  el.className = 'stroke'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.color = SEAT[pi].bright; el.style.setProperty('--ms', ms + 'ms');
  el.innerHTML = `<b>${GLYPH[type]}</b><span>${type === 'win' ? (pi === 0 ? 'You win' : S.players[pi].name + ' wins') : S.players[pi].name + ': ' + type[0].toUpperCase() + type.slice(1)}</span>`;
  $('#strokes').appendChild(el); setTimeout(() => el.remove(), ms + 500);
}

/* tap anything on the table to ask what it is */
function explainHit(hit){
  if (!S) return;
  if (S.mode === 'lesson' && typeof lessonTap === 'function' && lessonTap(hit)) return;
  if (S.claimWin && hit.kind === 'tile' && hit.id === S.claimWin.id){ S.claimWin.tap(); return; }
  if (S.ui && S.ui.mode === 'read'){ S.ui.resolve(); return; }
  if (hit.kind === 'marker') return say(`${WIND_NAME[S.roundWind]} round, ${S.wall.length} tiles left in the wall. A Pung of ${WIND_NAME[S.roundWind]} Winds scores 1 fan for anyone this round.`, 5200);
  if (hit.kind === 'plaque'){
    const p = S.players[hit.pi], w = seatWind(hit.pi);
    return say(`${hit.pi === 0 ? 'You' : p.name}: ${WIND_NAME[w]} seat${w === 0 ? ', dealing this hand' : ''}, ${p.score} points. A Pung of ${WIND_NAME[w]} Winds scores 1 fan for this seat.`, 5200);
  }
  const id = hit.id;
  for (let pi = 0; pi < 4; pi++){
    const p = S.players[pi], who = pi === 0 ? 'You' : p.name;
    const d = p.discards.find(x => x.id === id);
    if (d) return say(`${explainTile(d.t)} ${unseenFor(0)[d.t]} unseen.`, 5200);
    const m = p.melds.find(m => m.tiles.some(x => x.id === id));
    if (m) return say(`${pi === 0 ? 'Your' : who + '\'s'} ${m.type === 'chow' ? 'Chow: a run of three in one suit, like a straight in poker' : m.type === 'pung' ? 'Pung: three of a kind, like trips in poker' : 'Kong: four of a kind, like quads in poker'}.`, 5200);
    const f = p.flowers.find(x => x.id === id);
    if (f) return say(explainTile(f.t), 5200);
    if (pi > 0 && p.hand.some(x => x.id === id)) return say(S.turn === -1 ? explainTile(p.hand.find(x => x.id === id).t) : `${who}'s hand: ${p.hand.length} tiles, hidden until someone wins.`, 4200);
    if (pi === 0 && S.turn === -1){ const h = p.hand.find(x => x.id === id); if (h) return say(explainTile(h.t), 5200); }
  }
  if (S.wall.some(x => x.id === id)) say(`The wall: ${S.wall.length} tiles left to draw. If it runs out, the hand is a draw and nobody pays.`, 4600);
}

document.addEventListener('click', e => {
  if (!S) return;
  if (e.target.closest('[data-more]') || (S.ui && S.ui.mode === 'read' && !e.target.closest('button, canvas'))){ if (S.ui && S.ui.mode === 'read') S.ui.resolve(); return; }
  const actBtn = e.target.closest('[data-act]');
  if (actBtn && S.ui && S.ui.actions){ const a = S.ui.actions[+actBtn.dataset.act]; if (!a) return; S.showRec = false; if (!a.value) snd('pick'); S.ui.resolve(a.value); return; }
  if (e.target.closest('#newest') && S.claimWin){ S.claimWin.tap(); return; }
  const tile = e.target.closest('#hand .tile');
  if (tile){
    const id = +tile.dataset.id;
    if (S.mode === 'lesson' && typeof lessonRackTap === 'function' && lessonRackTap(id)) return;
    if (S.ui && S.ui.mode === 'chowpick'){ chowTap(id); return; }
    if (S.ui && S.ui.mode === 'read'){ S.ui.resolve(); return; }
    if (!S.ui || S.ui.mode !== 'discard'){ V.nudge(id); snd('nope'); return; }
    if (S.selected === id || settings.oneTap){ if (!tryDiscard(id)) render(); }
    else {
      S.selected = id; snd('pick');
      const x = S.players[0].hand.find(h => h.id === id);
      const n = x ? onTable(x.t) : 0, tbl = n ? ` ${n} already on the table, marked in blue.` : '';
      if (x && settings.coach && S.mode !== 'tut') say(explainTile(x.t) + tbl, 4200); else if (x && n) say(`${tName(x.t)}:${tbl}`, 3200); else render();
    }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#overlayRoot .book')){ closeBook(); return; }
  if (!S || $('#screen-game').hidden || $('#overlayRoot').firstChild) return;
  if (e.target.closest && e.target.closest('input')) return;
  const k = e.key.toLowerCase();
  if (S.ui && S.ui.mode === 'read'){ if (k === 'enter' || k === ' '){ e.preventDefault(); S.ui.resolve(); } return; }
  if (k === 'h'){ hint(); return; }
  if (k === 'f'){ $('#bPace').click(); return; }
  if (k === 't'){ $('#bView').click(); return; }
  if (k === 's' && manualRack()){ sortOnce(); return; }
  if (k === 'escape' && S.ui && S.ui.mode === 'chowpick'){ S.ui.resolve(null); return; }
  if (k === 'm' || k === 'escape'){ openBook('settings'); return; }
  const acts = (S.ui && S.ui.actions) || [];
  const ai = acts.findIndex(a => a.key === k);
  if (ai >= 0 && !(k === ' ' && document.activeElement && document.activeElement.closest('#hand'))){ e.preventDefault(); const b = document.querySelector(`[data-act="${ai}"]`); if (b) b.click(); return; }
  const tiles = [...document.querySelectorAll('#hand .tile')];
  if (!tiles.length) return;
  const cur = tiles.indexOf(document.activeElement);
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.shiftKey && cur >= 0){
    e.preventDefault(); const id = +tiles[cur].dataset.id; moveInRack(id, e.key === 'ArrowRight' ? 1 : -1);
    setTimeout(() => { const f = document.querySelector(`#hand [data-id="${id}"]`); if (f) f.focus(); }, 0); return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
    e.preventDefault();
    const n = cur < 0 ? (e.key === 'ArrowRight' ? 0 : tiles.length - 1) : (cur + (e.key === 'ArrowRight' ? 1 : -1) + tiles.length) % tiles.length;
    tiles[n].focus();
  } else if ((e.key === 'Enter' || e.key === ' ') && cur >= 0){ e.preventDefault(); tiles[cur].click(); }
});
$('#hand').addEventListener('focusin', e => { const t = e.target.closest('.tile'); V.setFocus(t ? +t.dataset.id : null); });
$('#hand').addEventListener('focusout', () => V.setFocus(null));
$('#bHint').onclick = hint;
const PACE_NAME = { relaxed:'Relaxed', normal:'Normal', fast:'Fast' };
$('#bPace').onclick = () => { const o = ['relaxed', 'normal', 'fast']; settings.pace = o[(o.indexOf(settings.pace) + 1) % 3]; save(); snd('pick'); if (S){ say(`Speed: ${PACE_NAME[settings.pace]}.`, 1400); render(); } };
$('#bView').onclick = () => onTableView(!V.tableView);
$('#bSort').onclick = () => sortOnce();
function onTableView(on){ if (!S) return; V.setTableView(on); snd('pick'); render(); }

/* ---------------- what follows the table: the newest discard, last turns, the Expert claim window ---------------- */
function renderRecent(){
  const el = $('#recent'); if (!el) return;
  const items = S && S.turn !== -1 && S.mode !== 'lesson' ? S.recent || [] : [];
  const k = items.map(r => r.id).join() + '|' + (S ? S.wall.length : '') + settings.helpers;
  if (el._k === k) return; el._k = k;
  if (!items.length && !(S && S.turn !== -1 && S.mode !== 'lesson')){ el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="rl">Last turns</span>${items.map((r, i) => `<span class="ri ${i === items.length - 1 ? 'new' : ''}"><b style="--c:${SEAT[r.from].bright}">${r.from === 0 ? 'You' : S.players[r.from].name}</b>${tileHTML(r.t)}</span>`).join('')}<span class="rw">${S.wall.length} left</span>`;
}
function placeFollowers(){
  const nw = $('#newest'); if (!nw) return;
  const n = S && S.newest && S.turn !== -1 ? S.newest : null;
  if (!n){ if (!nw.hidden){ nw.hidden = true; nw._k = ''; } return; }
  const px = V.tilePx(n.id), w = Math.round(Math.max(44, Math.min(70, px * 1.55))), k = n.id + ':' + w + ':' + !!S.claimWin + settings.helpers;
  if (nw._k !== k){
    nw._k = k; nw.hidden = false; nw.classList.toggle('open', !!S.claimWin);
    nw.innerHTML = `${tileHTML(n.t)}<b style="--c:${SEAT[n.from].bright}">${n.from === 0 ? 'You' : S.players[n.from].name}</b>${S.claimWin ? `<i class="cw" style="--ms:${Math.max(0, S.claimWin.until - Date.now())}ms"></i>` : ''}`;
    nw.style.setProperty('--w', w + 'px');
  }
  const p = V.pointXY(0, 0, .3); nw.style.left = p.x + 'px'; nw.style.top = p.y + 'px';
}
/* press and hold any tile, on the table, the rack or a page, to see what it is */
let infoTimer = 0;
function onHold(hit, x, y){
  if (!S && !hit.page) return;
  const el = $('#info'), t = hit.t;
  let html;
  if (t == null) html = `<b>A face-down tile</b><span>${hit.id != null && S && S.wall.some(w => w.id === hit.id) ? `The wall: ${S.wall.length} tiles left to draw.` : 'Hidden until someone wins.'}</span>`;
  else {
    const kind = t < 27 ? `${SUIT_NAME[suitOf(t)]} suit, number ${numOf(t)}` : t < 31 ? 'A Wind. It has no number and only matches itself.' : t < 34 ? 'A Dragon. It has no number and only matches itself.' : 'A bonus tile. It is set aside at once and replaced.';
    const unseen = S && S.mode !== 'lesson' && S.turn !== -1 && t < 34 ? unseenFor(0)[t] : null;
    html = `<div class="ih">${tileHTML(t)}<b>${tName(t)}</b></div><span>${kind}</span>${unseen != null ? `<span>${unseen} of 4 still unseen by you</span>` : t < 34 ? '<span>There are 4 of every tile.</span>' : ''}`;
    if (S && t < 34){ S.holdT = t; V.sync(); }
  }
  el.innerHTML = html; el.hidden = false;
  const w = Math.min(260, innerWidth - 24); el.style.width = w + 'px';
  el.style.left = Math.max(12, Math.min(innerWidth - w - 12, x - w / 2)) + 'px';
  el.style.top = Math.max(12, y - 140) + 'px';
  snd('pick'); haptic(8);
  clearTimeout(infoTimer); infoTimer = setTimeout(hideInfo, 4200);
}
function hideInfo(){ const el = $('#info'); if (el) el.hidden = true; if (S && S.holdT != null){ S.holdT = null; V.sync(); } }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#info')) { const el = $('#info'); if (el && !el.hidden) setTimeout(hideInfo, 0); } }, true);
// the paper pages, the strip and the slip: hold a pictured tile too
{ let ht = 0; document.addEventListener('pointerdown', e => { const t = e.target.closest('.tile[data-t]'); if (!t || e.target.closest('#hand')) return; const x = e.clientX, y = e.clientY; clearTimeout(ht); ht = setTimeout(() => onHold({ t: +t.dataset.t, page: true }, x, y), 460); const stop = () => { clearTimeout(ht); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); }; addEventListener('pointerup', stop); addEventListener('pointercancel', stop); }); }
$('#bMenu').onclick = () => openBook('settings');

/* ---------------- the win ---------------- */
const HE = [ // 和, stroke by stroke (禾 then 口), in a 100 x 100 box
  'M41 13C34 18 25 21 15 23', 'M12 39C24 38 38 36 50 35', 'M31 23C31 45 31 68 30 91', 'M30 43C25 57 18 66 8 74', 'M33 47C38 52 43 56 47 61',
  'M60 38C61 52 61 64 62 78', 'M60 37C70 36 80 35 90 34C89 48 89 61 88 76', 'M63 74C71 73 79 72 87 72'
];
function paintWin(hold = 1900){
  if (autotest) return;
  const el = document.createElement('div'); el.className = 'brush';
  el.innerHTML = `<svg viewBox="0 0 100 100" filter="url(#brushy)">${HE.map((d, i) => `<path d="${d}" pathLength="1" stroke="#EFE6D2" stroke-width="${[6,7.5,7,6.5,6,7,7,7][i]}" style="animation-delay:${.05 + i * .13}s"/>`).join('')}<g transform="translate(84 84)"><rect x="-7" y="-7" width="14" height="14" rx="1.5" fill="#B3261E"/><text y="4" font-size="11" text-anchor="middle" fill="#EFE6D2" font-family="TWbrush">風</text></g></svg>`;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, hold);
}

/* ---------------- screens ---------------- */
let screenNow = null;
function ensureTiles(){ if (!V.IMG.length){ V.renderTileImages(); injectTileCSS(); } }
function showScreen(name){
  if (name === 'game') ensureTiles();
  for (const s of ['home','game']) $('#screen-' + s).hidden = s !== name;
  if (name !== screenNow){ screenNow = name; V.setMode(name); }
}
function goHome(){ token++; S = null; LS = null; $('#lesson').hidden = true; document.body.classList.remove('inlesson', 'picking'); hideInfo(); tenseNow = -1; setTension(0); $('#overlayRoot').innerHTML = ''; $('#strokes').innerHTML = ''; document.body.classList.remove('moment'); renderHome(); showScreen('home'); }

const LENGTHS = [[1, 'Quick hand', 'One hand'], [4, 'East round', 'Four hands'], [16, 'Full game', 'Four rounds, sixteen hands']];
function renderHome(){
  const r = peekResume(), k = dayKey(), db = profile.daily[k], qs = todaysQuests(), qd = qs.filter(q => profile.quests.done[q.id]).length;
  const len = LENGTHS.find(l => l[0] === settings.length) || LENGTHS[1];
  const playSub = r ? (r.totalHands > 1 ? `Continue: ${WIND_NAME[Math.floor(r.handNo / 4) % 4]} round, hand ${r.handNo + 1} of ${r.totalHands}` : 'Continue your hand') : `${len[1]}, ${STYLES[settings.difficulty].name.toLowerCase()}`;
  const daySub = (db !== undefined ? `Best today ${db > 0 ? '+' : ''}${db}` : 'Today\'s deal is waiting') + (profile.dailyDays ? `, ${profile.dailyDays} ${profile.dailyDays === 1 ? 'day' : 'days'} played` : '');
  $('#screen-home').innerHTML = `<div class="mark"><span class="wm">Tilewind</span><span class="seal">風</span></div>
    <nav class="choices" aria-label="Tilewind">
      <button class="choice c0" id="hPlay"><b>Play</b><small>${playSub}</small></button>
      <button class="choice c1" id="hDaily"><b>Daily Hand</b><small>${daySub}</small></button>
      <button class="choice c2" id="hBook"><b>Collection</b><small>${stampCount()} of ${COLLECTION.length} hands, ${qd} of 3 quests</small></button>
    </nav>`;
  $('#hPlay').onclick = () => { arm(); playOrResume(); };
  $('#hDaily').onclick = () => { arm(); startGame('daily'); };
  $('#hBook').onclick = () => openBook('hands');
  setTimeout(() => { const b = $('#hPlay'); if (b && !$('#overlayRoot').firstChild) b.focus({ preventScroll:true }); }, 0);
}

/* ---------------- the book: collection, tables, today, rules, settings ---------------- */
let bookTab = 'hands', lessonIdx = 0;
const TABS = [['hands', 'Hands'], ['tables', 'Tables'], ['today', 'Today'], ['records', 'Records'], ['rules', 'Rules'], ['settings', 'Settings']];
function closeBook(){ $('#overlayRoot').innerHTML = ''; if (S) render(); else renderHome(); }
function openBook(tab){
  if (S && S.ui && S.ui.mode === 'read') return;
  if ($('#overlayRoot .slip')) return;
  bookTab = tab || bookTab; ensureTiles(); if (S && V.tableView) V.setTableView(false);
  const inGame = !!S;
  const root = $('#overlayRoot');
  root.innerHTML = `<div class="overlay"><div class="book paper" role="dialog" aria-modal="true" aria-label="Collection">
    <div class="tabs" role="tablist">${TABS.map(([id, n]) => `<button role="tab" data-tab="${id}" aria-selected="${id === bookTab}" class="${id === bookTab ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="bbody" id="bbody"></div>
    <div class="bfoot">${inGame ? `<button class="tbtn" data-home>Home</button>${S.mode === 'tut' ? '<button class="tbtn" data-skip>Skip the guided hand</button>' : S.mode === 'play' ? '<button class="tbtn" data-new>New match</button>' : ''}` : ''}<button class="tbtn prime" data-close>${inGame ? 'Back to the table' : 'Close'}</button></div>
  </div></div>`;
  const bk = root.querySelector('.book');
  bk.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; bookTab = b.dataset.tab; snd('pick'); bk.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); drawTab(); };
  bk.querySelector('[data-close]').onclick = closeBook;
  const h = bk.querySelector('[data-home]'); if (h) h.onclick = () => goHome();
  const sk = bk.querySelector('[data-skip]'); if (sk) sk.onclick = () => { profile.tut = true; save(); goHome(); };
  const nw = bk.querySelector('[data-new]'); if (nw) nw.onclick = () => { root.innerHTML = ''; startGame('play'); };
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.classList.contains('overlay')) closeBook(); });
  drawTab(); bk.querySelector('[data-close]').focus({ preventScroll:true });
}
function drawTab(){
  const el = $('#bbody'); if (!el) return; el.scrollTop = 0;
  if (bookTab === 'hands'){
    el.innerHTML = `<p class="blead">Every scoring pattern in the game. Win with one and it is stamped here with the date.</p><div class="cards">${COLLECTION.map(c => {
      const d = profile.stamps[c.id];
      return `<div class="card ${d ? 'got' : ''}"><div class="ch"><b>${c.name}</b><span>${c.fan} fan</span></div>${rowHTML(c.ex, d ? '' : 'sil')}<p>${d ? c.hint : c.hint}</p>${d ? `<span class="stamp"><i>印</i>${niceDate(d)}</span>` : ''}</div>`; }).join('')}</div>`;
  } else if (bookTab === 'tables'){
    const nt = nextTheme();
    el.innerHTML = `<p class="blead">${nt ? `Quests and finished matches open new tables. Next: ${nt.name}, ${profile.themePts} of ${nt.need}.` : 'All six tables are open.'}</p><div class="swatches">${THEMES.map(t => {
      const open = themeOpen(t), c = n => '#' + n.toString(16).padStart(6, '0');
      return `<button class="sw ${profile.theme === t.id ? 'on' : ''}" data-theme="${t.id}" data-open="${open ? 1 : 0}"><span class="felt" style="background:${c(t.felt)}"><i class="rl" style="background:${t.wood === 'light' ? '#b08a5a' : '#4a2e1c'};box-shadow:inset 0 0 0 99px ${c(t.rail)}55"></i><i class="bk" style="background:${c(t.back)}"></i><i class="iv"></i></span><b>${t.name}</b><small>${open ? (profile.theme === t.id ? 'On the table' : 'Open') : `${t.need - profile.themePts} more to open. Tap to look.`}</small></button>`; }).join('')}</div>${cosHTML()}`;
    el.querySelectorAll('[data-cos]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.cos.split(':'), it = cosItem(k, id), open = cosOpen(it); snd('pick');
      peek(`${it.name} ${COS_NAME[k].toLowerCase()}${open ? '' : `. Opens in ${it.need - profile.cosPts} more.`}`, { [k]: id }, open, () => { profile.cos[k] = id; save(); snd('place'); }); });
    el.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { const t = themeOf(b.dataset.theme);
      if (b.dataset.open === '1'){ profile.theme = t.id; save(); V.applyTheme(t); applyCos(); snd('place'); drawTab(); }
      else { snd('pick'); peek(`${t.name}. Opens in ${t.need - profile.themePts} more quests or matches.`, {}, false, null, t.id); } });
  } else if (bookTab === 'today'){
    const ri = rankInfo(), qs = todaysQuests(), nt = nextTheme(), db = profile.daily[dayKey()];
    el.innerHTML = `<div class="rankbig"><span class="rseal">${ri.seal}</span><div><b>${ri.name}</b><div class="bar"><i style="width:${Math.round(ri.frac * 100)}%"></i></div><small>${ri.next ? `${ri.into} of ${ri.need} to ${ri.next}` : 'The top rank'}</small></div></div>
      <div class="ladder">${RANKS.map((r, i) => `<span class="${i <= ri.i ? 'on' : ''}"><i>${r.seal}</i>${r.name}</span>`).join('')}</div>
      <h3>Today's quests</h3><div class="quests">${qs.map(q => `<div class="${profile.quests.done[q.id] ? 'done' : ''}"><i></i>${q.text}</div>`).join('')}</div>
      <p class="blead">${nt ? `Each quest is one step toward ${nt.name}: ${profile.themePts} of ${nt.need}.` : 'Every table is open. Quests still count toward your record.'}</p>
      ${weeklyHTML()}`;
    $('#wkPlay').onclick = () => { $('#overlayRoot').innerHTML = ''; arm(); startGame('weekly'); };
  } else if (bookTab === 'records'){
    el.innerHTML = recordsHTML();
  } else if (bookTab === 'rules'){
    const L = LESSONS[lessonIdx], last = lessonIdx === LESSONS.length - 1;
    const quiz = L.quiz ? `<div class="quiz"><div class="quiz-q">${L.quiz.q}</div><div class="quiz-opts">${L.quiz.opts.map((o, i) => `<button class="quiz-opt" data-q="${i}">${rowHTML(o[0])}</button>`).join('')}</div><div class="quiz-fb" id="qfb"></div></div>` : '';
    el.innerHTML = `<article class="page"><div class="eyebrow">${L.eyebrow}</div><h2>${L.title}</h2>${L.body()}${quiz}</article>
      <div class="booknav"><button class="tbtn" id="lPrev" ${lessonIdx === 0 ? 'disabled' : ''}>Previous</button><span class="pg">${lessonIdx + 1} of ${LESSONS.length}</span><button class="tbtn" id="lNext" ${last ? 'disabled' : ''}>Next</button></div>`;
    $('#lPrev').onclick = () => { if (lessonIdx > 0){ lessonIdx--; drawTab(); } };
    $('#lNext').onclick = () => { if (!last){ lessonIdx++; drawTab(); } };
    el.querySelectorAll('.quiz-opt').forEach(b => b.onclick = () => { const o = L.quiz.opts[+b.dataset.q]; b.classList.remove('right','wrong'); void b.offsetWidth; b.classList.add(o[2] ? 'right' : 'wrong'); $('#qfb').textContent = o[1]; snd(o[2] ? 'place' : 'nope'); });
  } else {
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const tog = key => seg(key, [[true,'On'],[false,'Off']]);
    const sl = key => `<input type="range" min="0" max="1" step="0.05" value="${settings[key]}" data-sl="${key}" aria-label="${key === 'music' ? 'Music volume' : 'Effects volume'}">`;
    el.innerHTML = `
      <div class="set"><div>How you play<small>${profile.kind ? KINDS.find(k => k.id === profile.kind).line : 'Sets the coach, the tiles and the table in one tap. Everything below can still be changed.'}</small></div><div class="seg" data-key="kind">${KINDS.map(k => `<button data-v="${k.id}" class="${profile.kind === k.id ? 'on' : ''}">${{ new:'New', casual:'Casual', veteran:'Lifelong' }[k.id]}</button>`).join('')}</div></div>
      <div class="set"><div>Coach<small>${['Silent.', 'Speaks up only before a clear mistake.', 'Marks a suggested discard and advises on calls.'][settings.coach]}</small></div>${seg('coach', [[2,'Full'],[1,'Nudge'],[0,'Off']])}</div>
      <div class="set"><div>Opponents<small>${STYLES[settings.difficulty].line} From your next match.</small></div>${seg('difficulty', STYLES.map((s, i) => [i, ['Loose','Careful','Hunters','Old hands'][i]]))}</div>
      <div class="set"><div>Match<small>${(LENGTHS.find(l => l[0] === settings.length) || LENGTHS[1])[2]}. From your next match.</small></div>${seg('length', LENGTHS.map(l => [l[0], l[1]]))}</div>
      <div class="set"><div>Music</div>${sl('music')}</div>
      <div class="set"><div>Effects</div>${sl('sfx')}</div>
      <div class="set"><div>Speed<small>${{ relaxed:'Each opponent takes about a second and a half, and every discard rests long enough to read.', normal:'About a second per opponent.', fast:'About half a second per opponent.' }[settings.pace]}</small></div>${seg('pace', [['relaxed','Relaxed'],['normal','Normal'],['fast','Fast']])}</div>
      <div class="set"><div>Call prompts<small>${{ guided:'Each call is explained: what it completes and what it costs you.', standard:'A small, even prompt at the table edge. Nothing is suggested.', expert:'No prompt. Tap a discard yourself while it can still be taken, as at a real table.' }[settings.calls]}</small></div>${seg('calls', [['guided','Guided'],['standard','Standard'],['expert','Expert']])}</div>
      <div class="set"><div>Tile helpers<small>A number in the corner of every suit tile and a letter on every wind, on the rack and on the table. Off is the traditional view.</small></div>${tog('helpers')}</div>
      <div class="set"><div>Auto sort<small>${settings.autoSort === 'off' ? 'Off: your rack keeps the order you set, and a new tile waits on the right until you place it. Sort, by the rack, tidies it once.' : 'On: the rack sorts itself. Drag tiles along the rack to arrange them yourself.'}</small></div>${seg('autoSort', [['on','On'],['off','Off']])}</div>
      <div class="set"><div>Sort by<small>${settings.sortStyle === 'sets' ? 'Likely sets first, then pairs, then tiles that are close, then loose tiles.' : 'Suit, then number.'}</small></div>${seg('sortStyle', [['suit','Suit and number'],['sets','Likely sets']])}</div>
      <div class="set"><div>One-tap discard<small>Off: tap to lift, tap again to throw. Dragging up always throws; dragging along the rack rearranges.</small></div>${tog('oneTap')}</div>
      <div class="set"><div>Large tiles<small>A bigger rack, for small screens and tired eyes.</small></div>${tog('big')}</div>
      <div class="set"><div>Graphics<small>Now ${['Low', 'Medium', 'High'][V.tier]}${settings.quality === 'auto' ? ', chosen for this device' : ''}. High has the softest shadows; Low keeps the frame rate on older devices.</small></div>${seg('quality', [['auto','Auto'],[2,'High'],[1,'Medium'],[0,'Low']])}</div>
      ${navigator.vibrate ? `<div class="set"><div>Vibration<small>A light tap on discards and calls.</small></div>${tog('haptics')}</div>` : ''}
      <div class="set"><div>Learn the tiles<small>About two minutes, hands on: the suits, the honours, the winning hand and a turn.</small></div><button class="tbtn" id="sLesson">Start</button></div>
      <div class="set" style="border:0"><div>Guided first hand<small>One real hand with an easy deal, every step explained.</small></div><button class="tbtn" id="sTut">Play it</button></div>`;
    el.querySelectorAll('.seg').forEach(sg => sg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
      const key = sg.dataset.key;
      if (key === 'kind') setKind(v); else if (key === 'autoSort') setAutoSort(v); else settings[key] = v;
      if (key === 'quality') V.setTier(v); if (key === 'big') V.resize(); if (key === 'helpers' || key === 'kind') V.setHelpers(settings.helpers);
      save(); snd('pick'); const top = el.scrollTop; drawTab(); el.scrollTop = top;
    }));
    el.querySelectorAll('[data-sl]').forEach(i => i.oninput = () => { settings[i.dataset.sl] = +i.value; save(); arm(); setVolumes(); if (i.dataset.sl === 'sfx') snd('place'); });
    $('#sTut').onclick = () => { $('#overlayRoot').innerHTML = ''; arm(); startGame('tut'); };
    $('#sLesson').onclick = () => { $('#overlayRoot').innerHTML = ''; arm(); startLesson(); };
  }
}
function toast(title, body){
  if (autotest) return;
  const t = document.createElement('div'); t.className = 'toast paper'; t.innerHTML = `<b>${title}</b>${body}`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
