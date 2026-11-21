/* =========================================================
   SOUND. Effects: ceramic on felt, a band-passed noise click over a low
   thump, never the same twice. Music: slow plucked notes on a five-note
   scale over a soft drone, composed as it goes, so it has no loop point.
   Silent until the first touch.
   ========================================================= */
let actx = null, noiseBuf = null, armed = false, sfxBus = null, musBus = null, musTimer = null, padGain = null, tension = 0, musNext = 0, musDeg = 4;
function arm(){ if (armed) return; armed = true; music(); }
document.addEventListener('pointerdown', arm, { once:true });
document.addEventListener('keydown', arm, { once:true });
function audio(){
  if (actx) return actx;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  sfxBus = actx.createGain(); sfxBus.connect(actx.destination);
  musBus = actx.createGain(); musBus.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * .3, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setVolumes();
  return actx;
}
function setVolumes(){
  if (!actx) return;
  sfxBus.gain.setTargetAtTime(settings.sfx, actx.currentTime, .03);
  musBus.gain.setTargetAtTime(settings.music * .5, actx.currentTime, .2);
}
function haptic(p){ if (settings.haptics && !autotest && armed && navigator.vibrate){ try { navigator.vibrate(p); } catch(e){} } }
const jit = (v, p) => v * (1 + (Math.random() * 2 - 1) * p);

function snd(kind){
  if (autotest || !armed || settings.sfx <= 0) return;
  try {
    const ac = audio(); if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const clack = (at, freq, vol, thump, thumpVol, decay = .04, q = 2.2) => {
      const pitch = jit(1, .06), v = jit(vol, .1), t0 = now + at;
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = pitch;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * pitch; bp.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0006, t0 + decay);
      s.connect(bp).connect(g).connect(sfxBus); s.start(t0, Math.random() * .1); s.stop(t0 + decay + .02);
      if (thump){
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(thump * pitch * 1.25, t0); o.frequency.exponentialRampToValueAtTime(thump * pitch, t0 + .03);
        og.gain.setValueAtTime(v * thumpVol, t0); og.gain.exponentialRampToValueAtTime(.0006, t0 + .1);
        o.connect(og).connect(sfxBus); o.start(t0); o.stop(t0 + .12);
      }
    };
    const slide = (at, dur, vol) => { // a tile drawn across wood
      const t0 = now + at, s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = jit(.7, .1);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8; bp.frequency.setValueAtTime(jit(900, .1), t0); bp.frequency.linearRampToValueAtTime(jit(1700, .1), t0 + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * .3); g.gain.linearRampToValueAtTime(0, t0 + dur);
      s.connect(bp).connect(g).connect(sfxBus); s.start(t0); s.stop(t0 + dur + .02);
    };
    const bowl = (f, at, dur, vol) => { // a struck bowl: a sine and a quiet inharmonic partial
      for (const [m, v] of [[1, 1], [2.71, .28], [5.2, .1]]){
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = jit(f, .004) * m;
        g.gain.setValueAtTime(0, now + at); g.gain.linearRampToValueAtTime(vol * v, now + at + .008); g.gain.exponentialRampToValueAtTime(.0004, now + at + dur / m);
        o.connect(g).connect(sfxBus); o.start(now + at); o.stop(now + at + dur / m + .05);
      }
    };
    if (kind === 'pick') clack(0, 3900, .2, 0, 0, .028, 3);
    else if (kind === 'draw'){ slide(0, .09, .1); clack(.085, 3500, .26, 210, .5, .03); }
    else if (kind === 'place') clack(0, 3000, .5, 180, .9);
    else if (kind === 'chow'){ clack(0, 3200, .42, 190, .6); clack(.07, 3600, .34, 0, 0); }
    else if (kind === 'pung' || kind === 'claim' || kind === 'call'){ clack(0, 2500, .6, 150, 1.1, .05); clack(.085, 2900, .52, 165, 1, .05); }
    else if (kind === 'kong'){ clack(0, 2400, .6, 140, 1.2, .05); clack(.08, 2700, .55, 150, 1.1, .05); clack(.16, 3000, .5, 120, 1.3, .06); }
    else if (kind === 'deal') clack(0, 3500, .18, 200, .45, .03);
    else if (kind === 'nope') clack(0, 2500, .16, 140, .8, .03);
    else if (kind === 'chance') bowl(jit(392, .01), 0, .9, .09);
    else if (kind === 'ready'){ bowl(587.3, 0, 1.6, .1); bowl(880, .16, 1.4, .06); }
    else if (kind === 'tick') clack(0, 4200, .12, 0, 0, .02, 4);
    else if (kind === 'win'){ [293.7, 370, 440, 587.3, 740].forEach((f, i) => pluck(f, now + i * .11, .16, 2.2, sfxBus)); bowl(146.8, 0, 2.6, .07); }
    else if (kind === 'bigwin'){ [146.8, 220, 293.7, 370, 440, 587.3, 740, 880].forEach((f, i) => pluck(f, now + i * .1, .17, 2.6, sfxBus)); bowl(146.8, 0, 3.2, .09); bowl(293.7, .8, 2.6, .05); }
    else if (kind === 'lose'){ pluck(220, now, .1, 1.6, sfxBus); pluck(185, now + .22, .09, 2, sfxBus); }
  } catch(e){}
}

/* a plucked string, near enough to a guzheng: bright attack, a quick bend down into pitch, long soft tail */
function pluck(f, at, vol, dur, bus){
  const ac = actx, o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'sawtooth'; o2.type = 'triangle';
  const f0 = jit(f, .0025);
  o.frequency.setValueAtTime(f0 * 1.022, at); o.frequency.exponentialRampToValueAtTime(f0, at + .07);
  o2.frequency.setValueAtTime(f0 * 2.003, at);
  lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(Math.min(9000, f0 * 9), at); lp.frequency.exponentialRampToValueAtTime(f0 * 1.6, at + .5);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + .006); g.gain.exponentialRampToValueAtTime(vol * .32, at + .22); g.gain.exponentialRampToValueAtTime(.0004, at + dur);
  const g2 = ac.createGain(); g2.gain.value = .25;
  o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(bus);
  o.start(at); o2.start(at); o.stop(at + dur + .05); o2.stop(at + dur + .05);
}
const SCALE = [146.83, 164.81, 185, 220, 246.94]; // D E F# A B
const noteAt = d => SCALE[((d % 5) + 5) % 5] * Math.pow(2, Math.floor(d / 5));
function music(){
  if (musTimer || autotest || !armed) return;
  try {
    const ac = audio();
    // the drone: two soft fifths that breathe
    padGain = ac.createGain(); padGain.gain.value = 0; padGain.connect(musBus);
    for (const [f, v] of [[73.42, .5], [110, .35], [146.83, .2]]){
      const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = v * .16;
      l.frequency.value = jit(.07, .4); lg.gain.value = v * .06; l.connect(lg).connect(g.gain);
      o.connect(g).connect(padGain); o.start(); l.start();
    }
    padGain.gain.setTargetAtTime(1, ac.currentTime, 2.5);
    musNext = ac.currentTime + 1.2;
    musTimer = setInterval(() => {
      if (ac.state !== 'running' || settings.music <= 0) { musNext = ac.currentTime + .5; return; }
      while (musNext < ac.currentTime + .6){
        const calm = 1 - tension;
        // a phrase: one to four notes walking the scale, then a rest. Tension leaves only single high notes.
        const n = tension > .5 ? 1 : 1 + Math.floor(Math.random() * 3.6);
        let t = musNext;
        for (let i = 0; i < n; i++){
          musDeg += [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(Math.random() * 8)];
          musDeg = Math.max(tension > .5 ? 8 : 2, Math.min(13, musDeg));
          pluck(noteAt(musDeg), t, jit(.11, .25) * (.6 + .4 * calm), jit(3.2, .2), musBus);
          if (calm > .5 && Math.random() < .22) pluck(noteAt(musDeg - 5), t + .02, .07, 3.6, musBus);
          t += jit([.42, .62, .84, 1.25][Math.floor(Math.random() * 4)], .08);
        }
        if (calm > .5 && Math.random() < .3) pluck(noteAt(Math.floor(Math.random() * 3)) / 2, t, .1, 4.5, musBus);
        musNext = t + jit(tension > .5 ? 5.5 : 2.4, .45);
      }
    }, 200);
  } catch(e){}
}
/* a ready hand: three notes climbing out of the quiet */
function lift(){
  if (!actx || !armed || autotest || settings.music <= 0) return;
  try { const t = actx.currentTime + .08; [7, 9, 11].forEach((d, i) => pluck(noteAt(d), t + i * .17, .13 - i * .01, 2.8, musBus)); } catch(e){}
}
function setTension(v){
  tension = v;
  if (padGain && actx) padGain.gain.setTargetAtTime(v > .5 ? .25 : 1, actx.currentTime, 1.2);
}
document.addEventListener('visibilitychange', () => { if (actx){ if (document.hidden) actx.suspend(); else if (armed) actx.resume(); } });
