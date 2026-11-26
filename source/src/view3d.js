/* =========================================================
   THE TABLE, IN 3D. Game state never lives here: sync() reads S and
   moves objects toward where the rules say they are, on springs.
   Main scene: the table, wall, discards, opponents, melds.
   Hand scene: your tiles on a wooden rack, drawn over the bottom strip.
   ========================================================= */
const V = (() => {
const T3 = window.THREE;
const TW = 1, TL = 1.33, TH = 0.7, DEG = Math.PI / 180;
const K_SPRING = 300, C_DAMP = 26;
let renderer = null, canvas = null, W = 1, H = 1, handH = 0, stripH = 0, rows = 1, ok = false, mode = 'none';
let slowUntil = 0, tier = 1, lowStep = 0, qN = 0, qSum = 0, qSkip = 40, pxCap = 2, theme = null;
const par = { x: 0, z: 0, tx: 0, tz: 0 };
let cos = { back: null, lamp: null, tint: 0xffffff, light: false }, settle = 0, settleV = 0, flick = 0;
let running = false, lastT = 0, needFrame = false;
let booting = true, hurryUntil = 0, expo = 1, expoT = 1, expoK = 1.6, dip = 0, dipT = 0, dipCb = null, rackY = 0, camInit = false, flipF = -1, flipWind = null;
const discT = new T3.Vector3(); let discSet = false;
const prof = { on: false, label: '', sync: false, frames: [] };
const scene = new T3.Scene(), hscene = new T3.Scene();
const cam = new T3.PerspectiveCamera(28, 1, 1, 600), hcam = new T3.PerspectiveCamera(22, 1, .5, 400);
const tmpV = new T3.Vector3(), tmpV2 = new T3.Vector3(), tmpQ = new T3.Quaternion(), tmpQ2 = new T3.Quaternion(), tmpE = new T3.Euler(0, 0, 0, 'YXZ');
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const STILL_ORDER = [...Array(144).keys()].sort((a, b) => rand(a + 7) - rand(b + 7));

/* ---------- geometry ---------- */
function roundedBox(w, h, d, seg, r){
  seg = seg * 2 + 1; r = Math.min(w / 2, h / 2, d / 2, r);
  const g = new T3.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
  const box = new T3.Vector3(w, h, d).divideScalar(2).subScalar(r);
  const p = new T3.Vector3(), n = new T3.Vector3(), half = .5 / seg;
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2){
    p.fromArray(pos, i); n.copy(p);
    n.x -= Math.sign(n.x) * half; n.y -= Math.sign(n.y) * half; n.z -= Math.sign(n.z) * half; n.normalize();
    pos[i] = box.x * Math.sign(p.x) + n.x * r; pos[i + 1] = box.y * Math.sign(p.y) + n.y * r; pos[i + 2] = box.z * Math.sign(p.z) + n.z * r;
    nor[i] = n.x; nor[i + 1] = n.y; nor[i + 2] = n.z;
    // world-ish UVs so wood grain runs along the long axis
    uv[j] = pos[i] * .18 + pos[i + 1] * .05; uv[j + 1] = pos[i + 2] * .18 + pos[i + 1] * .3;
  }
  return g;
}
function merge(geos){
  let count = 0; for (const g of geos) count += g.attributes.position.count;
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3), U = new Float32Array(count * 2);
  const out = new T3.BufferGeometry(); let o = 0;
  geos.forEach((g, i) => {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
    out.addGroup(o, c, i); o += c;
  });
  out.setAttribute('position', new T3.BufferAttribute(P, 3)); out.setAttribute('normal', new T3.BufferAttribute(N, 3)); out.setAttribute('uv', new T3.BufferAttribute(U, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const IVORY_H = TH * .6, JADE_H = TH - IVORY_H, SEAM_Y = TH / 2 - IVORY_H;
let bodyGeo, rimGeo, faceGeos = [], shadowGeo;

/* ---------- textures made in canvas ---------- */
function canvasTex(w, h, draw, srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T3.CanvasTexture(c); if (srgb) t.colorSpace = T3.SRGBColorSpace;
  t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function heightToNormal(ctx, w, h, field, strength){
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = y * w + x, l = field[y * w + (x + w - 1) % w], r = field[y * w + (x + 1) % w], u = field[((y + h - 1) % h) * w + x], dn = field[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    d[i * 4] = (nx * .5 + .5) * 255; d[i * 4 + 1] = (ny * .5 + .5) * 255; d[i * 4 + 2] = (nz * .5 + .5) * 255; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function feltNormal(){
  return canvasTex(512, 512, (ctx, w, h) => {
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = Math.random();
    // a little blur, then fibres: short streaks in random directions
    for (let pass = 0; pass < 2; pass++){ const g = f.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let s = 0; for (let k = -1; k <= 1; k++) s += g[y * w + (x + k + w) % w] + g[((y + k + h) % h) * w + x]; f[y * w + x] = s / 6; } }
    for (let n = 0; n < 9000; n++){ const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, L = 3 + Math.random() * 6; for (let s = 0; s < L; s++){ const xi = Math.floor(x + Math.cos(a) * s + w) % w, yi = Math.floor(y + Math.sin(a) * s + h) % h; f[yi * w + xi] += .35; } }
    heightToNormal(ctx, w, h, f, 2.2);
  }, false);
}
function feltColor(){
  // fine fibre noise, plus slow patches where the nap has been brushed one way or the other
  return canvasTex(1024, 1024, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data, N = 14, lo = new Float32Array((N + 1) * (N + 1));
    for (let i = 0; i < lo.length; i++) lo[i] = Math.random();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const gx = x / w * N, gy = y / h * N, x0 = Math.floor(gx), y0 = Math.floor(gy); let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = lo[y0 * (N + 1) + x0], b = lo[y0 * (N + 1) + x0 + 1], c = lo[(y0 + 1) * (N + 1) + x0], e = lo[(y0 + 1) * (N + 1) + x0 + 1];
      const patch = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
      const v = 214 + patch * 24 + Math.random() * 17, i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
function scratchTex(){
  // roughness only: hairline scratches and handling wear that show up in the highlight and nowhere else
  return canvasTex(512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let i = 0; i < w * h; i++){ const v = 226 + Math.random() * 22; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    for (let n = 0; n < 260; n++){
      const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28, L = 12 + Math.random() * 70, v = Math.random() < .5 ? 255 : 170 + Math.random() * 40;
      ctx.strokeStyle = `rgba(${v},${v},${v},${.25 + Math.random() * .45})`; ctx.lineWidth = .5 + Math.random() * .7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * .5 + (Math.random() - .5) * 8, y + Math.sin(a) * L * .5 + (Math.random() - .5) * 8, x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
    }
  }, false);
}
function woodTex(base = [64, 38, 22]){
  return canvasTex(1024, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data;
    const ph = Array.from({ length: 6 }, () => Math.random() * 6.28);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const warp = Math.sin(x * .004 + ph[0]) * 18 + Math.sin(x * .013 + ph[1]) * 5 + Math.sin(x * .0011 + y * .01 + ph[2]) * 9;
      const g = Math.sin((y + warp) * .16 + Math.sin(x * .002 + ph[3]) * 2);
      const ring = Math.pow(Math.abs(g), 8), fleck = Math.random() * .06;
      const f = .86 + .12 * Math.sin((y + warp * .5) * .045 + ph[4]) - ring * .2 - fleck;
      const i = (y * w + x) * 4; d[i] = base[0] * f * 1.25; d[i + 1] = base[1] * f * 1.25; d[i + 2] = base[2] * f * 1.25; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
function shadowTex(){
  // contact shadow: a wide soft falloff, and a tight dark line right where the tile meets the felt
  return canvasTex(256, 256, (ctx, w, h) => {
    const box = (x, y, bw, bh, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, bw, bh, r) : ctx.rect(x, y, bw, bh); ctx.fill(); };
    ctx.filter = 'blur(20px)'; ctx.fillStyle = 'rgba(0,0,0,.62)'; box(58, 50, 140, 156, 18);
    ctx.filter = 'blur(6px)'; ctx.fillStyle = 'rgba(0,0,0,.6)'; box(55, 47, 146, 162, 12);
  }, false);
}

/* ---------- the face atlas: 42 faces drawn once, plus a carving map ---------- */
let atlasTex, bumpTex, CW = 512, CH = 680, COLS = 8, AW, AH;
async function buildAtlas(){
  const small = Math.min(innerWidth, innerHeight) < 560 || renderer.capabilities.maxTextureSize < 4096;
  if (small){ CW = 256; CH = 340; }
  else if (tier === 2 && renderer.capabilities.maxTextureSize >= 8192){ CW = 768; CH = 1020; }
  AW = CW * COLS; AH = CH * 6;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d'); g.fillStyle = IVORY; g.fillRect(0, 0, AW, AH);
  // all 42 faces in one SVG, so the lettering fonts are read once rather than 42 times (this was most of the load time)
  const cellsF = [];
  for (let t = 0; t < 42; t++) cellsF.push(`<svg x="${(t % COLS) * CW}" y="${Math.floor(t / COLS) * CH}" width="${CW}" height="${CH}" viewBox="0 0 200 266" preserveAspectRatio="none"><rect width="200" height="266" fill="${IVORY}"/>${faceArt(t)}</svg>`);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${AW}" height="${AH}" viewBox="0 0 ${AW} ${AH}"><style>${FONT_CSS}</style>${cellsF.join('')}</svg>`);
  await img.decode();
  g.filter = 'saturate(1.25) contrast(1.06)'; g.drawImage(img, 0, 0); g.filter = 'none';
  atlasBase = document.createElement('canvas'); atlasBase.width = AW; atlasBase.height = AH; atlasBase.getContext('2d').drawImage(c, 0, 0);
  atlasTex = new T3.CanvasTexture(c); atlasTex.colorSpace = T3.SRGBColorSpace; atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // carving: ink sits slightly below the ivory, with a soft edge
  const bw = AW / 2, bh = AH / 2, b = document.createElement('canvas'); b.width = bw; b.height = bh;
  const bg = b.getContext('2d'); bg.drawImage(c, 0, 0, bw, bh);
  const id = bg.getImageData(0, 0, bw, bh), d = id.data;
  for (let i = 0; i < d.length; i += 4){
    const dist = Math.max(0, Math.abs(d[i] - 239) + Math.abs(d[i + 1] - 230) + Math.abs(d[i + 2] - 210) - 26);
    const v = 255 - Math.min(1, dist / 100) * 210; d[i] = d[i + 1] = d[i + 2] = v;
  }
  bg.putImageData(id, 0, 0);
  const b2 = document.createElement('canvas'); b2.width = bw; b2.height = bh; const g2 = b2.getContext('2d');
  g2.filter = small ? 'blur(.6px)' : 'blur(1.1px)'; g2.drawImage(b, 0, 0);
  bumpTex = new T3.CanvasTexture(b2); bumpTex.anisotropy = atlasTex.anisotropy;
  window.TW_atlas = c;
  // the helper marks, drawn once as SVG so the numerals are proper lining figures in the house serif
  const cells = [];
  for (let t = 0; t < 31; t++){
    const x = (t % COLS) * CW, y = Math.floor(t / COLS) * CH, txt = t < 27 ? String(t % 9 + 1) : 'ESWN'[t - 27];
    const col = t < 27 ? ['#A3221B', '#1B3566', '#185E31'][Math.floor(t / 9)] : '#1A1A1A';
    const bx = x + CW * .045, by = y + CH * .035;
    cells.push(`<text x="${bx}" y="${by + CH * .2}" text-anchor="start" fill="${col}" font-family="TWserif" font-weight="700" font-size="${CW * (t < 27 ? .36 : .3)}">${txt}</text>`);
  }
  helperImg = new Image();
  helperImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${AW}" height="${AH}" viewBox="0 0 ${AW} ${AH}"><style>${FONT_CSS} text{font-variant-numeric:lining-nums;font-feature-settings:"lnum"}</style>${cells.join('')}</svg>`);
  try { await helperImg.decode(); } catch(e){ helperImg = null; }
  composeAtlas(helpersOn);
}
/* Tile helpers: a number in the corner of every suit tile and a letter on every wind, printed into the face itself
   so they read the same on the rack, in the discards and in the melds */
let atlasBase = null, helpersOn = false, helperImg = null;
function composeAtlas(on){
  const c = window.TW_atlas; if (!c || !atlasBase) return;
  const g = c.getContext('2d'); g.save(); g.filter = 'none'; g.drawImage(atlasBase, 0, 0);
  if (on && helperImg) g.drawImage(helperImg, 0, 0);
  g.restore(); if (atlasTex) atlasTex.needsUpdate = true; wake();
}
function setHelpers(on){ on = !!on; if (on === helpersOn && atlasBase) return; helpersOn = on; composeAtlas(on); }
function faceGeo(t){
  const fw = .88, fh = fw * 266 / 200;
  const g = new T3.PlaneGeometry(fw, fh); g.rotateX(-Math.PI / 2); g.translate(0, TH / 2 + .0015, 0);
  const uv = g.attributes.uv, col = t % COLS, row = Math.floor(t / COLS);
  for (let i = 0; i < uv.count; i++){
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (col * CW + 3 + u * (CW - 6)) / AW, 1 - (row * CH + 3 + (1 - v) * (CH - 6)) / AH);
  }
  return g;
}

/* ---------- materials ---------- */
const M = {};
function makeMaterials(){
  const sc = scratchTex(); sc.repeat.set(3, 3);
  M.ivory = new T3.MeshPhysicalMaterial({ color: 0xEFE6D2, roughness: .42, roughnessMap: sc, clearcoat: .38, clearcoatRoughness: .26, clearcoatRoughnessMap: sc, envMapIntensity: .6, specularIntensity: .55, sheen: .35, sheenColor: new T3.Color(0xE8B98A), sheenRoughness: .5 });
  M.jade = new T3.MeshPhysicalMaterial({ color: 0x2C6B4F, roughness: .36, roughnessMap: sc, clearcoat: .8, clearcoatRoughness: .2, clearcoatRoughnessMap: sc, envMapIntensity: .8 });
  M.seam = new T3.MeshStandardMaterial({ color: 0x1a1d18, roughness: .85 });
  M.face = new T3.MeshPhysicalMaterial({ color: 0xffffff, map: atlasTex, bumpMap: bumpTex, bumpScale: 2.2, roughness: .35, clearcoat: .5, clearcoatRoughness: .3, envMapIntensity: .55, specularIntensity: .55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.rim = new T3.MeshBasicMaterial({ color: 0xD9AE55, side: T3.BackSide });
  M.rimSoft = new T3.MeshBasicMaterial({ color: 0xC9A24A, side: T3.BackSide, transparent: true, opacity: .75 });
  M.rimDead = new T3.MeshBasicMaterial({ color: 0x9CC4DA, side: T3.BackSide, transparent: true, opacity: .85 });
  M.shadow = new T3.MeshBasicMaterial({ map: shadowTex(), color: 0x000000, transparent: true, depthWrite: false, opacity: .5 });
  M.shadow.map.wrapS = M.shadow.map.wrapT = T3.ClampToEdgeWrapping;
  const fn = feltNormal(); fn.repeat.set(7, 7);
  const fc = feltColor(); fc.repeat.set(1, 1);
  M.felt = new T3.MeshPhysicalMaterial({ color: 0x1D4636, map: fc, roughness: 1, sheen: 1, sheenColor: new T3.Color(0x5a9a78), sheenRoughness: .48, normalMap: fn, normalScale: new T3.Vector2(.7, .7), envMapIntensity: .12 });
  const wood = woodTex([74, 44, 26]); wood.repeat.set(.4, .5); woodDark = wood;
  woodLight = woodTex([150, 108, 66]); woodLight.repeat.set(.4, .5);
  M.bone = new T3.MeshPhysicalMaterial({ color: 0xE9DFC8, roughness: .45, clearcoat: .3, clearcoatRoughness: .4, envMapIntensity: .4 });
  M.walnut = new T3.MeshPhysicalMaterial({ color: 0xffffff, map: wood, roughness: .5, clearcoat: .3, clearcoatRoughness: .4, envMapIntensity: .4 });
  const wood2 = woodTex([70, 42, 24]); wood2.repeat.set(.07, .07);
  M.walnutTop = new T3.MeshPhysicalMaterial({ color: 0xffffff, map: wood2, roughness: .5, clearcoat: .35, clearcoatRoughness: .4, envMapIntensity: .3 });
  const rackWood = woodTex([118, 74, 42]); rackWood.repeat.set(.5, 1.4);
  const rackPale = woodTex([196, 158, 108]); rackPale.repeat.set(.5, 1.4); M.rackMaps = { dark: rackWood, light: rackPale };
  M.rack = new T3.MeshPhysicalMaterial({ color: 0xffffff, map: rackWood, roughness: .4, clearcoat: .6, clearcoatRoughness: .3, envMapIntensity: .45 });
  M.brass = new T3.MeshStandardMaterial({ color: 0xC9A24A, metalness: .9, roughness: .42, roughnessMap: sc, envMapIntensity: 1.1 });
  const fl = woodTex([46, 32, 22]); fl.repeat.set(16, 34); M.floor = new T3.MeshStandardMaterial({ color: 0xffffff, map: fl, roughness: .9 });
}
const BODY_MATS = () => [M.ivory, M.jade, M.seam];
let woodDark, woodLight;

/* ---------- a soft room for reflections (after three.js RoomEnvironment, MIT) ---------- */
function roomEnv(){
  const s = new T3.Scene(), box = new T3.BoxGeometry(); box.deleteAttribute('uv');
  const room = new T3.Mesh(box, new T3.MeshStandardMaterial({ side: T3.BackSide, color: 0x6b6258 }));
  room.position.set(-.757, 13.219, .717); room.scale.set(31.713, 28.305, 28.591); s.add(room);
  const pl = new T3.PointLight(0xffffff, 700, 28, 2); pl.position.set(.418, 16.199, .3); s.add(pl);
  const area = (x, y, z, sx, sy, sz, i, col = 0xffffff) => { const m = new T3.MeshBasicMaterial({ color: col }); m.color.multiplyScalar(i); const o = new T3.Mesh(box, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); s.add(o); };
  area(-16.1, 14.4, 8.2, .1, 2.4, 2.7, 22, 0xffe2b8); area(14.9, 12.2, -1.8, .15, 4.2, 6.3, 6, 0xcfdde8); area(-.46, 8.9, 14.5, 4.4, 5.4, .09, 9); area(0, 20, 0, 1, .1, 1, 40, 0xffe2b8);
  return s;
}

/* ---------- scenes ---------- */
const seatLines = [];
let spot, hspot, hemiMain, turnSpot, felt, floor, rail, rackGroup, rackBars = [], tipDot, rackLedge;
const plaques = [], lampCol = new T3.Color(0xFFE2B8), warmCol = new T3.Color(0xFFC98A);
let marker = null, dealerDisc = null, warm = 0, warmT = 0, turnI = 0, turnIT = 0; const turnPos = new T3.Vector3(0, 0, 9), turnPosT = new T3.Vector3(0, 0, 9);
const lightsFor = (sc, isHand) => {
  const key = new T3.SpotLight(0xFFE2B8, isHand ? 6 : 6.6, 0, isHand ? .7 : .6, 1, 0);
  if (isHand){ key.position.set(-7, 10, 16); key.target.position.set(0, 0, 0); }
  else { key.position.set(-11, 36, 13); key.target.position.set(1.2, 0, -.8); }
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0003; key.shadow.normalBias = .02; key.shadow.blurSamples = 16;
  key.shadow.camera.near = isHand ? 4 : 18; key.shadow.camera.far = isHand ? 40 : 75; key.shadow.radius = 4;
  sc.add(key, key.target);
  const hemi = new T3.HemisphereLight(0xb9cad8, 0x2c4a3a, isHand ? .75 : 1.0); sc.add(hemi); if (!isHand) hemiMain = hemi;
  const fill = new T3.DirectionalLight(0xa9bccd, isHand ? .4 : .3); fill.position.set(10, 8, 14); sc.add(fill);
  return key;
};
function buildTable(){
  scene.background = new T3.Color(0x0b0a08); scene.fog = new T3.Fog(0x0b0a08, 70, 150);
  spot = lightsFor(scene, false);
  felt = new T3.Mesh(new T3.PlaneGeometry(26.6, 26.6), M.felt); felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
  // walnut rail: four boards, grain running along each one
  rail = new T3.Group();
  const longBar = roundedBox(29.4, .8, 1.5, 2, .16), sideBar = roundedBox(26.4, .8, 1.5, 2, .16);
  for (const [geo, x, z, ry] of [[longBar, 0, 13.95, 0], [longBar, 0, -13.95, Math.PI], [sideBar, 13.95, 0, Math.PI / 2], [sideBar, -13.95, 0, -Math.PI / 2]]){
    const m = new T3.Mesh(geo, M.walnut); m.position.set(x, .36, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; rail.add(m);
  }
  // brass corner caps where the boards meet
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){ const m = new T3.Mesh(roundedBox(1.64, .9, 1.64, 2, .2), M.brass); m.position.set(x * 13.95, .37, z * 13.95); m.castShadow = m.receiveShadow = true; rail.add(m); }
  scene.add(rail);
  floor = new T3.Mesh(new T3.PlaneGeometry(400, 400), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.y = -3.5; floor.receiveShadow = true; scene.add(floor);
  // the table's apron, so the rail does not float
  const apron = new T3.Mesh(new T3.BoxGeometry(29.8, 3.4, 29.8), M.walnut); apron.position.y = -1.72; scene.add(apron);
  // a second, small lamp that follows whoever is to play
  turnSpot = new T3.SpotLight(0xFFD9A0, 0, 0, .15, 1, 0); turnSpot.position.set(0, 26, 0); scene.add(turnSpot, turnSpot.target);
  // score plaques: lacquer on brass, one on the rail in front of each seat
  for (let s = 0; s < 4; s++){
    const g = new T3.Group(), [x, z] = seatXZ(s, 0, 13.95);
    const base = new T3.Mesh(roundedBox(8.6, .24, 1.44, 2, .08), M.brass); base.castShadow = true; base.receiveShadow = true;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
    const tex = new T3.CanvasTexture(c); tex.colorSpace = T3.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new T3.MeshPhysicalMaterial({ map: tex, roughness: .5, clearcoat: .6, clearcoatRoughness: .45, envMapIntensity: .35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    const top = new T3.Mesh(new T3.PlaneGeometry(8.44, 1.3), mat); top.rotation.x = -Math.PI / 2; top.position.y = .122; top.receiveShadow = true;
    g.add(base, top); g.position.set(x, .83, z); g.rotation.order = 'YXZ'; g.rotation.y = (s === 2 ? 0 : s * 90) * DEG; g.visible = false; scene.add(g);
    plaques.push({ g, base, top, c, tex, mat, key: '' });
  }
  // a thin lacquer line along the inside edge of each seat's discards, in that seat's colour, so you can tell whose grid is whose
  for (let s2 = 0; s2 < 4; s2++){
    const len = DCOLS * DSTEP, m = new T3.Mesh(roundedBox(len, .05, .13, 1, .02), new T3.MeshPhysicalMaterial({ color: new T3.Color(SEAT[s2].lac), roughness: .45, clearcoat: .6, clearcoatRoughness: .3 }));
    const [x, z] = seatXZ(s2, CIN - len / 2, CIN - .08); m.position.set(x, .026, z); m.rotation.y = s2 * 90 * DEG; m.receiveShadow = true; m.visible = false; scene.add(m); seatLines.push(m);
  }
  // the round marker: a bone disc in a brass ring at the centre of the table
  {
    const g = new T3.Group();
    const ring = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.28, .3, 72), M.brass); ring.position.y = .15; ring.castShadow = true; ring.receiveShadow = true;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const tex = new T3.CanvasTexture(c); tex.colorSpace = T3.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const top = new T3.Mesh(new T3.CircleGeometry(2.08, 64), new T3.MeshPhysicalMaterial({ map: tex, roughness: .4, clearcoat: .4, clearcoatRoughness: .35, envMapIntensity: .4 })); top.rotation.x = -Math.PI / 2; top.position.y = .302; top.receiveShadow = true;
    g.add(ring, top); g.visible = false; g.scale.setScalar(.6); scene.add(g); marker = { g, top, c, tex, key: '' };
    const dc = document.createElement('canvas'); dc.width = dc.height = 128; const dg = dc.getContext('2d');
    dg.fillStyle = '#E9DFC8'; dg.fillRect(0, 0, 128, 128); dg.fillStyle = '#B3261E'; dg.font = "84px TWbrush"; dg.textAlign = 'center'; dg.textBaseline = 'middle'; dg.fillText('莊', 64, 68);
    const dt = new T3.CanvasTexture(dc); dt.colorSpace = T3.SRGBColorSpace;
    const d = new T3.Group(), body = new T3.Mesh(new T3.CylinderGeometry(.46, .46, .2, 40), M.bone); body.castShadow = true;
    const face = new T3.Mesh(new T3.CircleGeometry(.4, 40), new T3.MeshPhysicalMaterial({ map: dt, roughness: .4, clearcoat: .4 })); face.rotation.x = -Math.PI / 2; face.position.y = .102;
    d.add(body, face); d.visible = false; scene.add(d); dealerDisc = d;
  }
}
function drawPlaque(s){
  const P = plaques[s], p = S.players[s], w = (s - S.dealer + 4) % 4, portrait = W < H * .9, on = S.turn === s;
  P.s = s; if (P.shown == null || P.who !== p.name) P.shown = p.score; P.who = p.name; P.target = p.score;
  if (P.wind != null && P.wind !== w && fixIn > .5 && !reduced() && P.flipF == null){ P.flipF = 0; P.flipTo = w; wake(); }
  if (P.flipF != null && P.flipF < .5) return;
  P.wind = w;
  const key = [P.shown, w, portrait, on, theme && theme.id, p.name].join();
  if (P.key === key) return; P.key = key;
  const g = P.c.getContext('2d'), a = SEAT[s];
  // v10: a bone plate set in brass, lettering cut in and inked, the seat's colour only on a small seal
  g.fillStyle = '#E6DCC6'; g.fillRect(0, 0, 1024, 160);
  { const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(255,250,238,.35)'); gr.addColorStop(1, 'rgba(120,96,60,.18)'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 160); }
  for (let i = 0; i < 70; i++){ g.fillStyle = `rgba(140,112,70,${.025 + rand(i * 3 + s * 211) * .03})`; g.fillRect(0, rand(i * 3 + 1 + s * 211) * 160, 1024, 1 + rand(i * 3 + 2 + s * 211) * 2); } // fixed grain: never draws on the game's random numbers
  g.fillStyle = a.lac; g.fillRect(14, 14, 132, 132);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(14, 140, 132, 6);
  g.fillStyle = '#F4EAD5'; g.textBaseline = 'middle'; g.font = "104px TWbrush"; g.textAlign = 'center'; g.fillText(WIND_HAN[w], 80, 84);
  g.fillStyle = '#1A130C'; g.font = "600 80px TWdisplay"; g.textAlign = 'left'; g.fillText(s === 0 ? 'You' : p.name, 180, 86, 440);
  g.font = "600 112px TWdisplay"; g.textAlign = 'right'; g.fillText(String(P.shown), 1000, 88);
  if (on){ g.fillStyle = a.lac; g.fillRect(180, 138, 300, 8); }
  P.tex.needsUpdate = true; P.mat.emissiveIntensity = on ? .17 : .07; // a touch of self-light so the far plaque still reads
}
function drawMarker(force){
  const left = S.wall.length, key = [S.roundWind, S.handNo, S.totalHands, left, S.mode].join();
  if (!force && marker.wind != null && marker.wind !== S.roundWind && fixIn > .5 && !reduced()){ if (flipF < 0){ flipF = 0; flipWind = S.roundWind; wake(); } return; }
  if (!force && flipF >= 0 && flipF < .5) return;
  if (marker.key === key) return; marker.key = key; marker.wind = S.roundWind;
  const g = marker.c.getContext('2d');
  g.fillStyle = '#E9DFC8'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#B3261E'; g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 232, 0, 7); g.stroke();
  g.fillStyle = '#B3261E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "216px TWbrush"; g.fillText(WIND_HAN[S.roundWind], 256, 180);
  g.fillStyle = '#2A2117';
  if (S.totalHands > 1){ g.font = "600 118px TWdisplay"; g.fillText((S.handNo + 1) + '/' + S.totalHands, 256, 380); g.font = "600 44px TWdisplay"; g.globalAlpha = .62; g.fillText('hand', 256, 458); g.globalAlpha = 1; }
  else { g.font = "600 70px TWdisplay"; g.fillText(['East', 'South', 'West', 'North'][S.roundWind], 256, 392); }
  marker.tex.needsUpdate = true;
}
function buildRack(){
  hscene.background = null;
  hspot = lightsFor(hscene, true);
  rackGroup = new T3.Group(); hscene.add(rackGroup);
  const ledge = new T3.Mesh(roundedBox(60, .6, 9, 2, .12), M.walnut); ledge.position.set(0, -.3, 2.1); ledge.receiveShadow = true; hscene.add(ledge); rackLedge = ledge;
  { const uv = ledge.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * .1 + 1.25); uv.needsUpdate = true; } // v10: the grain no longer wraps, so no seam down the middle of the board (edited in place: no new objects)
  tipDot = new T3.Mesh(new T3.CylinderGeometry(.075, .075, .03, 20), M.brass); tipDot.visible = false; hscene.add(tipDot);
}
function rackBar(len){
  const g = new T3.Group();
  const base = new T3.Mesh(roundedBox(len, .26, 1.25, 2, .06), M.rack); base.position.set(0, .13, .05); base.castShadow = base.receiveShadow = true;
  const back = new T3.Mesh(roundedBox(len, 1.05, .2, 2, .06), M.rack); back.position.set(0, .55, -.62); back.rotation.x = -.26; back.castShadow = back.receiveShadow = true;
  const lip = new T3.Mesh(roundedBox(len, .12, .14, 2, .04), M.rack); lip.position.set(0, .29, .6); lip.castShadow = lip.receiveShadow = true;
  g.add(base, back, lip); return g;
}

/* ---------- tiles ---------- */
const tiles = []; // by id: main-scene objects
const hand = new Map(); // id -> hand-scene objects (created when needed)
const typeOf0 = id => id < 136 ? Math.floor(id / 4) : 34 + (id - 136);
const TY = Array.from({ length: 144 }, (_, id) => typeOf0(id)); // the face each id shows; at a table with friends ids are dealt at random
const typeOf = id => TY[id];
function retype(id, t){
  if (t == null || t < 0 || TY[id] === t) return; TY[id] = t;
  const o = tiles[id]; if (o){ o.t = t; o.face.geometry = faceGeos[t]; }
  const h = hand.get(id); if (h){ h.t = t; h.face.geometry = faceGeos[t]; }
}
function resetTypes(){ for (let id = 0; id < 144; id++) retype(id, typeOf0(id)); }
function makeTileMesh(t, own){
  const g = new T3.Group();
  const mats = own ? [M.ivory.clone(), M.jade, M.seam] : BODY_MATS();
  const body = new T3.Mesh(bodyGeo, mats); body.castShadow = true; body.receiveShadow = true;
  const fmat = own ? M.face.clone() : M.face;
  const face = new T3.Mesh(faceGeos[t], fmat); face.receiveShadow = true;
  const rim = new T3.Mesh(rimGeo, M.rim); rim.visible = false; rim.scale.set(1.055, 1.07, 1.045);
  g.add(rim, body, face);
  g.rotation.order = 'YXZ';
  return { g, body, face, rim, mats, fmat };
}
function newState(o){
  return Object.assign(o, { pos: new T3.Vector3(), vel: new T3.Vector3(), rot: new T3.Vector3(), rvel: new T3.Vector3(), sc: 1, sv: 0,
    tgt: null, via: null, wait: 0, active: false, landSnd: null, glow: 0, glowT: 0 });
}
function buildTiles(){
  for (let id = 0; id < 144; id++){
    const t = typeOf(id), m = makeTileMesh(t, false);
    m.g.visible = false; scene.add(m.g);
    const sh = new T3.Mesh(shadowGeo, M.shadow); sh.rotation.order = 'YXZ'; sh.visible = false; sh.renderOrder = 1; scene.add(sh);
    tiles.push(newState({ id, t, ...m, shadow: sh, where: 'none', xferAt: 0 }));
  }
}
function handTile(id){
  let h = hand.get(id);
  if (!h){ h = newState({ id, t: typeOf(id), ...makeTileMesh(typeOf(id), true) }); h.g.visible = false; hscene.add(h.g); hand.set(id, h); }
  return h;
}

/* ---------- poses ---------- */
function seatXZ(s, u, v){ const a = s * 90 * DEG; return [u * Math.cos(a) + v * Math.sin(a), -u * Math.sin(a) + v * Math.cos(a)]; }
function pose(s, u, v, y, rx, yawExtra = 0, sc = 1, jit = 0){
  const [x, z] = seatXZ(s, u, v);
  return { x: x + (rand(jit * 3.1) - .5) * .028, y, z: z + (rand(jit * 5.7) - .5) * .05, rx, ry: s * 90 * DEG + yawExtra + (rand(jit * 1.3) - .5) * 2.2 * DEG, rz: 0, sc };
}
const LIE = TH / 2, STAND = TL / 2, UP = 90 * DEG, DOWN = 180 * DEG;
const SIDE_ORDER = [0, 3, 2, 1]; // walls clockwise from yours: you, left, top, right
/* the table, laid out so every discard can be read: each seat throws into its own grid of six in the order thrown,
   three rows deep, and the four grids interlock around the round marker. Melds lie on a band just behind the grid. */
const DS = 1.45, DCOLS = 6, CIN = 1.45, DSTEP = TW * 1.02 * DS, DROW = TL * DS + .06;
const DR = CIN + .05 + 3 * DROW, MS = 1.38, MV = DR + .25 + TL * MS / 2, MB0 = -(DR + .25 + TL * MS), MB1 = DR + .25;
const WALL_V = 11.0, HAND_V = 12.4;
function discardSlot(i, n){
  const rows = Math.max(3, Math.ceil(n / DCOLS)), k = rows > 3 ? 3 / rows : 1; // a very long hand packs a fourth row into the same space
  const row = Math.floor(i / DCOLS), col = i % DCOLS;
  return { u: CIN - DCOLS * DSTEP * k + (col + .5) * DSTEP * k, v: CIN + .05 + TL * DS * k / 2 + row * DROW * k, s: DS * k };
}
let narrow = false; // a tall phone: the frame ends just past the side players' melds
function wallPose(g, level, jit){
  const side = SIDE_ORDER[Math.floor(g / 18)], j = g % 18, v = narrow && side % 2 ? 11.9 : WALL_V;
  return pose(side, 8.76 - j * 1.03 + 1.1 + (WALL_V - 9.6), v, LIE + level * (TH + .004), DOWN, 0, 1, jit);
}
function slotStack(k, dealer, handNo){
  const g0 = SIDE_ORDER.indexOf(dealer) * 18 + 3 + (handNo * 5) % 11;
  return { g: (g0 + Math.floor(k / 2)) % 72, top: k % 2 === 0 };
}

/* ---------- hand layout (rack) ---------- */
const HAND_GAP = .62, HSTEP = 1.04, LEAN = 13 * DEG;
let handLayout = { rows: 1, width: 15.6 };
function handSlots(n, loose){
  // returns [{x, y, z, row}] for n tiles; the last `loose` tiles (a fresh draw, or tiles not yet placed) sit apart on the right
  loose = +loose || 0; const out = [], first = n - loose;
  if (rows === 1){
    const w = (n - 1) * HSTEP + (loose && first > 0 ? HAND_GAP : 0);
    for (let i = 0; i < n; i++) out.push({ x: -w / 2 + i * HSTEP + (loose && first > 0 && i >= first ? HAND_GAP : 0), z: 0, row: 0 });
  } else {
    const top = Math.ceil((n - loose) / 2);
    for (let i = 0; i < n; i++){
      const r = i < top ? 0 : 1, k = r ? i - top : i, cnt = r ? n - top : top, gap = r && loose && first > top;
      const w = (cnt - 1) * HSTEP + (gap ? HAND_GAP : 0);
      out.push({ x: -w / 2 + k * HSTEP + (gap && i >= first ? HAND_GAP : 0), z: r ? 0 : -1.3, row: r });
    }
  }
  for (const o of out){ o.y = (o.row === 0 && rows === 2 ? .98 : 0) + .26 + Math.cos(LEAN) * STAND + .01; }
  return out;
}
function layoutRack(){
  for (const b of rackBars) rackGroup.remove(b);
  rackBars = [];
  const len = rows === 1 ? 16.4 : 8.9;
  const a = rackBar(len); rackGroup.add(a); rackBars.push(a);
  if (rows === 2){ const b = rackBar(len); b.position.set(0, .98, -1.3); const riser = new T3.Mesh(roundedBox(len, .98, 1.2, 2, .06), M.rack); riser.position.set(0, .49, -1.3); riser.castShadow = riser.receiveShadow = true; rackGroup.add(riser); rackBars.push(riser); rackGroup.add(b); rackBars.push(b); }
}

/* ---------- springs ---------- */
function setTarget(o, p, opts = {}){
  const prev = o.tgt;
  o.tgt = p; o.active = true;
  // unwrap angles so a tile turns the short way round
  for (const k of ['rx', 'ry', 'rz']){ const cur = o.rot[k === 'rx' ? 'x' : k === 'ry' ? 'y' : 'z']; p[k] += Math.round((cur - p[k]) / (2 * Math.PI)) * 2 * Math.PI; }
  const vias = [], d = Math.hypot(p.x - o.pos.x, p.z - o.pos.z);
  if (opts.arc && d > 1.2) vias.push({ x: (o.pos.x + p.x) / 2, y: Math.max(o.pos.y, p.y) + 1.1 + Math.min(d * .07, 1.1), z: (o.pos.z + p.z) / 2, r: .6 });
  if (opts.hop) vias.push({ x: p.x, y: p.y + 1.05, z: p.z, r: .55 });
  if (opts.slide && d > 1.2){ const s2 = .34 * (p.sc || 1); vias.push({ x: p.x - (p.x - o.pos.x) / d * s2, y: p.y + .025, z: p.z - (p.z - o.pos.z) / d * s2, r: .09, touch: true }); }
  o.vias = vias.length ? vias : null; o.via = o.vias ? o.vias[0] : null;
  o.landSnd = opts.snd || null;
  o.wait = opts.wait || 0;
  if (!prev && !opts.keepPos) snap(o);
  wake();
}
function snap(o){
  const p = o.tgt; o.pos.set(p.x, p.y, p.z); o.rot.set(p.rx, p.ry, p.rz); o.sc = p.sc; o.vel.set(0, 0, 0); o.rvel.set(0, 0, 0); o.sv = 0; o.via = null; o.vias = null; apply(o);
}
function apply(o){
  o.g.position.copy(o.pos); o.g.rotation.set(o.rot.x, o.rot.y, o.rot.z, 'YXZ'); o.g.scale.setScalar(o.sc);
  if (o.shadow){
    const show = o.g.visible && o.tgt && o.tgt.y < 1.0 && o.pos.y < 3;
    o.shadow.visible = !!show;
    if (show){
      const standing = Math.abs(Math.cos(o.rot.x)) < .5;
      const lift = Math.max(0, o.pos.y - (standing ? STAND : LIE));
      o.shadow.position.set(o.pos.x + lift * .32, .006, o.pos.z + lift * .22); o.shadow.rotation.set(-Math.PI / 2, o.rot.y, 0, 'YXZ');
      o.shadow.scale.set(o.sc * 1.0, o.sc * (standing ? .62 : 1), 1);
      o.shadow.visible = lift < 2.6;
      o.shadow.scale.multiplyScalar(1 + lift * .38);
    }
  }
}
let landClock = 0;
function landed(o){
  const k = o.landSnd; o.landSnd = null; if (!k) return;
  const now = performance.now(); if (now - landClock > 28){ snd(k); landClock = now; }
  if (k === 'pung' || k === 'kong' || k === 'chow'){ if (!reduced()){ settleV -= (k === 'chow' ? .45 : k === 'kong' ? 1 : .8) * 1.1; if (k === 'kong') flick = 1; } }
}
function step(o, dt){
  if (!o.active) return false;
  if (o.wait > 0){ o.wait -= dt; return true; }
  const rm = reduced(), K = rm ? 640 : K_SPRING, C = rm ? 50 : C_DAMP;
  const p = o.via || o.tgt, k = o.via ? (o.via.touch ? K * 1.5 : K * .7) : K;
  const ax = k * (p.x - o.pos.x) - C * o.vel.x, ay = k * (p.y - o.pos.y) - C * o.vel.y, az = k * (p.z - o.pos.z) - C * o.vel.z;
  o.vel.x += ax * dt; o.vel.y += ay * dt; o.vel.z += az * dt;
  o.pos.addScaledVector(o.vel, dt);
  const t = o.tgt;
  const rx = K * (t.rx - o.rot.x) - C * o.rvel.x, ry = K * (t.ry - o.rot.y) - C * o.rvel.y, rz = K * (t.rz - o.rot.z) - C * o.rvel.z;
  o.rvel.x += rx * dt; o.rvel.y += ry * dt; o.rvel.z += rz * dt; o.rot.addScaledVector(o.rvel, dt);
  o.sv += (K * (t.sc - o.sc) - C * o.sv) * dt; o.sc += o.sv * dt;
  if (o.via && Math.hypot(o.via.x - o.pos.x, o.via.y - o.pos.y, o.via.z - o.pos.z) < o.via.r){ const was = o.via; o.vias.shift(); o.via = o.vias[0] || null; if (was.touch) landed(o); }
  if (o.glow !== o.glowT){ o.glow += (o.glowT - o.glow) * Math.min(1, dt * 14); if (Math.abs(o.glow - o.glowT) < .002) o.glow = o.glowT; if (o.mats[0].emissive){ o.mats[0].emissive.setRGB(o.glow, o.glow * .93, o.glow * .82); o.fmat.emissive.setRGB(o.glow, o.glow * .93, o.glow * .82); } }
  const err = Math.abs(t.x - o.pos.x) + Math.abs(t.y - o.pos.y) + Math.abs(t.z - o.pos.z) + Math.abs(t.rx - o.rot.x) + Math.abs(t.ry - o.rot.y) + Math.abs(t.rz - o.rot.z) + Math.abs(t.sc - o.sc);
  const spd = o.vel.length() + o.rvel.length() + Math.abs(o.sv);
  if (o.landSnd && !o.via && err < .05 && t.y < 1.5) landed(o);
  if (!o.via && err < .0015 && spd < .004 && o.glow === o.glowT){ snap(o); o.active = false; return false; }
  apply(o); return true;
}

/* ---------- camera ---------- */
let playX = 9.75, pushZoom = .14, push = 0, pushV = 0, pushT = 0, pushX = 0, pushZ = 0, tableView = false;
const cv = { R: 70, tilt: 20 * DEG, tx: 0, tz: 0 }, ct = { R: 70, tilt: 20 * DEG, tx: 0, tz: 0 }, cvV = { R: 0, tilt: 0, tx: 0, tz: 0 };
function placeCam(c, R, tx, tz, ox = 0, oz = 0, tilt = cv.tilt){ c.position.set(tx + ox, R * Math.cos(tilt), tz + R * Math.sin(tilt) + oz); c.lookAt(tx, 0, tz); c.updateMatrixWorld(); }
/* what the camera must show. A tall phone frames the discards and melds edge to edge (the side walls and the
   side players' hidden tiles fall outside the frame); a wide screen shows the whole table; table view looks straight down. */
function frameBox(aspect){ // in table view a phone zooms onto the four discard grids
  const portrait = aspect < .9;
  if (mode !== 'game') return { x: 14.7, z0: -14.7, z1: 14.7, frac: portrait ? 1.32 : .84, tilt: portrait ? 30 : aspect > 1.9 ? 40 : 36 }; // a phone: the table runs off the sides, so it fills the screen behind the title
  if (S && S.mode === 'lesson') return portrait ? { x: 7.6, z0: -13.5, z1: 10, frac: 1, tilt: 9 } : { x: 10.5, z0: -11, z1: 10, frac: .96, tilt: 16 };
  if (tableView) return portrait ? { x: 7.75, z0: -7.75, z1: 7.75, frac: 1, tilt: .5 } : { x: 10.2, z0: -10.2, z1: 10.2, frac: .98, tilt: .5 };
  if (portrait) return { x: playX, z0: -15.6, z1: 11.4, frac: 1, tilt: 13 }; // v10: as wide as the played tiles reach (7.2 to 9.75), so early tiles read bigger
  if (aspect > 2.2) return { x: 13.6, z0: -12.6, z1: 14.7, frac: 1, tilt: 47 }; // a sideways phone: lower still, so the table uses the width
  return { x: 14.3, z0: -13.6, z1: 14.9, frac: 1, tilt: aspect > 1.9 ? 38 : 33 }; // v10: lower and closer, like a photograph taken from a chair
}
function fitCamera(snapNow = true){
  const vh = Math.max(1, H - handH - stripH), aspect = W / vh, b = frameBox(aspect);
  narrow = mode === 'game' && aspect < .9;
  const tilt = b.tilt * DEG, tx = 0, tz = (b.z0 + b.z1) / 2;
  const test = new T3.PerspectiveCamera(28, aspect, 1, 600);
  const pts = []; for (const x of [-b.x, b.x]) for (const z of [b.z0, b.z1]) for (const y of [0, .8]) pts.push(new T3.Vector3(x, y, z));
  let lo = 20, hi = 400;
  for (let i = 0; i < 40; i++){
    const mid = (lo + hi) / 2; placeCam(test, mid, tx, tz, 0, 0, tilt); test.updateProjectionMatrix();
    const fits = pts.every(p => { tmpV.copy(p).project(test); return Math.abs(tmpV.x) <= b.frac && Math.abs(tmpV.y) <= b.frac; });
    if (fits) hi = mid; else lo = mid;
  }
  Object.assign(ct, { R: hi, tilt, tx, tz }); if (snapNow){ Object.assign(cv, ct); cvV.R = cvV.tilt = cvV.tx = cvV.tz = 0; }
  cam.aspect = aspect; cam.setViewOffset(W, vh, 0, 0, W, H); cam.updateProjectionMatrix();
  updateCam(); wake();
}
function setTableView(on){ on = !!on; if (on === tableView || mode !== 'game') return tableView; tableView = on; fitCamera(false); return on; }
/* looking around: off by default. A tap on a seat's plaque (or keys 1 2 3) glides to that seat's discards; a drag on empty felt
   turns the view within limits; the wheel or a pinch zooms within limits; a double tap, key 0 or My seat comes back. The rack is
   drawn by its own camera, so no view can lose it, and the tilt never passes 52 degrees, so the view never goes under the table. */
const LOOK0 = { yaw: 0, tilt: 0, zoom: 1, px: 0, pz: 0 };
const look = Object.assign({}, LOOK0), lookT = Object.assign({}, LOOK0), lookV = { yaw: 0, tilt: 0, zoom: 0, px: 0, pz: 0 };
let lookSeat = 0, orbit = null, lastTapAt = 0, lastTapXY = null;
const clampLook = () => {
  lookT.yaw = Math.max(-.7, Math.min(.7, lookT.yaw)); lookT.zoom = Math.max(.5, Math.min(1.12, lookT.zoom));
  const base = ct.tilt; lookT.tilt = Math.max(-base + .5 * DEG, Math.min(52 * DEG - base, lookT.tilt));
};
function lookAtSeat(pi){
  if (mode !== 'game' || !S) return;
  if (pi === 0 || pi == null || pi === lookSeat){ lookHome(); return; }
  const [x, z] = seatXZ(pi, 0, 5.4);
  Object.assign(lookT, { yaw: 0, tilt: (narrow ? 2 : 10) * DEG - ct.tilt, zoom: narrow ? .74 : .6, px: x - ct.tx, pz: z - ct.tz });
  if (narrow){ lookT.px *= .55; }
  lookSeat = pi; clampLook(); wake(); lookChanged();
}
function lookHome(){ Object.assign(lookT, LOOK0); lookSeat = 0; wake(); lookChanged(); }
const lookAway = () => Math.abs(lookT.yaw) > .02 || Math.abs(lookT.tilt) > .01 || Math.abs(lookT.zoom - 1) > .02 || Math.abs(lookT.px) + Math.abs(lookT.pz) > .05;
function lookChanged(){ if (typeof onLook === 'function') onLook(lookAway(), lookSeat); }
function updateCam(){
  const g = mode === 'game';
  const R = cv.R * (1 - pushZoom * push) * (g ? look.zoom : 1), tilt = cv.tilt + (g ? look.tilt : 0), yaw = g ? look.yaw : 0;
  const tx = cv.tx + pushX * push + (g ? look.px : 0), tz = cv.tz + pushZ * push + (mode === 'home' ? (W < H ? 3.5 : 2.4) : 0) + (g ? look.pz : 0);
  const oz = R * Math.sin(tilt);
  cam.position.set(tx + oz * Math.sin(yaw) + par.x, R * Math.cos(tilt), tz + oz * Math.cos(yaw) + par.z);
  cam.lookAt(tx, 0, tz); cam.updateMatrixWorld();
  if (scene.fog){ scene.fog.near = R + 22; scene.fog.far = R + 110; } // only the room past the table falls into the dark
}
function fitHand(){
  if (!handH){ return; }
  hcam.aspect = W / handH; hcam.fov = Math.min(22, Math.max(2.5, 2 * Math.atan(Math.tan(13 * DEG) / hcam.aspect) / DEG));
  const fovR = hcam.fov * DEG, needW = (rows === 1 ? 16.6 : 9.2), needH = rows === 1 ? 2.45 : 4.1;
  const d = Math.max(needW / (2 * Math.tan(fovR / 2) * hcam.aspect), needH / (2 * Math.tan(fovR / 2))) / .97;
  const el = 31 * DEG, cy = rows === 1 ? .92 : 1.45, cz = rows === 1 ? .1 : -.55;
  hcam.position.set(0, cy + d * Math.sin(el), cz + d * Math.cos(el)); hcam.lookAt(0, cy, cz);
  hcam.setViewOffset(W, handH, 0, -(H - handH), W, H); hcam.updateProjectionMatrix(); hcam.updateMatrixWorld();
}

/* ---------- resizing ---------- */
function computeHandH(){
  if (mode !== 'game'){ handH = 0; stripH = 0; rows = 1; return; }
  const big = typeof settings !== 'undefined' && settings.big;
  let tw = Math.min(W * .94 / 15.9, big ? 84 : 66, H * (big ? .108 : .088)); rows = 1;
  if (tw < (big ? 44 : 36) && W < H){ rows = 2; tw = Math.min(W * .94 / 8.9, 56, H * .062); }
  handH = Math.round(tw * (rows === 1 ? 2.3 : 3.75));
  stripH = W < 720 ? 98 : 58; // phones: room for the coach line under the rail, so it never sits on your score plaque
}
function resize(){
  if (!renderer) return;
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pxCap)); renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const oldRows = rows, oldH = handH; computeHandH(); if (rows !== oldRows || !rackBars.length) layoutRack();
  rackGroup.visible = handH > 0; rackLedge.visible = handH > 0; rackLedge.position.z = rows === 1 ? 2.1 : 1.3;
  if (handH > 0 && !oldH && camInit && !reduced()){ rackY = -3.2; rackGroup.position.y = rackY; rackLedge.position.y = -.3 + rackY; } // the rack slides up into view
  fitCamera(!camInit); camInit = true; fitHand();
  document.documentElement.style.setProperty('--handH', handH + 'px'); document.documentElement.style.setProperty('--stripH', stripH + 'px');
  if (S && mode === 'game' && lastHandKey !== null) sync();
  invalidate(); positionLabels();
}

/* ---------- render loop: only while something moves ---------- */
function wake(){ needFrame = true; if (!running && ok){ running = true; lastT = performance.now(); requestAnimationFrame(frame); } }
function invalidate(){ wake(); }
function frame(now){
  const raw = now - lastT, dt = Math.min(.05, raw / 1000); lastT = now;
  let busy = false;
  const slow = now < slowUntil ? .32 : now < hurryUntil ? 2.6 : 1;
  // the lamp: warms up at the start, dips while a table is changed
  if (Math.abs(expo - expoT) > .002){ expo += (expoT - expo) * Math.min(1, dt * expoK); busy = true; } else expo = expoT;
  if (dipT !== dip){ const sp = dt / (dipT > dip ? .2 : .32); dip = dipT > dip ? Math.min(dipT, dip + sp) : Math.max(dipT, dip - sp); if (dip >= 1 && dipCb){ const cb = dipCb; dipCb = null; cb(); dipT = 0; } busy = true; }
  renderer.toneMappingExposure = Math.max(.02, expo * (1 - dip * .62));
  if (Math.abs(rackY) > .002){ rackY += (0 - rackY) * Math.min(1, dt * 7); rackGroup.position.y = rackY; rackLedge.position.y = -.3 + rackY; busy = true; } else if (rackY){ rackY = 0; rackGroup.position.y = 0; rackLedge.position.y = -.3; }
  if (dealerDisc && dealerDisc.position.distanceToSquared(discT) > .0004){ dealerDisc.position.lerp(discT, Math.min(1, dt * 3.2)); dealerDisc.position.y = .86 + Math.sin(Math.min(1, dealerDisc.position.distanceTo(discT) / 6) * Math.PI) * .8; busy = true; }
  if (flipF >= 0){ flipF += dt / .62; if (flipF >= .5 && flipWind != null){ marker.key = ''; flipWind = null; drawMarker(true); } if (flipF >= 1){ flipF = -1; marker.g.rotation.x = 0; marker.g.position.y = 0; } else { marker.g.rotation.x = Math.sin(flipF * Math.PI) * Math.PI / 2; marker.g.position.y = Math.sin(flipF * Math.PI) * .9; } busy = true; }
  for (const P of plaques){ if (P.flipF != null){ P.flipF += dt / .5; if (P.flipF >= .5 && P.wind !== P.flipTo){ P.wind = P.flipTo; P.key = ''; if (S) drawPlaque(P.s); } if (P.flipF >= 1){ P.flipF = null; P.g.rotation.x = 0; } else P.g.rotation.x = Math.sin(P.flipF * Math.PI) * Math.PI / 2 * (P.s === 0 ? -1 : 1); busy = true; } }
  for (const P of plaques){ if (P.shown != null && P.shown !== P.target){ const d = P.target - P.shown, st = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * Math.min(1, dt * 7))); P.shown = Math.abs(st) >= Math.abs(d) ? P.target : P.shown + st; P.key = ''; if (P.s != null && S) drawPlaque(P.s); busy = true; } }
  const sub = window.TW_fast ? 30 : 2, h = window.TW_fast ? .016 : dt / sub * slow;
  // lamps ease toward whoever is to play
  if (Math.abs(warm - warmT) > .004 || Math.abs(turnI - turnIT) > .004 || turnPos.distanceToSquared(turnPosT) > .0004){
    const k = Math.min(1, dt * 5); warm += (warmT - warm) * k; turnI += (turnIT - turnI) * k; turnPos.lerp(turnPosT, k);
    hspot.color.copy(lampCol).lerp(warmCol, warm * .55); hspot.intensity = 6 + warm * 1.5;
    turnSpot.intensity = turnI * 1.5; turnSpot.target.position.copy(turnPos); turnSpot.position.set(turnPos.x * .8, 26, turnPos.z * .8);
    busy = true;
  }
  if (!(drag && drag.moved) && (Math.abs(cv.R - ct.R) > .01 || Math.abs(cv.tilt - ct.tilt) > .0005 || Math.abs(cv.tz - ct.tz) > .003 || Math.abs(cvV.R) > .01)){
    const w = reduced() ? 14 : 6.2;
    for (const k of ['R', 'tilt', 'tx', 'tz']){ const a = w * w * (ct[k] - cv[k]) - 2 * w * cvV[k]; cvV[k] += a * dt; cv[k] += cvV[k] * dt; }
    busy = true;
  } else if (!(drag && drag.moved)){ Object.assign(cv, ct); cvV.R = cvV.tilt = cvV.tx = cvV.tz = 0; }
  { let mv = false; const w = reduced() ? 16 : 7.5; for (const k in look){ const d = lookT[k] - look[k]; if (Math.abs(d) > .0004 || Math.abs(lookV[k]) > .0004){ if (orbit && (k === 'yaw' || k === 'tilt')){ look[k] = lookT[k]; lookV[k] = 0; } else { const a = w * w * d - 2 * w * lookV[k]; lookV[k] += a * dt; look[k] += lookV[k] * dt; } mv = true; } else { look[k] = lookT[k]; lookV[k] = 0; } } if (mv){ busy = true; labelsDirty = true; } }
  if (Math.abs(par.x - par.tx) > .002 || Math.abs(par.z - par.tz) > .002){ const k = Math.min(1, dt * 4); par.x += (par.tx - par.x) * k; par.z += (par.tz - par.z) * k; busy = true; }
  for (let s = 0; s < sub; s++){
    for (const o of tiles){ if (o.pendingHand && readyToXfer(o, now)) doXfer(o); if (step(o, h)) busy = true; }
    for (const o of hand.values()) if (step(o, h)) busy = true;
    // camera push (held still while a tile is being dragged)
    if (!(drag && drag.moved) && (Math.abs(push - pushT) > .0004 || Math.abs(pushV) > .0004)){ const a = 9 * (pushT - push) - 6 * pushV; pushV += a * h; push += pushV * h; busy = true; }
  }
  for (const o of tiles) if (o.pendingHand) busy = true;
  if (fixtures(dt)) busy = true;
  if (!(drag && drag.moved) && (Math.abs(settle) > .0005 || Math.abs(settleV) > .0005)){ settleV += (-140 * settle - 15 * settleV) * dt; settle += settleV * dt; busy = true; } else { settle = 0; settleV = 0; }
  if (flick > .004){ flick *= Math.exp(-dt * 4.5); spot.intensity = 6.6 * (1 + flick * .22); spot.color.copy(lampCol).lerp(warmCol, Math.min(1, flick * .8)); busy = true; } else if (flick){ flick = 0; spot.intensity = 6.6; spot.color.copy(lampCol); }
  updateCam(); cam.position.y += settle; cam.updateMatrixWorld();
  const c0 = prof.on ? performance.now() : 0;
  draw();
  if (prof.on){ if (prof.sync){ const g = renderer.getContext(), px = new Uint8Array(4); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); } prof.frames.push({ l: prof.label, raw, cost: performance.now() - c0, js: c0 - now }); }
  window.TW_busy = busy;
  // hold the frame rate: give up shadow quality first, resolution last
  if (busy && !window.TW_fast && raw < 120){
    if (qSkip > 0) qSkip--; else { qSum += raw; qN++; if (qN >= 50){ const avg = qSum / qN; qSum = 0; qN = 0; if (avg > 21 && window.TW_auto !== false){ if (tier > 0){ tier--; applyTier(); } else if (lowStep < 2){ lowStep++; applyTier(); } qSkip = 40; } } }
  }
  if (busy || needFrame){ needFrame = false; requestAnimationFrame(frame); }
  else running = false;
  if (labelsDirty || busy) positionLabels();
}
function detectTier(){
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || (mobile ? 4 : 8), maxTex = renderer.capabilities.maxTextureSize;
  window.TW_gpu = gpu;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu) || maxTex < 4096 || cores <= 2 || mem <= 2) return 0;
  if (mobile) return cores >= 6 && mem >= 4 ? 1 : 0;
  if (/Intel\(R\) (HD|UHD) Graphics|Mali-4|Adreno \(TM\) [3-5]/i.test(gpu)) return 1;
  return cores >= 8 && mem >= 8 && maxTex >= 8192 ? 2 : 1;
}
/* three looks, chosen up front: High is soft filtered shadows at full resolution, Medium is plain soft shadows,
   Low has contact shadows only and renders at a lower resolution. A slow device steps down a whole tier, never half of one. */
function applyTier(){
  const cast = tier > 0;
  pxCap = tier === 0 ? [1.5, 1.25, 1][lowStep] : 2;
  renderer.shadowMap.type = tier === 2 ? T3.VSMShadowMap : T3.PCFSoftShadowMap; renderer.shadowMap.needsUpdate = true;
  for (const l of [spot, hspot]){
    l.castShadow = cast; const big = l === spot && tier === 2 ? 2048 : l === spot ? 2048 : 1024;
    l.shadow.mapSize.set(big, big); l.shadow.radius = tier === 2 ? (l === spot ? 5 : 3) : 1; l.shadow.bias = tier === 2 ? -.00012 : -.0003;
    if (l.shadow.map){ l.shadow.map.dispose(); l.shadow.map = null; } if (l.shadow.mapPass){ l.shadow.mapPass.dispose(); l.shadow.mapPass = null; }
  }
  M.shadow.opacity = cast ? .5 : .78;
  for (const sc of [scene, hscene]) sc.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  window.TW_quality = tier; window.TW_px = pxCap;
  resize();
}
function setTier(t){ if (!ok) return; if (t === 'auto' || t == null){ tier = detectTier(); window.TW_auto = true; } else { tier = +t; window.TW_auto = false; } lowStep = 0; applyTier(); }
const NOGL = /[?&]nogl=1/.test(location.search); // test only: run every motion but skip drawing, for many windows on one machine
function draw(){
  if (NOGL){ scene.updateMatrixWorld(); hscene.updateMatrixWorld(); cam.updateMatrixWorld(); hcam.updateMatrixWorld(); return; }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
  renderer.clear(true, true, true);
  renderer.render(scene, cam);
  if (handH > 0){ renderer.clearDepth(); renderer.render(hscene, hcam); }
}

/* ---------- moving tiles between the table and the rack ---------- */
const fMain = () => (Math.max(1, H - handH - stripH) / 2) / Math.tan(cam.fov * DEG / 2);
const fHand = () => (handH / 2) / Math.tan(hcam.fov * DEG / 2);
function screenOf(camera, p){ tmpV.copy(p).project(camera); return tmpV.clone(); }
function rayPoint(camera, ndc, dist){ const p = new T3.Vector3(ndc.x, ndc.y, .5).unproject(camera); return camera.position.clone().add(p.sub(camera.position).normalize().multiplyScalar(dist)); }
function relQuat(fromCam, toCam, q){ return toCam.quaternion.clone().multiply(fromCam.quaternion.clone().invert()).multiply(q); }
function fromMainToHand(m, h){
  m.g.updateMatrixWorld();
  const ndc = screenOf(cam, m.pos), d = cam.position.distanceTo(m.pos) * fHand() / fMain();
  const p = rayPoint(hcam, ndc, d), q = relQuat(cam, hcam, m.g.quaternion);
  tmpE.setFromQuaternion(q, 'YXZ');
  h.pos.copy(p); h.rot.set(tmpE.x, tmpE.y, tmpE.z); h.sc = m.sc * 1.0; h.vel.set(0, 0, 0); h.rvel.set(0, 0, 0); h.sv = 0; h.via = null;
  apply(h);
}
function fromHandToMain(h, m){
  h.g.updateMatrixWorld();
  const ndc = screenOf(hcam, h.pos), d = hcam.position.distanceTo(h.pos) * fMain() / Math.max(1, fHand());
  const p = rayPoint(cam, ndc, d), q = relQuat(hcam, cam, h.g.quaternion);
  tmpE.setFromQuaternion(q, 'YXZ');
  m.pos.copy(p); m.rot.set(tmpE.x, tmpE.y, tmpE.z); m.sc = 1; m.vel.set(0, 0, 0); m.rvel.set(0, 0, 0); m.sv = 0; m.via = null;
  apply(m);
}
function doXfer(o){
  const h = handTile(o.id);
  if (o.pendingHand){ fromMainToHand(o, h); h.vel.copy(o.vel).multiplyScalar(fHand() / Math.max(1, fMain()) * .4); o.g.visible = false; o.shadow.visible = false; o.active = false; h.g.visible = true; h.tgt = null; const pz = o.pendingHand; o.pendingHand = null; setTarget(h, pz, { keepPos: true, snd: dealPhase === 2 ? null : 'place' }); }
}
const readyToXfer = (o, now) => o.pendingHand && o.wait <= 0 && !o.via && (now > o.exitBy || (o.tgt && Math.abs(o.tgt.x - o.pos.x) + Math.abs(o.tgt.y - o.pos.y) + Math.abs(o.tgt.z - o.pos.z) < 1.1));

/* ---------- page elements that follow the table ---------- */
let labelsDirty = true;
function positionLabels(){ labelsDirty = false; if (S && mode === 'game' && typeof placeFollowers === 'function') placeFollowers(); }

/* ---------- your rack order, with a dragged tile shown where it would land ---------- */
function rackOrder(){
  const o = handOrder(); // { ids, loose } from the match
  if (!(drag && drag.moved && drag.ins != null && o.ids.includes(drag.id))) return o;
  const n = o.ids.length, placed = o.ids.slice(0, n - o.loose).filter(x => x !== drag.id), loose = o.ids.slice(n - o.loose).filter(x => x !== drag.id);
  placed.splice(Math.min(drag.ins, placed.length), 0, drag.id);
  return { ids: placed.concat(loose), loose: loose.length };
}
/* ---------- reading the game state ----------
   Every tile is always somewhere on the table: in the wall, a hand, a set, the discards, or in the pile while the tiles are washed.
   Nothing appears or vanishes; a tile that changes place travels there. Deal phases:
   'wash'  every tile face down, swept into the middle and turned over by hand
   1       the wall is built from the pile, stack by stack
   2       tiles go out in fours to each seat; yours land face down on the rack in the order dealt
   3       your tiles stand up, one after another
   4       your tiles slide into order
   0       play */
let lastHandKey = null, dealPhase = 0, lastDiscardId = null, washTurn = 0, dealOrder = null;
const rimOn = new Set();
const RMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const reduced = () => RMQ.matches;
/* the pile while the tiles are washed: a loose ring around the marker, every tile face down at its own angle */
const WASH = (() => {
  const out = [];
  for (let r = 3.3; out.length < 220 && r < 10.6; r += 1.42){
    const n = Math.floor(2 * Math.PI * r / 1.5);
    for (let k = 0; k < n; k++){ const a = k / n * 2 * Math.PI + r; out.push({ r, a }); }
  }
  return out;
})();
function washPose(id, turn){
  const k = Math.floor(rand(id * 7.3 + 1.1 + Math.floor(washTurn / 2) * 3.7) * WASH.length), sl = WASH[(k + id * 37) % WASH.length];
  const a = sl.a + turn * .55 + (rand(id + 3.3) - .5) * .25, r = sl.r + (rand(id * 1.9 + turn) - .5) * .5;
  return { x: Math.cos(a) * r, y: LIE + rand(id * 2.1) * .02, z: Math.sin(a) * r * .92, rx: DOWN, ry: rand(id * 5.1 + turn) * Math.PI * 2, rz: 0, sc: 1 };
}
/* the deal goes out in packets of four: three rounds of four to each seat, then one each */
function packetOf(i){
  if (i >= 52) return { p: 16 + (i - 52), q: 0 };
  const r = Math.floor(i / 4), k = i % 4;
  return r < 12 ? { p: Math.floor(r / 4) * 4 + k, q: r % 4 } : { p: 12 + k, q: 0 };
}
const DEAL_GAP = .072; // seconds between packets
function exitPose(x){ return { x: Math.max(-8, Math.min(8, x * .7)), y: 2.4, z: 12.8, rx: 52 * DEG, ry: 0, rz: 0, sc: 1 }; }
let lastMeldKey = new Map(), lastRackIdx = new Map();
function sync(){
  if (!ok || mode !== 'game' || !S || !S.slot) return;
  const want = new Map(); // id -> {where, pose, arc, snd, wait, slide}
  const key = S.handNo + ':' + S.dealer + ':' + S.slotKey;
  const fresh = key !== lastHandKey;
  if (fresh){ lastHandKey = key; pushT = 0; lastMeldKey = new Map(); }
  const lesson = S.mode === 'lesson', rm = reduced();
  if (dealPhase === 'wash'){
    for (const o of tiles) want.set(o.id, { where: 'main', pose: washPose(o.id, washTurn & 1), wait: rm ? 0 : rand(o.id * 3.1) * .22, snd: null });
  } else {
    // the wall, with single tiles dropping to the bottom of their stack
    const stackCount = new Array(72).fill(0), stackOf = new Map();
    const wallIds = dealPhase === 1 ? [...S.slot.keys()] : S.wall.map(x => x.id);
    for (const id of wallIds){ const st = slotStack(S.slot.get(id), S.dealer, S.handNo); stackCount[st.g]++; stackOf.set(id, st); }
    for (const id of wallIds){
      const st = stackOf.get(id), side = Math.floor(st.g / 18);
      want.set(id, { where: 'main', pose: wallPose(st.g, st.top && stackCount[st.g] === 2 ? 1 : 0, id), wait: dealPhase === 1 && !rm ? (st.g % 18) * .03 + side * .05 + (st.top ? .05 : 0) : 0, snd: dealPhase === 1 && st.top && st.g % 3 === 0 ? 'deal' : null, arc: dealPhase === 1 });
    }
  }
  const dealing = dealPhase === 2 || dealPhase === 3;
  let xNeed = 0; const reach = (ps, pad) => { xNeed = Math.max(xNeed, Math.abs(ps.x) + pad); return ps; };
  if (dealPhase !== 1 && dealPhase !== 'wash'){
    S.players.forEach((p, pi) => {
      const winner = S.turn === -1 && S.reveal === pi;
      const drawn = p.hand.find(x => x.id === p.drawnId);
      const dealt = id => { const i = S.dealt && S.dealt.get(id); return i == null ? null : packetOf(i); };
      const dwait = id => { const d = dealt(id); return d && !rm ? d.p * DEAL_GAP + d.q * .022 : 0; };
      if (winner && S.groups){
        // the winning hand laid open in order, a tile at a time, the sets a little apart
        const hid = S.groups.filter(g => g.hidden), stepW = pi % 2 ? 1.36 : 1.02, gap = .5;
        const total = hid.reduce((a, g) => a + g.ids.length * stepW, 0) + gap * Math.max(0, hid.length - 1);
        let u = -total / 2 + stepW / 2, n = 0;
        hid.forEach((g, gi) => { const open = gi < S.revealN; for (const id of g.ids){ want.set(id, { where: 'main', arc: true, snd: open ? 'place' : null, wait: open && !rm ? (S.revealFast ? 0 : n * .05 + gi * .07) : 0, pose: Object.assign(pose(pi, u, 12.45, LIE, open ? 0 : DOWN, 0, 1, id), { ry: pi * 90 * DEG }) }); u += stepW; n++; } u += gap; });
      } else if (pi === 0){
        // your rack, in the order you keep it; tiles not yet placed sit apart on the right
        let ord = rackOrder();
        if (dealing && dealOrder) ord = { ids: dealOrder.filter(id => p.hand.some(x => x.id === id)), loose: 0 };
        const slots = handSlots(ord.ids.length, ord.loose);
        ord.ids.forEach((id, i) => {
          const sl = slots[i], down = dealPhase === 2;
          const ps = down ? { x: sl.x, y: sl.y - Math.cos(LEAN) * STAND + LIE + .02, z: sl.z + .45, rx: DOWN, ry: 0, rz: 0, sc: 1 } : { x: sl.x, y: sl.y, z: sl.z, rx: UP - LEAN, ry: 0, rz: 0, sc: 1 };
          want.set(id, { where: 'hand', i, pose: ps, wait: dealPhase === 2 ? dwait(id) : dealPhase === 3 && !rm ? i * .03 : 0 });
        });
      } else {
        const rest = p.hand.filter(x => x.id !== p.drawnId), order = drawn ? rest.concat([drawn]) : rest;
        const n = order.length, step2 = winner ? (pi % 2 ? 1.36 : 1.02) : 1.02;
        order.forEach((x, i) => {
          const u = (i - (n - 1) / 2) * step2 + (drawn && i === n - 1 && !winner ? .3 : 0);
          want.set(x.id, { where: 'main', arc: true, wait: dealPhase === 2 ? dwait(x.id) : 0, snd: null, hide: narrow && pi % 2 && !winner, pose: winner ? Object.assign(pose(pi, u, 12.45, LIE, 0, 0, 1, x.id), { ry: 0 }) : pose(pi, u, HAND_V, STAND, UP, 0, 1, x.id) });
        });
      }
      // sets on the band behind the discards, from the right-hand end. A new set: the claimed tile leads, the rest follow and lock on
      let cur = MB1;
      p.melds.forEach((m, mi) => {
        const mk = pi + ':' + mi, mkey = m.type + m.tiles.length, isNew = !fresh && lastMeldKey.has(pi + ':n') && lastMeldKey.get(mk) !== mkey;
        lastMeldKey.set(mk, mkey);
        const lastI = m.tiles.length - 1;
        m.tiles.forEach((x, i) => {
          const w = TW * MS, down = m.concealed && m.type === 'kong' && (i === 0 || i === 3), lead = m.claimed === x.id;
          const wt = !isNew || rm ? 0 : lead ? 0 : .14 + i * .045;
          want.set(x.id, { where: 'main', arc: true, wait: wt, snd: isNew ? (i === lastI ? (m.type === 'chow' ? 'chow' : m.type === 'kong' ? 'kong' : 'pung') : null) : 'place', pose: pi % 2 ? pose(pi, cur - w / 2, MV + (lead ? .1 : 0), LIE * MS, down ? DOWN : 0, 0, MS, x.id) : reach(pose(pi, cur - w / 2, MV + (lead ? .1 : 0), LIE * MS, down ? DOWN : 0, 0, MS, x.id), .7) });
          cur -= w + .03;
        });
        cur -= .2;
      });
      lastMeldKey.set(pi + ':n', true);
      let fc = MB0; const fsc = .9;
      for (const f of p.flowers){ want.set(f.id, { where: 'main', arc: true, snd: 'place', wait: dealPhase === 2 ? dwait(f.id) : 0, pose: pi % 2 ? pose(pi, fc + TW * fsc / 2, MV, LIE * fsc, 0, 0, fsc, f.id) : reach(pose(pi, fc + TW * fsc / 2, MV, LIE * fsc, 0, 0, fsc, f.id), .7) }); fc += TW * fsc + .04; }
      // discards: a grid of six per row, in the order thrown. A throw comes down short and slides the last bit
      p.discards.forEach((d, i) => {
        const sl = discardSlot(i, p.discards.length);
        const lifted = S.ui && S.ui.mode === 'claim' && S.lastDiscard && S.lastDiscard.id === d.id;
        want.set(d.id, { where: 'main', arc: true, slide: true, snd: 'place', pose: reach(pose(pi, sl.u, sl.v, LIE * sl.s + (lifted ? .34 : 0), 0, 0, sl.s, d.id), .9) });
      });
    });
  }
  if (!lesson && dealPhase !== 1 && dealPhase !== 'wash'){ const nx = Math.min(9.75, Math.max(7.2, xNeed)); if (Math.abs(nx - playX) > .25 || (fresh && nx !== playX)){ playX = nx; if (narrow) fitCamera(false); } }
  // the lesson lays loose tiles straight onto the cloth; every other tile waits in the wall around the table
  if (S.lay && dealPhase !== 'wash'){
    for (const L of S.lay){ want.set(L.id, { where: 'main', arc: true, snd: L.snd === undefined ? 'place' : L.snd, pose: { x: L.x, y: LIE * (L.s || 1) + (L.lift || 0), z: L.z, rx: L.down ? DOWN : 0, ry: L.ry || 0, rz: 0, sc: L.s || 1 } }); }
  }
  if (lesson && dealPhase !== 'wash'){
    let k = 0;
    for (const id of STILL_ORDER){ if (want.has(id)) continue; const st = slotStack(k, 0, 1); want.set(id, { where: 'main', pose: wallPose(st.g, st.top ? 1 : 0, id), snd: null }); k++; }
  }
  // apply
  const rackMoves = [];
  for (const o of tiles){
    let w = want.get(o.id);
    const h = hand.get(o.id);
    if (!w){ // never expected in play; park it in the pile rather than make it vanish
      w = { where: 'main', pose: washPose(o.id, 0), snd: null };
    }
    if (w.where === 'main'){
      if (o.where === 'hand' && h && h.g.visible){
        o.g.visible = true; fromHandToMain(h, o); h.g.visible = false; h.active = false; h.tgt = null; o.tgt = null; o.pendingHand = null;
        setTarget(o, w.pose, { keepPos: true, arc: !rm, slide: w.slide && !rm, snd: w.snd || 'place', wait: w.wait || 0 });
      } else {
        const was = o.tgt, shown = o.g.visible;
        o.g.visible = !w.hide; o.pendingHand = null;
        if (!was || !shown){ o.tgt = Object.assign({}, w.pose); snap(o); } // only ever at the very start, under the dark
        else if (moved(was, w.pose)){
          const flipUp = Math.cos(was.rx) < -.5 && Math.cos(w.pose.rx) > .5;
          setTarget(o, Object.assign({}, w.pose), { hop: flipUp && !w.arc, arc: w.arc && !rm, slide: w.slide && !rm, snd: w.snd, keepPos: true, wait: w.wait || 0 });
        }
      }
      o.where = 'main';
    } else { // into your rack
      const hh = handTile(o.id);
      if (o.where === 'main' && o.g.visible && !o.pendingHand){
        // lift off the table and travel to the near edge; the rack takes it over from there
        o.pendingHand = w.pose; setTarget(o, exitPose(w.pose.x), { keepPos: true, arc: !rm, wait: w.wait || 0 }); o.exitBy = performance.now() + 2600;
      } else if (o.pendingHand){ o.pendingHand = w.pose; }
      else {
        if (!hh.g.visible){ hh.g.visible = true; hh.tgt = Object.assign({}, w.pose); snap(hh); }
        const was = hh.tgt;
        if (!(drag && drag.moved && drag.id === o.id) && (!was || moved(was, w.pose, true))){
          const prevI = lastRackIdx.get(o.id);
          rackMoves.push({ hh, pose: Object.assign({}, w.pose), i: w.i, prevI, wait: w.wait });
        }
      }
      lastRackIdx.set(o.id, w.i);
      o.where = 'hand';
    }
  }
  // neighbours on the rack move as a ripple, outward from where the change happened
  if (rackMoves.length){
    const pivot = Math.min(...rackMoves.map(r => r.prevI == null ? r.i : Math.min(r.i, r.prevI)));
    for (const r of rackMoves){
      const wt = r.wait != null && r.wait > 0 ? r.wait : (rm || dealPhase === 2 ? 0 : Math.min(.3, Math.max(0, r.i - pivot) * .024));
      setTarget(r.hh, r.pose, { keepPos: true, wait: wt, snd: dealPhase === 3 && r.i % 3 === 0 ? 'deal' : null });
    }
  }
  // highlights: last discard on the table; selection, hover and hint on the rack
  // the newest discard keeps a soft rim until the next one; tiles matching the one you hold up get a cool rim, so dead tiles show
  const ld = S.lastDiscard ? S.lastDiscard.id : null, dt = typeof deadType === 'function' ? deadType() : null, seen = new Set();
  if (dt != null) for (const p of S.players){ for (const d of p.discards) if (d.t === dt) seen.add(d.id); for (const m of p.melds) m.tiles.forEach((x, i) => { if (x.t === dt && !(m.concealed && m.type === 'kong' && (i === 0 || i === 3))) seen.add(x.id); }); }
  for (const o of tiles){
    const mat = o.id === ld ? (S.ui && S.ui.mode === 'claim' ? M.rim : M.rimSoft) : seen.has(o.id) ? M.rimDead : null;
    o.rim.visible = !!mat && o.g.visible; if (mat) o.rim.material = mat;
  }
  lastDiscardId = ld;
  // plaques, the round marker, the dealer's disc and the lamps
  fixT = lesson ? 0 : 1;
  if (!lesson){ for (let s = 0; s < 4; s++) drawPlaque(s); drawMarker(); }
  { const [dx, dz] = seatXZ(S.dealer, S.dealer === 2 ? 5.1 : -5.1, 13.95); discT.set(dx, .86, dz); if (!discSet || fixIn < .05){ dealerDisc.position.copy(discT); discSet = true; } }
  const myMove = S.turn === 0 && S.ui && (S.ui.mode === 'discard' || S.ui.mode === 'claim');
  warmT = myMove ? 1 : 0; turnIT = S.turn >= 0 && dealPhase === 0 ? 1 : 0;
  if (S.turn >= 0){ const [tx, tz] = seatXZ(S.turn, 0, 8.2); turnPosT.set(tx, 0, tz); }
  updateHandFx();
  labelsDirty = true; wake();
}
function moved(a, b, exact){ const e = exact ? .0005 : .002; return Math.abs(a.x - b.x) > e || Math.abs(a.y - b.y) > e || Math.abs(a.z - b.z) > e || Math.abs(Math.cos(a.rx) - Math.cos(b.rx)) > .001 || Math.abs(Math.sin(a.ry - b.ry)) > .001 || Math.abs(a.sc - b.sc) > .001 || Math.abs(Math.cos(a.ry - b.ry) - 1) > .001; }

/* hover, selection, hint and the coach's brass dot */
let hoverId = null, focusId = null, drag = null, noClick = 0;
function updateHandFx(){
  if (!S) return;
  const ui = S.ui || {}, can = ui.mode === 'discard';
  let tipId = null;
  if (can && settings.coach && S.ui_tip != null){
    const me = S.players[0], drawn = me.hand.find(x => x.id === me.drawnId);
    if (drawn && drawn.t === S.ui_tip) tipId = drawn.id; else { const f = rackOrder().ids.find(id => typeOf(id) === S.ui_tip); if (f != null) tipId = f; }
  }
  tipDot.visible = false;
  for (const h of hand.values()){
    if (!h.g.visible || !h.tgt || (drag && drag.moved && drag.id === h.id)) continue;
    const base = h.base || (h.base = {});
    if (!h.tgt._b){ h.tgt._b = { y: h.tgt.y, rx: h.tgt.rx }; }
    const b = h.tgt._b, pk = ui.mode === 'chowpick' && ui.need && ui.need.has(h.t), sel = S.selected === h.id || pk, hint = S.hintId === h.id, hov = (can || ui.mode === 'chowpick') && (hoverId === h.id || focusId === h.id);
    const y = b.y + (sel ? .12 : hint ? .1 : hov ? .04 : 0), rx = b.rx - (sel ? 10 * DEG : 0);
    if (Math.abs(h.tgt.y - y) > 1e-4 || Math.abs(h.tgt.rx - rx) > 1e-4){ h.tgt.y = y; h.tgt.rx = rx; h.active = true; }
    h.rim.visible = sel || hint; h.rim.material = sel ? M.rim : M.rimSoft;
    const g = sel ? .012 : hov ? .03 : 0; if (h.glowT !== g){ h.glowT = g; h.active = true; }
    if (h.id === tipId){ tipDot.visible = true; tipDot.position.set(h.tgt.x, b.y - Math.cos(LEAN) * STAND + .09, h.tgt.z + .6); }
  }
  wake();
}
function pick(ev){
  if (!handH || mode !== 'game') return null;
  const r = canvas.getBoundingClientRect(), nx = (ev.clientX - r.left) / r.width * 2 - 1, ny = -((ev.clientY - r.top) / r.height * 2 - 1);
  const ray = new T3.Raycaster(); ray.setFromCamera({ x: nx, y: ny }, hcam);
  const objs = [...hand.values()].filter(h => h.g.visible).map(h => h.body);
  const hit = ray.intersectObjects(objs, false)[0];
  if (!hit) return null;
  for (const h of hand.values()) if (h.body === hit.object) return h.id;
  return null;
}

/* ---------- home: a still life on the table. Coming back from a hand, every tile travels home ---------- */
let fixIn = 0, fixT = 0;
function stillLife(first){
  const show = new Map();
  const picks = [[36, -3.1, .4, -14], [72, -1.95, .1, -6], [124, -.8, 0, 0], [128, .37, .05, 6], [108, 1.55, .2, 12], [16, 2.75, .55, 18]];
  for (const [id, x, z, a] of picks) show.set(id, { x, y: LIE, z: z + 1, rx: 0, ry: -a * DEG, rz: 0, sc: 1 });
  let k = 0;
  for (const id of STILL_ORDER){ if (show.has(id)) continue; const st = slotStack(k, 0, 1); show.set(id, wallPose(st.g, st.top ? 1 : 0, id)); k++; }
  const rm = reduced();
  for (const o of tiles){
    const p = Object.assign({}, show.get(o.id)), h = hand.get(o.id);
    o.rim.visible = false;
    if (!first && o.where === 'hand' && h && h.g.visible && handH > 0){ o.g.visible = true; fromHandToMain(h, o); o.tgt = null; o.shown = true; }
    if (h){ h.g.visible = false; h.active = false; h.tgt = null; }
    o.pendingHand = null; o.where = 'main';
    if (first || !o.g.visible || !o.tgt && !o.shown){ o.g.visible = true; o.tgt = p; snap(o); }
    else setTarget(o, p, { keepPos: true, arc: !rm, wait: rm ? 0 : rand(o.id * 1.7) * .4 });
    o.shown = false;
  }
  lastHandKey = null; lastDiscardId = null; lastRackIdx = new Map();
  fixT = 0; turnIT = 0; warmT = 0; wake();
}
function fixtures(dt){ // plaques sink into the rail, the marker and the dealer's disc are lifted away
  if (Math.abs(fixIn - fixT) < .002){ if (fixIn !== fixT){ fixIn = fixT; } else return false; }
  else fixIn += (fixT - fixIn) * Math.min(1, dt * 6);
  const e = fixIn;
  plaques.forEach((P, s) => { P.g.visible = e > .01; P.g.position.y = .83 - (1 - e) * 1.5; });
  if (marker){ marker.g.visible = e > .01; marker.g.scale.setScalar(.6 * Math.max(.001, e)); dealerDisc.visible = e > .01; dealerDisc.scale.setScalar(Math.max(.001, e)); }
  for (const l of seatLines) l.visible = false; // v10: the coloured lines read as guides drawn on the cloth; the grids sit in front of each seat, as at a real table
  return true;
}

/* ---------- tables: felt, rail, tile backs and the lamp ---------- */
/* a new table: the lamp dips, the table changes in the dark, the lamp comes back */
function applyTheme(th, now){
  if (!ok){ theme = th; return; }
  if (!now && !booting && theme && !reduced()){ dipCb = () => applyTheme(th, true); dipT = 1; wake(); return; }
  theme = th;
  M.felt.color.set(th.felt); M.felt.sheenColor.set(th.sheen);
  M.walnut.map = th.wood === 'light' ? woodLight : woodDark; M.walnut.color.set(th.rail); M.walnut.needsUpdate = true;
  M.jade.color.set(cos.back != null ? cos.back : th.back);
  M.rack.map = cos.light ? M.rackMaps.light : M.rackMaps.dark; M.rack.color.set(cos.tint); M.rack.needsUpdate = true;
  lampCol.set(cos.lamp != null ? cos.lamp : th.lamp); spot.color.copy(lampCol); hspot.color.copy(lampCol).lerp(warmCol, warm * .55);
  scene.background.set(th.room); scene.fog.color.set(th.room); hemiMain.groundColor.set(th.ground);
  for (const P of plaques) P.key = '';
  if (S && mode === 'game') sync();
  invalidate();
}

/* ---------- touching the table: drag a tile out, tap anything to ask what it is ---------- */
function handPoint(ev, h){
  const r = canvas.getBoundingClientRect(), nx = (ev.clientX - r.left) / r.width * 2 - 1, ny = -((ev.clientY - r.top) / r.height * 2 - 1);
  const ray = new T3.Raycaster(); ray.setFromCamera({ x: nx, y: ny }, hcam);
  const n = hcam.getWorldDirection(new T3.Vector3()), plane = new T3.Plane().setFromNormalAndCoplanarPoint(n, drag.origin);
  return ray.ray.intersectPlane(plane, new T3.Vector3());
}
/* drag along the rack to rearrange, drag up and out onto the table to throw */
const canThrow = () => S && S.ui && S.ui.mode === 'discard' && (typeof lessonAllows !== 'function' || lessonAllows('throw'));
const canArrange = () => S && S.turn !== -1 && mode === 'game' && handH > 0 && !(S.ui && (S.ui.mode === 'read' || S.ui.mode === 'chowpick')) && (typeof lessonAllows !== 'function' || lessonAllows('arrange'));
function dragStart(ev){
  if (!canArrange()) return;
  const id = pick(ev); if (id === null) return;
  const h = hand.get(id); if (!h || !h.tgt) return;
  h.vel.y += 1.6; h.active = true; wake(); // the tile answers the press at once
  drag = { id, x0: ev.clientX, y0: ev.clientY, moved: false, origin: h.pos.clone(), home: Object.assign({}, h.tgt), lastY: ev.clientY, lastT: performance.now(), vy: 0, ins: null, out: false };
  try { canvas.setPointerCapture(ev.pointerId); } catch(e){}
}
function insertAt(ev){
  // which gap in the rack is nearest the pointer
  const o = handOrder(), n = o.ids.length, others = o.ids.slice(0, n - o.loose).filter(x => x !== drag.id).length;
  const loose = o.ids.slice(n - o.loose).filter(x => x !== drag.id).length, slots = handSlots(others + 1 + loose, loose);
  let best = 0, bd = 1e9;
  for (let k = 0; k <= others; k++){ const sl = slots[k], p = screenXY(hcam, sl.x, sl.y, sl.z), d = Math.abs(p.x - ev.clientX) + (rows === 2 ? Math.abs(p.y - ev.clientY) * .8 : 0); if (d < bd){ bd = d; best = k; } }
  return best;
}
function dragMove(ev){
  if (!drag) return false;
  if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 9) return true;
  const h = hand.get(drag.id); if (!h){ drag = null; return false; }
  if (!drag.moved){ drag.moved = true; cancelHold(); snd('pick'); h.rim.visible = true; h.rim.material = M.rim; }
  const p = handPoint(ev, h); if (!p) return true;
  const now = performance.now(), dtm = Math.max(1, now - drag.lastT);
  drag.vy = drag.vy * .6 + (ev.clientY - drag.lastY) / dtm * .4; drag.lastY = ev.clientY; drag.lastT = now;
  const out = ev.clientY < H - handH - 4 && canThrow();
  const ins = out ? null : insertAt(ev);
  if (ins !== drag.ins || out !== drag.out){ drag.ins = ins; drag.out = out; sync(); }
  const y = out ? p.y + .15 : Math.min(p.y + .15, drag.home.y + (rows === 2 ? 1.4 : .5));
  h.tgt = { x: p.x, y, z: p.z, rx: UP - LEAN - (out ? 34 * DEG : 8 * DEG), ry: 0, rz: Math.max(-.2, Math.min(.2, (ev.clientX - drag.x0) * -.0012)), sc: out ? 1.04 : 1.03 };
  h.active = true; wake(); return true;
}
function dragEnd(ev){
  if (!drag) return;
  const d = drag, h = hand.get(d.id);
  if (!d.moved || !h){ drag = null; return; }
  noClick = performance.now() + 350;
  const out = (ev.clientY < H - handH - 4 || d.vy < -.55) && canThrow();
  h.rim.visible = false;
  if (ev.type === 'pointerup' && out){ drag = null; if (tryDiscard(d.id)) return; }
  else if (ev.type === 'pointerup' && d.ins != null && typeof onReorder === 'function'){ const ins = d.ins; drag = null; h.tgt = null; setTarget(h, Object.assign({}, d.home), { keepPos: true }); onReorder(d.id, ins); return; }
  drag = null; h.tgt = null; setTarget(h, d.home, { keepPos: true }); if (S) render();
}
/* press and hold any tile to ask what it is; pinch or scroll the table for the view from above */
let holdTimer = 0; const touches = new Map(); let pinch0 = 0, wheelAt = 0, pinchZ = 1;
function cancelHold(){ if (holdTimer){ clearTimeout(holdTimer); holdTimer = 0; } }
function holdHit(x, y){
  const ev = { clientX: x, clientY: y }, id = pick(ev);
  if (id !== null) return { kind: 'tile', id, t: typeOf(id), own: true };
  const m = pickMain(ev); if (m && m.kind === 'tile' && m.faceUp) return Object.assign(m, { t: typeOf(m.id) });
  return m && m.kind === 'tile' ? Object.assign(m, { t: null }) : null;
}
/* the camera never turns from a press on or just above the rack: the line is the top of the highest rack tile, less a finger's margin */
function rackTop(){ let top = H - handH - stripH; for (const id of hand.keys()){ const q = handXY(id); if (q) top = Math.min(top, q.y - 24); } return top; }
function onDown(ev){
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2){ cancelHold(); orbit = null; pinchZ = lookT.zoom; if (drag){ const h = hand.get(drag.id); if (h && drag.moved){ h.tgt = null; setTarget(h, drag.home, { keepPos: true }); } drag = null; sync(); } const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); return; }
  cancelHold();
  const x0 = ev.clientX, y0 = ev.clientY;
  orbit = null;
  if (mode === 'game' && S && y0 < rackTop() && pick(ev) === null){ if (!pickMain(ev)){ orbit = { x0, y0, yaw0: lookT.yaw, tilt0: lookT.tilt, id: ev.pointerId, moved: false }; try { canvas.setPointerCapture(ev.pointerId); } catch(e){} } }
  holdTimer = setTimeout(() => {
    holdTimer = 0; if (touches.size > 1 || (drag && drag.moved)) return;
    const hit = holdHit(x0, y0); if (!hit) return;
    if (drag){ const h = hand.get(drag.id); if (h){ h.tgt = null; setTarget(h, drag.home, { keepPos: true }); } drag = null; }
    noClick = performance.now() + 600;
    if (typeof onHold === 'function') onHold(hit, x0, y0);
  }, window.TW_holdMs || 520);
  dragStart(ev);
}
function onMove(ev){
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2 && pinch0 > 0){
    const [a, b] = [...touches.values()], r = Math.hypot(a.x - b.x, a.y - b.y) / pinch0;
    if (mode === 'game' && S){ lookT.zoom = pinchZ / Math.max(.3, r); clampLook(); if (lookSeat === 0) lookSeat = -1; wake(); }
    return;
  }
  if (orbit && orbit.id === ev.pointerId){
    const dx = ev.clientX - orbit.x0, dy = ev.clientY - orbit.y0;
    if (!orbit.moved && Math.hypot(dx, dy) > 9){ orbit.moved = true; cancelHold(); canvas.style.cursor = 'grabbing'; }
    if (orbit.moved){ const k = 1 / Math.max(320, Math.min(W, H)); lookT.yaw = orbit.yaw0 - dx * k * 1.6; lookT.tilt = orbit.tilt0 + dy * k * 1.1; clampLook(); lookSeat = -1; wake(); return; }
  }
  if (holdTimer){ const t = touches.get(ev.pointerId); if (t && drag && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 9) cancelHold(); }
  if (dragMove(ev) && drag && drag.moved) return;
  if (ev.pointerType !== 'mouse') return;
  const id = pick(ev); if (id !== hoverId){ hoverId = id; canvas.style.cursor = id !== null && canArrange() ? (canThrow() ? 'pointer' : 'grab') : ''; updateHandFx(); }
}
function onUp(ev){
  touches.delete(ev.pointerId); if (touches.size < 2){ if (pinch0 > 0) lookChanged(); pinch0 = 0; } cancelHold();
  if (orbit && orbit.id === ev.pointerId){
    const o = orbit; orbit = null; canvas.style.cursor = '';
    if (o.moved){ noClick = performance.now() + 250; lookChanged(); return; }
    const now = ev.timeStamp || performance.now();
    if (ev.type === 'pointerup' && now - lastTapAt < 400 && lastTapXY && Math.hypot(ev.clientX - lastTapXY.x, ev.clientY - lastTapXY.y) < 40){ lastTapAt = 0; if (lookAway()){ lookHome(); noClick = performance.now() + 250; } }
    else { lastTapAt = now; lastTapXY = { x: ev.clientX, y: ev.clientY }; }
  }
  dragEnd(ev);
}
function onWheel(ev){
  if (mode !== 'game' || !S) return;
  ev.preventDefault();
  const d = Math.max(-60, Math.min(60, ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY));
  lookT.zoom *= Math.exp(d * (ev.ctrlKey ? .01 : .0022)); clampLook(); if (lookSeat === 0) lookSeat = -1; wake();
  clearTimeout(wheelAt); wheelAt = setTimeout(lookChanged, 200);
}
function pickMain(ev){
  if (mode !== 'game' || !S) return null;
  const r = canvas.getBoundingClientRect(), nx = (ev.clientX - r.left) / r.width * 2 - 1, ny = -((ev.clientY - r.top) / r.height * 2 - 1);
  const ray = new T3.Raycaster(); ray.setFromCamera({ x: nx, y: ny }, cam);
  const objs = tiles.filter(o => o.g.visible).map(o => o.body).concat(plaques.map(P => P.base), [marker.top]);
  const hit = ray.intersectObjects(objs, false)[0]; if (!hit) return null;
  if (hit.object === marker.top) return { kind: 'marker' };
  const pl = plaques.findIndex(P => P.base === hit.object); if (pl >= 0) return { kind: 'plaque', pi: pl };
  const o = tiles.find(o => o.body === hit.object); return o ? { kind: 'tile', id: o.id, faceUp: Math.cos(o.rot.x) > .5 } : null;
}
function screenXY(camera, x, y, z){ tmpV.set(x, y, z).project(camera); return { x: (tmpV.x * .5 + .5) * W, y: (-tmpV.y * .5 + .5) * H }; }

/* ---------- tile pictures for the paper panels ---------- */
const IMG = [];
/* the flat tile pictures used in menus and the result slip. Drawn a few at a time in the background, so the
   title screen never stalls; n = 42 finishes them at once (a game is starting) */
let tileT = 0, tileMat = null;
function renderTileImages(n = 42){
  if (tileT >= 42) return true;
  const iw = 150, ih = 210;
  const sc = new T3.Scene(); sc.environment = scene.environment;
  const key = new T3.DirectionalLight(0xFFE8C8, 3.8); key.position.set(-3, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 20 }); key.shadow.radius = 6; key.shadow.bias = -.0005;
  sc.add(key, new T3.HemisphereLight(0xdfe3e6, 0x6a5c48, 1.1));
  const catcher = new T3.Mesh(new T3.PlaneGeometry(6, 6), new T3.ShadowMaterial({ opacity: .28 })); catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; sc.add(catcher);
  const c = new T3.PerspectiveCamera(14.5, iw / ih, .5, 50); c.position.set(0, 7.4, 3.1); c.lookAt(0, .3, .02);
  // the pictures never carry the helper numbers, so they use their own copy of the faces without them
  if (!tileMat){ const tx = new T3.CanvasTexture(atlasBase); tx.colorSpace = T3.SRGBColorSpace; tileMat = M.face.clone(); tileMat.map = tx; }
  const m = makeTileMesh(0, false); m.face.material = tileMat; m.g.position.y = LIE; sc.add(m.g);
  // drawn at full exposure: the table may still be coming up out of the dark
  const oldPR = renderer.getPixelRatio(), oldEx = renderer.toneMappingExposure; renderer.setPixelRatio(1); renderer.setSize(iw, ih, false); renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  for (const end = Math.min(42, tileT + n); tileT < end; tileT++){
    m.face.geometry = faceGeos[tileT];
    renderer.setViewport(0, 0, iw, ih); renderer.clear(); renderer.render(sc, c);
    IMG[tileT] = canvas.toDataURL('image/png');
  }
  sc.remove(m.g); renderer.setPixelRatio(oldPR); renderer.toneMappingExposure = oldEx; renderer.setClearColor(0x000000, 1);
  catcher.geometry.dispose(); key.shadow.map && key.shadow.map.dispose();
  if (ok) resize();
  if (tileT >= 42){ tileMat.map.dispose(); tileMat.dispose(); tileMat = null; return true; }
  return false;
}

/* ---------- start ---------- */
async function init(host){
  try {
    canvas = document.createElement('canvas'); canvas.id = 'gl'; host.appendChild(canvas);
    renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e){ return false; }
  renderer.outputColorSpace = T3.SRGBColorSpace; renderer.toneMapping = T3.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap; renderer.autoClear = false;
    W = innerWidth; H = innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
  { const q = (typeof settings !== 'undefined' && settings.quality != null && settings.quality !== 'auto') ? +settings.quality : null, u = new URLSearchParams(location.search).get('q'); tier = u != null ? +u : q != null ? q : detectTier(); window.TW_auto = u == null && q == null; }
  performance.mark('tw-i0');
  await document.fonts.load("40px TWbrush", '東'); await document.fonts.load("40px TWserif", '1'); await document.fonts.load("600 40px TWdisplay", 'You 1'); await document.fonts.load("40px TWbody", 'a');
  const tick = async p => { if (window.TWprog) TWprog(p); await new Promise(r => setTimeout(r, 0)); };
  performance.mark('tw-fonts'); await tick(62);
  await buildAtlas(); performance.mark('tw-atlas');
  await tick(78);
  bodyGeo = merge([
    roundedBox(TW, IVORY_H, TL, tier ? 4 : 2, .078).translate(0, TH / 2 - IVORY_H / 2, 0),
    roundedBox(TW, JADE_H + .01, TL, tier ? 4 : 2, .078).translate(0, -TH / 2 + JADE_H / 2 + .005, 0),
    new T3.BoxGeometry(TW - .07, .035, TL - .07).toNonIndexed().translate(0, SEAM_Y, 0)
  ]);
  rimGeo = roundedBox(TW, TH, TL, 2, .085);
  for (let t = 0; t < 42; t++) faceGeos.push(faceGeo(t));
  shadowGeo = new T3.PlaneGeometry(TW * 1.78, TL * 1.6);
  makeMaterials();
  const pm = new T3.PMREMGenerator(renderer);
  const env = pm.fromScene(roomEnv(), .04).texture; scene.environment = env; hscene.environment = env;
  performance.mark('tw-env'); await tick(86);
  buildTable(); buildRack(); buildTiles();
  performance.mark('tw-build'); await tick(94);
  ok = true; applyTier(); performance.mark('tw-tier');
  window.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; if (mode === 'game'){ if (par.tx || par.tz){ par.tx = 0; par.tz = 0; wake(); } return; } par.tx = (e.clientX / W - .5) * -.35; par.tz = (e.clientY / H - .5) * -.22; wake(); });
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', () => { hoverId = null; updateHandFx(); });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', ev => { if (mode === 'game' && S && lookAway() && !pickMain(ev) && ev.clientY < H - handH - stripH * .5){ lookHome(); noClick = performance.now() + 250; } });
  canvas.addEventListener('contextmenu', e => { if (mode === 'game') e.preventDefault(); });
  canvas.addEventListener('click', e => { if (performance.now() < noClick) return; const id = pick(e); if (id !== null){ const b = document.querySelector(`#hand [data-id="${id}"]`); if (b) b.click(); return; } const hit = pickMain(e); if (hit) explainHit(hit); else if (S && S.ui && S.ui.mode === 'read') S.ui.resolve(); });
  setMode('home');
  window.TW_V = { tiles, hand, cam, hcam, scene, hscene, renderer, M, spot, hspot, get handH(){ return handH; } };
  window.TW_dragdbg = () => ({ drag: drag && { id: drag.id, moved: drag.moved, ins: drag.ins, out: drag.out }, canArrange: canArrange(), canThrow: canThrow(), handH, H });
  return true;
}
function setMode(m){
  const first = mode === 'none';
  mode = m; Object.assign(lookT, LOOK0); Object.assign(look, LOOK0); lookSeat = 0; orbit = null; lookChanged();
  if (!ok) return;
  if (m !== 'game'){ stillLife(first); pushT = 0; }
  resize();
}
/* waits inside the deal end early when the player taps: the tiles finish their trip quickly instead of jumping */
let hurryWait = [];
function pause(ms){
  return new Promise((res, rej) => {
    const my = token, done = () => { clearTimeout(t); hurryWait = hurryWait.filter(f => f !== done); my === token ? res() : rej(ABORT); };
    const t = setTimeout(done, ms * speed()); hurryWait.push(done);
  });
}
function hurry(){
  if (!ok) return false;
  const any = dealPhase !== 0 || hurryWait.length || tiles.some(o => o.wait > 0 || o.pendingHand) || [...hand.values()].some(h => h.wait > 0);
  for (const o of tiles){ o.wait = 0; } for (const h of hand.values()) h.wait = 0;
  hurryUntil = performance.now() + 450; [...hurryWait].forEach(f => f()); wake();
  return any;
}
const dealing = () => dealPhase !== 0;
async function deal(){
  if (!ok || mode !== 'game' || autotest) return;
  try {
    const rm = reduced(), out = tiles.some(o => o.g.visible);
    // the last hand is swept into the middle and turned over: two strokes of the wash
    if (out && !rm){ dealPhase = 'wash'; washTurn = (washTurn | 1) + 1; lastHandKey = null; render(); await pause(620); washTurn++; render(); await pause(460); }
    // the wall goes up from the pile, stack by stack
    dealPhase = 1; lastHandKey = null; render(); await pause(rm ? 300 : 1000);
    // out in fours to each seat; yours lands face down in the order dealt
    dealOrder = S.dealt ? S.players[0].hand.map(x => x.id).sort((a, b) => (S.dealt.get(a) || 0) - (S.dealt.get(b) || 0)) : null;
    dealPhase = 2; render(); await pause(rm ? 300 : 17 * DEAL_GAP * 1000 + 520);
    // your tiles stand up, then slide into order
    dealPhase = 3; render(); await pause(rm ? 120 : 14 * 30 + 300);
    dealPhase = 4; render(); await pause(rm ? 100 : 420);
  } finally { dealPhase = 0; dealOrder = null; if (S && mode === 'game') render(); }
}
function warmUp(){ expo = .0; expoT = 1; expoK = 1.5; booting = false; if (ok){ renderer.toneMappingExposure = .02; wake(); } }
function pushTo(pi, amt = 1){
  if (reduced()) return;
  const [x, z] = seatXZ(pi, 0, 8); pushX = x * .45; pushZ = z * .45; pushT = amt;
  // on a tall phone the result slip covers the lower table: slide the table up instead of pushing in
  if (W < 720 && W < H){ pushX = 0; pushZ = pi === 0 ? 13 : pi === 2 ? 3 : 8; pushT = 1; pushZoom = 0; } else { pushZoom = .14; if (W > H * 1.1) pushX += 5.5; } // v10: the slip sits on the right, so the table slides left and the winning hand stays in view
  wake();
}
function nudge(id){ const h = hand.get(id); if (h && h.tgt){ h.rvel.z += 2.4; h.active = true; wake(); } }
function handXY(id){ const h = hand.get(id); if (!h || !h.g.visible) return null; const q = h.tgt || h.pos; return screenXY(hcam, q.x, q.y + STAND, q.z); }
function seatXY(pi, v = 7){ const [x, z] = seatXZ(pi, 0, v); return screenXY(cam, x, 0, z); }
/* the match waits for a thrown tile to come to rest before anything else happens */
function whenLanded(id, max = 1400){
  return new Promise(res => {
    const o = tiles[id], t0 = performance.now();
    if (!o || autotest || window.TW_fast) return res();
    const iv = setInterval(() => {
      const tg = o.tgt, err = tg ? Math.abs(tg.x - o.pos.x) + Math.abs(tg.y - o.pos.y) + Math.abs(tg.z - o.pos.z) : 0;
      if (!o.active || (!o.via && err < .04) || performance.now() - t0 > max){ clearInterval(iv); res(); }
    }, 24);
  });
}
function tileXY(id){ const o = tiles[id]; if (!o || !o.g.visible) return null; const q = o.tgt || o.pos; return screenXY(cam, q.x, q.y, q.z); }
function tilePx(id){ const o = tiles[id]; if (!o || !o.g.visible) return 0; o.g.updateMatrixWorld(); const a = new T3.Vector3(-.5, .35, 0).applyMatrix4(o.g.matrixWorld).project(cam), b = new T3.Vector3(.5, .35, 0).applyMatrix4(o.g.matrixWorld).project(cam); return Math.hypot((a.x - b.x) * W / 2, (a.y - b.y) * H / 2); }
function pointXY(x, z, y = 0){ return screenXY(cam, x, y, z); }
/* where the next tile will be drawn from, so the count can sit beside it */
function plaqueXY(s){ const P = plaques[s]; if (!P || !P.g.visible) return null; return screenXY(cam, P.g.position.x, P.g.position.y, P.g.position.z); }
function wallXY(){ if (!S || !S.wall || !S.wall.length) return null; const o = tiles[S.wall[0].id]; if (!o || !o.g.visible) return null; const q = o.tgt || o.pos; return screenXY(cam, q.x, q.y + .9, q.z); }
return { lookAtSeat, lookHome, get looking(){ return lookAway(); }, get lookSeat(){ return lookSeat; }, wallXY, plaqueXY, retype, resetTypes, hurry, dealing, warmUp, prof: { start(label, sync){ prof.on = true; prof.label = label; prof.sync = !!sync; wake(); }, label(l){ prof.label = l; }, stop(){ prof.on = false; return prof.frames.splice(0); } }, init, sync, setMode, setTableView, get tableView(){ return tableView; }, setHelpers, whenLanded, tileXY, tilePx, pointXY, seatXZ, rackOrder, deal, pushTo, nudge, applyTheme, renderTileImages, get tilesDone(){ return tileT >= 42; }, handXY, seatXY, slow(ms = 520){ slowUntil = performance.now() + ms; wake(); }, IMG, get ok(){ return ok; }, setFocus(id){ focusId = id; updateHandFx(); }, fx: updateHandFx, invalidate, positionLabels, setCos(o){ cos = Object.assign({ back: null, lamp: null, tint: 0xffffff, light: false }, o); if (ok && theme) applyTheme(theme); }, thump(a = 1, lamp = false){ if (!ok || reduced()) return; settleV -= a * 1.1; if (lamp) flick = 1; wake(); }, resize, setTier, get tier(){ return tier; }, get gpu(){ return window.TW_gpu; } };
})();
