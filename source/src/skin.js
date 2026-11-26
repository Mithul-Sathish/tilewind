/* =========================================================
   v8 SKIN: corner buttons for music and sound, a sound on every button press, the wall count
   beside the wall, and the way back after looking around the table. Nothing here touches the rules.
   ========================================================= */
if (settings.musicOn == null) settings.musicOn = settings.music > 0;
if (settings.sfxOn == null) settings.sfxOn = settings.sfx > 0;
if (settings.music <= 0) settings.music = .45;
if (settings.sfx <= 0) settings.sfx = .8;

/* music and sound, each one tap away, remembered */
function audioButtons(host){
  if (!host) return;
  host.innerHTML = `<button class="ib" data-aud="musicOn" aria-label="Music">${ICON.music}</button><button class="ib" data-aud="sfxOn" aria-label="Sound">${ICON.sound}</button>`;
  host.querySelectorAll('[data-aud]').forEach(b => b.onclick = e => {
    e.stopPropagation(); const k = b.dataset.aud;
    settings[k] = !settings[k]; save(); arm(); setVolumes(); refreshAudioButtons();
    if (k === 'sfxOn' && settings.sfxOn) snd('press');
  });
  refreshAudioButtons();
}
function refreshAudioButtons(){
  document.querySelectorAll('[data-aud]').forEach(b => {
    const on = !!settings[b.dataset.aud], k = b.dataset.aud === 'musicOn' ? 'music' : 'sound';
    b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on);
    b.title = (k === 'music' ? 'Music ' : 'Sound ') + (on ? 'on' : 'off');
    b.innerHTML = on ? ICON[k] : ICON[k].replace('</svg>', ICON.slash.replace(/^<svg[^>]*>/, '').replace('</svg>', '') + '</svg>');
  });
}
audioButtons($('#hud [data-audio]'));

/* every game button answers with a soft click and moves down while held */
function pressSounds(root){
  if (!root || root._ps) return; root._ps = true;
  root.addEventListener('pointerdown', e => { const b = e.target.closest('.gb, .ib, .ibl, .call, .tbtn, .seg button, .tabs button'); if (b && !b.disabled && !b.closest('[data-aud]')) snd('press'); });
}
pressSounds($('#screen-game'));

/* labels that belong to the table */
function placeTags(){
  const wt = $('#wallTag'); if (!wt) return;
  const show = S && S.turn !== -1 && S.mode !== 'lesson' && S.wall && S.wall.length > 0 && !V.dealing();
  const p = show ? V.wallXY() : null;
  if (!p || p.y > innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--handH')) || 0) - 30){ wt.hidden = true; }
  else {
    wt.hidden = false; const n = S.wall.length;
    if (wt._n !== n){ wt._n = n; wt.innerHTML = `${ICON.wall}${n}`; wt.title = n + ' tiles left'; wt.style.color = n <= 12 ? '#FFC2A8' : ''; }
    const lt = $('#seatTag3'), lo = lt && !lt.hidden ? 84 : 30; let tx = Math.max(lo, Math.min(innerWidth - 30, p.x)), ty = Math.max(70, p.y - 18);
    for (let s = 0; s < 4; s++){ const q = V.plaqueXY(s); if (q && Math.abs(q.x - tx) < 140 && Math.abs(q.y - ty) < 30) ty = q.y + 36; } // v10: never sit on a score plaque
    wt.style.left = tx + 'px'; wt.style.top = ty + 'px';
  }
}
/* on a narrow screen the side seats sit past the edge: their plaque continues as a tab at that edge */
function placeSeatTags(){
  for (const s of [1, 3]){
    const el = $('#seatTag' + s); if (!el) continue;
    const p = S && S.turn !== -1 && S.mode !== 'lesson' && S.players && !V.dealing() ? V.plaqueXY(s) : null;
    const off = p && (s === 1 ? p.x > innerWidth - 24 : p.x < 24);
    if (!off){ el.hidden = true; continue; }
    el.hidden = false; const pl = S.players[s], w = (s - S.dealer + 4) % 4;
    const key = [pl.name, pl.score, w, S.turn === s].join();
    if (el._k !== key){ el._k = key; el.innerHTML = `<i style="background:${SEAT[s].lac}">${WIND_HAN[w]}</i><span>${pl.name}</span><b>${pl.score}</b>`; el.style.background = '#E6DCC6'; el.style.color = '#1E160E'; el.classList.toggle('on', S.turn === s); }
    el.style.top = Math.max(80, Math.min(innerHeight * .6, p.y)) + 'px';
  }
}
['#seatTag1', '#seatTag3'].forEach((q, i) => { const el = $(q); if (el) el.onclick = () => { snd('pick'); V.lookAtSeat(V.lookSeat === (i ? 3 : 1) ? 0 : (i ? 3 : 1)); }; });
{ const pf = placeFollowers; placeFollowers = function(){ pf(); placeTags(); placeSeatTags(); }; }

/* looking around: the way back is always one tap */
function onLook(away, seat){
  const b = $('#lookBack'); if (!b) return;
  b.hidden = !(away && S);
}
$('#lookBack').onclick = () => V.lookHome();
document.addEventListener('keydown', e => {
  if (!S || $('#screen-game').hidden || overlayOpen() || (e.target.closest && e.target.closest('input'))) return;
  if (e.key === '1' || e.key === '2' || e.key === '3'){ e.preventDefault(); V.lookAtSeat(+e.key); snd('pick'); }
  else if (e.key === '0' || e.key === 'Backspace'){ if (V.looking){ e.preventDefault(); V.lookHome(); snd('pick'); } }
});
document.addEventListener('keydown', e => {
  if ($('#screen-home') && !$('#screen-home').hidden && !overlayOpen() && (e.key === 'Enter' || e.key === ' ') && !(e.target.closest && e.target.closest('button, input'))){ const b = $('#hPlay'); if (b){ e.preventDefault(); b.click(); } }
});
