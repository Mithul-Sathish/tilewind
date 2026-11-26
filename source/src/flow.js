/* =========================================================
   THE MATCH: who acts when, how long it takes, and what happens around a
   hand. Dealing, claiming and scoring call the same rule functions as
   before; nothing here decides what a hand is worth.
   ========================================================= */
/* three paces. Relaxed is the default: an opponent's whole turn, from one discard to the next, takes about 1.2 to 1.8 s,
   and the thrown tile always comes to rest and stays still before anyone else moves. */
const PACE = {
  relaxed: { think: [350, 850], hold: 420, f: 1.15, window: 1700 },
  normal:  { think: [300, 600],  hold: 260, f: 1,    window: 1250 },
  fast:    { think: [170, 380],  hold: 110, f: .65,  window: 900 }
};
const pace = () => PACE[S && S.mode === 'net' ? S.netPace : settings.pace] || PACE.relaxed;
function speed(){ return autotest ? 0 : pace().f; }
function sleep(ms){
  const my = token;
  return new Promise((res, rej) => setTimeout(() => (my === token ? res() : rej(ABORT)), ms * speed()));
}
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function newMatch(opts = {}){
  token++;
  const mode = opts.mode || 'play', teaching = mode === 'play' && profile.intro >= 1 && profile.intro <= 2;
  const want = mode === 'daily' || mode === 'weekly' || mode === 'net' ? 1 : mode === 'tut' || teaching ? 0 : settings.difficulty, diff = Math.min(want, 2);
  if (mode !== 'net') V.resetTypes(); // solo tiles keep their fixed ids; a table with friends deals fresh ids every hand
  S = {
    mode, diff,
    players: [0,1,2,3].map(i => ({
      name: SEAT[i].name, style: i === 0 ? 'you' : want === 3 ? ['', 'careful', 'flush', 'quick'][i] : STYLES[diff].id,
      isHuman: i === 0 && !autotest, score: 1000, hand: [], melds: [], discards: [], flowers: [], drawnId: null
    })),
    dealer: 0, handNo: 0, totalHands: mode === 'play' ? settings.length : 1, wall: [], turn: 0,
    lastDiscard: null, ui: {}, selected: null, matchXp: 0, started: Date.now(), hintId: null,
    fed: [], fedBy: [], rs: null, wasReady: false, say: null, callout: null, recent: [], newest: null, order: null, claimWin: null
  };
}
function allTiles(){
  const w = []; let id = 0;
  for (let t = 0; t < 34; t++) for (let k = 0; k < 4; k++) w.push({ id: id++, t });
  for (let t = 34; t < 42; t++) w.push({ id: id++, t });
  return w;
}
/* the guided first hand: a real deal, arranged so the lesson comes out right */
function tutWall(){
  const all = allTiles(), take = t => all.splice(all.findIndex(x => x.t === t), 1)[0];
  const mine = [0,1,2,12,13,14,31,31,24,25,27,27,30].map(take);
  const script = [29, 31, 28, 33, 30, 23].map(take); // West for you, Red from the right, three quiet tiles, then 6 Bamboo
  const flowers = all.filter(x => x.t >= 34), rest = shuffle(all.filter(x => x.t < 34));
  const w = [];
  for (let i = 0; i < 52; i++) w.push(i % 4 === 0 ? mine[i / 4] : rest.pop());
  return w.concat(script, shuffle(rest.concat(flowers)));
}
function setupHand(){
  S.rs = S.mode === 'daily' ? hashStr('daily' + dayKey()) | 0 : S.mode === 'weekly' ? weeklySeed() : (Math.random() * 4294967296) | 0;
  S.wall = S.mode === 'tut' ? tutWall() : shuffle(allTiles());
  if (S.mode === 'net'){ NET.shuffleIds(S.wall); S.dealId = crypto.getRandomValues(new Uint32Array(2)).join('-'); S.fedBy = []; }
  S.slot = new Map(S.wall.map((x, i) => [x.id, i])); S.slotKey = (S.slotKey || 0) + 1; S.reveal = null; S.groups = null; S.revealN = 0;
  for (const p of S.players){ p.hand = []; p.melds = []; p.discards = []; p.flowers = []; p.drawnId = null; }
  S.dealt = new Map(); let di = 0;
  for (let r = 0; r < 13; r++) for (let k = 0; k < 4; k++){ const x = S.wall.shift(); S.dealt.set(x.id, di++); S.players[(S.dealer + k) % 4].hand.push(x); }
  for (let k = 0; k < 4; k++){
    const p = S.players[(S.dealer + k) % 4];
    let f; while ((f = p.hand.findIndex(x => x.t >= 34)) >= 0){ p.flowers.push(p.hand.splice(f, 1)[0]); const r = drawTile(p, true); if (r){ S.dealt.set(r.id, di++); p.hand.push(r); } }
    sortTiles(p.hand);
  }
  S.roundWind = Math.floor(S.handNo / 4) % 4;
  S.lastDiscard = null; S.turn = S.dealer; S.ui = {}; S.selected = null; S.hintId = null;
  S.fed = []; S.wasReady = false; S.say = null; S.callout = null; S.warned = null; S.tutStep = 0; S.everReady = false; S.introShown = false;
  S.recent = []; S.newest = null; S.claimWin = null; S.order = sortedIds(S.players[0].hand); S.fresh = [];
}

/* ---------------- saving: a match is always exactly where you left it ---------------- */
function saveResume(loop){
  if (autotest || S.mode !== 'play') return;
  const o = { v:2, loop, dealer:S.dealer, handNo:S.handNo, totalHands:S.totalHands, diff:S.diff, matchXp:S.matchXp, wall:S.wall, roundWind:S.roundWind,
    slot:[...S.slot], rs:S.rs, fed:S.fed, lastDiscard:S.lastDiscard, wasReady:S.wasReady, elapsed: Date.now() - S.started, order:S.order, recent:S.recent,
    players: S.players.map(p => ({ name:p.name, style:p.style, score:p.score, hand:p.hand, melds:p.melds, discards:p.discards, flowers:p.flowers, drawnId:p.drawnId })) };
  try { localStorage.setItem(RKEY, JSON.stringify(o)); } catch(e){}
}
function saveBetween(){
  if (autotest || S.mode !== 'play') return;
  const o = { v:2, next:true, dealer:(S.dealer + 1) % 4, handNo:S.handNo + 1, totalHands:S.totalHands, diff:S.diff, matchXp:S.matchXp, elapsed: Date.now() - S.started,
    players: S.players.map(p => ({ name:p.name, style:p.style, score:p.score })) };
  try { localStorage.setItem(RKEY, JSON.stringify(o)); } catch(e){}
}
function clearResume(){ try { localStorage.removeItem(RKEY); } catch(e){} }
function peekResume(){ const r = load(RKEY); return r && r.v === 2 && r.handNo < r.totalHands ? r : null; }
function restore(r){
  newMatch({ mode:'play' });
  Object.assign(S, { dealer:r.dealer, handNo:r.handNo, totalHands:r.totalHands, diff:r.diff, matchXp:r.matchXp || 0, started: Date.now() - (r.elapsed || 0) });
  r.players.forEach((q, i) => Object.assign(S.players[i], q, { isHuman: i === 0 }));
  if (!r.next){
    Object.assign(S, { wall:r.wall, roundWind:r.roundWind, slot:new Map(r.slot), rs:r.rs, fed:r.fed || [], lastDiscard:null, wasReady:false, slotKey:(S.slotKey || 0) + 1, reveal:null, groups:null, revealN:0, tutStep:0, order: r.order || null, recent: r.recent || [] });
    // a discard still lying in front of its thrower was not yet resolved: the loop replays from before that turn
  }
}
function startGame(mode = 'play'){ if (mode === 'play') clearResume(); newMatch({ mode }); runMatch(); }
function playOrResume(){ const r = peekResume(); if (!r) return startGame('play'); restore(r); runMatch(r.next ? null : r.loop); }

/* a table for someone new: the same opponents, but three times in ten they throw back what they drew without thinking */
const gentleTable = () => S.mode === 'play' && S.diff === 0 && (profile.kind === 'new' || (profile.intro >= 1 && profile.intro <= 3));
async function runMatch(loop){
  const my = token;
  try {
    while (true){
      if (!loop){
        setupHand();
        if (S.mode === 'net'){ await NET.newHand(); S.netDeal = true; NET.pushNow(); }
        showScreen('game'); fpsStart('deal'); await V.deal(); fpsStop('deal'); S.netDeal = false;
      } else { if (S.mode === 'net') await NET.newHand(); showScreen('game'); }
      render();
      const r = await playHand(loop); loop = null;
      if (my !== token) return;
      if (S.mode === 'net' && S.handNo + 1 >= S.totalHands){ NET.matchOver(); netLobbyBack(); return; }
      if (S.handNo + 1 >= S.totalHands){ if (r === 'again') startGame(S.mode === 'tut' ? 'play' : S.mode); else goHome(); return; }
      S.handNo++; S.dealer = (S.dealer + 1) % 4;
    }
  } catch(e){ if (e !== ABORT) console.error(e); }
}

async function playHand(st){
  let turn = st ? st.turn : S.dealer, needDraw = st ? st.needDraw : true, kongDraw = st ? st.kongDraw : false;
  if (!st && !autotest && !profile.viewTip && S.mode === 'play' && !(profile.intro >= 1 && profile.intro <= 3)){ profile.viewTip = true; save(); say('Tip: hold a tile to see its name.', 4200); }
  if (!st && !autotest) await introIdea(); // hands two to four open with one new idea, before anyone moves
  while (true){
    const p = S.players[turn];
    S.turn = turn;
    S.resumeAt = { turn, needDraw, kongDraw }; saveResume(S.resumeAt); if (S.mode === 'net') NET.saveBackup(S.resumeAt);
    const pc = pace(), think = (pc.think[0] + Math.random() * (pc.think[1] - pc.think[0])) / pc.f; // sleep() scales it back by the pace
    if (needDraw){
      const tile = drawTile(p, kongDraw);
      if (!tile) return endDraw();
      p.hand.push(tile); p.drawnId = tile.id; // the enlarged copy of the last discard stays until the next one replaces it
      if (p.isHuman) noteNew(tile.id);
      if (p.isHuman) snd('draw'); else if (S.mode === 'net') NET.fx('snd', { sk: 'draw' }, turn);
      render();
      if (!p.isHuman && !NET.live(turn)) await sleep(think * .45);
    } else render();
    const so = selfOptions(turn, needDraw);
    let action;
    if (p.isHuman){ if (S.mode === 'tut') await tutIntro(); action = await (S.mode === 'net' ? netLocalTurn(so) : humanTurn(so)); }
    else if (NET.live(turn)) action = await NET.askTurn(turn, so);
    else {
      if (S.mode === 'tut') action = { type:'discard', id: p.drawnId != null ? p.drawnId : p.hand[0].id };
      else if (so.win) action = { type:'win' };
      else if (so.kongs.length) action = { type:'kong', t:so.kongs[0] };
      else action = { type:'discard', id: turn !== 0 && gentleTable() && p.drawnId != null && p.hand.some(x => x.id === p.drawnId) && rnd() < .3 ? p.drawnId : botDiscard(turn) };
      await sleep((needDraw ? think * .55 : think) * botTempo(turn, action));
    }
    if (action.type === 'win') return endWin(turn, true, { kongDraw, lastTile: S.wall.length === 0, winId: p.drawnId });
    if (action.type === 'kong'){
      doSelfKong(turn, action.t); haptic([14, 40, 14, 40, 20]); callStroke(turn, 'kong'); render();
      if (turn === 0){ questEvent({ kind:'kong' }); save(); }
      await sleep(620); needDraw = true; kongDraw = true; continue;
    }
    const d = removeById(p, action.id);
    p.drawnId = null; sortTiles(p.hand);
    p.discards.push(d); S.lastDiscard = { id:d.id, from:turn }; S.newest = { id:d.id, t:d.t, from:turn };
    S.recent.push({ id:d.id, t:d.t, from:turn }); if (S.recent.length > 4) S.recent.shift();
    S.selected = null; S.hintId = null; S.warned = null; kongDraw = false;
    if (p.isHuman){ haptic(10); readyCheck(); }
    render();
    if (autotest) for (const q of S.players){ if (q.hand.length + 3 * q.melds.length !== 13) (window.TW_bad = window.TW_bad || []).push([q.name, q.hand.length, q.melds.length]); }
    if (S.mode === 'tut' && p.isHuman && S.wasReady) await tutSay('One tile from winning! These tiles would win. The number is how many are left.', 'ghosts');
    // nothing moves while the tile is in the air; then it is held still long enough to read
    await V.whenLanded(d.id);
    let mine = undefined;
    if (S.mode === 'net') await sleep((p.isHuman || NET.live(turn) ? 200 : pace().hold) / pace().f);
    else if (!p.isHuman && callLevel() === 'expert' && !autotest && S.players[0].isHuman && S.mode !== 'tut' && S.mode !== 'lesson') mine = await expertWindow(turn, d);
    else await sleep(p.isHuman ? 240 : pace().hold / pace().f);
    const claim = S.mode === 'net' ? await netClaims(turn, d) : await resolveClaims(turn, d, mine);
    if (!claim){ turn = (turn + 1) % 4; needDraw = true; continue; }
    p.discards.pop(); S.lastDiscard = null; S.newest = null; S.recent = S.recent.filter(r => r.id !== d.id);
    if (claim.type === 'ron'){
      S.players[claim.pi].hand.push(d);
      return endWin(claim.pi, false, { from:turn, lastTile: S.wall.length === 0, winId:d.id });
    }
    makeMeld(claim.pi, claim, d);
    if (turn === 0) S.fed.push({ by:claim.pi, t:d.t, type:claim.type });
    S.fedBy.push({ from:turn, by:claim.pi, t:d.t });
    haptic(claim.type === 'chow' ? [12, 50, 12] : [16, 50, 22]); callStroke(claim.pi, claim.type);
    if (claim.pi === 0){ questEvent({ kind:'claim', type:claim.type }); if (claim.type === 'kong') questEvent({ kind:'kong' }); save(); }
    turn = claim.pi; needDraw = claim.type === 'kong'; kongDraw = needDraw;
    render(); await sleep(claim.pi === 0 ? 420 : 640);
  }
}

async function resolveClaims(from, d, mine){
  const entries = [];
  for (let k = 1; k < 4; k++){
    const pi = (from + k) % 4, o = claimOptions(pi, d.t, from);
    if (anyOpt(o)) entries.push({ pi, o, k });
  }
  if (!entries.length) return null;
  const decisions = [];
  for (const e of entries){
    const human = S.players[e.pi].isHuman;
    if (S.mode === 'tut' && !human) continue; // the guided hand keeps the other seats quiet
    const dec = human ? (mine !== undefined ? mine : await humanClaim(e.o, d, from)) : aiClaim(e.pi, d.t, e.o);
    if (dec) decisions.push(Object.assign({ pi:e.pi, k:e.k }, dec));
  }
  if (!decisions.length) return null;
  const rank = x => x.type === 'ron' ? 0 : (x.type === 'pung' || x.type === 'kong') ? 1 : 2;
  decisions.sort((a, b) => rank(a) - rank(b) || a.k - b.k);
  return decisions[0];
}

/* ---------------- the computer players: same rules, different temper ----------------
   Bold players push for the win when close even if someone looks dangerous; careful ones fold.
   They take a beat longer on hard choices and throw a fresh useless tile almost at once, the way people do. */
function botDiscard(pi){
  const p = S.players[pi];
  if (S.diff === 0 || S.mode === 'tut' || S.mode === 'lesson' || window.TW_v8ai) return aiDiscard(pi); // TW_v8ai: test switch for the rules check against v8
  const greedy = analyzeDiscards(pi, { flush: p.style === 'flush' });
  if (greedy[0] && greedy[0].sh === 0 && threatSeats(pi).length){
    const push = p.style === 'quick' ? .7 : p.style === 'flush' ? .45 : .12;
    if (rnd() < push) return pickDiscardTile(pi, greedy[0].t);
  }
  return aiDiscard(pi);
}
function botTempo(pi, action){
  if (autotest) return 1;
  const p = S.players[pi], st = p.style === 'quick' ? .8 : p.style === 'careful' ? 1.12 : 1;
  if (action.type === 'win') return 1.5 * st;
  if (action.type === 'kong') return 1.2 * st;
  const x = p.hand.find(h => h.id === action.id);
  if (x && x.id === p.drawnId && (x.t >= 27 || countsOf(p.hand)[x.t] === 1)) return .65 * st; // drew it, does not want it
  const c = analyzeDiscards(pi, {}), close = c.length > 1 && c[0].sh === c[1].sh && Math.abs(c[0].score - c[1].score) < 12;
  return (close ? 1.45 : 1) * st * (.85 + Math.random() * .3);
}

/* ---------------- a table with friends: every person decides at once, on a clock ---------------- */
async function netLocalTurn(so){
  const stop = NET.localClock('turn', NET.turnMs(), () => { say('Time up. Tile thrown for you.', 3000); if (S.ui && S.ui.resolve) S.ui.resolve(NET.defaultDiscard(0)); });
  try { return await humanTurn(so); } finally { stop(); }
}
async function netLocalClaim(fn, ms){
  S.netOut = false;
  const stop = NET.localClock('claim', ms, () => { S.netOut = true; if (S.ui && S.ui.resolve) S.ui.resolve(null); });
  try { return await fn(); } finally { stop(); S.netOut = false; }
}
async function netClaims(from, d){
  const lvl = callLevel(), jobs = [], tag = (pi, k) => v => v ? Object.assign({ pi, k }, v) : null;
  for (let k = 1; k < 4; k++){
    const pi = (from + k) % 4, o = claimOptions(pi, d.t, from), has = anyOpt(o);
    if (pi === 0 && S.players[0].isHuman){
      if (lvl === 'expert') jobs.push(netLocalClaim(() => expertWindow(from, d), pace().window + NET.callMs()).then(tag(pi, k)));
      else if (has) jobs.push(netLocalClaim(() => humanClaim(o, d, from), NET.callMs()).then(tag(pi, k)));
    } else if (NET.live(pi)){
      if (lvl === 'expert') jobs.push(NET.askExpert(pi, d, from).then(tag(pi, k)));
      else if (has) jobs.push(NET.askClaim(pi, o, d, from).then(tag(pi, k)));
    } else if (has) jobs.push(Promise.resolve(tag(pi, k)(aiClaim(pi, d.t, o))));
  }
  const decisions = (await Promise.all(jobs)).filter(Boolean);
  if (!decisions.length) return null;
  const rank = x => x.type === 'ron' ? 0 : (x.type === 'pung' || x.type === 'kong') ? 1 : 2;
  decisions.sort((a, b) => rank(a) - rank(b) || a.k - b.k);
  const win = decisions[0];
  if (decisions.length > 1) (window.TW_fights = window.TW_fights || []).push(decisions.map(x => NET.seatName(x.pi) + ' ' + x.type).join(', ') + ' -> ' + NET.seatName(win.pi));
  for (const x of decisions.slice(1)){
    const why = rank(win) < rank(x) ? (win.type === 'ron' ? 'winning comes before any call' : `a ${win.type === 'kong' ? 'Kong' : 'Pung'} comes before a Chow`) : 'they are next in turn';
    const text = `${NET.seatName(win.pi)} took it: ${why}.`;
    if (x.pi === 0) say(text, 3600); else NET.fx('note', { text }, x.pi);
  }
  return win;
}

/* ---------------- your decisions ---------------- */
function waitHuman(ui){
  return new Promise((res, rej) => {
    const my = token;
    S.ui = Object.assign({}, ui, { resolve: v => { S.ui = {}; S.callout = null; S.whyOn = null; if (my !== token) rej(ABORT); else res(v); } });
    S.callout = ui.callout || null;
    render();
    if (ui.mode === 'discard') setTimeout(() => { const f = document.querySelector('#hand .tile.drawn') || document.querySelector('#hand .tile:last-child'); if (f && document.activeElement && document.activeElement.closest && document.activeElement.closest('#hand')) f.focus(); }, 0);
  });
}
function humanTurn(so){
  const actions = [];
  if (so.win) actions.push({ label:'Win!', kind:'win', key:'w', value:{ type:'win' } });
  for (const t of so.kongs) actions.push({ label:'Kong', kind:'kong', key:'k', tiles:[t,t,t,t], value:{ type:'kong', t } });
  const ui = { mode:'discard', actions, coach: coachForTurn(so), moment: so.win && callLevel() === 'guided' };
  if (so.win && callLevel() !== 'expert') snd('chance');
  if (S.mode === 'tut') Object.assign(ui, tutTurn(so));
  return waitHuman(ui);
}
/* Call prompts. Guided explains what a call does and costs; Standard is a small, even prompt with nothing suggested;
   Expert shows nothing at all: you tap the discard yourself while it can still be claimed. A prompt only ever offers legal calls. */
const callLevel = () => S && S.mode === 'tut' ? 'guided' : S && S.mode === 'net' ? (S.online ? (settings.calls === 'guided' ? 'guided' : 'standard') : S.netCalls) : (settings.calls || 'guided');
function claimActions(o, d){
  const a = [];
  if (o.ron) a.push({ label:'Win!', kind:'win', key:'w', value:{ type:'ron' } });
  if (o.kong) a.push({ label:'Kong', kind:'kong', key:'k', value:{ type:'kong' } });
  if (o.pung) a.push({ label:'Pung', kind:'pung', key:'p', value:{ type:'pung' } });
  if (o.chows.length) a.push({ label:'Chow', kind:'chow', key:'c', value:{ type:'chow', start:o.chows[0] }, starts:o.chows.slice() });
  a.push({ label:'Pass', kind:'pass', key:' ', value:null });
  return a;
}
/* what taking it does and costs, in plain words, from the hand as it stands. Nothing here changes how a hand scores. */
function callParts(kind, o, d, full){
  const me = S.players[0], costs = [], open = me.melds.every(m => m.concealed);
  if (kind === 'ron') return { take: 'Wins the hand!', costs: [], effect: '' };
  const take = kind === 'pung' ? 'Three of a kind.' : kind === 'kong' ? 'Four, plus a free draw.' : 'Makes a run.';
  if (open) costs.push('no Hidden hand');
  const c = countsOf(me.hand), pairs = c.filter(v => v >= 2).length;
  if (!me.melds.length && pairs >= 5) costs.push('no Seven Pairs');
  const ts = me.hand.concat(me.melds.flatMap(m => m.tiles)).map(x => x.t), su = [0,0,0]; ts.forEach(t => { if (t < 27) su[suitOf(t)]++; });
  const dom = su.indexOf(Math.max(...su)), other = su.reduce((a, v, i) => a + (i === dom ? 0 : v), 0);
  if (d.t < 27 && suitOf(d.t) !== dom && su[dom] >= 8 && other <= 3) costs.push(`breaks your ${SUIT_NAME[dom]}`);
  if ((kind === 'pung' || kind === 'kong') && !me.melds.some(m => m.type !== 'chow') && groupSort(me.hand).sets.filter(g => g.kind === 'chow').length >= 2 && !groupSort(me.hand).sets.some(g => g.kind === 'pung')) costs.push('no All Chows');
  let effect = '';
  if (full && kind !== 'kong'){
    const cur = shanten(c, me.melds.length), need = kind === 'chow' ? null : [d.t, d.t];
    let after = 99;
    if (kind === 'chow') for (const st of o.chows) after = Math.min(after, bestAfterClaim(0, [st, st + 1, st + 2].filter(x => x !== d.t), 1));
    else after = bestAfterClaim(0, need, 1);
    effect = after <= 0 ? 'One away!' : after < cur ? `${after + 1} to go.` : 'No closer.';
  }
  return { take, costs, effect };
}
const costLine = c => c.costs.length ? 'But ' + c.costs.join(', ') + '.' : '';
function callCost(kind, o, d, full){
  const c = callParts(kind, o, d, full), name = { ron: 'Win', pung: 'Pung', kong: 'Kong', chow: 'Chow' }[kind];
  return [name + ': ' + c.take, c.effect, costLine(c)].filter(Boolean).join(' ');
}
function humanClaim(o, d, from){
  let actions = claimActions(o, d);
  const who = S.players[from].name, lvl = callLevel(), rec = aiRecommend(o, d.t);
  const coachRec = lvl === 'guided' && settings.coach === 2;
  if (coachRec) actions.forEach(a => { a.rec = rec ? (a.value && a.value.type === rec.type) : (!o.ron && a.kind === 'pass'); });
  let msg, callout = null;
  if (lvl === 'guided'){
    actions.forEach(a => { if (a.kind !== 'pass') a.why = callCost(a.value.type, o, d, true); else a.why = 'Let it go.'; });
    msg = o.ron ? `${who}'s <em>${tName(d.t)}</em> finishes your hand.` : `${who} threw <em>${tName(d.t)}</em>.` + (coachRec ? (rec ? ' Take it!' : ' Pass.') : '');
  } else {
    actions.forEach(a => { if (a.kind !== 'pass') a.why = costLine(callParts(a.value.type, o, d, false)); });
    msg = `${who} threw <em>${tName(d.t)}</em>.`;
  }
  if (S.mode === 'tut'){
    actions = actions.filter(a => a.kind === 'pung'); actions.forEach(a => a.rec = true);
    msg = `${who} threw <em>${tName(d.t)}</em>.`;
    callout = { at:'actions', text:`You have two Red Dragons. Take this one for a Pung.` };
    if (!actions.length) return Promise.resolve(null);
  }
  if (lvl !== 'expert') snd('chance');
  haptic(6);
  return askClaim({ mode:'claim', level:lvl, actions, coach: msg, rec, moment: lvl === 'guided', callout }, o, d);
}
/* a claim prompt; choosing Chow when there is more than one way asks you to touch the tiles you would use */
async function askClaim(ui, o, d){
  while (true){
    const v = await waitHuman(ui);
    if (!v || v.type !== 'chow' || o.chows.length < 2) return v;
    if (S.netOut) return null;
    const st = await pickChow(o.chows, d);
    if (st != null) return { type:'chow', start:st };
    if (S.netOut) return null;
  }
}
function pickChow(starts, d){
  const me = S.players[0], need = new Set(); starts.forEach(s => [s, s + 1, s + 2].forEach(t => { if (t !== d.t) need.add(t); }));
  return waitHuman({ mode:'chowpick', starts: starts.slice(), picked: [], tile: d.t, need,
    actions: starts.map(st => ({ label: `${st % 9 + 1}-${st % 9 + 2}-${st % 9 + 3}`, kind:'chow', value: st })).concat([{ label:'Back', kind:'pass', key:'escape', value:null }]),
    coach: `Which run? Tap it, or touch the two tiles.` });
}
function chowTap(id){
  const ui = S.ui; if (!ui || ui.mode !== 'chowpick') return false;
  const x = S.players[0].hand.find(h => h.id === id); if (!x) return false;
  if (!ui.need.has(x.t) || ui.picked.includes(x.t)){ V.nudge(id); snd('nope'); return true; }
  const left = ui.starts.filter(s => [s, s + 1, s + 2].includes(x.t) && x.t !== ui.tile && ui.picked.every(t => [s, s + 1, s + 2].includes(t)));
  if (!left.length){ V.nudge(id); snd('nope'); return true; }
  ui.picked.push(x.t); ui.starts = left; snd('pick');
  if (left.length === 1 || ui.picked.length >= 2){ ui.resolve(left[0]); return true; }
  ui.need = new Set(); left.forEach(s => [s, s + 1, s + 2].forEach(t => { if (t !== ui.tile && !ui.picked.includes(t)) ui.need.add(t); }));
  render(); return true;
}
/* Expert: every opponent's discard can be claimed for the same short window, whether or not you could use it,
   so the pause itself gives nothing away. Tap the discard to call; let it pass and the chance is gone. */
function expertWindow(from, d){
  return new Promise((res, rej) => {
    const my = token, o = claimOptions(0, d.t, from), legal = anyOpt(o) && S.mode !== 'tut';
    let done = false, timer = null;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); S.claimWin = null; render(); if (my !== token) rej(ABORT); else res(v); };
    S.claimWin = { id: d.id, until: Date.now() + pace().window, tap: async () => {
      if (done) return;
      if (!legal){ say(`You cannot take the ${tName(d.t)}.`, 1600); return; }
      clearTimeout(timer); S.claimWin = null;
      const actions = claimActions(o, d); actions.forEach(a => { if (a.kind !== 'pass') a.why = costLine(callParts(a.value.type, o, d, false)); });
      try { const v = await askClaim({ mode:'claim', level:'standard', actions, coach:`${S.players[from].name} threw <em>${tName(d.t)}</em>.` }, o, d); finish(v || null); } catch(e){ if (e === ABORT) rej(ABORT); }
    } };
    render();
    timer = setTimeout(() => finish(null), pace().window);
  });
}
function aiRecommend(o, tile){
  if (o.ron) return { type:'ron' };
  const p = S.players[0], cur = shanten(countsOf(p.hand), p.melds.length);
  const valueTile = tile >= 31 || tile === 27 + seatWind(0) || tile === 27 + S.roundWind;
  if (o.pung){ const a = bestAfterClaim(0, [tile,tile], 1); if (a < cur || (valueTile && a <= cur)) return { type:'pung' }; }
  for (const s of o.chows){ const need = [s,s+1,s+2].filter(x => x !== tile); if (bestAfterClaim(0, need, 1) < cur) return { type:'chow', start:s }; }
  return null;
}
function coachForTurn(so){
  if (so.win) return 'You can win!';
  const cands = analyzeDiscards(0, { defend: S.diff >= 1 });
  S.ui_tip = cands[0] ? cands[0].t : null;
  if (settings.coach < 2 || !cands[0]) return 'Your turn';
  if (cands[0].sh === 0) return `Throw ${tileHTML(cands[0].t)} to be one away`;
  return `Try ${tileHTML(cands[0].t)}`;
}
function stepsToWin(){
  const me = S.players[0], c = countsOf(me.hand), mc = me.melds.length;
  if (me.hand.length % 3 === 2){ if (isWin(c, mc)) return -1; let b = 99; for (let t = 0; t < 34; t++){ if (!c[t]) continue; c[t]--; b = Math.min(b, shanten(c, mc)); c[t]++; } return b; }
  return shanten(c, mc);
}
function myWaits(){
  const me = S.players[0]; if (me.hand.length % 3 !== 1) return [];
  const c = countsOf(me.hand); if (shanten(c, me.melds.length) !== 0) return [];
  const u = unseenFor(0); return waitsOf(c, me.melds.length).map(t => ({ t, left:u[t] }));
}
function readyCheck(){
  const ready = myWaits().length > 0;
  if (ready) S.everReady = true;
  if (ready && !S.wasReady){ snd('ready'); lift(); haptic(8); if (!autotest){ questEvent({ kind:'ready' }); save(); } }
  S.wasReady = ready;
}
/* the one clear mistake the middle coach level speaks up about */
function mistake(id){
  const me = S.players[0], x = me.hand.find(h => h.id === id); if (!x) return null;
  const c = analyzeDiscards(0, { defend: S.diff >= 1 }), best = c[0], mine = c.find(k => k.t === x.t);
  if (!best || !mine) return null;
  if (best.sh === 0 && mine.sh > 0) return `Keep that one. It's key.`;
  if (mine.sh > best.sh) return `That one helps a set.`;
  return null;
}
function tryDiscard(id){
  const ui = S && S.ui; if (!ui || ui.mode !== 'discard') return false;
  if (ui.only != null && ui.only !== id){ V.nudge(id); snd('nope'); say('Not that one yet.'); return false; }
  if (settings.coach === 1 && S.mode !== 'tut' && S.mode !== 'lesson' && S.warned !== id){
    const w = mistake(id);
    if (w){ S.warned = id; S.selected = id; V.nudge(id); snd('nope'); say(w + ' Tap again to throw.', 3600); return false; }
  }
  ui.resolve({ type:'discard', id }); return true;
}
function say(text, ms = 3200){
  if (!S || autotest) return;
  const o = S.say = { text, until: Date.now() + ms }; render();
  setTimeout(() => { if (S && S.say === o){ S.say = null; render(); } }, ms + 30);
}
function hint(){
  if (!S || !S.ui) return;
  if (S.ui.mode === 'discard'){
    const c = analyzeDiscards(0, { defend: S.diff >= 1 })[0]; if (!c) return;
    S.hintId = pickDiscardTile(0, c.t); say(`Try ${tileHTML(c.t)}`, 2600);
    setTimeout(() => { if (S && S.hintId){ S.hintId = null; render(); } }, 2600);
  } else if (S.ui.mode === 'claim'){ S.showRec = true; render(); }
}

/* ---------------- the guided first hand ---------------- */
function tutSay(text, at){
  return new Promise((res, rej) => {
    const my = token;
    S.ui = { mode:'read', actions:[], coach:'', resolve: () => { S.ui = {}; S.callout = null; if (my !== token) rej(ABORT); else res(); } };
    S.callout = { text, at, more:true }; render();
  });
}
async function tutIntro(){
  if (S.tutStep) return; S.tutStep = 1;
  await tutSay('Your hand. Win with four sets and a pair.', 'rack');
  await tutSay('Two runs done already: 1-2-3 and 4-5-6.', 'rack');
}
function tutTurn(so){
  const me = S.players[0];
  if (so.win) return { callout:{ at:'actions', text:'That 6 finishes your hand. Win it!' } };
  if (!me.melds.length){ const w = me.hand.find(x => x.t === 29); return { only: w.id, coach:'Your turn.', callout:{ at:'tile', id:w.id, text:'This Wind matches nothing. Drag it up, or tap twice.' } }; }
  const n = me.hand.find(x => x.t === 30);
  return { only: n.id, coach:'Your turn.', callout:{ at:'tile', id:n.id, text:'Nice Pung. Now throw the lonely North Wind.' } };
}

/* ---------------- the end of a hand ---------------- */
const setLabel = (type, t) => {
  const plural = t >= 27 ? tName(t) + 's' : tName(t).replace(/^(\d) (.*)$/, '$1s of $2');
  if (type === 'chow') return `Chow ${numOf(t)}-${numOf(t) + 1}-${numOf(t) + 2} ${SUIT_NAME[suitOf(t)]}`;
  if (type === 'pair') return 'Pair of ' + plural;
  return (type === 'kong' ? 'Kong of ' : 'Pung of ') + plural;
};
/* split the winner's tiles into the sets the scorer chose, and hang each set's fan on it */
function revealGroups(pi, res){
  const p = S.players[pi], items = res.items.map(i => ({ name:i.name, fan:i.fan })), groups = [];
  const takeFan = re => { let f = 0; for (const it of items){ if (it.fan > 0 && re.test(it.name)){ if (/Kong/.test(it.name) && !/replacement/.test(it.name)){ it.fan--; f++; } else { f += it.fan; it.fan = 0; } break; } } return f; };
  const setFan = (type, t) => {
    let f = 0; if (type === 'chow' || type === 'pair') return 0;
    if (t >= 31) f += takeFan(new RegExp('^' + ['Red','Green','White'][t - 31] + ' Dragon pung'));
    if (t === 27 + seatWind(pi)) f += takeFan(/^Seat wind pung/);
    if (t === 27 + S.roundWind) f += takeFan(/^Round wind pung/);
    if (type === 'kong') f += takeFan(/^(\d+ )?Kongs?$/);
    return f;
  };
  const pool = sortTiles(p.hand.slice()), pull = t => pool.splice(pool.findIndex(x => x.t === t), 1)[0];
  if (res.seven){ while (pool.length){ const a = pool.shift(), b = pull(a.t); groups.push({ ids:[a.id, b.id], label:setLabel('pair', a.t), fan:0, hidden:true }); } }
  else if (res.decomp){
    for (const s of res.decomp.sets){ const ts = s.type === 'chow' ? [s.t, s.t + 1, s.t + 2] : [s.t, s.t, s.t]; groups.push({ ids: ts.map(t => pull(t).id), label:setLabel(s.type, s.t), fan:setFan(s.type, s.t), hidden:true }); }
    if (pool.length){ const t = pool[0].t; groups.push({ ids: pool.splice(0).map(x => x.id), label:setLabel('pair', t), fan:0, hidden:true }); }
  }
  for (const m of p.melds){ const t = Math.min(...m.tiles.map(x => x.t)); groups.push({ ids:m.tiles.map(x => x.id), label:setLabel(m.type, t) + (m.concealed ? ', concealed' : ''), fan:setFan(m.type, t), hidden:false }); }
  return { groups, rest: items.filter(i => i.fan > 0) };
}

async function endWin(pi, selfDrawn, ctx){
  const p = S.players[pi];
  const res = scoreHand(pi, selfDrawn, ctx);
  const val = handValue(res.fan);
  const pay = [0,0,0,0];
  if (selfDrawn){ for (let q = 0; q < 4; q++) if (q !== pi){ pay[q] -= val; pay[pi] += val; } }
  else { pay[ctx.from] -= val * 2; pay[pi] += val * 2; }
  S.players.forEach((pl, q) => pl.score += pay[q]);
  S.turn = -1;
  const names = res.items.map(i => i.name), news = [];
  let gain = 10;
  if (autotest) (window.TW_log = window.TW_log || []).push({ w:pi, fan:res.fan, items:names, self:selfDrawn });
  else if (S.mode === 'net'){ /* a table with friends keeps no records */ }
  else if (pi === 0){
    profile.wins++; profile.winRun++; profile.bestFan = Math.max(profile.bestFan, res.fan);
    gain += 30 + res.fan * 10;
    const had = Object.assign({}, profile.stamps);
    news.push(...stampWin(names), ...questEvent({ kind:'win', self:selfDrawn, concealed:res.concealed, fan:res.fan, names }));
    S.rare = COLLECTION.filter(c => c.fan >= 3 && profile.stamps[c.id] && !had[c.id]);
  } else if (S.mode !== 'net') profile.winRun = 0;
  return finishHand({ pi, selfDrawn, ctx, res, val, pay, news, gain });
}
function endDraw(){
  S.turn = -1;
  if (autotest) (window.TW_log = window.TW_log || []).push({ draw:true });
  return finishHand({ pi:-1, news:[], gain:10, pay:[0,0,0,0] });
}
async function finishHand(w){
  const last = S.handNo + 1 >= S.totalHands, news = w.news, me = S.players[0];
  let place = 0, order = null, dailyLine = '';
  setTension(0);
  if (!autotest && S.mode !== 'net'){
    profile.hands++; todaysQuests(); profile.quests.hands++;
    news.push(...questEvent({ kind:'hand', count: profile.quests.hands, paid: Math.max(0, -w.pay[0]) }));
    if (S.mode === 'tut'){ profile.tut = true; if (!profile.intro) profile.intro = 1; }
    else if (S.mode === 'play' && profile.intro >= 1 && profile.intro <= 3 && S.introShown) profile.intro++;
    if (S.mode === 'weekly') news.push(...weeklyResult(w));
    if (S.mode !== 'tut') news.push(...sitting());
    { const dl = dayPlayed(); if (dl) news.push(dl); }
    if (S.mode === 'daily'){
      const k = dayKey(), got = w.pay[0], had = profile.daily[k];
      if (profile.dailyLast !== k){ profile.dailyLast = k; profile.dailyDays++; }
      if (had === undefined || got > had) profile.daily[k] = got;
      dailyLine = `Today ${got > 0 ? '+' : ''}${got}. Your best today ${profile.daily[k] > 0 ? '+' : ''}${profile.daily[k]}. Days played: ${profile.dailyDays}.`;
      news.push(...questEvent({ kind:'daily' }));
    }
    if (last){
      order = S.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score);
      place = order.findIndex(o => o.i === 0) + 1;
      if (S.mode === 'play' && S.totalHands > 1){
        profile.games++; w.gain += place === 1 ? 60 : place === 2 ? 30 : 10;
        const before = THEMES.filter(themeOpen).length; profile.themePts++;
        news.push(...questEvent({ kind:'match', place }));
        profile.places = (profile.places || []).concat(place).slice(-50);
        const open = THEMES.filter(themeOpen); if (open.length > before && !news.some(n => /^New table/.test(n))) news.push('New table: ' + open[open.length - 1].name + '. Find it in the Collection.');
      }
      if (S.mode === 'play') clearResume();
    } else saveBetween();
    const r0 = rankInfo().i; profile.xp += w.gain; S.matchXp += w.gain;
    if (rankInfo().i > r0) news.push('New rank: ' + rankInfo().name + '.');
    save();
  }
  if (autotest) return 'next';
  // what the table shows
  const win = w.pi >= 0, mine = w.pi === 0, big = win && w.res.fan >= 3;
  let parts = { groups:[], rest:[] };
  if (win){ parts = revealGroups(w.pi, w.res); S.reveal = w.pi; S.groups = parts.groups; S.revealN = 0; S.revealFast = false; }
  if (S.mode !== 'tut' && S.mode !== 'net'){ recordHand(w, parts); save(); }
  if (S.mode === 'net' && last){ order = S.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score); place = order.findIndex(o => o.i === 0) + 1; }
  render();
  if (win){ fpsStart('win'); setTimeout(() => fpsStop('win'), 5200); V.pushTo(w.pi, big ? 1 : .55); snd(mine ? (big ? 'bigwin' : 'win') : 'lose'); haptic(mine ? [20, 60, 20, 60, 40] : 12); callStroke(w.pi, 'win', big ? 1500 : 1000); }
  await sleep(win ? 520 : 400);
  if (mine && S.rare && S.rare.length){ const rr = S.rare; S.rare = null; for (const c of rr) await rareReveal(c); }
  const x = { last, big, place, order, dailyLine };
  if (S.mode === 'net'){
    NET.result(w, parts, x);
    resultSlip(w, parts, Object.assign(x, { net: true })).catch(() => {});
    await NET.waitNext();
    closeOverlay();
    return 'next';
  }
  return resultSlip(w, parts, x);
}

/* the names the scorer uses stay as they are; this is only what the player reads */
const ITEM_TEXT = [
  [/^Mahjong$/, () => 'Winning hand', 'Any win'],
  [/^Self-drawn$/, () => 'Own draw', 'Drew it yourself'],
  [/^Concealed hand$/, () => 'Hidden hand', 'Nothing grabbed'],
  [/^Seven Pairs$/, () => 'Seven Pairs', 'Seven different pairs'],
  [/^All Chows$/, () => 'All Chows', 'Runs only'],
  [/^All Pungs$/, () => 'All Pungs', 'Three-of-a-kinds only'],
  [/Dragon pung$/, n => 'Pung of ' + n.split(' ')[0] + ' Dragons', 'Dragons always score'],
  [/^Seat wind pung/, n => 'Pung of ' + n.match(/\((\w+)\)/)[1] + ' Wind', 'Your seat wind'],
  [/^Round wind pung/, n => 'Pung of ' + n.match(/\((\w+)\)/)[1] + ' Wind', 'The round wind'],
  [/Kongs?$/, n => n, '1 faan each'],
  [/^Own (flower|season): /, n => n, 'Matches the seat'],
  [/^All Honors$/, () => 'Only Winds and Dragons', 'No suits at all'],
  [/^Full Flush$/, () => 'Full Flush', 'One suit only'],
  [/^Half Flush$/, () => 'Half Flush', 'One suit plus honors'],
  [/^Last tile of the wall$/, () => 'Last tile', 'Very last tile'],
  [/^Win on a Kong replacement$/, () => 'Kong replacement', 'Extra tile after a Kong']
];
const itemText = name => { const e = ITEM_TEXT.find(e => e[0].test(name)); return e ? { label: e[1](name), why: e[2] } : { label: name, why: '' }; };
const setWhyText = label => /Dragons/.test(label) ? 'Dragons always score' : /Wind/.test(label) ? 'Seat or round wind' : /^Kong/.test(label) ? '1 faan each' : '';
function typeById(id){
  for (const p of S.players) for (const x of p.hand.concat(p.melds.flatMap(m => m.tiles), p.flowers)) if (x.id === id && x.t >= 0) return x.t;
  return null;
}
function resultSlip(w, parts, x){
  const win = w.pi >= 0, mine = w.pi === 0, name = win ? S.players[w.pi].name : '', net = !!x.net;
  const winT = () => { const h = win && w.ctx && w.ctx.winId != null ? typeById(w.ctx.winId) : null; return h == null ? 'tile' : tName(h); };
  let title, lead, fed = '';
  if (!win){ title = 'No winner'; lead = 'The wall ran out. Nobody pays.'; }
  else if (mine){ title = 'You win'; lead = w.selfDrawn ? `Own draw. Everyone pays ${w.val}.` : `${S.players[w.ctx.from].name} threw it and pays ${w.val * 2}.`; }
  else {
    title = name + ' wins';
    lead = w.selfDrawn ? `Own draw. Everyone pays ${w.val}.` : w.ctx.from === 0 ? `Your ${winT()} won it. You pay ${w.val * 2}.` : `${S.players[w.ctx.from].name} threw it and pays ${w.val * 2}.`;
    const fedTs = x.fedTs || S.fed.filter(f => f.by === w.pi).map(f => f.t);
    if (!x.fedTs && !w.selfDrawn && w.ctx.from === 0){ const t = typeById(w.ctx.winId); if (t != null) fedTs.push(t); }
    fed = `<div class="fed"><span>${fedTs.length ? 'Your tiles:' : 'None of your tiles.'}</span>${fedTs.map(t => tileHTML(t)).join('')}</div>`;
  }
  // the hand itself, set by set, then each thing that scored, each with its reason in plain words
  const tilesOf = ids => ids.map(id => typeById(id)).filter(t => t != null).map(t => tileHTML(t)).join('');
  const handRow = win ? `<div class="ln hand wait"><div class="htiles">${parts.groups.map(g => `<span class="hg">${tilesOf(g.ids)}</span>`).join('')}</div><small>${parts.groups.length === 7 ? 'Seven pairs' : '4 sets + pair'}</small></div>` : '';
  const line = (label, fan, why, tiles) => `<div class="ln wait"><div class="lt"><span>${label}</span>${tiles ? `<span class="lts">${tiles}</span>` : ''}${why ? `<small>${why}</small>` : ''}</div><b>${fan} faan</b></div>`;
  const scoring = win ? parts.groups.filter(g => g.fan).map(g => ({ fan: g.fan, html: line(g.label.replace(/, concealed$/, ''), g.fan, setWhyText(g.label), tilesOf(g.ids)) }))
    .concat(parts.rest.map(i => { const it = itemText(i.name); return { fan: i.fan, html: line(it.label, i.fan, it.why) }; })) : [];
  const dbl = win ? Math.min(w.res.fan, 8) - 1 : 0;
  const tot = win ? `<div class="ln tot wait"><div class="lt"><span>Total: <i id="rFan">0</i> faan</span><small>${dbl ? `10 doubled ${dbl === 1 ? 'once' : dbl + ' times'}` : '1 faan = 10 points'}</small></div><b><i id="rPts">0</i> points</b></div>` : '';
  const pays = `<div class="pays">${S.players.map((pl, q) => `<div class="${w.pay[q] > 0 ? 'up' : w.pay[q] < 0 ? 'down' : ''}"><span><i style="background:${SEAT[q].lac}"></i>${pl.name}</span><b>${w.pay[q] > 0 ? '+' : ''}${w.pay[q] || '0'}</b><small>${pl.score}</small></div>`).join('')}</div>`;
  const ri = rankInfo();
  const rank = net ? '' : `<div class="rank"><span class="rseal">${ri.seal}</span><div><div class="rname">${ri.name}<small>${ri.next ? `${ri.into} of ${ri.need} to ${ri.next}` : 'Top rank'}</small></div><div class="bar"><i style="width:${Math.round(ri.frac * 100)}%"></i></div></div><span class="rgain">+${w.gain}</span></div>`;
  let stand = '';
  if (x.last && S.totalHands > 1) stand = `<div class="stand"><div class="sth">${['', '1st place', '2nd place', '3rd place', '4th place'][x.place]}</div>${x.order.map((o, k) => { const i = o.i, sc = o.score != null ? o.score : o.p.score; return `<div class="${i === 0 ? 'me' : ''}"><span>${k + 1}</span><span><i style="background:${SEAT[i].lac}"></i>${S.players[i].name}</span><b>${sc}</b></div>`; }).join('')}</div>`;
  const allNews = (x.dailyLine ? [x.dailyLine] : []).concat(w.news), stampN = allNews.filter(n => /^New stamp in your Collection/.test(n)).length;
  // v10: several stamps at once read as one line, and the list never runs past three lines
  const newsL = stampN > 1 ? [`${stampN} new stamps in your Collection.`].concat(allNews.filter(n => !/^New stamp in your Collection/.test(n))) : allNews;
  const news = newsL.slice(0, 3).map(n => `<div>${n}</div>`).join('') + (newsL.length > 3 ? `<div class="more">and ${newsL.length - 3} more in your Collection</div>` : '');
  let btns;
  const onl = net && NET.online;
  if (onl && x.last) btns = `<button class="tbtn" data-r="home">Home</button><button class="tbtn prime big" data-r="online">Play again</button>`;
  else if (net) btns = `<span class="nwait" id="nWait"></span><button class="tbtn prime big" data-r="next">${x.last ? 'Back to the table' : 'Next hand'}</button>`;
  else if ((S.mode === 'tut' || S.mode === 'play') && !profile.kind) btns = `<div class="kinds"><div class="kq">Your style?</div>${KINDS.map((k, i) => `<button class="tbtn kind ${i === 0 ? 'prime' : ''}" data-kind="${k.id}"><b>${k.name}</b><small>${k.line}</small></button>`).join('')}</div>`;
  else if (S.mode === 'tut') btns = `<button class="tbtn prime big" data-r="again">Play for real</button>`;
  else if (!x.last) btns = `<button class="tbtn prime big" data-r="next">Next hand</button>`;
  else btns = `<button class="tbtn" data-r="home">Home</button><button class="tbtn prime big" data-r="again">${S.mode === 'daily' || S.mode === 'weekly' ? 'Again' : S.totalHands > 1 ? 'New game' : 'Another hand'}</button>`;
  if (S.mode === 'daily') btns = `<button class="tbtn" data-share>Share card</button>` + btns;
  const tutLine = S.mode === 'tut' && mine ? '<div class="news"><div>Real rules, real score.</div></div>' : '';
  const near = x.near != null ? x.near : nearMiss(w);
  const html = `<div class="slipwrap"><div class="slip paper ${mine ? 'mine' : ''}" role="dialog" aria-label="${title}">
    <div class="shead"><span class="seal" style="background:${win ? SEAT[w.pi].lac : '#5c4c37'}">${win ? '和' : '日'}</span><div><h2>${title}</h2><p class="lead">${lead}</p></div>${mine ? `<b class="bigpay" id="rPay">+0</b>` : ''}</div>
    <div class="sbody">${near}${win ? `<div class="lines">${handRow}${scoring.map(l => l.html).join('')}${tot}</div>` : ''}
    ${pays}${fed}${stand}${news ? `<div class="news">${news}</div>` : ''}${tutLine}</div>
    <div class="sfoot">${onl && x.last ? '<div class="nrated" id="nRated" hidden></div>' : ''}${rank}<div class="sbtns">${btns}</div></div></div></div>`;
  return new Promise((res, rej) => {
    const my = token, root = setOverlay(html);
    const slip = root.querySelector('.slip');
    if (onl && x.last && S.rated){ const el = slip.querySelector('#nRated'); if (el) paintRated(el, S.rated); }
    let alive = true, done = !win;
    const finish = () => {
      if (done) return; done = true;
      slip.querySelectorAll('.wait').forEach(e => e.classList.remove('wait'));
      if (win){ slip.querySelector('#rFan').textContent = w.res.fan; slip.querySelector('#rPts').textContent = w.val; const bp = slip.querySelector('#rPay'); if (bp){ bp.textContent = '+' + w.pay[0]; bp.classList.add('land'); } S.revealN = parts.groups.length; S.revealFast = true; render(); }
    };
    const go = v => { alive = false; leave(root, 200); if (my !== token) rej(ABORT); else res(v); };
    slip.addEventListener('click', e => {
      const kb = e.target.closest('[data-kind]'); if (kb){ setKind(kb.dataset.kind); go(S.mode === 'play' && !x.last ? 'next' : 'again'); return; }
      if (e.target.closest('[data-share]')){ shareCard(w); return; }
      const b = e.target.closest('[data-r]');
      if (b && onl && x.last){ finish(); go(b.dataset.r); if (b.dataset.r === 'online'){ goHome(); setTimeout(openOnline, 260); } else goHome(); return; }
      if (b && net){ finish(); b.disabled = true; b.textContent = x.last ? 'Going back to the table' : 'Ready for the next hand'; NET.iAmNext(); return; }
      if (b){ finish(); go(b.dataset.r); return; }
      finish(); // a tap anywhere else on the slip shows the whole count at once
    });
    S.slipSkip = finish;
    const prime = slip.querySelector('.prime'); if (prime) prime.focus({ preventScroll:true });
    if (!win) return;
    // counted out line by line: the hand lays down set by set, then each thing that scored, then the total
    (async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms * (pace().f < 1 ? .6 : 1) * (reducedUI() ? .5 : 1)));
      const ok = () => alive && my === token && !done;
      const hr = slip.querySelector('.ln.hand');
      if (hr){ hr.classList.remove('wait'); const gs = [...hr.querySelectorAll(".hg")]; gs.forEach(g => g.classList.add('wait'));
        for (let k = 0; k < gs.length && ok(); k++){ gs[k].classList.remove('wait'); S.revealN = k + 1; render(); await wait(x.big ? 300 : 210); } }
      const els = [...slip.querySelectorAll('.lines .ln:not(.hand):not(.tot)')];
      let fan = 0; const fanEl = slip.querySelector('#rFan'), totEl = slip.querySelector('.ln.tot');
      if (totEl && ok()){ totEl.classList.remove('wait'); }
      for (let i = 0; i < els.length && ok(); i++){
        els[i].classList.remove('wait'); snd(i === els.length - 1 ? 'place' : 'tick');
        fan += scoring[i].fan; fanEl.textContent = fan;
        await wait(x.big ? 380 : 260);
      }
      if (!ok()) return;
      const pts = slip.querySelector('#rPts');
      const bp = slip.querySelector('#rPay');
      if (bp) bp.classList.add('counting');
      for (let k = 1; k <= 12 && ok(); k++){ pts.textContent = Math.round(w.val * k / 12 / 10) * 10; if (bp) bp.textContent = '+' + Math.round(w.pay[0] * k / 12 / 10) * 10; if (bp && k % 3 === 0) snd('tick'); await wait(36); }
      if (bp && ok()){ bp.classList.add('land'); snd('place'); }
      if (ok()){ finish(); if (mine && x.big) paintWin(1700); }
    })();
  });
}

/* ---------------- your rack: the order you keep your tiles in ----------------
   Auto sort On keeps the rack sorted; Off keeps exactly the order you set for the whole hand, and a tile you have
   not placed yet waits apart on the right. The order is saved with the match, so it survives calls and a reload. */
function sortedIds(tiles){ return settings.sortStyle === 'sets' ? groupSort(tiles).ids : sortTiles(tiles.slice()).map(x => x.id); }
const manualRack = () => !!S && (S.manual || settings.autoSort === 'off');
function handOrder(){
  const me = S.players[0], drawn = me.hand.find(x => x.id === me.drawnId);
  if (!manualRack() || !S.order){
    const o = sortedIds(me.hand.filter(x => x.id !== me.drawnId)); if (drawn) o.push(drawn.id);
    return { ids: o, loose: drawn ? 1 : 0 };
  }
  const have = new Set(me.hand.map(x => x.id)), placed = S.order.filter(id => have.has(id)), ps = new Set(placed);
  const loose = me.hand.filter(x => !ps.has(x.id)).sort((a, b) => (a.id === me.drawnId) - (b.id === me.drawnId)).map(x => x.id);
  return { ids: placed.concat(loose), loose: loose.length };
}
function onReorder(id, ins){
  if (!S) return;
  const o = handOrder(), n = o.ids.length, placed = o.ids.slice(0, n - o.loose).filter(x => x !== id);
  placed.splice(Math.min(ins, placed.length), 0, id);
  if (!S.manual && settings.autoSort !== 'off'){ settings.autoSort = 'off'; save(); say('Auto sort off. Your order stays.', 3200); }
  S.order = placed; snd('place'); saveResumeNow(); render();
  if (typeof lessonEvent === 'function') lessonEvent('reorder');
}
function moveInRack(id, dir){
  const o = handOrder(), i = o.ids.indexOf(id); if (i < 0) return;
  const placedN = o.ids.length - o.loose, j = Math.max(0, Math.min(placedN - (i < placedN ? 1 : 0), (i < placedN ? i : placedN) + dir));
  onReorder(id, j);
}
function sortOnce(){ if (!S) return; S.order = sortedIds(S.players[0].hand); snd('place'); saveResumeNow(); render(); if (typeof lessonEvent === 'function') lessonEvent('reorder'); }
function setAutoSort(v){ if (S && v === 'off' && settings.autoSort !== 'off') S.order = handOrder().ids.filter(id => id !== S.players[0].drawnId); settings.autoSort = v; save(); if (S) render(); }
function saveResumeNow(){ if (!S || S.mode !== 'play' || autotest) return; const r = load(RKEY); if (!r || r.next) return; r.order = S.order; try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch(e){} } // only the order changes: the saved turn stays exactly as it was
/* the tile type you are holding up: every visible copy of it on the table gets a cool rim */
function deadType(){
  if (!S || S.turn === -1) return null;
  if (S.holdT != null) return S.holdT;
  const id = S.selected; if (id == null) return null;
  const x = S.players[0].hand.find(h => h.id === id); return x ? x.t : null;
}
function onTable(t){ let n = 0; for (const p of S.players){ n += p.discards.filter(d => d.t === t).length; for (const m of p.melds) n += m.tiles.filter((x, i) => x.t === t && !(m.concealed && m.type === 'kong' && (i === 0 || i === 3))).length; } return n; }
function noteNew(){ /* a fresh tile waits apart on the right until you place it (manual rack) */ }
/* grouped by likely sets: finished sets first, then pairs, then two-tile starts, then loose tiles */
function groupSort(tiles){
  const c = countsOf(tiles), memo = new Map();
  const best = cc => {
    let t = 0; while (t < 34 && !cc[t]) t++;
    if (t >= 34) return { sc: 0, g: [] };
    const key = cc.join(''); if (memo.has(key)) return memo.get(key);
    let b = null;
    const tryIt = (ts, kind, pts) => { for (const x of ts) cc[x]--; const r = best(cc); for (const x of ts) cc[x]++; const sc = r.sc + pts; if (!b || sc > b.sc) b = { sc, g: [{ kind, ts }].concat(r.g) }; };
    const suit = t < 27, n = t % 9;
    if (cc[t] >= 3) tryIt([t, t, t], 'pung', 3);
    if (suit && n <= 6 && cc[t + 1] && cc[t + 2]) tryIt([t, t + 1, t + 2], 'chow', 3);
    if (cc[t] >= 2) tryIt([t, t], 'pair', 2.1);
    if (suit && n <= 7 && cc[t + 1]) tryIt([t, t + 1], 'two', 1);
    if (suit && n <= 6 && cc[t + 2]) tryIt([t, t + 2], 'two', .9);
    tryIt([t], 'one', 0);
    memo.set(key, b); return b;
  };
  const r = best(c.slice()), rank = { pung: 0, chow: 0, pair: 1, two: 2, one: 3 };
  const groups = r.g.slice().sort((a, b) => rank[a.kind] - rank[b.kind] || a.ts[0] - b.ts[0]);
  const pool = new Map(); for (const x of sortTiles(tiles.slice())){ if (!pool.has(x.t)) pool.set(x.t, []); pool.get(x.t).push(x.id); }
  return { ids: groups.flatMap(g => g.ts.map(t => pool.get(t).shift())), sets: groups };
}
