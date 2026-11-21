/* =========================================================
   WHAT YOU KEEP: profile, ranks, tables, collection, quests, the daily hand.
   Everything saves itself. Nothing here touches the rules.
   ========================================================= */
const KEY = 'tilewind.v1', RKEY = 'tilewind.resume';
function load(k = KEY){ try { return JSON.parse(localStorage.getItem(k)) || null; } catch(e){ return null; } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch(e){} }
const defaults = {
  xp:0, games:0, hands:0, wins:0, bestFan:0, winRun:0, stamps:{}, theme:'jade', themePts:0,
  daily:{}, dailyDays:0, dailyLast:null, quests:null, tut:false,
  settings:{ coach:2, labels:true, music:.45, sfx:.8, fast:false, difficulty:0, length:4, oneTap:false, haptics:true }
};
const stored = load() || {};
let profile = Object.assign({}, defaults, stored);
profile.settings = Object.assign({}, defaults.settings, stored.settings || {});
(() => { // carry an older save forward
  const s = profile.settings, o = stored.settings || {};
  if (typeof o.coach === 'boolean') s.coach = o.coach ? 2 : 0;
  if (o.sound === false){ s.music = 0; s.sfx = 0; }
  if (o.speed === 2) s.fast = true;
  if (s.length === 8) s.length = 16; if (![1, 4, 16].includes(s.length)) s.length = 4;
  if (stored.hands > 0 && stored.tut === undefined) profile.tut = true;
  if (Object.values(profile.daily || {}).some(v => v === true)) profile.daily = {};
  profile.stamps = profile.stamps || {}; profile.daily = profile.daily || {};
  delete s.sound; delete s.speed; delete profile.skin; delete profile.ach; delete profile.streak; delete profile.lastDay;
})();
const settings = profile.settings;

const hashStr = s => { let h = 2166136261; for (const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function dayKey(d = new Date()){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
const niceDate = k => { const [y, m, d] = k.split('-'); return +d + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] + ' ' + y; };

/* seats: each has one accent, used on its wind marker, plaque and brush-stroke */
const SEAT = [
  { name:'You',    lac:'#A8281E', bright:'#D9503C', ink:'#F1E3C6' },
  { name:'Right',  lac:'#B98A2C', bright:'#E3BC62', ink:'#2A1C08' },
  { name:'Across', lac:'#23745A', bright:'#5DBB97', ink:'#F1E3C6' },
  { name:'Left',   lac:'#27447F', bright:'#7C9BE0', ink:'#F1E3C6' }
];
const STYLES = [
  { id:'quick',   name:'Fast and loose',    line:'Quick to call and careless with discards.' },
  { id:'careful', name:'Careful defenders', line:'They stop feeding you once you look close.' },
  { id:'flush',   name:'Big-hand hunters',  line:'They collect one suit and defend hard.' }
];

/* ranks */
const RANKS = [
  { name:'Novice', seal:'初', xp:0 }, { name:'Apprentice', seal:'徒', xp:150 }, { name:'Tile Reader', seal:'聽', xp:500 },
  { name:'Table Regular', seal:'客', xp:1200 }, { name:'Master', seal:'師', xp:2500 }, { name:'Grandmaster', seal:'聖', xp:5000 }
];
function rankInfo(xp = profile.xp){
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const r = RANKS[i], n = RANKS[i + 1];
  return { i, name:r.name, seal:r.seal, next:n ? n.name : null, into: xp - r.xp, need: n ? n.xp - r.xp : 1, frac: n ? (xp - r.xp) / (n.xp - r.xp) : 1 };
}

/* six tables. felt, rail, tile backs and the lamp change; ivory and inks never do */
const THEMES = [
  { id:'jade',   name:'Jade Night',       need:0,  felt:0x1D4636, sheen:0x5a9a78, wood:'dark',  rail:0xffffff, back:0x2C6B4F, lamp:0xFFE2B8, room:0x0b0a08, ground:0x2c4a3a, css:'#1D4636' },
  { id:'red',    name:'Red Lacquer',      need:3,  felt:0x4C1310, sheen:0xb06452, wood:'dark',  rail:0x4a3a36, back:0xA02A1C, lamp:0xFFDCAE, room:0x0c0807, ground:0x4a2a22, css:'#4C1310' },
  { id:'indigo', name:'Indigo Porcelain', need:7,  felt:0x1A2C58, sheen:0x6a88c8, wood:'light', rail:0xf2ece0, back:0x234E9C, lamp:0xF6EEDC, room:0x08090c, ground:0x2a3550, css:'#1A2C58' },
  { id:'plum',   name:'Plum Blossom',     need:12, felt:0x4B1D3B, sheen:0xb47c9e, wood:'dark',  rail:0xd8a0a0, back:0x93385E, lamp:0xFFE0C6, room:0x0b080a, ground:0x45283a, css:'#4B1D3B' },
  { id:'gold',   name:'Golden Hour',      need:18, felt:0x6C4E14, sheen:0xd4b060, wood:'light', rail:0xe8c890, back:0xB8791A, lamp:0xFFCB82, room:0x0c0a06, ground:0x5a4520, css:'#7C5A16' },
  { id:'ink',    name:'Midnight Ink',     need:25, felt:0x14171F, sheen:0x566278, wood:'dark',  rail:0x5a5a62, back:0x1A1C22, lamp:0xF2EAD8, room:0x060607, ground:0x22252c, css:'#14171F' }
];
const themeOf = id => THEMES.find(t => t.id === id) || THEMES[0];
const themeOpen = t => profile.themePts >= t.need;
if (!themeOpen(themeOf(profile.theme))) profile.theme = 'jade';

/* the collection: every scoring pattern in the game */
const COLLECTION = [
  { id:'win',    name:'Mahjong',          fan:1,  re:/^Mahjong$/,            ex:[0,1,2,null,13,13,13,null,27,27], hint:'Any complete hand: four sets and a pair.' },
  { id:'self',   name:'Self-drawn',       fan:1,  re:/^Self-drawn$/,         ex:[20,21,null,19],                  hint:'Draw the winning tile yourself. Everyone pays.' },
  { id:'conc',   name:'Concealed hand',   fan:1,  re:/^Concealed hand$/,     ex:[3,4,5,null,15,15,15],            hint:'Win without claiming a single discard.' },
  { id:'chows',  name:'All Chows',        fan:1,  re:/^All Chows$/,          ex:[0,1,2,null,12,13,14,null,22,23,24], hint:'Four runs and a pair. No sets of three.' },
  { id:'pungs',  name:'All Pungs',        fan:3,  re:/^All Pungs$/,          ex:[4,4,4,null,16,16,16,null,28,28,28], hint:'Four sets of three and a pair. No runs.' },
  { id:'red',    name:'Red Dragon',       fan:1,  re:/^Red Dragon pung/,     ex:[31,31,31],                       hint:'A Pung of Red Dragons.' },
  { id:'green',  name:'Green Dragon',     fan:1,  re:/^Green Dragon pung/,   ex:[32,32,32],                       hint:'A Pung of Green Dragons.' },
  { id:'white',  name:'White Dragon',     fan:1,  re:/^White Dragon pung/,   ex:[33,33,33],                       hint:'A Pung of White Dragons.' },
  { id:'seat',   name:'Seat wind',        fan:1,  re:/^Seat wind pung/,      ex:[28,28,28],                       hint:'A Pung of the wind on your own plaque.' },
  { id:'round',  name:'Round wind',       fan:1,  re:/^Round wind pung/,     ex:[27,27,27],                       hint:'A Pung of the wind shown on the round marker.' },
  { id:'kong',   name:'Kong',             fan:1,  re:/Kongs?$/,              ex:[7,7,7,7],                        hint:'Four of a kind, declared.' },
  { id:'flower', name:'Own flower',       fan:1,  re:/^Own flower/,          ex:[34],                             hint:'Draw the flower whose number matches your seat.' },
  { id:'season', name:'Own season',       fan:1,  re:/^Own season/,          ex:[38],                             hint:'Draw the season whose number matches your seat.' },
  { id:'half',   name:'Half Flush',       fan:3,  re:/^Half Flush$/,         ex:[9,10,11,null,14,14,14,null,29,29], hint:'One suit, plus winds or dragons.' },
  { id:'full',   name:'Full Flush',       fan:6,  re:/^Full Flush$/,         ex:[18,19,20,null,22,22,22,null,25,25], hint:'One suit and nothing else.' },
  { id:'seven',  name:'Seven Pairs',      fan:4,  re:/^Seven Pairs$/,        ex:[1,1,null,9,9,null,20,20,null,33,33], hint:'Seven different pairs. No sets at all.' },
  { id:'honors', name:'All Honors',       fan:10, re:/^All Honors$/,         ex:[27,27,27,null,31,31,31,null,32,32], hint:'Only winds and dragons.' },
  { id:'last',   name:'Last tile',        fan:1,  re:/^Last tile of the wall$/, ex:[26],                          hint:'Win on the very last tile of the wall.' },
  { id:'kongwin',name:'Kong replacement', fan:1,  re:/^Win on a Kong replacement$/, ex:[5,5,5,5,null,17],         hint:'Declare a Kong and win on the tile you draw for it.' }
];
const stampCount = () => COLLECTION.filter(c => profile.stamps[c.id]).length;

/* quests: three a day, small, each moves you one step toward the next table */
const QUESTS = [
  { id:'win',    text:'Win a hand',                        test:e => e.kind === 'win' },
  { id:'self',   text:'Win on your own draw',              test:e => e.kind === 'win' && e.self },
  { id:'conc',   text:'Win without claiming a tile',       test:e => e.kind === 'win' && e.concealed },
  { id:'dragon', text:'Win with a Pung of Dragons',        test:e => e.kind === 'win' && e.names.some(n => /Dragon pung/.test(n)) },
  { id:'fan3',   text:'Win a hand worth 3 fan or more',    test:e => e.kind === 'win' && e.fan >= 3 },
  { id:'ron',    text:'Win on another player\'s discard',  test:e => e.kind === 'win' && !e.self },
  { id:'pung',   text:'Claim a Pung',                      test:e => e.kind === 'claim' && e.type === 'pung' },
  { id:'chow',   text:'Claim a Chow',                      test:e => e.kind === 'claim' && e.type === 'chow' },
  { id:'kong',   text:'Declare a Kong',                    test:e => e.kind === 'kong' },
  { id:'ready',  text:'Reach a ready hand',                test:e => e.kind === 'ready' },
  { id:'three',  text:'Play three hands',                  test:e => e.kind === 'hand' && e.count >= 3 },
  { id:'daily',  text:'Play the daily hand',               test:e => e.kind === 'daily' },
  { id:'top2',   text:'Finish a match first or second',    test:e => e.kind === 'match' && e.place <= 2 },
  { id:'safe',   text:'Finish a hand without paying',      test:e => e.kind === 'hand' && e.paid === 0 }
];
function todaysQuests(){
  const k = dayKey();
  if (!profile.quests || profile.quests.day !== k) profile.quests = { day:k, done:{}, hands:0 };
  let seed = hashStr('q' + k); const pool = QUESTS.slice(), out = [];
  while (out.length < 3){ seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; out.push(pool.splice(seed % pool.length, 1)[0]); }
  return out;
}
/* returns the lines worth telling the player about */
function questEvent(ev){
  if (autotest) return [];
  const news = [], before = THEMES.filter(themeOpen).length;
  for (const q of todaysQuests()){
    if (profile.quests.done[q.id] || !q.test(ev)) continue;
    profile.quests.done[q.id] = true; profile.themePts++;
    news.push('Quest done: ' + q.text.toLowerCase() + '.');
  }
  const open = THEMES.filter(themeOpen);
  if (open.length > before) news.push('New table: ' + open[open.length - 1].name + '. Find it in the Collection.');
  return news;
}
function stampWin(names){
  const news = [], today = dayKey();
  for (const c of COLLECTION){
    if (profile.stamps[c.id] || !names.some(n => c.re.test(n))) continue;
    profile.stamps[c.id] = today; news.push('Stamped in your collection: ' + c.name + '.');
  }
  return news;
}
function nextTheme(){ return THEMES.find(t => !themeOpen(t)) || null; }

/* a small seeded generator: the daily deal is the same for everyone, and a saved hand replays exactly */
function rnd(){
  if (!S || S.rs == null) return Math.random();
  let t = (S.rs = (S.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* one-sentence explanations */
function explainTile(t){
  if (t >= 34) return `${tName(t).replace(' (', ', ').replace(')', '')}: a bonus tile. It is set aside when drawn and scores 1 fan for the ${WIND_NAME[(t - 34) % 4]} seat.`;
  if (t >= 31) return `${tName(t)}: an honor tile. A set of three dragons is always worth 1 fan.`;
  if (t >= 27) return `${tName(t)}: an honor tile. No runs, only pairs and sets of three. It scores when it matches your seat or the round.`;
  const n = numOf(t), a = Math.max(1, Math.min(7, n - 1));
  return `${tName(t)}: a suit tile. It can sit in a run such as ${a}-${a + 1}-${a + 2}, or in a set of three.`;
}
const EXPLAIN = [
  [/^Mahjong/, 'One fan for completing a hand at all.'],
  [/^Self-drawn/, 'You drew the winning tile yourself, so all three players pay.'],
  [/^Concealed hand/, 'No discards were claimed, so the hand stayed hidden until the end.'],
  [/^Seven Pairs/, 'Seven different pairs: the one winning shape with no sets.'],
  [/^All Chows/, 'Every set is a run, like four straights and a pair.'],
  [/^All Pungs/, 'Every set is three of a kind, like a hand made only of trips.'],
  [/Dragon pung/, 'Three matching dragons always score.'],
  [/^Seat wind/, 'Three of the wind on the winner\'s own plaque.'],
  [/^Round wind/, 'Three of the wind on the round marker in the middle of the table.'],
  [/Kong/, 'Four of a kind, like quads in poker. One fan each.'],
  [/^Own flower|^Own season/, 'A bonus tile whose number matches the winner\'s seat.'],
  [/^All Honors/, 'Only winds and dragons. The rarest hand in this game.'],
  [/^Full Flush/, 'One suit and nothing else, like a flush with no exceptions.'],
  [/^Half Flush/, 'One suit plus honors, a flush with a few face cards allowed.'],
  [/^Last tile/, 'Won on the final tile of the wall.'],
  [/^Win on a Kong/, 'Won on the extra tile drawn after declaring a Kong.']
];
const explainItem = name => (EXPLAIN.find(e => e[0].test(name)) || [0, ''])[1];
