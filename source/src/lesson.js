/* =========================================================
   LEARN THE TILES. A hands-on lesson of about two minutes, done on the real table: every idea is one screen,
   and every screen is finished by touching tiles, not by reading. Skippable, and it can be replayed from Settings.
   The guided first hand (a real hand with an easy deal) follows it. Nothing here touches the rules.
   ========================================================= */
let LS = null;
const LSTEPS = 8;
const lid = (t, k = 0) => t * 4 + k;                    // tile ids: four copies of every type
const lessonAllows = what => !S || S.mode !== 'lesson' || !LS ? true : !!(LS.def.allow && LS.def.allow[what]);
function lessonRow(types, z, s = 1.3, gapAfter = []){
  const step = 1.02 * s * 1.06, gaps = gapAfter.length * .5 * s, w = (types.length - 1) * step + gaps, out = [];
  let x = -w / 2, used = {};
  types.forEach((t, i) => { const k = used[t] = (used[t] || 0); used[t]++; out.push({ id: t < 34 ? lid(t, k) : t, t, x, z, s }); x += step + (gapAfter.includes(i) ? .5 * s : 0); });
  return out;
}
/* the lesson card: a new step fades in over the old one; within a step only the task line changes, with a fade */
function lessonCard(){
  const el = $('#lesson'); if (!LS){ fadeHide(el, 180); el._n = null; return; }
  const d = LS.def;
  fadeShow(el);
  if (el._n !== d.n){
    el._n = d.n;
    [...el.children].forEach(c => leave(c, 170));
    el.insertAdjacentHTML('beforeend', `<div class="lbody"><div class="le">Learn the tiles: step ${d.n} of ${LSTEPS}</div><h2>${d.title}</h2><p>${d.text}</p>${d.key ? d.key : ''}<p class="lt" aria-live="polite"></p>
      <div class="lb"><button class="tbtn" data-lskip>Skip the lesson</button><button class="tbtn prime" data-lnext>${d.n === LSTEPS ? 'Play a hand' : 'Next'}</button></div></div>`);
    const b = el.lastElementChild;
    b.querySelector('[data-lskip]').onclick = () => endLesson(true);
    b.querySelector('[data-lnext]').onclick = () => { if (LS && (LS.done || LS.def.free)){ snd('pick'); const r = LS.res; r(); } };
  }
  const b = el.querySelector('.lbody:not(.leaving)'), lt = b.querySelector('.lt');
  lt.classList.toggle('ok', !!LS.done); swapFade(lt, LS.status || d.task || '');
  b.querySelector('[data-lnext]').disabled = !(LS.done || d.free);
}
function lessonStatus(text, done){ if (!LS) return; LS.status = text; if (done){ LS.done = true; snd('place'); } lessonCard(); }
function lessonStep(def){
  return new Promise((res, rej) => {
    const my = token;
    LS = { def, done: false, status: '', res: () => { if (my !== token) rej(ABORT); else res(); }, my };
    S.lay = []; S.selected = null; S.lastDiscard = null; S.newest = null; S.ui = {};
    def.enter && def.enter();
    lessonCard(); render();
  });
}
function lessonTap(hit){
  if (!LS || hit.kind !== 'tile') return !!LS;
  const L = (S.lay || []).find(x => x.id === hit.id), t = L ? L.t : null;
  if (LS.def.tap && t != null) LS.def.tap(L);
  else if (t != null) lessonStatus(lessonName(t) + '.');
  return true;
}
function lessonRackTap(id){
  if (!LS) return false;
  if (LS.def.rackTap){ LS.def.rackTap(id); return true; }
  return false;
}
function lessonEvent(name){ if (LS && LS.def.event) LS.def.event(name); }
const lessonName = t => t < 27 ? `That is the ${numOf(t)} of ${SUIT_NAME[suitOf(t)]}` : `That is the ${tName(t)}`;
function raise(L, on = true){ L.lift = on ? .45 : 0; render(); }
const typeOfId = id => id < 136 ? Math.floor(id / 4) : 34 + (id - 136);
const KEY_HAN = `<div class="key">${HAN_NUM.map((h, i) => `<span>${h}<small>${i + 1}</small></span>`).join('')}</div>`;

function startLesson(first){
  newMatch({ mode: 'lesson' });
  Object.assign(S, { slot: new Map(), wall: [], lay: [], manual: true, order: [], turn: 0, lessonFirst: !!first });
  closeOverlay();
  showScreen('game'); V.setHelpers(settings.helpers); V.resize(); document.body.classList.add('inlesson');
  runLesson();
}
function endLesson(skipped){
  const first = S && S.lessonFirst;
  LS = null; lessonCard(); V.setHelpers(settings.helpers); document.body.classList.remove('inlesson');
  profile.lessonDone = true;
  if (skipped){ if (first){ profile.tut = true; save(); startGame('play'); } else { save(); goHome(); } return; }
  save(); startGame('tut');
}
async function runLesson(){
  const me = S.players[0];
  try {
    /* a. three suits, each just the numbers 1 to 9 */
    await lessonStep({ n: 1, title: 'Dots: count the circles', text: 'Most tiles belong to one of three suits, like the suits in a deck of cards. Each suit runs from 1 to 9. On Dots, the number is how many circles you see.',
      task: 'Tap the 5 of Dots.',
      enter(){ S.lay = lessonRow([9,10,11,12,13,14,15,16,17], 0); },
      tap(L){ if (L.t === 13){ raise(L); lessonStatus('Yes. Five circles is the 5 of Dots.', true); } else lessonStatus(`${lessonName(L.t)}: ${numOf(L.t)} ${numOf(L.t) === 1 ? 'circle' : 'circles'}. Find five.`); } });
    await lessonStep({ n: 2, title: 'Bamboo: count the sticks', text: 'On Bamboo, the number is how many sticks you see. The 1 is different: it shows a bird.',
      task: 'Tap the 1 of Bamboo. It is the bird.',
      enter(){ S.lay = lessonRow([18,19,20,21,22,23,24,25,26], 0); this.want = 18; },
      tap(L){
        if (L.t === this.want){ raise(L); if (this.want === 18){ this.want = 24; lessonStatus('Yes, the bird is the 1. Now tap the 7 of Bamboo.'); } else lessonStatus('Yes. Seven sticks is the 7 of Bamboo.', true); }
        else lessonStatus(`${lessonName(L.t)}.` + (this.want === 18 ? ' Look for the bird.' : ' Count seven sticks.'));
      } });
    await lessonStep({ n: 3, title: 'Characters: read the top sign', text: 'On Characters, the top sign is a Chinese number. The red sign under it is the same on every tile in this suit. Here are 1 to 9:',
      key: KEY_HAN, task: 'Tap the 4 of Characters.',
      enter(){ S.lay = lessonRow([0,1,2,3,4,5,6,7,8], 0); this.want = 3; },
      tap(L){
        if (L.t === this.want){ raise(L); if (this.want === 3){ this.want = 7; lessonStatus('四 means 4. Now tap the 8.'); } else lessonStatus('八 means 8. You can read Characters now.', true); }
        else lessonStatus(`${lessonName(L.t)}: the top sign is ${HAN_NUM[numOf(L.t) - 1]}.`);
      } });
    await lessonStep({ n: 4, title: 'Three suits, side by side', text: 'Dots on top, Bamboo in the middle, Characters at the bottom. Each column is one number.',
      task: 'Tap all three 6s.',
      enter(){ S.lay = lessonRow([9,10,11,12,13,14,15,16,17], 0, 1.2).concat(lessonRow([18,19,20,21,22,23,24,25,26], 2.1, 1.2), lessonRow([0,1,2,3,4,5,6,7,8], 4.2, 1.2)); this.got = new Set(); },
      tap(L){
        if (numOf(L.t) === 6 && L.t < 27){ if (!this.got.has(L.t)){ this.got.add(L.t); raise(L); } lessonStatus(this.got.size === 3 ? 'Three 6s, one in each suit.' : `${this.got.size} of 3 found.`, this.got.size === 3); }
        else lessonStatus(`${lessonName(L.t)}. Find the 6s.`);
      } });
    /* b. prove it: put one shuffled suit in order */
    const ord = [0,1,2,3,4,5,6,7,8], shuf = [5,2,8,0,6,3,1,7,4];
    await lessonStep({ n: 5, title: 'Put Characters in order', text: 'These tiles are on your rack, at the bottom. Put them in order from 1 on the left to 9 on the right. Drag a tile along the rack, or tap two tiles to swap them.',
      key: KEY_HAN, task: 'Put 1 on the left and 9 on the right.', allow: { arrange: true },
      enter(){ V.setHelpers(false); me.hand = shuf.map(t => ({ id: lid(t, 1), t })); S.order = me.hand.map(x => x.id); this.check(); },
      check(){ const ok = S.order.map(typeOfId).every((t, i) => t === ord[i]); if (ok && !LS.done){ V.setHelpers(settings.helpers); lessonStatus('That is 1 to 9 in order.', true); } return ok; },
      event(){ this.check(); },
      rackTap(id){
        if (LS.done) return;
        if (S.selected == null || S.selected === id){ S.selected = S.selected === id ? null : id; snd('pick'); render(); return; }
        const a = S.order.indexOf(S.selected), b = S.order.indexOf(id); [S.order[a], S.order[b]] = [S.order[b], S.order[a]]; S.selected = null; snd('place'); render(); this.check();
      } });
    me.hand = []; S.order = []; V.setHelpers(settings.helpers);
    /* c. winds and dragons */
    const honors = [27,28,29,30,31,32,33];
    await lessonStep({ n: 6, title: 'Winds and Dragons', text: 'These seven tiles have no number, so they can never be part of a run. Each one only matches itself: East with East, Red Dragon with Red Dragon.',
      task: 'Tap the tile in the row that matches the one held up.',
      enter(){ this.targets = [28, 32]; this.k = 0; this.lay(); },
      lay(){ const tg = this.targets[this.k]; S.lay = lessonRow(honors, 2.6).concat([{ id: lid(tg, 3), t: tg, x: 0, z: -.4, s: 1.3, lift: .5, held: true }]); render(); },
      tap(L){
        if (L.held){ lessonStatus(`This is the ${tName(L.t)}. Find the same tile in the row.`); return; }
        const tg = this.targets[this.k];
        if (L.t === tg){
          raise(L);
          if (++this.k < this.targets.length){ lessonStatus(`Yes, the ${tName(tg)}. One more.`); setTimeout(() => { if (LS && LS.def.n === 6) this.lay(); }, 700); }
          else lessonStatus(`Yes, the ${tName(tg)}. Winds and Dragons only match themselves.`, true);
        } else lessonStatus(`${lessonName(L.t)}. It only matches another ${tName(L.t)}.`);
      } });
    /* d. the goal */
    await lessonStep({ n: 7, title: 'How to win: four sets and a pair', text: 'A set is three tiles. A Chow is three in a row in one suit, like 4-5-6. A Pung is three of the same tile. Four sets and one pair (two of the same tile) make 14 tiles, and that wins.',
      task: 'One tile is missing. Tap the tile that finishes this hand.',
      enter(){
        const top = lessonRow([10,11,12, 22,23,null, 31,31,31], -.2, 1.15, [2, 5]), bot = lessonRow([8,8,8, 27,27], 2.05, 1.15, [2]);
        this.hole = top.find(x => x.t == null); S.lay = top.concat(bot).filter(x => x.t != null);
        S.lay.push({ id: lid(24, 2), t: 24, x: -2.6, z: 5, s: 1.15, cand: true }, { id: lid(15, 2), t: 15, x: 0, z: 5, s: 1.15, cand: true }, { id: lid(30, 2), t: 30, x: 2.6, z: 5, s: 1.15, cand: true });
      },
      tap(L){
        if (!L.cand){ const g = L.t === 31 ? 'a Pung: three Red Dragons' : L.t === 8 ? 'a Pung: three 9s of Characters' : L.t === 27 ? 'the pair: two East Winds' : L.t < 18 ? 'a Chow: 2-3-4 of Dots' : 'a run that is not finished yet: 5 and 6 of Bamboo'; lessonStatus(`This is ${g}.`); return; }
        if (LS.done) return;
        if (L.t === 24){ Object.assign(L, { x: this.hole.x, z: this.hole.z, cand: false }); render(); lessonStatus('The 7 of Bamboo makes 5-6-7. Chow, Chow, Pung, Pung and a pair: that is a winning hand.', true); }
        else if (L.t === 15) lessonStatus('Right number, wrong suit. A Chow has to stay in one suit.');
        else lessonStatus('Winds have no number, so they can never finish a run.');
      } });
    /* e. a turn, and taking a discard */
    await lessonStep({ n: 8, title: 'Your turn: draw one, throw one', text: 'On each turn you take one tile from the wall and throw one away, face up. The tile you throw is called a discard. You hold 13 tiles, and 14 right after you draw.',
      task: 'Tap the wall to draw a tile.', allow: { arrange: true },
      enter(){
        me.hand = [0,1,2,4,12,13,24,25,26,31,31,27,29].map((t, i) => ({ id: lid(t, 2 + (t === 31 && i === 10 ? 1 : 0)), t })); S.order = sortTiles(me.hand.slice()).map(x => x.id);
        S.lay = [-1.2, 0, 1.2].flatMap((x, i) => [0, 1].map(k => ({ id: lid(19 + i, k + 2), t: 19 + i, x: x - 4.5, z: -.6, s: 1, down: true, lift: k * .704, wall: true })));
        this.phase = 0;
      },
      tap(L){
        if (this.phase !== 0 || !L.wall) return lessonStatus(this.phase === 0 ? 'Tap the face-down tiles of the wall to draw.' : LS.status);
        this.phase = 1; S.lay = S.lay.filter(x => x !== L);
        const d = { id: lid(17, 3), t: 17 }; me.hand.push(d); me.drawnId = d.id; snd('draw');
        S.lay.forEach(x => x.snd = null);
        lessonStatus('You drew the 9 of Dots. Now throw away the tile you need least: the West Wind, which matches nothing. Drag it up onto the table, or tap it twice.');
        this.throwIt();
      },
      async throwIt(){
        const v = await waitHuman({ mode: 'discard', actions: [], coach: '' });
        const x = removeById(me, v.id); me.drawnId = null; me.discards.push(x); S.lastDiscard = { id: x.id, from: 0 };
        LS.def.allow = { arrange: true }; render(); await V.whenLanded(x.id);
        lessonStatus(x.t === 29 ? 'Good. Now watch the player on your left.' : `You threw the ${tName(x.t)}. West was the better throw because it matched nothing. Now watch the player on your left.`);
        await new Promise(r => setTimeout(r, 1300));
        const d = { id: lid(14, 3), t: 14 }; S.players[3].discards.push(d); S.lastDiscard = { id: d.id, from: 3 }; S.newest = { id: d.id, t: 14, from: 3 }; snd('place'); render();
        await V.whenLanded(d.id);
        const o = { ron: false, pung: false, kong: false, chows: [12] }; // the lesson table has no wall, so the run is offered by hand: 4, 5, 6 of Dots
        while (true){
          lessonStatus(o.chows.length ? 'Left threw the 6 of Dots, and you have the 4 and 5. You can take it to make a run, but only from the player on your left. Press Chow.' : 'Left threw the 6 of Dots.');
          const act = await waitHuman({ mode: 'claim', level: 'guided', actions: claimActions(o, d).map(a => Object.assign(a, { why: a.kind === 'chow' ? 'Chow makes 4-5-6 of Dots. The run goes face up in front of you.' : a.kind === 'pass' ? 'Pass lets it go.' : '' })), coach: '' });
          if (act && act.type === 'chow'){ makeMeld(0, { type: 'chow', start: act.start }, d); S.players[3].discards.pop(); S.lastDiscard = null; S.newest = null; snd('chow'); callStroke(0, 'chow'); render(); break; }
          lessonStatus('You let it go. This time, take it.'); await new Promise(r => setTimeout(r, 900));
        }
        lessonStatus('Your run is face up, and now you throw a tile. A Pung works the same way, but you can take it from anyone. That is the whole game: draw, throw, take sets, win.', true);
      } });
    endLesson(false);
  } catch(e){ if (e !== ABORT) console.error(e); LS = null; lessonCard(); document.body.classList.remove('inlesson'); }
}

/* the first launch: one question */
function firstQuestion(){
  const root = setOverlay(`<div class="first"><div class="paper" role="dialog" aria-label="Welcome">
    <h2>Have you played Mahjong before?</h2>
    <div class="fb">
      <button class="tbtn prime" data-k="new"><b>No, teach me</b><small>A short lesson on the table, then an easy first hand.</small></button>
      <button class="tbtn" data-k="casual"><b>Yes, a little</b><small>Go straight to a game, with some help.</small></button>
      <button class="tbtn" data-k="veteran"><b>Yes, I know it well</b><small>Go straight to a game, with no help.</small></button>
    </div></div></div>`);
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k; arm(); setKind(k); profile.asked = true; save(); closeOverlay();
    if (k === 'new') startLesson(true); else { profile.tut = true; save(); startGame('play'); }
  });
  setTimeout(() => { const b = root.querySelector('.prime'); if (b) b.focus({ preventScroll: true }); }, 0);
}
window.TW_lesson = () => LS;
