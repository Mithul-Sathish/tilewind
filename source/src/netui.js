/* =========================================================
   PLAY WITH FRIENDS: the lobby, and the table as a guest sees it.
   A guest's browser runs no match of its own. It draws what the host sends (its own tiles and what is face up),
   asks the same questions solo play asks (the same buttons, the same Call prompts), and sends back only the answer.
   ========================================================= */
let gView = null, gDealing = false, gDealId = null, gAsk = null, lobbyMsg = '';
const nearMissFor = () => '';

/* ---------------- the lobby ---------------- */
function openFriends(code){
  ensureTiles();
  if (NET.active() && NET.table && !NET.table.started){ renderLobby(NET.table); return; }
  const name = NET.store.name || '';
  const root = setOverlay(`<div class="overlay"><div class="lobby paper" role="dialog" aria-modal="true" aria-label="Play with friends">
    <h2>Play with friends</h2>
    <p class="blead">2 to 4 players. No sign-up.</p>
    <label class="fld"><span>Your name</span><input id="fName" maxlength="12" autocomplete="nickname" value="${name.replace(/"/g, '&quot;')}" placeholder="Your name"></label>
    <div class="lrow"><button class="tbtn prime big" id="fHost">New table</button></div>
    <div class="lor">or join one</div>
    <div class="lrow"><label class="fld code"><span>Table code</span><input id="fCode" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${code || ''}" placeholder="5 letters"></label><button class="tbtn big" id="fJoin">Join</button></div>
    <p class="lmsg" id="fMsg" aria-live="polite">${lobbyMsg}</p>
    <div class="bfoot"><button class="tbtn" data-close>Close</button></div>
  </div></div>`);
  lobbyMsg = '';
  const msg = t => { const m = root.querySelector('#fMsg'); if (m) m.textContent = t; };
  const nm = () => { const v = root.querySelector('#fName').value.trim(); if (!v){ msg('Name first!'); root.querySelector('#fName').focus(); return null; } NET.store.name = v; NET.saveStore(); return v; };
  const busy = on => root.querySelectorAll('#fHost,#fJoin').forEach(b => b.disabled = on);
  root.querySelector('#fHost').onclick = async () => { const n = nm(); if (!n) return; arm(); busy(true); msg('Making a table…'); try { await NET.host(n); } catch(e){ busy(false); msg(e.message); } };
  const join = async () => { const n = nm(); if (!n) return; arm(); const c = root.querySelector('#fCode').value; busy(true); msg('Joining…'); try { await NET.join(c, n); } catch(e){ busy(false); msg(e.message); } };
  root.querySelector('#fJoin').onclick = join;
  root.querySelector('#fCode').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  root.querySelector('[data-close]').onclick = () => closeOverlay();
  setTimeout(() => { const f = root.querySelector(name ? (code ? '#fJoin' : '#fHost') : '#fName'); if (f) f.focus({ preventScroll: true }); }, 0);
}
NET.onLobby = t => { if (t && !t.started && !(S && S.mode === 'net')) renderLobby(t); };
const PACE_WORD = { relaxed: 'Relaxed', normal: 'Normal', fast: 'Fast' }, CALL_WORD = { guided: 'Guided', standard: 'Standard', expert: 'Expert' };
function renderLobby(t){
  const host = NET.isHost(), me = NET.me, people = t.seats.filter(s => s.kind === 'human').length;
  const allReady = t.seats.every(s => s.kind !== 'human' || s.ready);
  const seat = (s, a) => s.kind === 'human' ? `<div class="seatln ${a === me ? 'me' : ''}"><i style="background:${SEAT[(a - me + 4) & 3].lac}"></i><span>${s.name}${a === me ? ' (you)' : ''}${a === t.host ? ', host' : ''}</span><b class="${s.ready ? 'ok' : ''}">${s.ready ? 'Ready' : 'Not ready'}</b></div>`
    : `<div class="seatln open"><i></i><span>Empty seat</span><b>Computer</b></div>`;
  const seg = (k, opts, words) => host ? `<div class="seg" data-tk="${k}">${opts.map(v => `<button data-v="${v}" class="${String(t[k]) === String(v) ? 'on' : ''}">${words[v]}</button>`).join('')}</div>` : `<b class="ro">${words[t[k]]}</b>`;
  const lenWord = { 1: 'One hand', 4: 'Four hands', 16: 'Sixteen hands' };
  const why = !host ? (t.seats[me] && t.seats[me].ready ? 'Waiting for the host' : 'Press Ready')
    : people < 2 ? 'Waiting for a friend' : !allReady ? 'Waiting for Ready' : 'All set!';
  const html = `<div class="overlay"><div class="lobby paper" role="dialog" aria-modal="true" aria-label="Your table">
    <div class="lhead"><div><small>Table code</small><b class="lcode">${t.code}</b></div><button class="tbtn" id="lCopy">Copy link</button></div>
    <p class="blead">Send the link or the code.</p>
    <div class="seats">${t.seats.map(seat).join('')}</div>
    <div class="set"><div>Speed<small>${({ relaxed: 30, normal: 22, fast: 15 })[t.pace]} s a turn</small></div>${seg('pace', ['relaxed', 'normal', 'fast'], PACE_WORD)}</div>
    <div class="set"><div>Call prompts</div>${seg('calls', ['guided', 'standard', 'expert'], CALL_WORD)}</div>
    <div class="set" style="border:0"><div>Game length</div>${seg('length', [1, 4, 16], lenWord)}</div>
    <p class="lmsg" id="lMsg" aria-live="polite">${why}</p>
    <div class="bfoot"><button class="tbtn" id="lLeave">Leave</button>${host ? `<button class="tbtn prime big" id="lStart" ${people >= 2 && allReady ? '' : 'disabled'}>Start</button>` : `<button class="tbtn prime big" id="lReady">${t.seats[me] && t.seats[me].ready ? 'Not ready' : 'Ready'}</button>`}</div>
  </div></div>`;
  // the lobby updates in place while it is open, so it does not fade out and in on every change
  const cur = overlayEl('.lobby');
  let root;
  if (cur && cur.querySelector('.lcode')){ const box = cur.closest('.overlay'); box.innerHTML = html.replace(/^<div class="overlay">/, '').replace(/<\/div>$/, ''); box.querySelector('.lobby').style.animation = 'none'; root = box; }
  else root = setOverlay(html);
  root.querySelectorAll('[data-tk]').forEach(sg => sg.onclick = e => { const b = e.target.closest('button'); if (!b) return; let v = b.dataset.v; v = isNaN(+v) ? v : +v; snd('pick'); NET.setTable(sg.dataset.tk, v); });
  root.querySelector('#lCopy').onclick = async () => {
    const link = NET.link(), m = root.querySelector('#lMsg');
    try { await navigator.clipboard.writeText(link); m.textContent = 'Copied!'; }
    catch(e){ m.textContent = link; }
  };
  root.querySelector('#lLeave').onclick = () => { NET.leave(); closeOverlay(); };
  const st = root.querySelector('#lStart'); if (st) st.onclick = () => { snd('pick'); NET.start(); };
  const rd = root.querySelector('#lReady'); if (rd) rd.onclick = () => { snd('pick'); NET.ready(!(t.seats[me] && t.seats[me].ready)); };
}
function netStarted(){ closeOverlay(); }
function netLobbyBack(){ goHome(true); if (NET.table) renderLobby(NET.table); }
function netOver(){ if (!S || !S.guest) return; setTimeout(() => { goHome(true); if (NET.table) renderLobby(NET.table); }, 300); }
function netGone(){ goHome(); toast('Table closed', 'Nobody could keep the table going.'); }

/* ---------------- the table, as a guest ---------------- */
function netView(v){ if (gDealing){ gView = v; return; } applyView(v); }
async function applyView(v){
  const fresh = !S || S.mode !== 'net' || !S.guest;
  if (fresh){ newMatch({ mode: 'net' }); S.guest = true; gDealId = null; closeOverlay(); }
  S.netPace = v.pace; S.netCalls = v.calls;
  for (const p of v.players){ for (const x of p.hand) V.retype(x.id, x.t); for (const m of p.melds) for (const x of m.tiles) V.retype(x.id, x.t); for (const x of p.discards.concat(p.flowers)) V.retype(x.id, x.t); }
  const newDeal = v.dealId !== gDealId;
  v.players.forEach((p, r) => Object.assign(S.players[r], { name: p.name, score: p.score, hand: p.hand, melds: p.melds, discards: p.discards, flowers: p.flowers, drawnId: p.drawnId, isHuman: r === 0, on: p.on, human: p.human }));
  Object.assign(S, { dealer: v.dealer, handNo: v.handNo, totalHands: v.totalHands, roundWind: v.roundWind, turn: v.turn, wall: v.wall.map(id => ({ id, t: -1 })),
    slot: new Map(v.slot), dealt: v.dealt ? new Map(v.dealt) : null, lastDiscard: v.lastDiscard, newest: v.newest, recent: v.recent, reveal: v.reveal, groups: v.groups });
  S.netTimer = v.timer ? { e: v.timer.seat, until: Date.now() + v.timer.left, total: v.timer.total } : null;
  if (newDeal){
    gDealId = v.dealId; S.slotKey = (S.slotKey || 0) + 1; S.order = null; S.revealN = 0; S.revealFast = false; S.fed = []; S.ui = {}; S.selected = null;
    closeOverlay(); showScreen('game');
    if (v.dealing){
      gDealing = true; render();
      try { await V.deal(); } catch(e){}
      gDealing = false;
      if (gView){ const q = gView; gView = null; applyView(q); return; }
    }
  }
  render();
}
function netAsk(m){
  if (!S || !S.guest) return;
  gAsk = m.id; S.netOut = false;
  S.deadline = { until: Date.now() + m.ms, total: m.ms };
  const pr = m.kind === 'turn' ? humanTurn(m.so) : m.kind === 'claim' ? humanClaim(m.o, m.d, m.from) : expertWindow(m.from, m.d);
  pr.then(v => {
    if (gAsk !== m.id) return;
    gAsk = null; S.deadline = null;
    if (S.netOut) return;
    NET.act(m.id, v);
    // your own throw starts moving at once; the host's next view confirms it
    if (m.kind === 'turn' && v && v.type === 'discard'){
      const p = S.players[0], i = p.hand.findIndex(x => x.id === v.id);
      if (i >= 0){ const d = p.hand.splice(i, 1)[0]; p.discards.push(d); p.drawnId = null; S.lastDiscard = { id: d.id, from: 0 }; S.newest = { id: d.id, t: d.t, from: 0 }; haptic(10); }
    }
    render();
  }).catch(() => {});
}
function netCancel(id){
  if (!S || gAsk !== id) return;
  S.netOut = true; gAsk = null; S.deadline = null;
  if (S.ui && S.ui.resolve) S.ui.resolve(null);
  say('Time is up. The table moved on.', 2600);
}
function netFx(m){
  if (!S || !S.guest) return;
  if (m.k === 'stroke') callStroke(m.pi, m.type, m.ms);
  else if (m.k === 'snd') snd(m.sk || 'draw');
  else if (m.k === 'note') say(m.text, 3600);
}
function netResult(m){
  if (!S || !S.guest) return;
  const w = m.w, win = w.pi >= 0, mine = w.pi === 0, big = win && w.res.fan >= 3;
  S.turn = -1;
  if (win){ S.reveal = w.pi; S.groups = m.parts.groups; S.revealN = 0; S.revealFast = false; }
  render();
  if (win){ V.pushTo(w.pi, big ? 1 : .55); snd(mine ? (big ? 'bigwin' : 'win') : 'lose'); haptic(mine ? [20, 60, 20, 60, 40] : 12); }
  const order = m.x.order ? m.x.order.map(o => ({ i: o.i, score: o.score })) : null;
  setTimeout(() => { if (S && S.guest) resultSlip(w, m.parts, { net: true, last: m.x.last, place: m.x.place, order, big, dailyLine: '', fedTs: m.fedTs, near: m.near || '' }).catch(() => {}); }, win ? 520 : 400);
}
function netWaiting(names){
  const el = $('#nWait'); if (!el) return;
  el.textContent = names.length ? 'Waiting for ' + names.join(', ') + '.' : '';
}
function netNote(text, quiet){
  if (S && S.mode === 'net' && !$('#screen-game').hidden) say(text, quiet ? 2600 : 4200);
  else { lobbyMsg = text; const m = $('#lMsg') || $('#fMsg'); if (m) m.textContent = text; }
}
/* preset reactions: no free text at the table */
function netReaction(r, k){
  if (!S) return;
  const p = r === 0 ? { x: innerWidth / 2, y: innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--handH')) || 0) - 120 } : V.seatXY(r, 7.5);
  const el = document.createElement('div'); el.className = 'react'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  el.innerHTML = `<b style="color:${SEAT[r].bright}">${r === 0 ? 'You' : S.players[r].name}</b>${k}`;
  $('#strokes').appendChild(el); setTimeout(() => leave(el, 300), 2400);
}
$('#bReact').onclick = () => {
  const box = $('#reacts');
  if (!box.hidden && !box.classList.contains('fading')){ fadeHide(box); return; }
  box.innerHTML = NET.REACTS.map(k => `<button class="tbtn" data-react="${k}">${k}</button>`).join('');
  fadeShow(box); box.classList.remove('renew'); void box.offsetWidth; box.classList.add('renew');
};
$('#reacts').addEventListener('click', e => { const b = e.target.closest('[data-react]'); if (!b) return; NET.sendReact(b.dataset.react); snd('pick'); fadeHide($('#reacts')); });

/* the turn clock: a number and a shrinking bar beside whoever is deciding */
function drawTimer(){
  const el = $('#ttimer');
  if (!S || S.mode !== 'net' || S.turn === -1 || $('#screen-game').hidden){ fadeHide(el); return; }
  let t = S.netTimer;
  if (S.deadline && (!t || t.e !== 0)) t = { e: 0, until: S.deadline.until, total: S.deadline.total };
  if (!t){ fadeHide(el); return; }
  const left = Math.max(0, t.until - Date.now()), sec = Math.ceil(left / 1000);
  if (el.hidden || el.classList.contains('fading')){ fadeShow(el); el.innerHTML = '<b></b><i><u></u></i>'; }
  el.querySelector('b').textContent = t.e === 0 ? `${sec} s left` : `${S.players[t.e].name}: ${sec} s`;
  el.querySelector('u').style.transform = `scaleX(${(left / t.total).toFixed(3)})`;
  el.classList.toggle('low', sec <= 5);
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--handH')) || 0, sh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stripH')) || 0;
  const p = t.e === 0 ? { x: innerWidth / 2, y: innerHeight - hh - sh - 70 } : V.seatXY(t.e, 6.2);
  el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
}
setInterval(() => { if (S && S.mode === 'net') drawTimer(); }, 200);
