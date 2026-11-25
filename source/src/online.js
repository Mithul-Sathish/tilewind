/* =========================================================
   PLAY ONLINE: the waiting room on screen, the away card, and the rating after a game.
   Names are made by the game, there is no typing between strangers, and only the preset reactions exist.
   ========================================================= */
const ONLINE_WAIT = 20000;
let qTick = 0, qDeadline = 0, qN = 1;
const tierLine = (r, g) => `${onlineTier(r).name} · ${r}${g != null && g < 3 ? ' · settling in' : ''}`;
function onlineTier(r){ const T = [['Plum', 0], ['Orchid', 1050], ['Chrysanthemum', 1150], ['Bamboo', 1250], ['Jade', 1350], ['Dragon', 1450]]; let k = 0; T.forEach((t, i) => { if (r >= t[1]) k = i; }); return { name: T[k][0], i: k, next: T[k + 1] ? T[k + 1][1] : null, nextName: T[k + 1] ? T[k + 1][0] : null, min: T[k][1] }; }

function openOnline(){
  ensureTiles();
  if (!NET.onlineURL()){ toast('Play online', 'Online tables are not open yet.'); return; }
  const saved = NET.onlineSaved();
  if (saved){ rejoinOnline(saved); return; }
  qN = 1; qDeadline = Date.now() + ONLINE_WAIT;
  const name = NET.store.oname || '', r = NET.store.rating || 1000;
  const root = setOverlay(`<div class="overlay"><div class="lobby qroom paper" role="dialog" aria-modal="true" aria-label="Finding players">
    <h2>Finding players</h2>
    <p class="blead" id="qWho">${name ? `You play as <b>${name}</b>. ${tierLine(r, NET.store.games)}` : 'Connecting…'}</p>
    <div class="qseats" id="qSeats">${[0,1,2,3].map(i => `<div class="qs ${i === 0 ? 'on' : ''}"><span class="qt"></span><small>${i === 0 ? 'You' : 'Open'}</small></div>`).join('')}</div>
    <div class="qclock"><b id="qSec">20</b><span>seconds to start. Empty seats get computer players.</span></div>
    <div class="bfoot"><button class="tbtn" id="qCancel">Cancel</button></div>
  </div></div>`);
  const paint = () => {
    const left = Math.max(0, Math.ceil((qDeadline - Date.now()) / 1000));
    const a = root.querySelector('#qSec'); if (!a) return;
    a.textContent = left;
    root.querySelectorAll('.qs').forEach((el, i) => { const on = i < qN; if (on && !el.classList.contains('on')){ el.classList.add('on'); snd('place'); } el.classList.toggle('on', on); el.querySelector('small').textContent = i === 0 ? 'You' : on ? 'Player found' : 'Open'; });
  };
  clearInterval(qTick); qTick = setInterval(paint, 250); paint();
  const stop = () => { clearInterval(qTick); NET.unqueue(); };
  root.querySelector('#qCancel').onclick = () => { snd('pick'); stop(); closeOverlay(); };
  root.querySelector('#qCancel').focus({ preventScroll: true });
  NET.queue({
    you: m => { const w = root.querySelector('#qWho'); if (w) w.innerHTML = `You play as <b>${m.name}</b>. ${tierLine(m.rating, m.games)}`; },
    q: m => { qN = m.n; qDeadline = Date.now() + m.left; paint(); },
    go: m => {
      clearInterval(qTick); qN = 4; paint();
      const h = root.querySelector('h2'); if (h) h.textContent = 'Table ready';
      const c = root.querySelector('.qclock span'); if (c) c.textContent = m.n === 4 ? 'Four players. Sitting down.' : `${m.n === 1 ? 'You' : m.n + ' players'} and ${4 - m.n} computer${4 - m.n > 1 ? 's' : ''}. Sitting down.`;
      root.querySelectorAll('.qs').forEach((el, i) => { if (i >= m.n) el.querySelector('small').textContent = 'Computer'; });
      snd('chance');
    },
    fail: text => { clearInterval(qTick); const c = root.querySelector('.qclock'); if (c) c.innerHTML = `<span class="qfail">${text}</span>`; const f = root.querySelector('.bfoot'); if (f) f.innerHTML = `<button class="tbtn" data-close>Close</button><button class="tbtn prime" id="qAgain">Try again</button>`; root.querySelector('[data-close]').onclick = () => closeOverlay(); root.querySelector('#qAgain').onclick = () => { closeOverlay(); setTimeout(openOnline, 220); }; }
  });
}
function rejoinOnline(code){
  toast('Rejoining', 'Back to your online table.');
  NET.sit(code, true);
}
/* the computer has been playing your seat because two turns ran out */
function netAway(on){
  const el = $('#awayCard'); if (!el) return;
  if (!on){ fadeHide(el); return; }
  el.innerHTML = `<p>The computer is playing for you.</p><button class="tbtn prime" id="awayBack">I'm back</button>`;
  fadeShow(el);
  el.querySelector('#awayBack').onclick = () => { snd('pick'); NET.back(); fadeHide(el); };
}
/* the rating line on the last slip of an online game */
function netRated(r){
  const el = $('#nRated'); if (!el) { S && (S.rated = r); return; }
  paintRated(el, r);
}
function paintRated(el, r){
  const d = r.to - r.from, t = onlineTier(r.to), up = r.tier.i > r.was.i;
  el.innerHTML = `<div class="rt"><span>Rating</span><b><i id="rtNum">${r.from}</i></b><em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</em></div>
    <div class="rtier"><span>${t.name}</span>${t.next ? `<div class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, (r.to - t.min) / (t.next - t.min))) * 100)}%"></i></div><small>${t.next - r.to} to ${t.nextName}</small>` : '<small>The top tier</small>'}</div>
    ${up ? `<div class="rup">New tier: ${t.name}</div>` : ''}`;
  el.hidden = false;
  const num = el.querySelector('#rtNum'); let k = 0;
  const step = () => { k++; num.textContent = Math.round(r.from + d * Math.min(1, k / 18)); if (k < 18) setTimeout(step, 40); else if (up) snd('ready'); };
  setTimeout(step, 300);
}
function netOverOnline(){ /* the last slip stays up; its buttons take you on */ }
