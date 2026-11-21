/* =========================================================
   TILE FACES. Each face is drawn once, as SVG in a 200 x 266 box
   (the tile's face is 1 x 1.33), then rasterised into the texture atlas.
   Inks: vermilion, green, indigo, black. Ivory ground.
   ========================================================= */
const INK = { r:'#B3261E', g:'#1E6B3A', b:'#1F3A6B', k:'#1A1A1A' };
const IVORY = '#EFE6D2';
const hex2 = h => [1,3,5].map(i => parseInt(h.substr(i, 2), 16));
const rgb = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixC = (a, b, t) => { const x = hex2(a), y = hex2(b); return rgb(x.map((v, i) => v + (y[i] - v) * t)); };
const dark = (c, t) => mixC(c, '#000000', t);
const f1 = v => +v.toFixed(2);

/* ---------- drawing helpers ---------- */
function bez(p0, p1, p2, p3, n = 18){
  const out = [];
  for (let i = 0; i <= n; i++){
    const t = i / n, u = 1 - t;
    out.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]);
  }
  return out;
}
// a brush stroke: a filled outline around a polyline, width w0 at the start to w1 at the end
function taper(pts, w0, w1, fill, extra = ''){
  const L = [], R = [], n = pts.length;
  for (let i = 0; i < n; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const t = i / (n - 1), w = (w0 + (w1 - w0) * t) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const P = L.concat(R.reverse());
  return `<path d="M${P.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L')}Z" fill="${fill}" ${extra}/>`;
}
// lens-shaped leaf or petal from (x,y) pointing at angle a (deg)
function leaf(x, y, len, wid, a, fill, stroke = INK.k, sw = 1.3, rib = true){
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})"><path d="M0 0Q${f1(len*.42)} ${f1(-wid)} ${f1(len)} 0Q${f1(len*.42)} ${f1(wid)} 0 0Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    (rib ? `<path d="M${f1(len*.08)} 0Q${f1(len*.5)} ${f1(-wid*.12)} ${f1(len*.86)} 0" fill="none" stroke="${stroke}" stroke-width="${sw*.6}" stroke-linecap="round"/>` : '') + `</g>`;
}
function circ(x, y, r, fill, extra = ''){ return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" ${extra}/>`; }

/* ---------- Dots: every circle is a medallion ---------- */
function medal(cx, cy, r, c){
  const C = INK[c], acc = c === 'r' ? INK.b : INK.r;
  let s = circ(cx, cy, r, C) + circ(cx, cy, r * .81, IVORY);
  for (let k = 0; k < 12; k++){ const a = k * Math.PI / 6; s += circ(cx + Math.cos(a) * r * .67, cy + Math.sin(a) * r * .67, r * .09, C); }
  s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r*.53)}" fill="none" stroke="${C}" stroke-width="${f1(r*.085)}"/>`;
  s += circ(cx, cy, r * .38, C);
  for (let k = 0; k < 4; k++) s += `<ellipse cx="${f1(cx)}" cy="${f1(cy - r*.17)}" rx="${f1(r*.075)}" ry="${f1(r*.15)}" fill="${IVORY}" transform="rotate(${k*90 + 45} ${f1(cx)} ${f1(cy)})"/>`;
  s += circ(cx, cy, r * .075, acc);
  return s;
}
function bigDot(){
  const cx = 100, cy = 133;
  let s = '';
  // scalloped outer rim
  for (let k = 0; k < 20; k++){ const a = k * Math.PI / 10; s += circ(cx + Math.cos(a) * 76, cy + Math.sin(a) * 76, 9.5, INK.g); }
  s += circ(cx, cy, 76, INK.g) + circ(cx, cy, 70, IVORY);
  s += `<circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="${INK.b}" stroke-width="3.2"/>`;
  // a ring of sixteen petals
  for (let k = 0; k < 16; k++){ const a = k * 22.5; s += `<g transform="rotate(${a} ${cx} ${cy})"><path d="M${cx} ${cy-63}Q${cx+9} ${cy-50} ${cx} ${cy-38}Q${cx-9} ${cy-50} ${cx} ${cy-63}Z" fill="${k % 2 ? INK.b : INK.g}"/></g>`; }
  s += circ(cx, cy, 36, INK.r) + circ(cx, cy, 31, IVORY);
  for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4 + Math.PI / 8; s += circ(cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, 3.1, INK.r); }
  s += circ(cx, cy, 19, INK.b);
  for (let k = 0; k < 8; k++) s += `<path d="M${cx} ${cy-16}L${cx+3.4} ${cy-6}L${cx-3.4} ${cy-6}Z" fill="${IVORY}" transform="rotate(${k*45} ${cx} ${cy})"/>`;
  s += circ(cx, cy, 5.5, INK.r) + circ(cx, cy, 2, IVORY);
  for (let k = 0; k < 20; k++){ const a = k * Math.PI / 10 + Math.PI / 20; s += circ(cx + Math.cos(a) * 73, cy + Math.sin(a) * 73, 1.6, IVORY); }
  return s;
}
const DOTS = {
  2:{ r:44, p:[[100,76,'g'],[100,190,'b']] },
  3:{ r:33, p:[[52,60,'b'],[100,133,'r'],[148,206,'g']] },
  4:{ r:36, p:[[58,80,'b'],[142,80,'g'],[58,186,'g'],[142,186,'b']] },
  5:{ r:30, p:[[50,60,'b'],[150,60,'g'],[100,133,'r'],[50,206,'g'],[150,206,'b']] },
  6:{ r:29, p:[[62,50,'g'],[138,50,'g'],[62,140,'r'],[138,140,'r'],[62,212,'r'],[138,212,'r']] },
  7:{ r:25, p:[[42,36,'g'],[100,62,'g'],[158,88,'g'],[64,160,'r'],[136,160,'r'],[64,220,'r'],[136,220,'r']] },
  8:{ r:26, p:[[62,42,'b'],[138,42,'b'],[62,102,'b'],[138,102,'b'],[62,164,'b'],[138,164,'b'],[62,224,'b'],[138,224,'b']] },
  9:{ r:25, p:[[46,58,'b'],[100,58,'b'],[154,58,'b'],[46,133,'r'],[100,133,'r'],[154,133,'r'],[46,208,'g'],[100,208,'g'],[154,208,'g']] }
};

/* ---------- Bamboo: jointed, slightly tapered stalks ---------- */
function stalk(cx, cy, h, c, ang = 0){
  const C = INK[c], dk = dark(C, .38), lt = mixC(C, IVORY, .55);
  const w0 = 7 + h * .095, w1 = w0 * .82, top = cy - h / 2, segs = 3, sh = h / segs;
  let s = `<g transform="rotate(${ang} ${cx} ${cy})">`;
  for (let i = 0; i < segs; i++){
    const yb = cy + h / 2 - i * sh, yt = yb - sh;
    const wb = (w0 + (w1 - w0) * (i / segs)) / 2, wt = (w0 + (w1 - w0) * ((i + 1) / segs)) / 2, pinch = .7;
    s += `<path d="M${f1(cx-wt)} ${f1(yt)}Q${f1(cx-(wt+wb)/2+pinch)} ${f1((yt+yb)/2)} ${f1(cx-wb)} ${f1(yb)}L${f1(cx+wb)} ${f1(yb)}Q${f1(cx+(wt+wb)/2-pinch)} ${f1((yt+yb)/2)} ${f1(cx+wt)} ${f1(yt)}Z" fill="${C}"/>`;
    s += `<path d="M${f1(cx+wt*.35)} ${f1(yt+1)}Q${f1(cx+(wt+wb)/4)} ${f1((yt+yb)/2)} ${f1(cx+wb*.35)} ${f1(yb-1)}L${f1(cx+wb)} ${f1(yb-1)}Q${f1(cx+(wt+wb)/2-pinch)} ${f1((yt+yb)/2)} ${f1(cx+wt)} ${f1(yt+1)}Z" fill="${dk}" opacity=".55"/>`;
    s += `<path d="M${f1(cx-wt*.45)} ${f1(yt+3.2)}Q${f1(cx-(wt+wb)/4-.4)} ${f1((yt+yb)/2)} ${f1(cx-wb*.45)} ${f1(yb-3.2)}" stroke="${lt}" stroke-width="${f1(Math.max(1.2, wb*.32))}" stroke-linecap="round" fill="none" opacity=".85"/>`;
  }
  for (let i = 0; i <= segs; i++){
    const y = cy + h / 2 - i * sh, w = (w0 + (w1 - w0) * (i / segs)) / 2 + 1.6;
    s += `<rect x="${f1(cx-w)}" y="${f1(y-2)}" width="${f1(w*2)}" height="4" rx="2" fill="${dk}"/>`;
    if (i > 0 && i < segs) s += `<path d="M${f1(cx-w+1.5)} ${f1(y-3.3)}H${f1(cx+w-1.5)}" stroke="${lt}" stroke-width="1" opacity=".7"/>`;
  }
  return s + `</g>`;
}
const BAM = { // [cx, cy, height, ink, angle]
  2:[[100,78,96,'b'],[100,190,96,'g']],
  3:[[100,76,94,'b'],[64,192,94,'g'],[136,192,94,'g']],
  4:[[62,78,96,'b'],[138,78,96,'g'],[62,190,96,'g'],[138,190,96,'b']],
  5:[[46,72,92,'g'],[154,72,92,'b'],[100,133,92,'r'],[46,194,92,'b'],[154,194,92,'g']],
  6:[[48,78,96,'g'],[100,78,96,'g'],[152,78,96,'g'],[48,190,96,'b'],[100,190,96,'b'],[152,190,96,'b']],
  7:[[100,50,66,'r'],[48,134,66,'g'],[100,134,66,'g'],[152,134,66,'g'],[48,214,66,'b'],[100,214,66,'b'],[152,214,66,'b']],
  8:[[34,78,94,'g'],[78,78,94,'g',-20],[122,78,94,'g',20],[166,78,94,'g'],[34,190,94,'b'],[78,190,94,'b',20],[122,190,94,'b',-20],[166,190,94,'b']],
  9:[[48,54,68,'b'],[100,54,68,'r'],[152,54,68,'g'],[48,133,68,'b'],[100,133,68,'r'],[152,133,68,'g'],[48,212,68,'b'],[100,212,68,'r'],[152,212,68,'g']]
};

/* ---------- 1 Bamboo: a bird on a bamboo branch, layered feathers ---------- */
function bird(){
  const K = INK.k, G = INK.g, B = INK.b, R = INK.r, gl = mixC(G, IVORY, .45), bl = mixC(B, IVORY, .5);
  let s = '';
  // the branch: a jointed stalk running across the bottom, with two leaves
  const br = bez([14,236],[60,226],[120,214],[188,206], 24);
  s += taper(br, 15, 11, G, `stroke="${dark(G,.35)}" stroke-width="1.2"`);
  for (const t of [.27, .62]){ const i = Math.round(t * 24), p = br[i]; s += `<path d="M${f1(p[0]-1.5)} ${f1(p[1]-8)}l3 16" stroke="${dark(G,.45)}" stroke-width="3.4" stroke-linecap="round"/>`; }
  s += taper(br.slice(2, 22).map(p => [p[0], p[1] - 3.5]), 1.6, 1.2, gl, 'opacity=".9"');
  s += leaf(150, 210, 44, 8.5, 28, G) + leaf(162, 208, 36, 7, 58, mixC(G, B, .3));
  s += `<g transform="translate(4 26)">`;
  // the tail: five long feathers fanning down to the right, each with an eye
  const tail = [[116,150,22],[119,152,32],[121,154,42],[122,156,52],[122,158,62]];
  tail.forEach(([x, y, a], i) => {
    const len = 74 - i * 3;
    s += `<g transform="translate(${x} ${y}) rotate(${a})">` +
      `<path d="M0 0Q${len*.5} -10 ${len} 0Q${len*.5} 10 0 0Z" fill="${i % 2 ? G : B}" stroke="${K}" stroke-width="1.2"/>` +
      `<path d="M4 0Q${len*.5} -4.5 ${len-6} 0Q${len*.5} 4.5 4 0Z" fill="${i % 2 ? gl : bl}"/>` +
      Array.from({length:6}, (_, j) => `<path d="M${10 + j*8} 0l5 -6M${10 + j*8} 0l5 6" stroke="${K}" stroke-width=".6" opacity=".6"/>`).join('') +
      `<path d="M2 0L${len-3} 0" stroke="${K}" stroke-width=".8"/>` +
      `<ellipse cx="${len-11}" cy="0" rx="6" ry="5" fill="${R}" stroke="${K}" stroke-width=".9"/><ellipse cx="${len-11}" cy="0" rx="3" ry="2.5" fill="${B}"/><circle cx="${len-11}" cy="0" r="1" fill="${IVORY}"/>` +
      `</g>`;
  });
  // legs, short, gripping the branch
  s += `<path d="M86 156L84 182M100 158L101 178" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`;
  s += `<path d="M84 182l-7 2M84 182l6 4M101 178l-7 3M101 178l7 3" stroke="${K}" stroke-width="1.8" stroke-linecap="round"/>`;
  // body: slimmer, leaning forward, covered in small scale feathers
  s += `<path d="M50 112C54 92 76 84 100 90C126 96 140 120 132 144C124 162 102 166 84 160C62 154 46 134 50 112Z" fill="${G}" stroke="${K}" stroke-width="1.6"/>`;
  s += `<clipPath id="bb"><path d="M50 112C54 92 76 84 100 90C126 96 140 120 132 144C124 162 102 166 84 160C62 154 46 134 50 112Z"/></clipPath><g clip-path="url(#bb)">`;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 10; c++){ const x = 54 + c * 9 + (r % 2) * 4.5, y = 94 + r * 8; s += `<path d="M${x-4} ${y}q4 5 8 0" stroke="${dark(G,.45)}" stroke-width=".9" fill="none"/>`; }
  s += `</g>`;
  // red breast with fine scale marks
  s += `<path d="M52 116C54 136 64 152 82 159C74 146 70 130 74 112C66 106 58 108 52 116Z" fill="${R}" stroke="${K}" stroke-width="1.2"/>`;
  for (let k = 0; k < 5; k++) s += `<path d="M${59 + k*3} ${120 + k*8}q4 3 8 0" stroke="${dark(R,.45)}" stroke-width="1" fill="none"/>`;
  // wing: three rows of overlapping feathers
  const row = (n, x0, y0, x1, y1, len, wid, fill, rot) => { let o = ''; for (let k = 0; k < n; k++){ const t = k / (n - 1); o += leaf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, len, wid, rot + t * 14, fill, K, 1.1, false); } return o; };
  s += row(5, 92, 126, 118, 118, 40, 7, B, 34);
  s += row(5, 86, 114, 118, 104, 30, 6, mixC(B, G, .5), 28);
  s += row(6, 80, 102, 116, 94, 20, 5, gl, 22);
  for (let k = 0; k < 6; k++) s += `<path d="M${84 + k*6} ${96 - k*1.2}q3 -3 6 0" stroke="${K}" stroke-width=".9" fill="none"/>`;
  // head, crest, eye and beak
  s += `<path d="M58 76l-6 -18M63 74l2 -20M68 77l9 -16" stroke="${K}" stroke-width="1.3" stroke-linecap="round"/>`;
  s += circ(52, 57, 3, R, `stroke="${K}" stroke-width="1"`) + circ(65, 53, 3, R, `stroke="${K}" stroke-width="1"`) + circ(77, 60, 3, R, `stroke="${K}" stroke-width="1"`);
  s += `<path d="M42 90C42 76 52 68 64 70C76 72 82 82 79 93C76 103 65 107 56 104C48 101 42 97 42 90Z" fill="${B}" stroke="${K}" stroke-width="1.6"/>`;
  for (let k = 0; k < 4; k++) s += `<path d="M${54 + k*6} ${96 + (k%2)*2}q3 2 6 0" stroke="${bl}" stroke-width="1" fill="none"/>`;
  s += circ(57, 84, 5.6, IVORY, `stroke="${K}" stroke-width="1.2"`) + circ(57, 84, 3.3, R) + circ(57, 84, 1.8, K) + circ(56.3, 83.3, .7, IVORY);
  s += `<path d="M43 86L26 90L43 94Z" fill="#C8902E" stroke="${K}" stroke-width="1.3" stroke-linejoin="round"/><path d="M28 90H42" stroke="${K}" stroke-width=".9"/>`;
  s += `</g>`;
  return s;
}

/* ---------- Flowers and seasons: woodblock line pictures ---------- */
function blossom(x, y, r, fill = INK.r){
  let s = '';
  for (let k = 0; k < 5; k++){ const a = k * Math.PI * 2 / 5 - Math.PI / 2; s += circ(x + Math.cos(a) * r * .52, y + Math.sin(a) * r * .52, r * .5, fill, `stroke="${INK.k}" stroke-width="1.2"`); }
  s += circ(x, y, r * .3, IVORY, `stroke="${INK.k}" stroke-width=".9"`);
  for (let k = 0; k < 7; k++){ const a = k * Math.PI * 2 / 7; s += `<path d="M${f1(x)} ${f1(y)}L${f1(x + Math.cos(a) * r * .55)} ${f1(y + Math.sin(a) * r * .55)}" stroke="${INK.k}" stroke-width=".8"/>` + circ(x + Math.cos(a) * r * .58, y + Math.sin(a) * r * .58, 1.1, '#C8902E'); }
  return s;
}
function bonusArt(t){
  const k = t - 34, flower = k < 4, n = k % 4 + 1, ink = flower ? INK.r : INK.b;
  const K = INK.k, G = INK.g, B = INK.b, R = INK.r;
  const name = ['梅','蘭','菊','竹','春','夏','秋','冬'][k];
  let s = `<text x="30" y="52" font-size="40" fill="${ink}" text-anchor="middle" font-family="TWserif" font-weight="600">${n}</text>` +
    `<text x="168" y="54" font-size="40" fill="${ink}" text-anchor="middle" font-family="TWbrush">${name}</text>`;
  if (k === 0){ // plum: a gnarled branch in flower
    s += taper(bez([22,250],[44,212],[48,170],[92,140]), 13, 6, K);
    s += taper(bez([90,142],[118,124],[140,104],[176,92]), 7, 2.6, K);
    s += taper(bez([60,190],[92,186],[120,196],[150,182]), 6, 2.2, K);
    s += taper(bez([92,140],[94,118],[86,98],[96,78]), 5, 2, K);
    s += blossom(98, 80, 19) + blossom(142, 108, 21) + blossom(168, 90, 15) + blossom(120, 192, 18) + blossom(58, 160, 17) + blossom(152, 182, 13);
    s += circ(176, 80, 4.5, R, `stroke="${K}" stroke-width="1"`) + circ(80, 120, 4, R, `stroke="${K}" stroke-width="1"`) + circ(38, 212, 4, R, `stroke="${K}" stroke-width="1"`);
  } else if (k === 1){ // orchid: arching leaves and two flowers
    s += taper(bez([96,252],[70,200],[40,150],[18,118]), 6, 1, G);
    s += taper(bez([100,252],[118,190],[150,150],[184,140]), 6, 1, G);
    s += taper(bez([98,252],[96,200],[78,160],[86,110]), 5, 1, G);
    s += taper(bez([102,252],[130,214],[146,206],[170,214]), 5, 1, mixC(G, K, .3));
    s += taper(bez([100,250],[106,210],[112,170],[118,130]), 2.2, 1.4, K);
    const orchid = (x, y, sc, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">` +
      [-70, -10, 50, 130, 200].map((a, i) => leaf(0, 0, i === 4 ? 16 : 26, i === 4 ? 6 : 8, a, i === 4 ? R : B, K, 1.2, false)).join('') +
      circ(0, 0, 4, IVORY, `stroke="${K}" stroke-width="1"`) + circ(2, 6, 2.4, R) + `</g>`;
    s += orchid(118, 120, 1.15, 10) + orchid(140, 168, .9, -20);
  } else if (k === 2){ // chrysanthemum
    s += taper(bez([100,252],[98,220],[104,190],[100,150]), 5, 3, G);
    s += leaf(98, 214, 44, 13, 200, G) + leaf(102, 196, 46, 13, -18, G) + leaf(100, 236, 34, 10, -30, mixC(G, K, .25));
    const cx = 100, cy = 120;
    for (let ring = 0; ring < 3; ring++){
      const n2 = 18 - ring * 4, L = 46 - ring * 12, W = 7 - ring;
      for (let i = 0; i < n2; i++) s += leaf(cx, cy, L, W, i * 360 / n2 + ring * 9, ring === 1 ? mixC(R, IVORY, .25) : R, K, 1, false);
    }
    s += circ(cx, cy, 9, '#C8902E', `stroke="${K}" stroke-width="1"`);
    for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4; s += circ(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 1.3, K); }
  } else if (k === 3){ // bamboo: two thin stalks and leaf clusters
    const thin = (x0, x1, c) => { let o = taper([[x0,252],[x1,72]], 9, 6.5, c, `stroke="${dark(c,.35)}" stroke-width="1"`); for (let y = 228; y > 80; y -= 38){ const x = x0 + (x1 - x0) * (252 - y) / 180; o += `<path d="M${f1(x-5)} ${y}h10" stroke="${dark(c,.5)}" stroke-width="2.4" stroke-linecap="round"/>`; } return o; };
    s += thin(80, 92, G) + thin(124, 118, mixC(G, B, .25));
    const cluster = (x, y, a) => [0, 1, 2, 3].map(i => leaf(x, y, 46 - i * 5, 6.5, a + i * 18 - 20, i % 2 ? G : mixC(G, K, .3))).join('');
    s += cluster(90, 112, 190) + cluster(120, 92, -20) + cluster(118, 168, 10) + cluster(86, 196, 170);
  } else if (k === 4){ // spring: willow strands, a swallow, the sun
    s += circ(144, 92, 20, R);
    s += taper(bez([20,64],[60,70],[90,66],[120,70]), 5, 2, K);
    for (let i = 0; i < 6; i++){ const x = 30 + i * 16; s += taper(bez([x,68],[x - 4,120],[x + 6,170],[x - 2,212 - i * 6]), 1.8, .8, G); for (let j = 0; j < 4; j++) s += leaf(x - 1 + (j % 2 ? 4 : -2), 96 + j * 28, 12, 3, 100 + (j % 2 ? -30 : 30), G, G, .5, false); }
    s += `<path d="M116 170C130 160 142 160 152 166C162 156 176 152 188 154C176 158 166 166 160 176C170 182 176 192 178 204C168 192 158 186 148 184C138 190 126 188 116 180C124 178 130 176 134 172C128 172 122 172 116 170Z" fill="${B}" stroke="${K}" stroke-width="1.3" stroke-linejoin="round"/>`;
    s += circ(140, 172, 1.6, IVORY) + `<path d="M146 178q4 4 9 3" stroke="${R}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M24 240C60 232 100 236 176 230" stroke="${K}" stroke-width="1.6" fill="none"/><path d="M60 250C90 244 130 246 170 242" stroke="${K}" stroke-width="1" fill="none"/>`;
  } else if (k === 5){ // summer: lotus over water
    s += `<path d="M18 206C50 186 150 186 184 206C150 222 50 222 18 206Z" fill="${G}" stroke="${K}" stroke-width="1.4"/>`;
    for (let i = 0; i < 9; i++) s += `<path d="M100 206L${f1(100 + Math.cos(Math.PI + i * Math.PI / 8) * 78)} ${f1(206 + Math.sin(Math.PI + i * Math.PI / 8) * 14)}" stroke="${dark(G,.4)}" stroke-width="1"/>`;
    s += taper(bez([100,200],[98,180],[102,170],[100,150]), 4, 3, mixC(G, K, .3));
    const pet = (a, L, W, fill) => leaf(100, 150, L, W, a, fill, K, 1.3, false);
    s += pet(-150, 52, 16, mixC(R, IVORY, .35)) + pet(-30, 52, 16, mixC(R, IVORY, .35)) + pet(-125, 58, 17, R) + pet(-55, 58, 17, R) + pet(-90, 62, 18, R);
    for (let i = 0; i < 5; i++) s += `<path d="M${f1(100 + Math.cos((-90 + (i-2)*25) * Math.PI/180) * 14)} ${f1(150 + Math.sin((-90 + (i-2)*25) * Math.PI/180) * 14)}L${f1(100 + Math.cos((-90 + (i-2)*25) * Math.PI/180) * 46)} ${f1(150 + Math.sin((-90 + (i-2)*25) * Math.PI/180) * 46)}" stroke="${dark(R,.4)}" stroke-width=".8"/>`;
    s += `<path d="M14 232C40 226 70 238 100 232S160 226 188 234M30 248C60 242 90 252 120 246S170 242 186 248" stroke="${B}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  } else if (k === 6){ // autumn: maple leaves under a full moon
    s += `<circle cx="132" cy="106" r="34" fill="none" stroke="${K}" stroke-width="1.6"/>`;
    s += taper(bez([20,246],[60,210],[90,190],[150,170]), 6, 2, K);
    s += taper(bez([84,196],[96,172],[90,150],[104,132]), 3.6, 1.4, K);
    const maple = (x, y, sc, rot, fill) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M0 -30L6 -14L16 -20L13 -6L28 -9L20 2L27 8L10 10L12 22L0 14L-12 22L-10 10L-27 8L-20 2L-28 -9L-13 -6L-16 -20L-6 -14Z" fill="${fill}" stroke="${K}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 -24V24M0 4L18 -6M0 4L-18 -6" stroke="${dark(fill,.45)}" stroke-width="1" fill="none"/></g>`;
    s += maple(106, 124, 1.05, -10, R) + maple(152, 168, .9, 20, mixC(R, '#C8902E', .35)) + maple(60, 200, .75, -30, R);
    s += `<path d="M40 150l-6 10M150 222l5 9" stroke="${K}" stroke-width="1.4" stroke-linecap="round"/>`;
  } else { // winter: a snowy pine bough
    s += taper(bez([18,226],[70,200],[120,170],[186,150]), 9, 3, K);
    s += taper(bez([80,196],[96,160],[90,130],[110,100]), 5, 2, K);
    const needles = (x, y, a) => { let o = ''; for (let i = 0; i < 9; i++){ const aa = (a - 60 + i * 15) * Math.PI / 180; o += `<path d="M${x} ${y}L${f1(x + Math.cos(aa) * 26)} ${f1(y + Math.sin(aa) * 26)}" stroke="${G}" stroke-width="2.2" stroke-linecap="round"/>`; } return o + circ(x, y, 2.6, K); };
    s += needles(108, 100, -90) + needles(140, 160, -80) + needles(60, 208, -100) + needles(164, 146, -50) + needles(96, 150, -130);
    s += `<path d="M50 196C66 186 86 184 104 186C90 192 70 196 50 196Z" fill="${IVORY}" stroke="${K}" stroke-width="1.1"/><path d="M118 168C134 160 150 158 166 158C152 164 136 168 118 168Z" fill="${IVORY}" stroke="${K}" stroke-width="1.1"/>`;
    const flake = (x, y, r) => `<g stroke="${B}" stroke-width="1.6" stroke-linecap="round">` + [0, 60, 120].map(a => `<g transform="rotate(${a} ${x} ${y})"><path d="M${x} ${y - r}V${y + r}M${x} ${y - r*.6}l-${r*.25} -${r*.25}M${x} ${y - r*.6}l${r*.25} -${r*.25}M${x} ${y + r*.6}l-${r*.25} ${r*.25}M${x} ${y + r*.6}l${r*.25} ${r*.25}"/></g>`).join('') + `</g>`;
    s += flake(48, 108, 14) + flake(164, 216, 11) + flake(150, 92, 8);
  }
  return s;
}

/* ---------- the faces ---------- */
const HAN_NUM_F = ['一','二','三','四','五','六','七','八','九'];
const WIND_F = ['東','南','西','北'];
function brush(ch, x, y, size, col){ return `<text x="${x}" y="${y}" font-size="${size}" fill="${col}" text-anchor="middle" font-family="TWbrush">${ch}</text>`; }
function faceArt(t){
  if (t < 9){
    const y1 = [118, 120, 122, 124, 124, 124, 124, 120, 124][t];
    return brush(HAN_NUM_F[t], 100, y1, t === 0 ? 132 : 118, INK.k) + brush('萬', 100, 246, 126, INK.r);
  }
  if (t < 18){
    const n = t % 9 + 1;
    if (n === 1) return bigDot();
    const d = DOTS[n]; return d.p.map(([x, y, c]) => medal(x, y, d.r, c)).join('');
  }
  if (t < 27){
    const n = t % 9 + 1;
    if (n === 1) return bird();
    return BAM[n].map(([x, y, h, c, a]) => stalk(x, y, h, c, a || 0)).join('');
  }
  if (t < 31) return brush(WIND_F[t - 27], 100, 196, 176, INK.k);
  if (t === 31) return brush('中', 100, 200, 188, INK.r);
  if (t === 32) return brush('發', 100, 198, 180, INK.g);
  if (t === 33) return `<rect x="26" y="26" width="148" height="214" rx="8" fill="none" stroke="${INK.b}" stroke-width="10"/><rect x="42" y="42" width="116" height="182" rx="3" fill="none" stroke="${INK.b}" stroke-width="3.5"/>` +
    [[42,42],[158,42],[42,224],[158,224]].map(([x, y]) => `<rect x="${x-5}" y="${y-5}" width="10" height="10" fill="${INK.b}" transform="rotate(45 ${x} ${y})"/>`).join('');
  return bonusArt(t);
}
// fontCSS: @font-face rules with data URIs, so the SVG can be rasterised as an image with the real lettering
function faceSVG(t, fontCSS = '', bg = true){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 266" width="200" height="266">` +
    (fontCSS ? `<style>${fontCSS}</style>` : '') +
    (bg ? `<rect width="200" height="266" fill="${IVORY}"/>` : '') + faceArt(t) + `</svg>`;
}
