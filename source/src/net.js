/* =========================================================
   PLAY WITH FRIENDS. Two to four people at one table, browser to browser.
   The host's browser runs the match with exactly the same rules code as solo play. Everyone else sends only
   their choices and receives only what their seat may see: their own tiles, and what is face up on the table.
   No server of ours: PeerJS's free public broker introduces the browsers, then they talk directly (WebRTC).
   ========================================================= */
const NET = (() => {
  const PROTO = 7, ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PING = 1000, LOST = 6500;
  const qs = new URLSearchParams(location.search);
  const lagMs = +qs.get('lag') || 0; // test only: pretend every message takes this long
  const peerOpts = () => {
    const s = qs.get('sig'); // test only: a local broker instead of the public one
    if (!s) return { debug: 0 };
    const [host, port] = s.split(':'); return { host, port: +port || 9000, secure: false, path: '/', key: 'peerjs', debug: 0, config: { iceServers: [] } };
  };
  const store = (() => { try { return JSON.parse(localStorage.getItem('tilewind.net')) || {}; } catch(e){ return {}; } })();
  if (!store.token){ store.token = rid(20); }
  const saveStore = () => { try { localStorage.setItem('tilewind.net', JSON.stringify(store)); } catch(e){} };
  saveStore();
  function rid(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => ALPHA[b % ALPHA.length]).join(''); }
  const pid = (code, gen) => 'tilewind-' + code + '-' + gen;

  let peer = null, role = null, code = null, me = -1, table = null, hostConn = null, alive = true;
  const conns = new Map(), seen = new Map(), pending = new Map(), lastView = new Map(), reactAt = new Map();
  let askSeq = 0, pushQueued = false, pinger = 0, lastHostMsg = 0, migrating = false, onLobby = null, backup = null, myShare = null;
  let handKey = null, handShares = null, nextReady = null, nextWait = null;

  /* ---------- names: short, plain, and passed through a basic filter ---------- */
  const BAD = ['fuck','shit','bitch','cunt','dick','cock','pussy','fag','nigg','nigr','slut','whore','rape','nazi','hitler','penis','vagin','porn','sex','anal','arse','asshole','bastard','damn','crap','piss','twat','wank','retard','kys','kill','die','tits','boob','cum','jizz','dildo','hoe'];
  function cleanName(s, seat){
    const raw = String(s || '');
    s = raw.replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const flat = raw.toLowerCase().replace(/[0@4]/g, m => ({ '0': 'o', '@': 'a', '4': 'a' })[m]).replace(/1|!|\|/g, 'i').replace(/3/g, 'e').replace(/5|\$/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
    if (!s || BAD.some(b => flat.includes(b))) return 'Player ' + (seat + 1);
    return s;
  }

  /* ---------- a key for the host's backup, split so no single guest can open it ---------- */
  // Shamir's scheme over GF(256), two shares needed: each byte of the key is the constant of a random straight line
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => { let x = 1; for (let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0); x &= 255; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const gmul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0, gdiv = (a, b) => a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0;
  function split(key, xs){ const a = new Uint8Array(key.length); crypto.getRandomValues(a); return xs.map(x => ({ x, y: [...key].map((b, i) => b ^ gmul(a[i], x)) })); }
  function join2(s1, s2){ return Uint8Array.from(s1.y.map((y1, i) => { const a = gdiv(y1 ^ s2.y[i], s1.x ^ s2.x); return y1 ^ gmul(a, s1.x); })); }
  const b64 = u => btoa(String.fromCharCode(...new Uint8Array(u))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function seal(keyBytes, obj){ const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj))); return { iv: b64(iv), ct: b64(ct) }; }
  async function open(keyBytes, box){ const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k, unb64(box.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
  async function hashTok(t){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tw' + t)); return b64(h).slice(0, 16); }

  /* ---------- sending ---------- */
  function send(conn, m){ if (!conn || !conn.open) return; const go = () => { try { conn.send(m); } catch(e){} }; lagMs ? setTimeout(go, lagMs * (.7 + Math.random() * .6)) : go(); }
  const toHost = m => send(hostConn, m);
  function broadcast(m){ for (const c of conns.values()) send(c, m); }

  /* ---------- seats ---------- */
  // absolute seats are the table's own; the host's match puts the host at seat 0, so the two are a rotation apart
  const eng = a => (a - table.host + 4) & 3, abs = e => (e + table.host) & 3;
  const isHost = () => role === 'host', isGuest = () => role === 'guest', active = () => !!role;
  const humanAt = a => table && table.seats[a].kind === 'human';
  const liveAt = a => humanAt(a) && table.seats[a].on && (a === me || conns.has(a));
  function blankTable(c){ return { code: c, gen: 0, host: 0, started: false, pace: 'normal', calls: 'standard', length: 4, seats: [0,1,2,3].map(() => ({ kind: 'open', name: '', ready: false, on: false, th: '' })) }; }

  /* ---------- the broker ---------- */
  function makePeer(id){
    return new Promise((res, rej) => {
      if (!window.Peer){ rej(new Error('nolib')); return; }
      let p; try { p = new Peer(id, peerOpts()); } catch(e){ rej(e); return; }
      const t = setTimeout(() => { rej(new Error('timeout')); try { p.destroy(); } catch(e){} }, 15000);
      p.on('open', () => { clearTimeout(t); res(p); });
      p.on('error', e => { clearTimeout(t); rej(e); });
    });
  }
  function why(e){
    const ty = e && (e.type || e.message);
    if (ty === 'unavailable-id') return 'Code taken. Try again.';
    if (ty === 'peer-unavailable') return 'No table with that code.';
    if (ty === 'nolib' || ty === 'browser-incompatible') return 'This browser can\'t connect.';
    if (/claude\.ai|claudeusercontent/.test(location.host)) return 'Not in this preview. Use mithul-sathish.github.io/tilewind';
    return 'Can\'t reach the others. Check your internet.';
  }

  /* =========================================================
     HOST
     ========================================================= */
  async function host(name){
    leave(true);
    for (let tries = 0; tries < 4; tries++){
      const c = rid(5);
      try { peer = await makePeer(pid(c, 0)); code = c; break; }
      catch(e){ if (e && e.type === 'unavailable-id') continue; throw new Error(why(e)); }
    }
    if (!peer) throw new Error(why({ type: 'unavailable-id' }));
    role = 'host'; me = 0; alive = true;
    table = blankTable(code);
    table.seats[0] = { kind: 'human', name: cleanName(name, 0), ready: true, on: true, th: await hashTok(store.token) };
    store.room = code; store.name = name; saveStore();
    hostListen();
    startPing();
    lobbyChanged();
    return code;
  }
  function hostListen(){
    peer.on('connection', conn => {
      conn.on('data', m => lagMs ? setTimeout(() => onHostMsg(conn, m), lagMs * (.7 + Math.random() * .6)) : onHostMsg(conn, m));
      conn.on('close', () => { const a = seatOf(conn); if (a >= 0) dropped(a); });
      conn.on('error', () => {});
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch(e){} }); // the broker only matters for new arrivals
    peer.on('error', () => {});
  }
  const seatOf = conn => { for (const [a, c] of conns) if (c === conn) return a; return -1; };
  async function onHostMsg(conn, m){
    if (!m || typeof m !== 'object' || !alive) return;
    let a = seatOf(conn);
    if (a >= 0) seen.set(a, Date.now());
    if (m.t === 'hello'){
      if (m.v !== PROTO){ send(conn, { t: 'deny', why: 'Your copy of Tilewind is out of date. Reload the page and try again.' }); return; }
      const th = await hashTok(String(m.token || ''));
      let seat = table.seats.findIndex(s => s.kind === 'human' && s.th === th);
      if (seat < 0){
        if (table.started){ send(conn, { t: 'deny', why: 'This game has already started. Ask the host to start a new table.' }); return; }
        seat = table.seats.findIndex(s => s.kind === 'open');
        if (seat < 0){ send(conn, { t: 'deny', why: 'This table is full.' }); return; }
        table.seats[seat] = { kind: 'human', name: cleanName(m.name, seat), ready: false, on: true, th };
      }
      const old = conns.get(seat); if (old && old !== conn) try { old.close(); } catch(e){}
      const back = table.started && !table.seats[seat].on;
      conns.set(seat, conn); seen.set(seat, Date.now()); table.seats[seat].on = true;
      if (m.share && handShares && (m.share.k === handKey || (backup && m.share.k === backup.k))) handShares.got.set(m.share.x, m.share);
      send(conn, { t: 'welcome', seat, table });
      if (table.started){ lastView.delete(seat); sendShare(seat); pushNow(); broadcast({ t: 'table', table }); if (back) note(table.seats[seat].name + ' is back.', seat); }
      lobbyChanged(); return;
    }
    if (a < 0) return;
    if (m.t === 'ping') return;
    if (m.t === 'ready' && !table.started){ table.seats[a].ready = !!m.on; lobbyChanged(); return; }
    if (m.t === 'act'){ const p = pending.get(m.id); if (p && p.seat === a) p.done(p.check(m.v)); return; }
    if (m.t === 'react'){ react(a, m.k); return; }
    if (m.t === 'next'){ if (nextReady){ nextReady.add(a); nextChanged(); } return; }
    if (m.t === 'bye'){ dropped(a, true); return; }
  }
  function dropped(a, left){
    if (!table || !table.seats[a] || table.seats[a].kind !== 'human' || a === me) return;
    const c = conns.get(a); conns.delete(a); seen.delete(a); lastView.delete(a);
    if (c) try { c.close(); } catch(e){}
    if (!table.started){ table.seats[a] = { kind: 'open', name: '', ready: false, on: false, th: '' }; lobbyChanged(); return; }
    if (!table.seats[a].on) return;
    table.seats[a].on = false;
    broadcast({ t: 'table', table });
    for (const p of [...pending.values()]) if (p.seat === a) p.done(p.deflt());
    if (nextReady) nextChanged();
    note(table.seats[a].name + (left ? ' left' : ' dropped') + '. Computer takes over.', a);
    lobbyChanged(); pushNow();
  }
  function lobbyChanged(){
    if (isHost()) broadcast({ t: 'table', table });
    if (onLobby) onLobby(table);
  }
  function setTable(k, v){ if (!isHost() || table.started) return; table[k] = v; lobbyChanged(); }
  function startPing(){
    clearInterval(pinger);
    pinger = setInterval(() => {
      if (isHost()){
        broadcast({ t: 'ping' });
        const now = Date.now();
        for (const [a, t] of seen) if (now - t > LOST) dropped(a);
      } else if (isGuest()){
        toHost({ t: 'ping' });
        if (!migrating && lastHostMsg && Date.now() - lastHostMsg > LOST) hostLost();
      }
    }, PING);
  }

  /* ---------- the match, from the host's side ---------- */
  function start(){
    if (!isHost() || table.started) return;
    table.started = true;
    let nb = 0; table.seats.forEach((s, a) => { if (s.kind !== 'human') table.seats[a] = { kind: 'bot', name: 'Computer ' + (++nb), ready: true, on: true, th: '' }; });
    lobbyChanged();
    if (onLobby) onLobby(null);
    netMatch();
  }
  function netMatch(resume, carry){
    if (typeof closeOverlay === 'function') closeOverlay();
    newMatch({ mode: 'net' });
    S.netPace = table.pace; S.netCalls = table.calls; S.totalHands = table.length;
    S.players.forEach((p, e) => { const a = abs(e), st = table.seats[a]; p.name = e === 0 ? 'You' : st.name; p.remote = e !== 0 && st.kind === 'human'; p.isHuman = e === 0; p.style = st.kind === 'human' ? 'you' : 'careful'; });
    if (resume) applyBackup(resume);
    if (carry){ S.handNo = carry.handNo; S.dealer = eng(carry.dealer); S.totalHands = carry.totalHands; carry.scores.forEach((sc, a) => S.players[eng(a)].score = sc); }
    if (typeof netStarted === 'function') netStarted();
    runMatch(resume ? resume.st : null);
  }
  const seatName = e => table.seats[abs(e)].name || 'Computer';
  // what one seat may see. Tiles in other hands and in the wall go out as ids only; ids are dealt at random each hand
  function viewFor(e){
    const rot = i => i == null || i < 0 ? i : (i - e + 4) & 3, P = S.players;
    const T = x => ({ id: x.id, t: x.t }), H = x => ({ id: x.id, t: -1 });
    const players = [0,1,2,3].map(r => {
      const i = (r + e) & 3, p = P[i], open = i === e || (S.turn === -1 && S.reveal === i), a = abs(i);
      return { name: r === 0 ? 'You' : seatName(i), score: p.score, hand: p.hand.map(open ? T : H), melds: p.melds.map(m => ({ type: m.type, concealed: m.concealed, claimed: m.claimed, tiles: m.tiles.map(T) })),
        discards: p.discards.map(T), flowers: p.flowers.map(T), drawnId: p.drawnId, human: humanAt(a), on: liveAt(a) || !humanAt(a) };
    });
    const tm = S.netTimer;
    return { t: 'view', seat: abs(e), dealer: rot(S.dealer), handNo: S.handNo, totalHands: S.totalHands, roundWind: S.roundWind, turn: S.turn < 0 ? -1 : rot(S.turn), dealId: S.dealId, dealing: !!S.netDeal,
      wall: S.wall.map(x => x.id), slot: S.slot ? [...S.slot] : [], dealt: S.dealt ? [...S.dealt] : null, players,
      lastDiscard: S.lastDiscard ? { id: S.lastDiscard.id, from: rot(S.lastDiscard.from) } : null, newest: S.newest ? Object.assign({}, S.newest, { from: rot(S.newest.from) }) : null,
      recent: (S.recent || []).map(x => Object.assign({}, x, { from: rot(x.from) })), reveal: S.reveal == null ? null : rot(S.reveal), groups: S.turn === -1 ? S.groups : null, revealN: S.revealN || 0, revealFast: !!S.revealFast,
      timer: tm ? { seat: rot(tm.e), left: Math.max(0, tm.until - Date.now()), total: tm.total } : null, pace: table.pace, calls: table.calls };
  }
  function push(){ if (!isHost() || !S || S.mode !== 'net' || pushQueued) return; pushQueued = true; queueMicrotask(() => { pushQueued = false; sendViews(); }); }
  function pushNow(){ if (isHost() && S && S.mode === 'net') sendViews(); }
  function sendViews(){
    for (const [a, c] of conns){
      if (!table.seats[a].on) continue;
      const v = viewFor(eng(a)), k = JSON.stringify(v.timer ? Object.assign({}, v, { timer: { seat: v.timer.seat, total: v.timer.total } }) : v);
      if (lastView.get(a) === k) continue; lastView.set(a, k); send(c, v);
    }
  }
  function fx(k, o, onlySeat){ if (!isHost() || !S || S.mode !== 'net') return; const m = Object.assign({ t: 'fx', k }, o); for (const [a, c] of conns){ if (onlySeat != null && a !== abs(onlySeat)) continue; const mm = Object.assign({}, m); if (mm.pi != null) mm.pi = (mm.pi - eng(a) + 4) & 3; send(c, mm); } }
  const live = e => isHost() && S && S.mode === 'net' && e !== 0 && liveAt(abs(e));
  const remote = e => isHost() && S && S.mode === 'net' && e !== 0 && humanAt(abs(e));
  /* turn and call clocks: nobody can hold up the table */
  const turnMs = () => ({ relaxed: 30000, normal: 22000, fast: 15000 })[table.pace] || 22000;
  const callMs = () => ({ relaxed: 11000, normal: 8000, fast: 6000 })[table.pace] || 8000;
  function ask(e, kind, payload, ms, check, deflt){
    const a = abs(e), conn = conns.get(a);
    if (!conn || !liveAt(a)) return Promise.resolve(deflt());
    const id = ++askSeq;
    return new Promise(res => {
      let tm = 0;
      const p = { seat: a, kind, check, deflt, done: v => { if (!pending.has(id)) return; pending.delete(id); clearTimeout(tm); if (kind === 'turn' && S && S.netTimer && S.netTimer.id === id){ S.netTimer = null; push(); } res(v); } };
      pending.set(id, p);
      tm = setTimeout(() => { send(conn, { t: 'cancel', id }); note(table.seats[a].name + ' ran out of time.', null, true); p.done(deflt()); }, ms + 900);
      if (kind === 'turn'){ S.netTimer = { id, e, until: Date.now() + ms, total: ms }; push(); }
      send(conn, Object.assign({ t: 'ask', id, kind, ms }, payload));
      pushNow();
    });
  }
  // the host's own turn runs on the same clock
  function localClock(kind, ms, onTime){
    const id = ++askSeq;
    if (kind === 'turn'){ S.netTimer = { id, e: 0, until: Date.now() + ms, total: ms }; push(); }
    S.deadline = { until: Date.now() + ms, total: ms };
    const t = setTimeout(() => { if (S && S.netTimer && S.netTimer.id === id){ S.netTimer = null; } onTime(); }, ms);
    return () => { clearTimeout(t); if (S && S.netTimer && S.netTimer.id === id){ S.netTimer = null; push(); } if (S) S.deadline = null; };
  }
  function defaultDiscard(e){ const p = S.players[e]; return { type: 'discard', id: p.drawnId != null && p.hand.some(x => x.id === p.drawnId) ? p.drawnId : p.hand[p.hand.length - 1].id }; }
  function askTurn(e, so){
    const p = S.players[e];
    const check = v => {
      if (v && v.type === 'win' && so.win) return { type: 'win' };
      if (v && v.type === 'kong' && so.kongs.includes(v.t)) return { type: 'kong', t: v.t };
      if (v && v.type === 'discard' && p.hand.some(x => x.id === v.id)) return { type: 'discard', id: v.id };
      return defaultDiscard(e);
    };
    return ask(e, 'turn', { so }, turnMs(), check, () => defaultDiscard(e));
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
    return ask(e, 'claim', { o, d: { id: d.id, t: d.t }, from: (from - e + 4) & 3 }, callMs(), check, () => null);
  }
  function askExpert(e, d, from){
    const o = claimOptions(e, d.t, from);
    const check = v => { if (!v || !anyOpt(o)) return null; if (v.type === 'ron' && o.ron) return { type: 'ron' }; if (v.type === 'kong' && o.kong) return { type: 'kong' }; if (v.type === 'pung' && o.pung) return { type: 'pung' }; if (v.type === 'chow' && o.chows.includes(v.start)) return { type: 'chow', start: v.start }; return null; };
    const win = (PACE[table.pace] || PACE.normal).window;
    return ask(e, 'expert', { d: { id: d.id, t: d.t }, from: (from - e + 4) & 3, win }, win + callMs(), check, () => null);
  }

  /* ---------- a new hand: fresh ids, and a fresh key for the backup ---------- */
  function shuffleIds(tiles){
    const ids = [...Array(144).keys()], r = new Uint32Array(144); crypto.getRandomValues(r);
    for (let i = 143; i > 0; i--){ const j = r[i] % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (const x of tiles) x.id = ids[x.id];
    return tiles;
  }
  async function newHand(){
    if (!isHost()) return;
    for (const p of S.players) for (const x of p.hand.concat(p.flowers)) V.retype(x.id, x.t);
    for (const x of S.wall) V.retype(x.id, x.t);
    handKey = S.slotKey + ':' + S.handNo + ':' + rid(6);
    const guests = [...conns.keys()].filter(a => table.seats[a].on);
    backup = null; handShares = null; myShare = null;
    if (guests.length >= 2){ // with only one guest a backup could be opened by that guest alone, so there is none
      const key = crypto.getRandomValues(new Uint8Array(32));
      const xs = [0,1,2,3].map(a => a + 1);
      const shares = split(key, xs);
      handShares = { key, shares, got: new Map() };
    }
    for (const a of guests) sendShare(a);
  }
  function sendShare(a){ if (!handShares || !handShares.shares || !handShares.shares[a] || !conns.get(a)) return; const sh = handShares.shares[a]; send(conns.get(a), { t: 'share', k: handKey, x: sh.x, y: sh.y }); }
  async function saveBackup(st){
    if (!isHost() || !handShares || !S || S.mode !== 'net') return;
    const o = { k: handKey, st: { turn: abs(st.turn), needDraw: st.needDraw, kongDraw: st.kongDraw }, dealer: abs(S.dealer), handNo: S.handNo, totalHands: S.totalHands, roundWind: S.roundWind,
      wall: S.wall, slot: [...S.slot], dealt: S.dealt ? [...S.dealt] : null, dealId: S.dealId, fedBy: (S.fedBy || []).map(f => ({ from: abs(f.from), by: abs(f.by), t: f.t })),
      players: [0,1,2,3].map(a => { const p = S.players[eng(a)]; return { score: p.score, hand: p.hand, melds: p.melds, discards: p.discards, flowers: p.flowers }; }) };
    try { const box = await seal(handShares.key, o); box.k = handKey; for (const [a, c] of conns) if (table.seats[a].on) send(c, Object.assign({ t: 'bk' }, box)); } catch(e){}
  }
  function applyBackup(b){
    Object.assign(S, { dealId: b.dealId, dealer: eng(b.dealer), handNo: b.handNo, totalHands: b.totalHands, roundWind: b.roundWind, wall: b.wall, slot: new Map(b.slot), dealt: b.dealt ? new Map(b.dealt) : null, slotKey: (S.slotKey || 0) + 1, fedBy: (b.fedBy || []).map(f => ({ from: eng(f.from), by: eng(f.by), t: f.t })), reveal: null, groups: null, revealN: 0, lastDiscard: null, newest: null, recent: [], order: null, fed: [] });
    b.players.forEach((q, a) => Object.assign(S.players[eng(a)], { score: q.score, hand: q.hand, melds: q.melds, discards: q.discards, flowers: q.flowers, drawnId: null }));
    b.st = { turn: eng(b.st.turn), needDraw: b.st.needDraw, kongDraw: b.st.kongDraw };
    for (const p of S.players) for (const x of p.hand.concat(p.flowers, p.discards, p.melds.flatMap(m => m.tiles))) V.retype(x.id, x.t);
    for (const x of S.wall) V.retype(x.id, x.t);
  }

  /* ---------- between hands: everyone taps to go on, or the table goes on by itself ---------- */
  function waitNext(){
    if (!isHost()) return Promise.resolve();
    nextReady = new Set();
    return new Promise(res => {
      const end = () => { clearTimeout(t); nextReady = null; nextWait = null; res(); };
      const t = setTimeout(end, 25000);
      nextWait = end; nextChanged();
    });
  }
  function nextChanged(){
    if (!nextReady) return;
    const need = table.seats.map((s, a) => a).filter(a => liveAt(a) && a !== me), missing = need.filter(a => !nextReady.has(a));
    broadcast({ t: 'waiting', names: missing.map(a => table.seats[a].name) });
    if (typeof netWaiting === 'function') netWaiting(missing.map(a => table.seats[a].name), nextReady.has(me));
    if (!missing.length && nextReady.has(me) && nextWait) nextWait();
  }
  function iAmNext(){ if (isHost()){ if (nextReady){ nextReady.add(me); nextChanged(); } } else toHost({ t: 'next' }); }
  function result(w, parts, x){
    if (!isHost()) return;
    for (const [a, c] of conns){
      if (!table.seats[a].on) continue;
      const e = eng(a), rot = i => i == null || i < 0 ? i : (i - e + 4) & 3;
      const fedTs = (S.fedBy || []).filter(f => f.from === e && f.by === w.pi).map(f => f.t);
      if (w.pi >= 0 && !w.selfDrawn && w.ctx.from === e){ const h = S.players[w.pi].hand.find(h => h.id === w.ctx.winId); if (h) fedTs.push(h.t); }
      send(c, { t: 'result', w: { pi: rot(w.pi), selfDrawn: w.selfDrawn, ctx: w.ctx ? { from: rot(w.ctx.from), winId: w.ctx.winId } : null, res: w.res ? { fan: w.res.fan, items: w.res.items, concealed: w.res.concealed } : null, val: w.val, pay: [0,1,2,3].map(r => w.pay[(r + e) & 3]), news: [] },
        parts, x: { last: x.last, place: x.order ? x.order.findIndex(o => o.i === e) + 1 : 0, order: x.order ? x.order.map(o => ({ i: rot(o.i), score: o.p.score })) : null }, fedTs, near: typeof nearMissFor === 'function' ? nearMissFor(e, w) : '' });
    }
  }
  function matchOver(){
    if (!isHost()) return;
    table.started = false; table.seats.forEach((s, a) => { if (s.kind === 'bot') table.seats[a] = { kind: 'open', name: '', ready: false, on: false, th: '' }; else if (s.kind === 'human' && !s.on && a !== me) table.seats[a] = { kind: 'open', name: '', ready: false, on: false, th: '' }; else s.ready = a === me; });
    broadcast({ t: 'over' }); lobbyChanged();
  }
  function react(a, k){
    const now = Date.now(); if (now - (reactAt.get(a) || 0) < 2500) return; reactAt.set(a, now);
    if (!REACTS.includes(k)) return;
    if (isHost()){ broadcast({ t: 'react', seat: a, k }); showReact(a, k); }
  }
  const REACTS = ['Nice hand', 'Good game', 'Oops', 'Thanks'];
  function sendReact(k){ if (isHost()) react(me, k); else { const now = Date.now(); if (now - (reactAt.get(me) || 0) < 2500) return; reactAt.set(me, now); toHost({ t: 'react', k }); } }
  function showReact(a, k){ if (typeof netReaction === 'function' && table && S && S.mode === 'net') netReaction(rel(a), k); }
  const rel = a => (a - me + 4) & 3; // where an absolute seat sits on my screen
  function note(text, a, quiet){ if (isHost()) broadcast({ t: 'note', text, quiet: !!quiet }); if (typeof netNote === 'function') netNote(text, quiet); }

  /* =========================================================
     GUEST
     ========================================================= */
  async function join(c, name){
    leave(true);
    c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 5) throw new Error('A table code is five letters and numbers.');
    try { peer = await makePeer(pid(c, 'g' + rid(8))); } catch(e){ throw new Error(why(e)); }
    code = c; role = 'guest'; alive = true; store.room = c; store.name = name; saveStore();
    peer.on('error', e => { if (e && e.type === 'peer-unavailable' && !hostConn && connFail) connFail(why(e)); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch(e){} });
    const ok = await new Promise((res, rej) => connectHost(0, name, res, rej));
    startPing();
    return ok;
  }
  // connFail: the broker said nobody has that id (yet). During a hand-off the new host may need a second to register, so the caller retries.
  let connFail = null;
  function connectHost(gen, name, res, rej, ms){
    const conn = peer.connect(pid(code, gen), { reliable: true, serialization: 'json' });
    let done = false;
    const fail = msg => { if (done) return; done = true; clearTimeout(t); if (connFail === fail) connFail = null; try { conn.close(); } catch(e){} rej && rej(new Error(msg || 'No table with that code answered. Check the code and try again.')); };
    const t = setTimeout(() => fail(), ms || 12000);
    connFail = fail;
    conn.on('open', () => { send(conn, { t: 'hello', v: PROTO, name, token: store.token, share: myShare }); });
    conn.on('data', m => {
      const go = () => {
        lastHostMsg = Date.now();
        if (m && m.t === 'welcome' && !done){ done = true; clearTimeout(t); if (connFail === fail) connFail = null; hostConn = conn; me = m.seat; table = m.table; migrating = false; res && res(m.seat); lobbyChanged(); }
        else if (m && m.t === 'deny' && !done) fail(m.why);
        else if (conn === hostConn) onGuestMsg(m);
      };
      lagMs ? setTimeout(go, lagMs * (.7 + Math.random() * .6)) : go();
    });
    conn.on('close', () => { if (conn === hostConn && alive && !migrating) hostLost(); });
    conn.on('error', () => {});
  }
  function onGuestMsg(m){
    if (!m || typeof m !== 'object') return;
    switch (m.t){
      case 'ping': return;
      case 'table': table = m.table; if (onLobby && !table.started) onLobby(table); return;
      case 'view': if (typeof netView === 'function') netView(m); return;
      case 'ask': if (typeof netAsk === 'function') netAsk(m); return;
      case 'cancel': if (typeof netCancel === 'function') netCancel(m.id); return;
      case 'fx': if (typeof netFx === 'function') netFx(m); return;
      case 'result': if (typeof netResult === 'function') netResult(m); return;
      case 'waiting': if (typeof netWaiting === 'function') netWaiting(m.names); return;
      case 'react': showReact(m.seat, m.k); return;
      case 'note': if (typeof netNote === 'function') netNote(m.text, m.quiet); return;
      case 'share': myShare = { k: m.k, x: m.x, y: m.y }; return;
      case 'bk': backup = m; return;
      case 'over': if (typeof netOver === 'function') netOver(); return;
    }
  }
  function act(id, v){ toHost({ t: 'act', id, v }); }
  function ready(on){ if (isHost()){ table.seats[me].ready = true; lobbyChanged(); } else toHost({ t: 'ready', on }); }

  /* ---------- the host has gone: the next person at the table takes over ---------- */
  function hostLost(){
    if (migrating || !table) return;
    migrating = true; hostConn = null;
    const old = table.host, gen0 = table.gen;
    const cands = [0,1,2,3].map(k => (old + k) & 3).filter(a => a !== old && table.seats[a].kind === 'human' && table.seats[a].on);
    if (typeof netNote === 'function') netNote('The host left. Moving the table to ' + (cands[0] === me ? 'you' : cands[0] != null ? table.seats[cands[0]].name : 'someone else') + '.');
    tryCand(0, cands, gen0, old);
  }
  async function tryCand(k, cands, gen0, old){
    if (!alive) return;
    if (k >= cands.length){ migrating = false; if (typeof netNote === 'function') netNote('Lost the table. Nobody else could take over.'); if (typeof netGone === 'function') netGone(); return; }
    const gen = gen0 + 1 + k, a = cands[k];
    if (a === me){
      try {
        const p2 = await makePeer(pid(code, gen));
        try { peer.destroy(); } catch(e){}
        peer = p2; role = 'host'; migrating = false;
        table.gen = gen; table.host = me; table.seats[old].on = false; cands.slice(0, k).forEach(x => table.seats[x].on = false);
        conns.clear(); seen.clear(); lastView.clear(); pending.clear();
        hostListen();
        takeOver();
      } catch(e){ tryCand(k + 1, cands, gen0, old); }
      return;
    }
    // keep knocking on the same door until it opens or 12 s pass; only then try the next person
    const deadline = Date.now() + 12000;
    const knock = () => {
      if (!alive || !migrating) return;
      const left = deadline - Date.now();
      if (left <= 0) return tryCand(k + 1, cands, gen0, old);
      connectHost(gen, store.name, () => {}, () => setTimeout(knock, 1200), Math.min(4000, left));
    };
    knock();
  }
  async function takeOver(){
    // wait a moment for the others, then open the backup if two of us hold shares of its key
    const wasHand = S && S.mode === 'net' ? { handNo: S.handNo, dealer: (S.dealer + me) & 3, scores: [0,1,2,3].map(a => S.players[rel(a)].score), totalHands: S.totalHands } : null;
    handShares = handShares || { got: new Map() };
    if (myShare) handShares.got.set(myShare.x, myShare);
    const expect = table.seats.filter((s, a) => s.kind === 'human' && s.on && a !== me).length;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000 && conns.size < expect) await new Promise(r => setTimeout(r, 200));
    let state = null;
    const sh = [...handShares.got.values()].filter(s => backup && s.k === backup.k);
    if (backup && sh.length >= 2){ try { state = await open(join2(sh[0], sh[1]), backup); } catch(e){ state = null; } }
    token++;
    if (state && state.k === backup.k){ note('The table moved to ' + table.seats[me].name + '. The hand goes on.'); netMatch(state); }
    else {
      note('The table moved to ' + table.seats[me].name + '. This hand starts again with the same scores.');
      netMatch(null, wasHand);
    }
    lobbyChanged();
  }

  function leave(quiet){
    alive = false;
    try { if (isGuest()) toHost({ t: 'bye' }); } catch(e){}
    clearInterval(pinger);
    for (const p of [...pending.values()]) p.done(p.deflt());
    for (const c of conns.values()) try { c.close(); } catch(e){}
    conns.clear(); seen.clear(); lastView.clear();
    try { if (hostConn) hostConn.close(); } catch(e){}
    try { if (peer) peer.destroy(); } catch(e){}
    peer = null; hostConn = null; role = null; table = null; me = -1; migrating = false; backup = null; myShare = null; handShares = null; nextReady = null;
    if (!quiet){ store.room = null; saveStore(); }
  }
  window.addEventListener('pagehide', () => { if (active()) try { if (isGuest()) toHost({ t: 'bye' }); } catch(e){} });

  return {
    REACTS, store, saveStore, cleanName, host, join, leave, start, setTable, ready, act, sendReact, iAmNext, waitNext, result, matchOver,
    push, pushNow, fx, live, remote, askTurn, askClaim, askExpert, localClock, turnMs, callMs, newHand, saveBackup, shuffleIds, defaultDiscard,
    isHost, isGuest, active, rel, eng: e => eng(e), seatName,
    get table(){ return table; }, get me(){ return me; }, get code(){ return code; },
    set onLobby(f){ onLobby = f; },
    link(){ const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', code); if (qs.get('sig')) u.searchParams.set('sig', qs.get('sig')); return u.toString(); },
    test: { split, join2, seal, open, cleanName }
  };
})();
window.TW_net = NET;
