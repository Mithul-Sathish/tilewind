/* =========================================================
   TABLE TALK: the thin layer of type over the 3D table
   ========================================================= */
const $ = s => document.querySelector(s);
/* ---------------- motion for the type layer: nothing appears or vanishes in one frame ----------------
   Panels fade and rise a few pixels (160 to 260 ms); what leaves fades while what replaces it fades in.
   Only opacity and transform are animated. With reduced motion the CSS keeps the fades and drops the movement. */
const reducedUI = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function leave(el, ms = 180){
  if (!el || el.classList.contains('leaving')) return;
  el.classList.add('leaving'); el.style.pointerEvents = 'none'; el.setAttribute('aria-hidden', 'true');
  el.removeAttribute('id'); el.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); // so the page that replaces it owns its ids
  setTimeout(() => el.remove(), ms);
}
const overlayOpen = () => [...$('#overlayRoot').children].some(c => !c.classList.contains('leaving'));
const overlayEl = sel => $('#overlayRoot').querySelector(`:scope > :not(.leaving) ${sel}, :scope > ${sel}:not(.leaving)`);
function setOverlay(html){ const r = $('#overlayRoot'); [...r.children].forEach(c => leave(c)); r.insertAdjacentHTML('beforeend', html); return r.lastElementChild; }
function closeOverlay(){ [...$('#overlayRoot').children].forEach(c => leave(c)); }
/* swap the contents of a line: the old words fade out where they are while the new ones fade in over them */
function swapFade(el, html){
  if (el._h === html) return; el._h = html;
  const old = [...el.children].filter(c => c.classList.contains('sw-in') || !c.classList.contains('sw-out'));
  old.forEach(c => { c.classList.remove('sw-in'); c.classList.add('sw-out'); setTimeout(() => c.remove(), 170); });
  if (html){ const n = document.createElement('span'); n.className = 'sw-in'; n.innerHTML = html; el.appendChild(n); }
}
/* hide with a fade instead of a cut */
function fadeHide(el, ms = 160){
  if (!el || el.hidden || el.classList.contains('fading')) return;
  el.classList.add('fading'); clearTimeout(el._ft);
  el._ft = setTimeout(() => { el.hidden = true; el.classList.remove('fading'); }, ms);
}
function fadeShow(el){ if (!el) return; clearTimeout(el._ft); el.classList.remove('fading'); el.hidden = false; }
/* items that stay but move (the last-turns row): they slide to their new place instead of jumping */
function flip(container, sel, key, change){
  const before = new Map(); container.querySelectorAll(sel).forEach(e => before.set(e.dataset[key], e.getBoundingClientRect().left));
  change();
  if (reducedUI()) return;
  container.querySelectorAll(sel).forEach(e => {
    const b = before.get(e.dataset[key]); if (b == null) return;
    const dx = b - e.getBoundingClientRect().left; if (Math.abs(dx) < 1) return;
    e.style.transition = 'none'; e.style.transform = `translateX(${dx}px)`;
    requestAnimationFrame(() => { e.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1)'; e.style.transform = ''; });
  });
}
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
  const whys = acts.filter(a => a.why && (a.kind !== 'pass' || acts.length === 1)), distinct = new Set(whys.map(a => a.why)), why = (distinct.size > 1 && lvl !== 'guided' ? whys.map(a => `<div>${a.label}: ${a.why.replace(/^./, m => m.toLowerCase())}</div>`) : [...distinct].map(w => `<div>${w}</div>`)).join('');
  const key = acts.map(a => a.label + (a.why || '')).join('|') + showRec + lvl + ui.mode;
  const box = $('#actions');
  if (box._k !== key){
    box._k = key;
    box.className = 'lv-' + lvl + (ui.mode === 'claim' ? ' claim' : '');
    // the old row fades where it stood; the new buttons rise in one after another, 30 ms apart
    [...box.children].forEach(c => { if (c.classList.contains('leaving')) return; c.classList.add('actout'); leave(c, 150); });
    if (acts.length) box.insertAdjacentHTML('beforeend', (why && ui.mode === 'claim' ? `<div class="whyline">${why}</div>` : '') + `<div class="calls">${acts.map((a, i) => `<button class="call k-${a.kind} ${showRec && a.rec ? 'rec' : ''}" data-act="${i}" style="--i:${i}"><span class="lb">${a.label}</span>${a.key && a.key.length === 1 && a.key !== ' ' ? `<kbd>${a.key.toUpperCase()}</kbd>` : a.key === ' ' ? '<kbd>Space</kbd>' : ''}</button>`).join('')}</div>`);
  }
  document.body.classList.toggle('moment', !!ui.moment);
  document.body.classList.toggle('picking', ui.mode === 'chowpick');
  // one quiet line, and the tiles you are waiting for
  let msg = S.say && S.say.until > Date.now() ? S.say.text : (ui.coach || '');
  // while the others play, name what was just thrown so the table is easy to follow
  if (!msg && S.turn > 0 && S.lastDiscard && S.lastDiscard.from > 0){ const d = S.players[S.lastDiscard.from].discards.slice(-1)[0]; if (d && d.id === S.lastDiscard.id) msg = `<i class="dot" style="background:${SEAT[S.lastDiscard.from].bright}"></i>${S.players[S.lastDiscard.from].name} threw ${tileHTML(d.t)} ${tName(d.t)}`; }
  swapFade($('#coach'), msg || '');
  let g = '';
  if (S.turn !== -1 && S.mode !== 'lesson'){
    if (me.hand.length % 3 === 1) S.waits = myWaits();
    const w = S.waits || [];
    if (w.length && (me.hand.length % 3 === 1 || S.wasReady)) g = `<span class="near">Win on</span>` + w.map(x => `<span class="ghost ${x.left ? '' : 'none'}" title="${tName(x.t)}: ${x.left} left">${tileHTML(x.t)}<i>${x.left}</i></span>`).join('');
    else if (settings.coach === 2 && me.hand.length){ const st = stepsToWin(); if (st > 0 && st < 9) g = `<span class="near dim">${st + 1} tiles to go</span>`; }
  }
  swapFade($('#ghosts'), g);
  $('#bSort').hidden = !manualRack();
  $('#bReact').hidden = S.mode !== 'net';
  renderRecent(); placeTags();
  const tense = S.turn !== -1 && (S.wasReady || S.wall.length < 16) ? 1 : 0;
  if (tense !== tenseNow){ tenseNow = tense; setTension(tense); }
  V.sync();
  placeCallout();
  if (S.mode === 'net'){ NET.push(); drawTimer(); }
}
function placeCallout(){
  const el = $('#callout'), c = S && S.callout;
  if (!c){ fadeHide(el); el._k = ''; return; }
  const was = el.hidden || el.classList.contains('fading'); fadeShow(el);
  const k = c.text + !!c.more;
  if (el._k !== k){ el._k = k; el.innerHTML = `<p>${c.text}</p>${c.more ? '<button class="tbtn prime" data-more>Continue</button>' : ''}`; if (!was){ el.classList.remove('renew'); void el.offsetWidth; el.classList.add('renew'); } }
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
  if (S.mode === 'net') NET.fx('stroke', { pi, type, ms });
  const p = V.seatXY(pi, pi === 0 ? 5 : 6.5), el = document.createElement('div');
  el.className = 'stroke'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.color = SEAT[pi].bright; el.style.setProperty('--ms', ms + 'ms');
  el.innerHTML = `<b>${GLYPH[type]}</b><span>${type === 'win' ? (pi === 0 ? 'You win' : S.players[pi].name + ' wins') : S.players[pi].name + ': ' + type[0].toUpperCase() + type.slice(1)}</span>`;
  $('#strokes').appendChild(el); setTimeout(() => el.remove(), ms + 500);
}

/* tap anything on the table to ask what it is */
function explainHit(hit){
  if (!S) return;
  const busy = V.dealing(); V.hurry(); if (busy) return; // a tap while tiles are travelling finishes the motion at once
  if (S.turn === -1 && S.slipSkip){ S.slipSkip(); }
  if (S.mode === 'lesson' && typeof lessonTap === 'function' && lessonTap(hit)) return;
  if (S.claimWin && hit.kind === 'tile' && hit.id === S.claimWin.id){ S.claimWin.tap(); return; }
  if (S.ui && S.ui.mode === 'read'){ S.ui.resolve(); return; }
  if (hit.kind === 'marker') return say(`${WIND_NAME[S.roundWind]} round. ${S.wall.length} tiles left.`, 3600);
  if (hit.kind === 'plaque'){ snd('pick'); return V.lookAtSeat(hit.pi === V.lookSeat ? 0 : hit.pi); }
  const id = hit.id;
  for (let pi = 0; pi < 4; pi++){
    const p = S.players[pi], who = pi === 0 ? 'You' : p.name;
    const d = p.discards.find(x => x.id === id);
    if (d) return say(`${explainTile(d.t)} ${unseenFor(0)[d.t]} unseen.`, 4200);
    const m = p.melds.find(m => m.tiles.some(x => x.id === id));
    if (m) return say(`${pi === 0 ? 'Your' : who + '\'s'} ${m.type === 'chow' ? 'Chow' : m.type === 'pung' ? 'Pung' : 'Kong'}.`, 5200);
    const f = p.flowers.find(x => x.id === id);
    if (f) return say(explainTile(f.t), 5200);
    if (pi > 0 && p.hand.some(x => x.id === id)) return say(S.turn === -1 && p.hand.find(x => x.id === id).t >= 0 ? explainTile(p.hand.find(x => x.id === id).t) : `${who}: ${p.hand.length} tiles, hidden.`, 4200);
    if (pi === 0 && S.turn === -1){ const h = p.hand.find(x => x.id === id); if (h) return say(explainTile(h.t), 5200); }
  }
  if (S.wall.some(x => x.id === id)) say(`Wall: ${S.wall.length} left. Empty wall, no winner.`, 3600);
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
      const n = x ? onTable(x.t) : 0, tbl = n ? ` ${n} already out on the table, marked in blue.` : '';
      if (x && settings.coach && S.mode !== 'tut') say(explainTile(x.t) + tbl, 4200); else if (x && n) say(`${tName(x.t)}:${tbl}`, 3200); else render();
    }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (overlayEl('.book') || overlayEl('.menu'))){ closeBook(); return; }
  if (!S || $('#screen-game').hidden || overlayOpen()) return;
  if (e.target.closest && e.target.closest('input')) return;
  const k = e.key.toLowerCase();
  if (S.ui && S.ui.mode === 'read'){ if (k === 'enter' || k === ' '){ e.preventDefault(); S.ui.resolve(); } return; }
  if (k === 'h'){ hint(); return; }
  if (k === 'f'){ $('#bPace').click(); return; }
  if (k === 't'){ $('#bView').click(); return; }
  if (k === 's' && manualRack()){ sortOnce(); return; }
  if (k === 'escape' && S.ui && S.ui.mode === 'chowpick'){ S.ui.resolve(null); return; }
  if (k === 'm' || k === 'escape'){ openMenu(); return; }
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
  if (!items.length && !(S && S.turn !== -1 && S.mode !== 'lesson')){ fadeHide(el, 200); el._ids = null; return; }
  fadeShow(el);
  flip(el, '.ri', 'id', () => el.innerHTML = `${items.map((r, i) => `<span class="ri ${i === items.length - 1 ? 'new' : ''} ${el._ids && !el._ids.includes(r.id) ? 'arrive' : ''}" data-id="${r.id}"><b style="--c:${SEAT[r.from].bright}">${r.from === 0 ? 'You' : S.players[r.from].name}</b>${tileHTML(r.t)}</span>`).join('')}<span class="rw">Wall ${S.wall.length}</span>`);
  el._ids = items.map(r => r.id);
}
function placeFollowers(){
  const nw = $('#newest'); if (!nw) return;
  const n = S && S.newest && S.turn !== -1 ? S.newest : null;
  if (!n){ if (!nw.hidden){ fadeHide(nw, 160); nw._k = ''; } return; }
  const px = V.tilePx(n.id), w = Math.round(Math.max(44, Math.min(70, px * 1.55))), k = n.id + ':' + w + ':' + !!S.claimWin + settings.helpers;
  if (nw._k !== k){
    nw._k = k; fadeShow(nw); nw.classList.toggle('open', !!S.claimWin);
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
  if (t == null || t < 0) html = `<b>A face-down tile</b><span>${hit.id != null && S && S.wall.some(w => w.id === hit.id) ? `Wall: ${S.wall.length} left` : 'Hidden'}</span>`;
  else {
    const kind = t < 27 ? `${SUIT_NAME[suitOf(t)]}, number ${numOf(t)}` : t < 31 ? 'Wind. Matches only itself.' : t < 34 ? 'Dragon. Matches only itself.' : 'Bonus. Set aside, draw again.';
    const unseen = S && S.mode !== 'lesson' && S.turn !== -1 && t < 34 ? unseenFor(0)[t] : null;
    html = `<div class="ih">${tileHTML(t)}<b>${tName(t)}</b></div><span>${kind}</span>${unseen != null ? `<span>${unseen} of 4 unseen</span>` : t < 34 ? '<span>4 of each</span>' : ''}`;
    if (S && t < 34){ S.holdT = t; V.sync(); }
  }
  el.innerHTML = html; fadeShow(el);
  const w = Math.min(260, innerWidth - 24); el.style.width = w + 'px';
  el.style.left = Math.max(12, Math.min(innerWidth - w - 12, x - w / 2)) + 'px';
  el.style.top = Math.max(12, y - 140) + 'px';
  snd('pick'); haptic(8);
  clearTimeout(infoTimer); infoTimer = setTimeout(hideInfo, 4200);
}
function hideInfo(){ const el = $('#info'); if (el) fadeHide(el, 140); if (S && S.holdT != null){ S.holdT = null; V.sync(); } }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#info')) { const el = $('#info'); if (el && !el.hidden) setTimeout(hideInfo, 0); } }, true);
// the paper pages, the strip and the slip: hold a pictured tile too
{ let ht = 0; document.addEventListener('pointerdown', e => { const t = e.target.closest('.tile[data-t]'); if (!t || e.target.closest('#hand')) return; const x = e.clientX, y = e.clientY; clearTimeout(ht); ht = setTimeout(() => onHold({ t: +t.dataset.t, page: true }, x, y), 460); const stop = () => { clearTimeout(ht); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); }; addEventListener('pointerup', stop); addEventListener('pointercancel', stop); }); }
$('#bMenu').onclick = () => openMenu();

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

/* ---------------- frame times: add ?fps=1 to the address to see them after each deal and each win ---------------- */
const FPS_ON = /[?&]fps=1/.test(location.search), fpsLog = {};
function fpsStart(label){ if (FPS_ON) V.prof.start(label, false); }
function fpsStop(label){
  if (!FPS_ON) return;
  const all = V.prof.stop().filter(x => x.l === label), f = all.map(x => x.raw).filter(x => x > 0 && x < 1000).sort((a, b) => a - b);
  if (f.length < 5) return;
  const avg = f.reduce((a, b) => a + b, 0) / f.length, p95 = f[Math.floor(f.length * .95)], worst = f[f.length - 1];
  const js = all.map(x => x.js).filter(x => x >= 0), jsAvg = js.reduce((a, b) => a + b, 0) / (js.length || 1), jsMax = Math.max(0, ...js);
  fpsLog[label] = `${label === 'deal' ? 'Deal' : 'Win'}: ${f.length} frames, average ${avg.toFixed(1)} ms (${Math.round(1000 / avg)} fps), slowest 5% ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms. Animation script ${jsAvg.toFixed(2)} ms a frame, worst ${jsMax.toFixed(2)} ms`;
  window.TW_fps = fpsLog;
  let el = $('#fpsbox'); if (!el){ el = document.createElement('div'); el.id = 'fpsbox'; document.body.appendChild(el); }
  el.innerHTML = Object.values(fpsLog).map(s => `<div>${s}</div>`).join('');
}

/* ---------------- screens ---------------- */
let screenNow = null;
function ensureTiles(){ if (!V.IMG.length){ V.renderTileImages(); injectTileCSS(); } }
function showScreen(name){
  if (name === 'game') ensureTiles();
  // screens cross-fade over the table, which never goes away: the camera moves while the type changes
  for (const s of ['home','game']){
    const el = $('#screen-' + s);
    if (s === name){ clearTimeout(el._ft); el.classList.remove('scr-out'); if (el.hidden){ el.hidden = false; el.classList.add('scr-in'); void el.offsetWidth; requestAnimationFrame(() => el.classList.remove('scr-in')); } }
    else if (!el.hidden && !el.classList.contains('scr-out')){ el.classList.add('scr-out'); el._ft = setTimeout(() => { el.hidden = true; el.classList.remove('scr-out'); }, 260); }
  }
  document.body.classList.toggle('athome', name === 'home');
  if (name !== screenNow){ screenNow = name; V.setMode(name); }
}
function goHome(keepTable){ if (!keepTable && NET.active()) NET.leave(); token++; S = null; LS = null; $('#lesson').hidden = true; document.body.classList.remove('inlesson', 'picking'); hideInfo(); tenseNow = -1; setTension(0); closeOverlay(); [...$('#strokes').children].forEach(c => leave(c, 200)); document.body.classList.remove('moment'); renderHome(); showScreen('home'); }

const LENGTHS = [[1, 'One hand', 'One hand'], [4, 'Four hands', 'Four hands'], [16, 'Sixteen hands', 'Sixteen hands, a full game']];
/* the title screen: the name, one big Play, three small round buttons, and sound in the corner */
function renderHome(quiet, delay = 0){
  const r = peekResume();
  const resume = r ? (r.totalHands > 1 ? `Hand ${r.handNo + 1} of ${r.totalHands}` : 'Your hand is waiting') : '';
  const atTable = NET.active() && NET.table;
  $('#screen-home').innerHTML = `<div class="corner r" data-audio></div>
    <div class="title">
      <div class="logo" style="--i:0"><span class="seal">風</span><span class="wm">Tilewind</span></div>
      <div class="sub" style="--i:1">Hong Kong Mahjong</div>
      <button class="gb big red ${resume ? 'two' : ''}" id="hPlay" style="--i:2"><span style="display:flex;gap:12px;align-items:center">${ICON.play}${r ? 'Continue' : 'Play'}</span>${resume ? `<small class="resume">${resume}</small>` : ''}</button>
      <div class="trio" style="--i:3">
        <button class="ibl" id="hHow"><span class="ib">${ICON.help}</span>How to play</button>
        <button class="ibl" id="hFriends"><span class="ib ${atTable ? 'lit' : ''}">${ICON.friends}</span>${atTable ? 'Your table' : 'Friends'}</button>
        <button class="ibl" id="hSet"><span class="ib">${ICON.gear}</span>Settings</button>
      </div>
    </div>`;
  audioButtons($('#screen-home [data-audio]'));
  const hs = $('#screen-home'); hs.classList.remove('home-in'); hs.style.setProperty('--d', delay + 'ms');
  if (!quiet){ void hs.offsetWidth; hs.classList.add('home-in'); }
  $('#hPlay').onclick = () => { arm(); firstPlay(); playOrResume(); };
  $('#hHow').onclick = () => { arm(); profile.asked = true; save(); startLesson(!profile.tut); };
  $('#hFriends').onclick = () => { arm(); openFriends(); };
  $('#hSet').onclick = () => openBook('settings');
  pressSounds(hs);
  // Enter and Space on the title screen press Play (no focus ring until the keyboard is used)
}
/* the first Play needs no questions: a new player gets the gentle table, and is asked what they know after the first hand */
function firstPlay(){
  if (profile.asked) return;
  profile.asked = true; profile.tut = true;
  if (!profile.kind){ Object.assign(settings, KINDS[0].set); profile.intro = Math.max(1, profile.intro || 1); V.resize(); V.setHelpers(settings.helpers); }
  save();
}

/* ---------------- the book: collection, tables, today, rules, settings ---------------- */
let bookTab = 'hands', lessonIdx = 0;
const TABS = [['hands', 'Hands'], ['tables', 'Tables'], ['today', 'Today'], ['records', 'Records']];
const PANEL = { settings: 'Settings', rules: 'How to play' };
function closeBook(){ closeOverlay(); if (S) render(); else renderHome(true); }
/* one menu button holds everything used now and then */
function openMenu(){
  if (S && S.ui && S.ui.mode === 'read') return;
  if (overlayEl('.slip')) return;
  const inGame = !!S, net = inGame && S.mode === 'net', db = profile.daily[dayKey()];
  const root = setOverlay(`<div class="overlay"><div class="menu paper" role="dialog" aria-modal="true" aria-label="Menu">
    <h2>${inGame ? 'Paused' : 'Menu'}</h2>
    ${inGame ? `<button class="gb big red" data-m="close">${ICON.play}Resume</button>` : `<button class="gb gold" data-m="daily">Daily hand${db !== undefined ? ` <small style="font:400 15px/1 var(--body);opacity:.8">best ${db > 0 ? '+' : ''}${db}</small>` : ''}</button>`}
    <div class="row2"><button class="gb" data-m="settings">${ICON.gear}Settings</button><button class="gb" data-m="rules">${ICON.help}Rules</button></div>
    <button class="gb" data-m="book">Collection <small style="font:400 15px/1 var(--body);opacity:.7">${stampCount()}/${COLLECTION.length}</small></button>
    ${inGame ? `<div class="row2">${S.mode === 'play' ? '<button class="gb" data-m="new">New game</button>' : S.mode === 'tut' ? '<button class="gb" data-m="skip">Skip</button>' : ''}<button class="gb dark" data-m="home" ${S.mode === 'play' || S.mode === 'tut' ? '' : 'style="grid-column:1/-1"'}>${net ? 'Leave table' : 'Quit'}</button></div>` : '<button class="gb dark" data-m="close">Close</button>'}
  </div></div>`);
  pressSounds(root);
  root.addEventListener('click', e => {
    if (e.target.classList.contains('overlay')) return closeBook();
    const b = e.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m;
    if (m === 'close') closeBook();
    else if (m === 'settings' || m === 'rules') openBook(m);
    else if (m === 'book') openBook('hands');
    else if (m === 'daily'){ closeOverlay(); arm(); startGame('daily'); }
    else if (m === 'new'){ closeOverlay(); startGame('play'); }
    else if (m === 'skip'){ profile.tut = true; save(); goHome(); }
    else if (m === 'home') goHome();
  });
  setTimeout(() => { const f = root.querySelector('.gb'); if (f) f.focus({ preventScroll:true }); }, 0);
}
function openBook(tab){
  if (tab === 'menu') return openMenu();
  if (S && S.ui && S.ui.mode === 'read') return;
  if (overlayEl('.slip')) return;
  bookTab = tab || bookTab; ensureTiles(); if (S && V.tableView) V.setTableView(false);
  const single = PANEL[bookTab];
  const root = setOverlay(`<div class="overlay"><div class="book paper ${bookTab === 'settings' ? 'narrow' : ''}" role="dialog" aria-modal="true" aria-label="${single || 'Collection'}">
    <div class="phead"><h2>${single || 'Collection'}</h2><button class="ib" data-close aria-label="Close">${ICON.close}</button></div>
    ${single ? '' : `<div class="tabs" role="tablist">${TABS.map(([id, n]) => `<button role="tab" data-tab="${id}" aria-selected="${id === bookTab}" class="${id === bookTab ? 'on' : ''}">${n}</button>`).join('')}</div>`}
    <div class="bbody" id="bbody"></div>
  </div></div>`);
  const bk = root.querySelector('.book');
  const tb = bk.querySelector('.tabs');
  if (tb) tb.onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; bookTab = b.dataset.tab; snd('pick'); bk.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); drawTab(); };
  bk.querySelector('[data-close]').onclick = closeBook;
  root.addEventListener('click', e => { if (e.target.classList.contains('overlay')) closeBook(); });
  pressSounds(root);
  drawTab(); bk.querySelector('[data-close]').focus({ preventScroll:true });
}
function drawTab(){
  const el = $('#bbody'); if (!el) return; el.scrollTop = 0;
  if (bookTab === 'hands'){
    el.innerHTML = `<p class="blead">Win one to stamp it.</p><div class="cards">${COLLECTION.map(c => {
      const d = profile.stamps[c.id];
      return `<div class="card ${d ? 'got' : ''}"><div class="ch"><b>${c.name}</b><span>${c.fan} faan</span></div>${rowHTML(c.ex, d ? '' : 'sil')}<p>${d ? c.hint : c.hint}</p>${d ? `<span class="stamp"><i>印</i>${niceDate(d)}</span>` : ''}</div>`; }).join('')}</div>`;
  } else if (bookTab === 'tables'){
    const nt = nextTheme();
    el.innerHTML = `<p class="blead">${nt ? `Finish quests and games to open new tables. Next: ${nt.name}, ${profile.themePts} of ${nt.need}.` : 'All six tables are open.'}</p><div class="swatches">${THEMES.map(t => {
      const open = themeOpen(t), c = n => '#' + n.toString(16).padStart(6, '0');
      return `<button class="sw ${profile.theme === t.id ? 'on' : ''}" data-theme="${t.id}" data-open="${open ? 1 : 0}"><span class="felt" style="background:${c(t.felt)}"><i class="rl" style="background:${t.wood === 'light' ? '#b08a5a' : '#4a2e1c'};box-shadow:inset 0 0 0 99px ${c(t.rail)}55"></i><i class="bk" style="background:${c(t.back)}"></i><i class="iv"></i></span><b>${t.name}</b><small>${open ? (profile.theme === t.id ? 'In use' : 'Tap to use') : `Opens in ${t.need - profile.themePts}. Tap to preview.`}</small></button>`; }).join('')}</div>${cosHTML()}`;
    el.querySelectorAll('[data-cos]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.cos.split(':'), it = cosItem(k, id), open = cosOpen(it); snd('pick');
      peek(`${it.name} ${COS_NAME[k].toLowerCase()}${open ? '' : `. Opens after ${it.need - profile.cosPts} more.`}`, { [k]: id }, open, () => { profile.cos[k] = id; save(); snd('place'); }); });
    el.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { const t = themeOf(b.dataset.theme);
      if (b.dataset.open === '1'){ profile.theme = t.id; save(); V.applyTheme(t); applyCos(); snd('place'); drawTab(); }
      else { snd('pick'); peek(`${t.name}. Opens after ${t.need - profile.themePts} more quests or games.`, {}, false, null, t.id); } });
  } else if (bookTab === 'today'){
    const ri = rankInfo(), qs = todaysQuests(), nt = nextTheme(), db = profile.daily[dayKey()];
    el.innerHTML = `<div class="rankbig"><span class="rseal">${ri.seal}</span><div><b>${ri.name}</b><div class="bar"><i style="width:${Math.round(ri.frac * 100)}%"></i></div><small>${ri.next ? `${ri.into} of ${ri.need} points to ${ri.next}` : 'The top rank'}</small></div></div>
      <div class="ladder">${RANKS.map((r, i) => `<span class="${i <= ri.i ? 'on' : ''}"><i>${r.seal}</i>${r.name}</span>`).join('')}</div>
      <h3>Today's quests</h3><div class="quests">${qs.map(q => `<div class="${profile.quests.done[q.id] ? 'done' : ''}"><i></i>${q.text}</div>`).join('')}</div>
      <p class="blead">${nt ? `Each quest moves you one step toward the ${nt.name} table: ${profile.themePts} of ${nt.need}.` : 'Every table is open. Quests still count toward your record.'}</p>
      ${weeklyHTML()}`;
    $('#wkPlay').onclick = () => { closeOverlay(); arm(); startGame('weekly'); };
  } else if (bookTab === 'records'){
    el.innerHTML = recordsHTML();
  } else if (bookTab === 'rules'){
    const L = LESSONS[lessonIdx], last = lessonIdx === LESSONS.length - 1;
    const quiz = L.quiz ? `<div class="quiz"><div class="quiz-q">${L.quiz.q}</div><div class="quiz-opts">${L.quiz.opts.map((o, i) => `<button class="quiz-opt" data-q="${i}">${rowHTML(o[0])}</button>`).join('')}</div><div class="quiz-fb" id="qfb"></div></div>` : '';
    el.innerHTML = `${lessonIdx === 0 && !S ? `<div class="tryrow"><button class="gb sm jade" id="sLesson">Tile lesson</button><button class="gb sm" id="sTut">Guided hand</button></div>` : ''}<article class="page"><h2>${L.title}</h2>${L.body()}${quiz}</article>
      <div class="booknav"><button class="gb sm" id="lPrev" ${lessonIdx === 0 ? 'disabled' : ''}>${ICON.back}Back</button><span class="pg">${lessonIdx + 1} / ${LESSONS.length}</span><button class="gb sm red" id="lNext" ${last ? 'disabled' : ''}>Next</button></div>`;
    const sl1 = $('#sLesson'); if (sl1) sl1.onclick = () => { closeOverlay(); arm(); startLesson(); };
    const st1 = $('#sTut'); if (st1) st1.onclick = () => { closeOverlay(); arm(); startGame('tut'); };
    $('#lPrev').onclick = () => { if (lessonIdx > 0){ lessonIdx--; drawTab(); } };
    $('#lNext').onclick = () => { if (!last){ lessonIdx++; drawTab(); } };
    el.querySelectorAll('.quiz-opt').forEach(b => b.onclick = () => { const o = L.quiz.opts[+b.dataset.q]; b.classList.remove('right','wrong'); void b.offsetWidth; b.classList.add(o[2] ? 'right' : 'wrong'); $('#qfb').textContent = o[1]; snd(o[2] ? 'place' : 'nope'); });
  } else {
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const tog = key => seg(key, [[true,'On'],[false,'Off']]);
    const sl = key => `<input type="range" min="0" max="1" step="0.05" value="${settings[key]}" data-sl="${key}" aria-label="${key === 'music' ? 'Music volume' : 'Sound volume'}">`;
    const row = (label, ctl, hint) => `<div class="set"><div>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</div>${ctl}</div>`;
    el.innerHTML = `
      <div class="sgroup">Sound</div>
      ${row('Music', `<div class="sw2">${sl('music')}${seg('musicOn', [[true,'On'],[false,'Off']])}</div>`)}
      ${row('Sound', `<div class="sw2">${sl('sfx')}${seg('sfxOn', [[true,'On'],[false,'Off']])}</div>`)}
      <div class="sgroup">Game</div>
      ${row('Opponents', seg('difficulty', STYLES.map((s, i) => [i, s.name])), 'Next game')}
      ${row('Hands', seg('length', [[1, '1'], [4, '4'], [16, '16']]), 'Next game')}
      ${row('Speed', seg('pace', [['relaxed','Calm'],['normal','Normal'],['fast','Fast']]))}
      ${row('Coach', seg('coach', [[2,'Full'],[1,'Some'],[0,'Off']]))}
      ${row('Call buttons', seg('calls', [['guided','Explained'],['standard','Plain'],['expert','None']]), settings.calls === 'expert' ? 'Tap a throw fast to take it' : '')}
      <div class="sgroup">Tiles</div>
      ${row('Number tags', tog('helpers'))}
      ${row('Big rack', tog('big'))}
      ${row('Auto sort', seg('autoSort', [['on','On'],['off','Off']]))}
      ${row('Sort by', seg('sortStyle', [['suit','Suit'],['sets','Sets']]))}
      ${row('One-tap throw', tog('oneTap'))}
      ${row('Graphics', seg('quality', [['auto','Auto'],[2,'High'],[1,'Mid'],[0,'Low']]), settings.quality === 'auto' ? 'Now ' + ['Low', 'Mid', 'High'][V.tier] : '')}
      ${navigator.vibrate ? row('Vibration', tog('haptics')) : ''}`;
    el.querySelectorAll('.seg').forEach(sg => sg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
      const key = sg.dataset.key;
      if (key === 'kind') setKind(v); else if (key === 'autoSort') setAutoSort(v); else settings[key] = v;
      if (key === 'quality') V.setTier(v); if (key === 'big') V.resize(); if (key === 'helpers' || key === 'kind') V.setHelpers(settings.helpers);
      if (key === 'musicOn' || key === 'sfxOn'){ arm(); setVolumes(); refreshAudioButtons(); }
      save(); snd('pick'); const top = el.scrollTop; drawTab(); el.scrollTop = top;
    }));
    el.querySelectorAll('[data-sl]').forEach(i => i.oninput = () => { settings[i.dataset.sl] = +i.value; if (+i.value > 0) settings[i.dataset.sl + 'On'] = true; save(); arm(); setVolumes(); refreshAudioButtons(); if (i.dataset.sl === 'sfx') snd('place'); });
  }
}
function toast(title, body){
  if (autotest) return;
  const t = document.createElement('div'); t.className = 'toast paper'; t.innerHTML = `<b>${title}</b>${body}`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
