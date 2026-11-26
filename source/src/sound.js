/* =========================================================
   SOUND. Effects: ceramic on felt, a band-passed noise click over a low
   thump, never the same twice. Music: four short written pieces that rotate
   (see below). Silent until the first touch; music and sound each have their
   own switch, and everything pauses while the tab is hidden.
   ========================================================= */
let actx = null, noiseBuf = null, armed = false, sfxBus = null, musBus = null, musTimer = null, tension = 0;
function arm(){ if (armed) return; armed = true; music(); }
document.addEventListener('pointerdown', arm, { once:true });
document.addEventListener('keydown', arm, { once:true });
function audio(){
  if (actx) return actx;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  sfxBus = actx.createGain(); sfxBus.connect(actx.destination);
  try { // v10: a quiet, short room behind the effects
    const len = Math.floor(actx.sampleRate * .42), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++){ const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++){ lp += (Math.random() * 2 - 1 - lp) * .35; d[i] = lp * Math.pow(1 - i / len, 3.2) * (i < actx.sampleRate * .004 ? 0 : 1); } }
    const cv = actx.createConvolver(); cv.buffer = ir; const wet = actx.createGain(); wet.gain.value = .22;
    sfxBus.connect(cv).connect(wet).connect(actx.destination);
  } catch(e){}
  musBus = actx.createGain(); musBus.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * .3, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setVolumes();
  return actx;
}
function setVolumes(){
  if (!actx) return;
  sfxBus.gain.setTargetAtTime(settings.sfxOn === false ? 0 : settings.sfx, actx.currentTime, .03);
  musBus.gain.setTargetAtTime(settings.musicOn === false ? 0 : settings.music * .8, actx.currentTime, .25);
}
function haptic(p){ if (settings.haptics && !autotest && armed && navigator.vibrate){ try { navigator.vibrate(p); } catch(e){} } }
const jit = (v, p) => v * (1 + (Math.random() * 2 - 1) * p);

function snd(kind){
  if (autotest || !armed || settings.sfx <= 0 || settings.sfxOn === false) return;
  try {
    const ac = audio(); if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const clack = (at, freq, vol, thump, thumpVol, decay = .04, q = 2.2) => {
      // v10: a struck tile rings at a few stiff, inharmonic modes for a few hundredths of a second; a filtered-noise
      // click only gave the hiss. A very short noise tick starts it, the modes carry the "tock", the table gives the thud.
      const pitch = jit(1, .05), v = jit(vol, .1), t0 = now + at;
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = pitch;
      const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = freq * 1.4 * pitch; hp.Q.value = .7;
      const g = ac.createGain(); g.gain.setValueAtTime(v * .55, t0); g.gain.exponentialRampToValueAtTime(.0005, t0 + .006);
      s.connect(hp).connect(g).connect(sfxBus); s.start(t0, Math.random() * .2); s.stop(t0 + .012);
      const f0 = freq * .62 * pitch, modes = [[1, 1, 1], [1.594, .62, .7], [2.136, .42, .5], [2.873, .3, .36], [3.712, .16, .25]];
      for (const [r, a, dk] of modes){
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f0 * r * jit(1, .012);
        const d = Math.max(.012, decay * (.9 + q * .1) * dk);
        og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(v * a * .34, t0 + .0012); og.gain.exponentialRampToValueAtTime(.0004, t0 + d);
        o.connect(og).connect(sfxBus); o.start(t0); o.stop(t0 + d + .01);
      }
      if (thump){ // the board under the cloth: a damped low knock, slightly lowpassed noise so it is wood, not a tone
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(thump * pitch * 1.35, t0); o.frequency.exponentialRampToValueAtTime(thump * pitch * .9, t0 + .05);
        og.gain.setValueAtTime(v * thumpVol * .8, t0); og.gain.exponentialRampToValueAtTime(.0005, t0 + .075);
        o.connect(og).connect(sfxBus); o.start(t0); o.stop(t0 + .09);
        const n = ac.createBufferSource(); n.buffer = noiseBuf; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const ng = ac.createGain();
        ng.gain.setValueAtTime(v * thumpVol * .5, t0); ng.gain.exponentialRampToValueAtTime(.0005, t0 + .04);
        n.connect(lp).connect(ng).connect(sfxBus); n.start(t0, Math.random() * .2); n.stop(t0 + .05);
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
    else if (kind === 'press'){ clack(0, 1700, .22, 260, .55, .035, 1.6); }
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

/* the win and lose figures use the same soft harp as the music */
function pluck(f, at, vol, dur, bus){ voice(actx, bus, 'harp', f, at, Math.max(.3, dur * .45), vol); }
/* ---------------- music ----------------
   Four short pieces with real tunes, written out note by note, that take turns in a shuffled order. Each time a piece comes
   round again it is dressed differently (harp or felt piano on the tune, a different accompaniment, the tune up an octave on
   the repeat), so half an hour does not wear thin. Soft instruments only, and well under the tile sounds. */
const NOTE = n => { const m = /^([A-G])(#|b)?(\d)$/.exec(n); const st = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return 440 * Math.pow(2, (st + (+m[3] + 1) * 12 - 69) / 12); };
const CHORD = c => { const m = /^([A-G](?:#|b)?)(m|7)?$/.exec(c), root = NOTE(m[1] + '3'), third = m[2] === 'm' ? 3 : 4; return [root, root * Math.pow(2, third / 12), root * Math.pow(2, 7 / 12)]; };
const tune = s => s.trim().split(/\s+/).map(x => { const [n, d] = x.split(':'); return [n === 'r' ? null : NOTE(n), +d]; });
const SONGS = [
  { name: 'Lamp', bpm: 80, beats: 4, form: 'ABA',
    A: { ch: 'D Bm G A D Bm Em A', m: tune('F#5:1 E5:.5 D5:.5 A4:2  B4:1 D5:1 F#5:1.5 E5:.5  D5:1.5 B4:.5 G4:1 B4:1  A4:3 r:1  F#5:1 A5:1 B5:.5 A5:.5 F#5:1  E5:1 F#5:.5 E5:.5 D5:2  E5:1 G5:1 F#5:1 E5:1  A4:1 C#5:1 E5:2') },
    B: { ch: 'G A F#m Bm G A D D', m: tune('D5:1 B4:1 G4:1 B4:1  C#5:1 E5:1 A5:2  F#5:1.5 E5:.5 C#5:1 A4:1  B4:2 D5:1 F#5:1  G5:1.5 F#5:.5 E5:1 D5:1  E5:1 F#5:.5 E5:.5 C#5:1 A4:1  D5:1 F#5:1 A5:1 F#5:1  D5:3 r:1') } },
  { name: 'Rain', bpm: 70, beats: 4, form: 'ABA',
    A: { ch: 'Am F C G Am F G Am', m: tune('E5:1.5 D5:.5 C5:1 A4:1  C5:2 D5:1 E5:1  G5:1.5 E5:.5 D5:1 C5:1  D5:3 r:1  E5:1 A5:1 G5:1 E5:1  F5:1.5 E5:.5 D5:1 C5:1  D5:1 E5:.5 D5:.5 B4:2  A4:3 r:1') },
    B: { ch: 'F G Em Am Dm Em F E', m: tune('A4:1 C5:1 F5:2  D5:1 G5:1.5 F5:.5 D5:1  E5:1.5 G5:.5 B5:1 G5:1  A5:2 E5:1 C5:1  D5:1 F5:1 A5:1.5 G5:.5  E5:1 G5:1 B4:2  C5:1 A4:1 F5:1 E5:1  E5:2 G#4:2') } },
  { name: 'Tea', bpm: 96, beats: 3, form: 'AABA', waltz: true,
    A: { ch: 'F Dm Bb C F Am Bb C', m: tune('C5:2 A4:1  D5:1.5 E5:.5 F5:1  D5:2 Bb4:1  C5:3  A5:2 G5:.5 F5:.5  E5:1 C5:1 A4:1  D5:1 F5:1 G5:1  E5:2 r:1'), end: tune('F5:3') },
    B: { ch: 'Bb F Gm C Dm Am Bb C', m: tune('F5:1 D5:1 Bb4:1  C5:1 F5:1 A5:1  Bb5:2 A5:.5 G5:.5  E5:3  D5:1 F5:1 A5:1  G5:1.5 E5:.5 C5:1  D5:1 E5:1 F5:1  G5:2 E5:1') } },
  { name: 'Rail', bpm: 88, beats: 4, form: 'ABA',
    A: { ch: 'G Em C D G Em Am D', m: tune('B4:.5 D5:.5 G5:1 A5:.5 G5:.5 E5:1  D5:1 E5:.5 D5:.5 B4:2  E5:1 G5:1 A5:1 G5:.5 E5:.5  D5:3 r:1  G5:.5 A5:.5 B5:1 A5:1 G5:1  E5:1 G5:.5 E5:.5 D5:2  C5:1 E5:1 A5:1 G5:.5 E5:.5  D5:2 F#5:1 A5:1') },
    B: { ch: 'C D Bm Em C D G G', m: tune('G5:1.5 E5:.5 C5:1 E5:1  F#5:1.5 D5:.5 A4:1 D5:1  B4:1 D5:1 F#5:1 B5:1  G5:2 E5:2  E5:1 G5:1 C6:1 B5:.5 A5:.5  A5:1 F#5:1 D5:1 E5:.5 F#5:.5  G5:1 D5:1 B4:1 D5:1  G5:3 r:1') } }
];
/* the instruments: all soft, nothing buzzy */
function voice(ac, bus, kind, f, t, dur, vel){
  if (!f) return;
  const g = ac.createGain(); g.connect(bus);
  if (kind === 'harp'){ // a plucked string: triangle and a quiet octave, the brightness falling away fast
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g2 = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.002; g2.gain.value = .22;
    lp.type = 'lowpass'; lp.Q.value = .4; lp.frequency.setValueAtTime(Math.min(6000, f * 5), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.4), t + .6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .005); g.gain.exponentialRampToValueAtTime(vel * .35, t + .25); g.gain.exponentialRampToValueAtTime(.0003, t + Math.max(1.4, dur + 1.1));
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g);
    const end = t + Math.max(1.5, dur + 1.2); o.start(t); o2.start(t); o.stop(end); o2.stop(end);
  } else if (kind === 'piano'){ // a felt piano: sine partials that fade at different speeds
    for (const [m, v, d] of [[1, 1, 1], [2, .32, .45], [3, .1, .25], [4.01, .04, .15]]){
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * m;
      const L = Math.max(.9, dur * 1.2 + .7) * d;
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(vel * v, t + .009); og.gain.exponentialRampToValueAtTime(.0003, t + L);
      o.connect(og).connect(g); o.start(t); o.stop(t + L + .05);
    }
    g.gain.value = 1;
  } else if (kind === 'pad'){ // two soft triangles a hair apart, behind a low filter, swelling in and out
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = .3; lp.connect(g);
    for (const d of [-4, 4]){ const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 1.8); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(1.2, dur * .4)); g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
  } else if (kind === 'bass'){
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .02); g.gain.exponentialRampToValueAtTime(vel * .5, t + .4); g.gain.exponentialRampToValueAtTime(.0003, t + Math.max(.8, dur + .4));
    o.connect(g); o.start(t); o.stop(t + Math.max(.9, dur + .5));
  }
}
/* the player: lays out one piece at a time, a little ahead of the clock */
function MusicPlayer(ac, bus, rand = Math.random){
  const P = { t: ac.currentTime + .4, queue: [], last: -1, plays: [0, 0, 0, 0], tension: 0, accBus: ac.createGain(), melBus: ac.createGain() };
  P.accBus.connect(bus); P.melBus.connect(bus);
  const hz = (v, j) => v * (1 + (rand() * 2 - 1) * j);
  P.next = () => {
    if (!P.queue.length){ const o = [0, 1, 2, 3]; for (let i = 3; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } if (o[0] === P.last) o.push(o.shift()); P.queue = o; }
    const k = P.queue.shift(); P.last = k; return k;
  };
  P.lay = () => { // write one whole piece into the timeline, starting at P.t; returns its end
    const k = P.next(), song = SONGS[k], n = P.plays[k]++, beat = 60 / song.bpm, bar = beat * song.beats;
    const mel = n % 2 ? 'piano' : 'harp', acc = song.waltz ? (n % 2 ? 'harp' : 'piano') : ['arp', 'pad', 'arp2'][n % 3];
    let t = P.t;
    const parts = []; let seenA = 0; for (const ch of song.form){ const sec = song[ch]; parts.push({ sec, end: ch === 'A' && sec.end && seenA > 0 ? sec.end : null, up: ch === 'A' && seenA > 0 && parts.length >= 2 && n % 3 === 1 }); if (ch === 'A') seenA++; }
    for (const p of parts){
      const chords = p.sec.ch.split(' ');
      // the tune
      let bt = 0; const notes = p.end ? p.sec.m.slice(0, p.sec.m.length - 2).concat(p.end) : p.sec.m;
      for (const [f, d] of notes){ if (f) voice(ac, P.melBus, mel, (p.up ? f * 2 : f) / (mel === 'piano' && p.up ? 2 : 1), t + bt * beat + (rand() - .5) * .016, d * beat, hz(mel === 'harp' ? .12 : .1, .1)); bt += d; }
      // underneath
      chords.forEach((c, i) => {
        const tb = t + i * bar, tones = CHORD(c);
        voice(ac, P.accBus, 'bass', tones[0] / 2, tb, beat * (song.beats - .5), hz(.075, .08));
        if (song.waltz){ for (const b of [1, 2]) tones.forEach(x => voice(ac, P.accBus, acc, x * 2, tb + b * beat + (rand() - .5) * .01, beat * .8, hz(.022, .1))); }
        else if (acc === 'pad'){ tones.forEach(x => voice(ac, P.accBus, 'pad', x * 2, tb, bar - .1, .018)); }
        else { const seq = acc === 'arp' ? [0, 1, 2, 1, 0, 1, 2, 1] : [0, 2, 1, 2, 0, 2, 1, 2]; seq.forEach((q, j) => voice(ac, P.accBus, 'harp', tones[q] * (j % 4 === 2 ? 4 : 2), tb + j * beat / 2 + (rand() - .5) * .012, beat / 2, hz(j % 2 ? .028 : .038, .12))); }
      });
      t += chords.length * bar;
    }
    // a breath between pieces: one held chord, then quiet
    const home = CHORD(SONGS[k].A.ch.split(' ')[0]);
    home.forEach(x => voice(ac, P.accBus, 'pad', x * 2, t, 3.2, .016));
    P.t = t + 4.5 + rand() * 2;
    return P.t;
  };
  P.fill = horizon => { while (P.t < horizon) P.lay(); };
  P.setTension = v => { P.tension = v; P.accBus.gain.setTargetAtTime(v > .5 ? .45 : 1, ac.currentTime, 1.5); };
  return P;
}
function music(){
  if (musTimer || autotest || !armed) return;
  try {
    const ac = audio(); const pl = MusicPlayer(ac, musBus); window.TW_music = pl;
    musTimer = setInterval(() => {
      if (ac.state !== 'running') return;
      if (!settings.musicOn || settings.music <= 0){ if (pl.t < ac.currentTime) pl.t = ac.currentTime + .5; return; }
      if (pl.t < ac.currentTime - .5) pl.t = ac.currentTime + .4; // after a pause, start a fresh piece rather than cramming the old one in
      pl.fill(ac.currentTime + 1.5);
    }, 400);
    tensionNow = () => pl;
  } catch(e){}
}
let tensionNow = () => null;
/* a ready hand: three notes climbing out of the quiet */
function lift(){
  if (!actx || !armed || autotest || !settings.musicOn || settings.music <= 0) return;
  try { const t = actx.currentTime + .08; ['A5', 'B5', 'D6'].forEach((n, i) => voice(actx, musBus, 'harp', NOTE(n), t + i * .17, .4, .1 - i * .01)); } catch(e){}
}
function setTension(v){
  tension = v; const p = tensionNow(); if (p) p.setTension(v);
}
document.addEventListener('visibilitychange', () => { if (actx){ if (document.hidden) actx.suspend(); else if (armed) actx.resume(); } });
