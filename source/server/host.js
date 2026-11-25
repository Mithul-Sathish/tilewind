/* =========================================================
   PLAY ONLINE: the table on the server.
   The match runs here with exactly the same rules code the browser uses (flow.js and the engine, joined in by
   build_server.py). No browser runs the match, so no browser ever holds another seat's tiles: each seat is sent
   only its own tiles and what is face up. Every seat is remote; a seat with nobody at it is played by the computer.
   This file is wrapped, with the rules code, inside createGame(), so each table has its own state.
   ========================================================= */
const NET = (() => {
  const PING = 1000, LOST = 9000, MISSES_AWAY = 2;
  let table = null, alive = true, pushQueued = false, askSeq = 0, nextReady = null, nextWait = null, pinger = 0;
  const conns = new Map(), seen = new Map(), pending = new Map(), lastView = new Map(), reactAt = new Map(), misses = new Map();
  const REACTS = ['Nice hand', 'Good game', 'Oops', 'Thanks', 'Well played', 'Hello'];

  const humanAt = a => table && table.seats[a].kind === 'human';
  const liveAt = a => humanAt(a) && table.seats[a].on && !table.seats[a].away && conns.has(a);
  const send = (c, m) => { if (c) c.send(m); };
  const broadcast = m => { for (const c of conns.values()) send(c, m); };
  const publicTable = () => ({ code: table.code, gen: 0, host: -1, started: table.started, pace: table.pace, calls: table.calls, length: table.length, online: true,
    seats: table.seats.map(s => ({ kind: s.kind, name: s.name, ready: true, on: s.kind !== 'human' || (s.on && !s.away), away: !!s.away, rating: s.rating || 0 })) });
  const tableChanged = () => broadcast({ t: 'table', table: publicTable() });

  /* ---------- people arriving, leaving and coming back ---------- */
  function connect(conn, hello){
    if (!alive) return send(conn, { t: 'deny', why: 'This table has finished.' });
    const a = table.seats.findIndex(s => s.kind === 'human' && s.th && s.th === hello.th);
    if (a < 0) return send(conn, { t: 'deny', why: 'This seat is not yours.' });
    const old = conns.get(a); if (old && old !== conn) try { old.close(); } catch(e){}
    const back = table.started && !table.seats[a].on;
    conns.set(a, conn); seen.set(a, Date.now()); table.seats[a].on = true; table.seats[a].away = false; misses.set(a, 0);
    send(conn, { t: 'welcome', seat: a, table: publicTable() });
    lastView.delete(a);
    if (table.started){ tableChanged(); pushNow(); if (back) note(table.seats[a].name + ' is back.'); }
    if (table.result) send(conn, table.result[a]);
    if (table.rated && table.rated[a]) send(conn, { t: 'rated', r: table.rated[a] });
    if (onArrive) onArrive();
    return a;
  }
  let onArrive = null;
  function message(conn, m){
    if (!m || typeof m !== 'object' || !alive) return;
    let a = -1; for (const [k, c] of conns) if (c === conn) a = k;
    if (a < 0) return;
    seen.set(a, Date.now());
    if (m.t === 'ping') return;
    if (m.t === 'act'){ const p = pending.get(m.id); if (p && p.seat === a){ misses.set(a, 0); p.done(p.check(m.v)); } return; }
    if (m.t === 'back'){ if (table.seats[a].away){ table.seats[a].away = false; misses.set(a, 0); tableChanged(); note(table.seats[a].name + ' is back.', true); pushNow(); } return; }
    if (m.t === 'react'){ react(a, m.k); return; }
    if (m.t === 'next'){ if (nextReady){ nextReady.add(a); nextChanged(); } return; }
    if (m.t === 'bye'){ dropped(a, true); return; }
  }
  function closed(conn){ for (const [a, c] of conns) if (c === conn) dropped(a); }
  function dropped(a, left){
    if (!table.seats[a] || table.seats[a].kind !== 'human') return;
    const c = conns.get(a); conns.delete(a); seen.delete(a); lastView.delete(a);
    if (c) try { c.close(); } catch(e){}
    if (!table.seats[a].on) return;
    table.seats[a].on = false;
    for (const p of [...pending.values()]) if (p.seat === a) p.done(p.deflt());
    if (nextReady) nextChanged();
    if (alive && table.started){ tableChanged(); note(table.seats[a].name + (left ? ' left.' : ' lost connection.') + ' The computer plays for now.'); pushNow(); }
  }
  function startPing(){
    clearInterval(pinger);
    pinger = setInterval(() => {
      broadcast({ t: 'ping' });
      const now = Date.now();
      for (const [a, t] of seen) if (now - t > LOST) dropped(a);
    }, PING);
  }
  const humansHere = () => [...conns.keys()].length;

  /* ---------- the match ---------- */
  function open(t){
    // t: { code, seats: [{ kind: 'human'|'bot', name, th, style, rating }], pace, calls, length }
    table = Object.assign({ started: false, result: null }, t);
    table.seats.forEach(s => { s.on = false; s.away = false; });
    startPing();
  }
  function start(){
    if (table.started) return;
    table.started = true; tableChanged();
    newMatch({ mode: 'net' });
    S.netPace = table.pace; S.netCalls = table.calls; S.totalHands = table.length;
    S.players.forEach((p, e) => { const st = table.seats[e]; p.name = st.name; p.isHuman = false; p.remote = st.kind === 'human'; p.style = st.style || 'careful'; if (st.diff != null) p.diff = st.diff; });
    return runMatch();
  }
  const seatName = e => table.seats[e].name || 'Computer';
  // what one seat may see. Tiles in other hands and in the wall go out as ids only; ids are dealt at random each hand
  function viewFor(e){
    const rot = i => i == null || i < 0 ? i : (i - e + 4) & 3, P = S.players;
    const T = x => ({ id: x.id, t: x.t }), H = x => ({ id: x.id, t: -1 });
    const players = [0,1,2,3].map(r => {
      const i = (r + e) & 3, p = P[i], open = i === e || (S.turn === -1 && S.reveal === i);
      return { name: r === 0 ? 'You' : seatName(i), score: p.score, hand: p.hand.map(open ? T : H), melds: p.melds.map(m => ({ type: m.type, concealed: m.concealed, claimed: m.claimed, tiles: m.tiles.map(T) })),
        discards: p.discards.map(T), flowers: p.flowers.map(T), drawnId: p.drawnId, human: humanAt(i), on: liveAt(i) || !humanAt(i), away: !!table.seats[i].away, bot: !humanAt(i) };
    });
    const tm = S.netTimer;
    return { t: 'view', seat: e, dealer: rot(S.dealer), handNo: S.handNo, totalHands: S.totalHands, roundWind: S.roundWind, turn: S.turn < 0 ? -1 : rot(S.turn), dealId: S.dealId, dealing: !!S.netDeal,
      wall: S.wall.map(x => x.id), slot: S.slot ? [...S.slot] : [], dealt: S.dealt ? [...S.dealt] : null, players,
      lastDiscard: S.lastDiscard ? { id: S.lastDiscard.id, from: rot(S.lastDiscard.from) } : null, newest: S.newest ? Object.assign({}, S.newest, { from: rot(S.newest.from) }) : null,
      recent: (S.recent || []).map(x => Object.assign({}, x, { from: rot(x.from) })), reveal: S.reveal == null ? null : rot(S.reveal), groups: S.turn === -1 ? S.groups : null, revealN: S.revealN || 0, revealFast: !!S.revealFast,
      timer: tm ? { seat: rot(tm.e), left: Math.max(0, tm.until - Date.now()), total: tm.total } : null, pace: table.pace, calls: table.calls, online: true };
  }
  function push(){ if (!S || S.mode !== 'net' || pushQueued) return; pushQueued = true; queueMicrotask(() => { pushQueued = false; sendViews(); }); }
  function pushNow(){ if (S && S.mode === 'net') sendViews(); }
  function sendViews(){
    for (const [a, c] of conns){
      if (!table.seats[a].on) continue;
      const v = viewFor(a), k = JSON.stringify(v.timer ? Object.assign({}, v, { timer: { seat: v.timer.seat, total: v.timer.total } }) : v);
      if (lastView.get(a) === k) continue; lastView.set(a, k); send(c, v);
    }
  }
  function fx(k, o, onlySeat){ if (!S || S.mode !== 'net') return; const m = Object.assign({ t: 'fx', k }, o); for (const [a, c] of conns){ if (onlySeat != null && a !== onlySeat) continue; const mm = Object.assign({}, m); if (mm.pi != null) mm.pi = (mm.pi - a + 4) & 3; send(c, mm); } }
  const live = e => !!S && S.mode === 'net' && liveAt(e);
  const remote = e => !!S && S.mode === 'net' && humanAt(e);
  const turnMs = () => ({ relaxed: 30000, normal: 22000, fast: 15000 })[table.pace] || 22000;
  const callMs = () => ({ relaxed: 11000, normal: 8000, fast: 6000 })[table.pace] || 8000;
  function ask(e, kind, payload, ms, check, deflt){
    const conn = conns.get(e);
    if (!conn || !liveAt(e)) return Promise.resolve(deflt());
    const id = ++askSeq;
    return new Promise(res => {
      let tm = 0;
      const p = { seat: e, kind, check, deflt, done: v => { if (!pending.has(id)) return; pending.delete(id); clearTimeout(tm); if (kind === 'turn' && S && S.netTimer && S.netTimer.id === id){ S.netTimer = null; push(); } res(v); } };
      pending.set(id, p);
      tm = setTimeout(() => {
        send(conn, { t: 'cancel', id });
        // a missed call costs nothing; two missed turns in a row and the computer plays the seat until its owner taps back in
        if (kind === 'turn'){
          const n = (misses.get(e) || 0) + 1; misses.set(e, n);
          if (n >= MISSES_AWAY){ table.seats[e].away = true; tableChanged(); send(conn, { t: 'away' }); note(table.seats[e].name + ' is away. The computer plays for now.', true); }
          else note(table.seats[e].name + ' ran out of time.', true);
        }
        p.done(deflt());
      }, ms + 900);
      if (kind === 'turn'){ S.netTimer = { id, e, until: Date.now() + ms, total: ms }; push(); }
      send(conn, Object.assign({ t: 'ask', id, kind, ms }, payload));
      pushNow();
    });
  }
  function localClock(){ return () => {}; }
  // when time runs out the game makes the safest sensible throw for you: a tile nobody can use, else the one that keeps your hand closest to winning
  function defaultDiscard(e){ const c = analyzeDiscards(e, { defend: true })[0]; return { type: 'discard', id: c ? pickDiscardTile(e, c.t) : S.players[e].hand[S.players[e].hand.length - 1].id }; }
  function askTurn(e, so){
    const p = S.players[e];
    const check = v => {
      if (v && v.type === 'win' && so.win) return { type: 'win' };
      if (v && v.type === 'kong' && so.kongs.includes(v.t)) return { type: 'kong', t: v.t };
      if (v && v.type === 'discard' && p.hand.some(x => x.id === v.id)) return { type: 'discard', id: v.id };
      return defaultDiscard(e);
    };
    // out of time with a winning hand in front of you: the game takes the win, never throws it away
    return ask(e, 'turn', { so }, turnMs(), check, () => so.win ? { type: 'win' } : defaultDiscard(e));
  }
  function askClaim(e, o, d, from){
    const check = v => {
      if (!v) return null;
      if (v.type === 'ron' && o.ron) return { type: 'ron' };
      if (v.type === 'kong' && o.kong) return { type: 'kong' };
      if (v.type === 'pung' && o.pung) return { type: 'pung' };
      if (v.type === 'chow' && o.chows.includes(v.start)) return { type: 'chow', start: v.start };
      return null;
    };
    return ask(e, 'claim', { o, d: { id: d.id, t: d.t }, from: (from - e + 4) & 3 }, callMs(), check, () => o.ron ? { type: 'ron' } : null);
  }
  function askExpert(e, d, from){ const o = claimOptions(e, d.t, from); return anyOpt(o) ? askClaim(e, o, d, from) : Promise.resolve(null); }
  function shuffleIds(tiles){
    const ids = [...Array(144).keys()], r = new Uint32Array(144); crypto.getRandomValues(r);
    for (let i = 143; i > 0; i--){ const j = r[i] % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (const x of tiles) x.id = ids[x.id];
    return tiles;
  }
  async function newHand(){}
  function saveBackup(){} // no backups leave the server: nobody else can ever open a hand

  /* ---------- between hands ---------- */
  let lastHand = false;
  function waitNext(){
    if (lastHand) return Promise.resolve(); // the game is over: ratings go out at once, nobody waits for a Next
    nextReady = new Set();
    return new Promise(res => {
      const end = () => { clearTimeout(t); nextReady = null; nextWait = null; res(); };
      const t = setTimeout(end, 20000);
      nextWait = end; nextChanged();
    });
  }
  function nextChanged(){
    if (!nextReady) return;
    const need = table.seats.map((s, a) => a).filter(a => liveAt(a)), missing = need.filter(a => !nextReady.has(a));
    broadcast({ t: 'waiting', names: missing.map(a => table.seats[a].name) });
    if (!missing.length && nextWait) setTimeout(() => nextWait && nextWait(), 600);
  }
  function result(w, parts, x){
    if (x.last) lastHand = true;
    const order = S.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score);
    for (let e = 0; e < 4; e++){
      const rot = i => i == null || i < 0 ? i : (i - e + 4) & 3;
      const fedTs = (S.fedBy || []).filter(f => f.from === e && f.by === w.pi).map(f => f.t);
      if (w.pi >= 0 && !w.selfDrawn && w.ctx.from === e){ const h = S.players[w.pi].hand.find(h => h.id === w.ctx.winId); if (h) fedTs.push(h.t); }
      const m = { t: 'result', w: { pi: rot(w.pi), selfDrawn: w.selfDrawn, ctx: w.ctx ? { from: rot(w.ctx.from), winId: w.ctx.winId } : null, res: w.res ? { fan: w.res.fan, items: w.res.items, concealed: w.res.concealed } : null, val: w.val, pay: [0,1,2,3].map(r => w.pay[(r + e) & 3]), news: [] },
        parts, x: { last: x.last, place: x.last ? order.findIndex(o => o.i === e) + 1 : 0, order: x.last ? order.map(o => ({ i: rot(o.i), score: o.p.score })) : null }, fedTs, near: '' };
      if (conns.get(e) && table.seats[e].on) send(conns.get(e), m);
      if (x.last){ table.result = table.result || []; table.result[e] = m; }
    }
  }
  let onOver = null;
  function matchOver(){
    const order = S.players.map((p, i) => ({ i, score: p.score })).sort((a, b) => b.score - a.score);
    table.final = order;
    broadcast({ t: 'over', order: order.map(o => ({ seat: o.i, name: seatName(o.i), score: o.score })) });
    if (onOver) onOver(order);
  }
  function react(a, k){
    const now = Date.now(); if (now - (reactAt.get(a) || 0) < 2500) return; reactAt.set(a, now);
    if (!REACTS.includes(k)) return; // preset words only: nothing anyone types ever reaches anyone else
    broadcast({ t: 'react', seat: a, k });
  }
  function rated(list){ table.rated = list; for (const [a, c] of conns) if (list[a]) send(c, { t: 'rated', r: list[a] }); }
  function note(text, quiet){ broadcast({ t: 'note', text, quiet: !!quiet }); }
  function close(){ alive = false; clearInterval(pinger); for (const p of [...pending.values()]) p.done(p.deflt()); for (const c of conns.values()) try { c.close(); } catch(e){} conns.clear(); token++; }

  return {
    REACTS, open, start, connect, message, closed, close, humansHere,
    push, pushNow, fx, live, remote, askTurn, askClaim, askExpert, localClock, turnMs, callMs, newHand, saveBackup, shuffleIds, defaultDiscard,
    result, waitNext, matchOver, rated, seatName, isHost: () => true, isGuest: () => false, active: () => true,
    set onOver(f){ onOver = f; }, set onArrive(f){ onArrive = f; },
    get table(){ return table; }, viewFor
  };
})();
