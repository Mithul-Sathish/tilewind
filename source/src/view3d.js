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
const scene = new T3.Scene(), hscene = new T3.Scene();
const cam = new T3.PerspectiveCamera(28, 1, 1, 600), hcam = new T3.PerspectiveCamera(22, 1, .5, 400);
const tmpV = new T3.Vector3(), tmpV2 = new T3.Vector3(), tmpQ = new T3.Quaternion(), tmpQ2 = new T3.Quaternion(), tmpE = new T3.Euler(0, 0, 0, 'YXZ');
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

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
  const jobs = [];
  for (let t = 0; t < 42; t++){
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(faceSVG(t, FONT_CSS));
    g.filter = 'saturate(1.35) contrast(1.06)';
    jobs.push(img.decode().then(() => g.drawImage(img, (t % COLS) * CW, Math.floor(t / COLS) * CH, CW, CH)));
  }
  await Promise.all(jobs);
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
}
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
  const fl = woodTex([26, 20, 16]); fl.repeat.set(12, 26); M.floor = new T3.MeshStandardMaterial({ color: 0xffffff, map: fl, roughness: .9 });
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
let spot, hspot, hemiMain, turnSpot, felt, floor, rail, rackGroup, rackBars = [], tipDot, rackLedge;
const plaques = [], lampCol = new T3.Color(0xFFE2B8), warmCol = new T3.Color(0xFFC98A);
let marker = null, dealerDisc = null, warm = 0, warmT = 0, turnI = 0, turnIT = 0; const turnPos = new T3.Vector3(0, 0, 9), turnPosT = new T3.Vector3(0, 0, 9);
const lightsFor = (sc, isHand) => {
  const key = new T3.SpotLight(0xFFE2B8, isHand ? 6 : 6.6, 0, isHand ? .7 : .5, 1, 0);
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
  scene.background = new T3.Color(0x0b0a08);
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
    g.add(base, top); g.position.set(x, .83, z); g.rotation.y = (s === 2 ? 0 : s * 90) * DEG; g.visible = false; scene.add(g);
    plaques.push({ g, base, top, c, tex, mat, key: '' });
  }
  // the round marker: a bone disc in a brass ring at the centre of the table
  {
    const g = new T3.Group();
    const ring = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.28, .3, 72), M.brass); ring.position.y = .15; ring.castShadow = true; ring.receiveShadow = true;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const tex = new T3.CanvasTexture(c); tex.colorSpace = T3.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const top = new T3.Mesh(new T3.CircleGeometry(2.08, 64), new T3.MeshPhysicalMaterial({ map: tex, roughness: .4, clearcoat: .4, clearcoatRoughness: .35, envMapIntensity: .4 })); top.rotation.x = -Math.PI / 2; top.position.y = .302; top.receiveShadow = true;
    g.add(ring, top); g.visible = false; scene.add(g); marker = { g, top, c, tex, key: '' };
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
  const key = [p.score, w, portrait, on, theme && theme.id].join();
  if (P.key === key) return; P.key = key;
  const g = P.c.getContext('2d'), a = SEAT[s];
  g.fillStyle = a.lac; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = a.ink; g.globalAlpha = .5; g.lineWidth = 3; g.strokeRect(10, 10, 1004, 140); g.globalAlpha = 1;
  g.fillStyle = a.ink; g.textBaseline = 'middle';
  g.font = "118px TWbrush"; g.textAlign = 'center'; g.fillText(WIND_HAN[w], 92, 84);
  g.globalAlpha = .5; g.fillRect(170, 30, 3, 100); g.globalAlpha = 1;
  g.font = "600 84px TWserif"; g.textAlign = 'left'; g.fillText(p.name, 200, 84);
  g.font = "600 118px TWserif"; g.textAlign = 'right'; g.fillText(String(p.score), 990, 82);
  P.tex.needsUpdate = true; P.mat.emissiveIntensity = on ? .2 : 0;
}
function drawMarker(){
  const left = S.wall.length, key = [S.roundWind, S.handNo, S.totalHands, left, S.mode].join();
  if (marker.key === key) return; marker.key = key;
  const g = marker.c.getContext('2d');
  g.fillStyle = '#E9DFC8'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#B3261E'; g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 232, 0, 7); g.stroke();
  g.fillStyle = '#B3261E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "216px TWbrush"; g.fillText(WIND_HAN[S.roundWind], 256, 180);
  g.fillStyle = '#2A2117'; g.font = "600 132px TWserif"; g.fillText(String(left), 256, 372);
  g.font = "600 40px TWserif"; g.globalAlpha = .7; g.fillText('LEFT', 256, 452); g.globalAlpha = 1;
  marker.tex.needsUpdate = true;
}
function buildRack(){
  hscene.background = null;
  hspot = lightsFor(hscene, true);
  rackGroup = new T3.Group(); hscene.add(rackGroup);
  const ledge = new T3.Mesh(roundedBox(60, .6, 9, 2, .12), M.walnut); ledge.position.set(0, -.3, 2.1); ledge.receiveShadow = true; hscene.add(ledge); rackLedge = ledge;
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
const typeOf = id => id < 136 ? Math.floor(id / 4) : 34 + (id - 136);
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
function wallPose(g, level, jit){
  const side = SIDE_ORDER[Math.floor(g / 18)], j = g % 18;
  return pose(side, 8.76 - j * 1.03 + 1.1, 9.6, LIE + level * (TH + .004), DOWN, 0, 1, jit);
}
function slotStack(k, dealer, handNo){
  const g0 = SIDE_ORDER.indexOf(dealer) * 18 + 3 + (handNo * 5) % 11;
  return { g: (g0 + Math.floor(k / 2)) % 72, top: k % 2 === 0 };
}

/* ---------- hand layout (rack) ---------- */
const HAND_GAP = .62, HSTEP = 1.04, LEAN = 13 * DEG;
let handLayout = { rows: 1, width: 15.6 };
function handSlots(n, hasDrawn){
  // returns [{x, y, z, row}] for n tiles; the drawn tile (last) sits apart
  const out = [];
  if (rows === 1){
    const w = (n - 1) * HSTEP + (hasDrawn ? HAND_GAP : 0);
    for (let i = 0; i < n; i++) out.push({ x: -w / 2 + i * HSTEP + (hasDrawn && i === n - 1 ? HAND_GAP : 0), z: 0, row: 0 });
  } else {
    const top = Math.ceil((n - (hasDrawn ? 1 : 0)) / 2);
    for (let i = 0; i < n; i++){
      const r = i < top ? 0 : 1, k = r ? i - top : i, cnt = r ? n - top : top;
      const w = (cnt - 1) * HSTEP + (r && hasDrawn ? HAND_GAP : 0);
      out.push({ x: -w / 2 + k * HSTEP + (r && hasDrawn && i === n - 1 ? HAND_GAP : 0), z: r ? 0 : -1.3, row: r });
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
  if (opts.arc){
    const d = Math.hypot(p.x - o.pos.x, p.z - o.pos.z);
    if (d > 1.2) o.via = { x: (o.pos.x + p.x) / 2, y: Math.max(o.pos.y, p.y) + 1.4 + Math.min(d * .08, 1.2), z: (o.pos.z + p.z) / 2 };
  }
  if (opts.hop) o.via = { x: p.x, y: p.y + 1.05, z: p.z };
  if (opts.snd) o.landSnd = opts.snd;
  if (opts.wait) o.wait = opts.wait;
  if (!prev && !opts.keepPos) snap(o);
  wake();
}
function snap(o){
  const p = o.tgt; o.pos.set(p.x, p.y, p.z); o.rot.set(p.rx, p.ry, p.rz); o.sc = p.sc; o.vel.set(0, 0, 0); o.rvel.set(0, 0, 0); o.sv = 0; o.via = null; apply(o);
}
function apply(o){
  o.g.position.copy(o.pos); o.g.rotation.set(o.rot.x, o.rot.y, o.rot.z, 'YXZ'); o.g.scale.setScalar(o.sc);
  if (o.shadow){
    const show = o.g.visible && o.tgt && o.tgt.y < 1.0 && o.pos.y < 3;
    o.shadow.visible = !!show;
    if (show){
      const standing = Math.abs(Math.cos(o.rot.x)) < .5;
      o.shadow.position.set(o.pos.x, .006, o.pos.z); o.shadow.rotation.set(-Math.PI / 2, o.rot.y, 0, 'YXZ');
      o.shadow.scale.set(o.sc * 1.0, o.sc * (standing ? .62 : 1), 1);
      const lift = Math.max(0, o.pos.y - (standing ? STAND : LIE));
      o.shadow.material === M.shadow && (o.shadow.visible = lift < 2.2);
      o.shadow.scale.multiplyScalar(1 + lift * .25);
    }
  }
}
let landClock = 0;
function step(o, dt){
  if (!o.active) return false;
  if (o.wait > 0){ o.wait -= dt; return true; }
  const p = o.via || o.tgt, k = o.via ? K_SPRING * .7 : K_SPRING;
  const ax = k * (p.x - o.pos.x) - C_DAMP * o.vel.x, ay = k * (p.y - o.pos.y) - C_DAMP * o.vel.y, az = k * (p.z - o.pos.z) - C_DAMP * o.vel.z;
  o.vel.x += ax * dt; o.vel.y += ay * dt; o.vel.z += az * dt;
  o.pos.addScaledVector(o.vel, dt);
  const t = o.tgt;
  const rx = K_SPRING * (t.rx - o.rot.x) - C_DAMP * o.rvel.x, ry = K_SPRING * (t.ry - o.rot.y) - C_DAMP * o.rvel.y, rz = K_SPRING * (t.rz - o.rot.z) - C_DAMP * o.rvel.z;
  o.rvel.x += rx * dt; o.rvel.y += ry * dt; o.rvel.z += rz * dt; o.rot.addScaledVector(o.rvel, dt);
  o.sv += (K_SPRING * (t.sc - o.sc) - C_DAMP * o.sv) * dt; o.sc += o.sv * dt;
  if (o.via && Math.hypot(o.via.x - o.pos.x, o.via.y - o.pos.y, o.via.z - o.pos.z) < .55) o.via = null;
  if (o.glow !== o.glowT){ o.glow += (o.glowT - o.glow) * Math.min(1, dt * 14); if (Math.abs(o.glow - o.glowT) < .002) o.glow = o.glowT; if (o.mats[0].emissive){ o.mats[0].emissive.setRGB(o.glow, o.glow * .93, o.glow * .82); o.fmat.emissive.setRGB(o.glow, o.glow * .93, o.glow * .82); } }
  const err = Math.abs(t.x - o.pos.x) + Math.abs(t.y - o.pos.y) + Math.abs(t.z - o.pos.z) + Math.abs(t.rx - o.rot.x) + Math.abs(t.ry - o.rot.y) + Math.abs(t.rz - o.rot.z) + Math.abs(t.sc - o.sc);
  const spd = o.vel.length() + o.rvel.length() + Math.abs(o.sv);
  if (o.landSnd && !o.via && err < .05 && t.y < 1.5){ const now = performance.now(); if (now - landClock > 28){ snd(o.landSnd); landClock = now; } o.landSnd = null; }
  if (!o.via && err < .0015 && spd < .004 && o.glow === o.glowT){ snap(o); o.active = false; return false; }
  apply(o); return true;
}

/* ---------- camera ---------- */
let pushZoom = .14, camR = 70, push = 0, pushV = 0, pushT = 0, pushX = 0, pushZ = 0;
let TILT = 20 * DEG;
function placeCam(c, R, tx, tz, ox = 0, oz = 0){ c.position.set(tx + ox, R * Math.cos(TILT), tz + R * Math.sin(TILT) + oz); c.lookAt(tx, 0, tz); c.updateMatrixWorld(); }
function fitCamera(){
  const vh = Math.max(1, H - handH - stripH), aspect = W / vh, portrait = aspect < .9;
  TILT = (portrait ? 15 : aspect > 1.9 ? 27 : 21) * DEG; // tall phone: nearly overhead so tiles stay large; wide: lower, so the table fills the width
  const test = new T3.PerspectiveCamera(28, aspect, 1, 600);
  const ext = portrait ? 14.5 : 14.7, frac = portrait ? .99 : (mode === 'game' ? .97 : .8);
  const pts = []; for (const x of [-ext, ext]) for (const z of [-ext, ext]) pts.push(new T3.Vector3(x, .8, z));
  let lo = 20, hi = 400;
  for (let i = 0; i < 40; i++){
    const mid = (lo + hi) / 2; placeCam(test, mid, 0, 0); test.updateProjectionMatrix();
    const fits = pts.every(p => { tmpV.copy(p).project(test); return Math.abs(tmpV.x) <= frac && Math.abs(tmpV.y) <= frac; });
    if (fits) hi = mid; else lo = mid;
  }
  camR = hi;
  cam.aspect = aspect; cam.setViewOffset(W, vh, 0, 0, W, H); cam.updateProjectionMatrix();
  updateCam();
}
function updateCam(){
  const R = camR * (1 - pushZoom * push);
  placeCam(cam, R, pushX * push, pushZ * push + (mode === 'home' ? (W < H ? 6 : 2.4) : 0), par.x, par.z);
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
  stripH = W < 720 ? 84 : 58;
}
function resize(){
  if (!renderer) return;
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pxCap)); renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const oldRows = rows; computeHandH(); if (rows !== oldRows || !rackBars.length) layoutRack();
  rackGroup.visible = handH > 0; rackLedge.visible = handH > 0; rackLedge.position.z = rows === 1 ? 2.1 : 1.3;
  fitCamera(); fitHand();
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
  const slow = now < slowUntil ? .32 : 1;
  const sub = window.TW_fast ? 30 : 2, h = window.TW_fast ? .016 : dt / sub * slow;
  // lamps ease toward whoever is to play
  if (Math.abs(warm - warmT) > .004 || Math.abs(turnI - turnIT) > .004 || turnPos.distanceToSquared(turnPosT) > .0004){
    const k = Math.min(1, dt * 5); warm += (warmT - warm) * k; turnI += (turnIT - turnI) * k; turnPos.lerp(turnPosT, k);
    hspot.color.copy(lampCol).lerp(warmCol, warm * .55); hspot.intensity = 6 + warm * 1.5;
    turnSpot.intensity = turnI * 1.5; turnSpot.target.position.copy(turnPos); turnSpot.position.set(turnPos.x * .8, 26, turnPos.z * .8);
    busy = true;
  }
  if (Math.abs(par.x - par.tx) > .002 || Math.abs(par.z - par.tz) > .002){ const k = Math.min(1, dt * 4); par.x += (par.tx - par.x) * k; par.z += (par.tz - par.z) * k; busy = true; }
  for (let s = 0; s < sub; s++){
    for (const o of tiles){ if (o.xferAt && now >= o.xferAt){ o.xferAt = 0; doXfer(o); } if (step(o, h)) busy = true; }
    for (const o of hand.values()) if (step(o, h)) busy = true;
    // camera push
    if (Math.abs(push - pushT) > .0004 || Math.abs(pushV) > .0004){ const a = 9 * (pushT - push) - 6 * pushV; pushV += a * h; push += pushV * h; busy = true; }
  }
  for (const o of tiles) if (o.xferAt) busy = true;
  if (Math.abs(settle) > .0005 || Math.abs(settleV) > .0005){ settleV += (-140 * settle - 15 * settleV) * dt; settle += settleV * dt; busy = true; } else { settle = 0; settleV = 0; }
  if (flick > .004){ flick *= Math.exp(-dt * 4.5); spot.intensity = 6.6 * (1 + flick * .22); spot.color.copy(lampCol).lerp(warmCol, Math.min(1, flick * .8)); busy = true; } else if (flick){ flick = 0; spot.intensity = 6.6; spot.color.copy(lampCol); }
  updateCam(); cam.position.y += settle; cam.updateMatrixWorld();
  draw();
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
function draw(){
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
  if (o.pendingHand){ fromMainToHand(o, h); o.g.visible = false; o.shadow.visible = false; o.active = false; h.g.visible = true; h.tgt = null; setTarget(h, o.pendingHand, { keepPos: true, snd: 'place' }); o.pendingHand = null; }
}

/* ---------- labels for the other seats ---------- */
let labelsDirty = true;
function positionLabels(){
  labelsDirty = false;
  if (!S || mode !== 'game') return;
  const nums = document.getElementById('rackNums');
  if (nums){
    let html = '';
    if (settings.labels && handH) for (const h of hand.values()){
      if (!h.g.visible || h.t >= 27 || !h.tgt || (drag && drag.moved && drag.id === h.id)) continue;
      if (rows === 2 && h.tgt.z < -.5) continue;
      tmpV.set(h.pos.x, h.pos.y - Math.cos(LEAN) * STAND - .14, h.pos.z + .7).project(hcam);
      html += `<span style="left:${((tmpV.x * .5 + .5) * W).toFixed(1)}px;top:${((-tmpV.y * .5 + .5) * H).toFixed(1)}px">${h.t % 9 + 1}</span>`;
    }
    if (nums._h !== html){ nums.innerHTML = html; nums._h = html; }
  }
}

/* ---------- reading the game state ---------- */
let lastHandKey = null, dealPhase = 0, lastDiscardId = null;
const rimOn = new Set();
function sync(){
  if (!ok || mode !== 'game' || !S || !S.slot) return;
  const want = new Map(); // id -> {where, pose, arc, snd}
  const key = S.handNo + ':' + S.dealer + ':' + S.slotKey;
  const fresh = key !== lastHandKey;
  if (fresh){ lastHandKey = key; pushT = 0; }
  // the wall, with single tiles dropping to the bottom of their stack
  const stackCount = new Array(72).fill(0), stackOf = new Map();
  const wallIds = dealPhase === 1 ? [...S.slot.keys()] : S.wall.map(x => x.id);
  for (const id of wallIds){ const st = slotStack(S.slot.get(id), S.dealer, S.handNo); stackCount[st.g]++; stackOf.set(id, st); }
  for (const id of wallIds){ const st = stackOf.get(id); want.set(id, { where: 'main', pose: wallPose(st.g, st.top && stackCount[st.g] === 2 ? 1 : 0, id) }); }
  if (dealPhase !== 1){
    S.players.forEach((p, pi) => {
      // concealed hand
      const winner = S.turn === -1 && S.reveal === pi;
      const drawn = p.hand.find(x => x.id === p.drawnId);
      const rest = (pi === 0 ? sortTiles(p.hand.filter(x => x.id !== p.drawnId)) : p.hand.filter(x => x.id !== p.drawnId));
      const order = drawn ? rest.concat([drawn]) : rest;
      if (winner && S.groups){
        // the winning hand laid open, set by set
        const hid = S.groups.filter(g => g.hidden), stepW = pi % 2 ? 1.36 : 1.02, gap = .34;
        const total = hid.reduce((a, g) => a + g.ids.length * stepW, 0) + gap * Math.max(0, hid.length - 1);
        let u = -total / 2 + stepW / 2;
        hid.forEach((g, gi) => { for (const id of g.ids){ want.set(id, { where: 'main', arc: true, snd: gi < S.revealN ? 'place' : null, pose: Object.assign(pose(pi, u, pi % 2 ? 12.2 : 12.45, LIE, gi < S.revealN ? 0 : DOWN, 0, 1, id), { ry: 0 }) }); u += stepW; } u += gap; });
      } else if (pi === 0){
        const slots = handSlots(order.length, !!drawn);
        order.forEach((x, i) => want.set(x.id, { where: 'hand', i, pose: { x: slots[i].x, y: slots[i].y, z: slots[i].z, rx: UP - LEAN, ry: 0, rz: 0, sc: 1 } }));
      } else {
        const n = order.length, step2 = winner ? (pi % 2 ? 1.36 : 1.02) : 1.02;
        order.forEach((x, i) => {
          const u = (i - (n - 1) / 2) * step2 + (drawn && i === n - 1 && !winner ? .3 : 0);
          want.set(x.id, { where: 'main', arc: true, pose: winner ? Object.assign(pose(pi, u, 12.2, LIE, 0, 0, 1, x.id), { ry: 0 }) : pose(pi, u, 12.3, STAND, UP, 0, 1, x.id) });
        });
      }
      // melds on the felt, from the right hand end
      let cur = 8.9; const msc = .86;
      for (const m of p.melds){
        m.tiles.forEach((x, i) => {
          const side = m.claimed === x.id, w = (side ? TL : TW) * msc;
          const down = m.concealed && m.type === 'kong' && (i === 0 || i === 3);
          want.set(x.id, { where: 'main', arc: true, snd: 'claim', pose: pose(pi, cur - w / 2, 11.15 + (side ? .17 * msc : 0), LIE * msc, down ? DOWN : 0, side ? UP : 0, msc, x.id) });
          cur -= w + .03;
        });
        cur -= .32;
      }
      let fc = -8.9; const fsc = .76;
      for (const f of p.flowers){ want.set(f.id, { where: 'main', arc: true, snd: 'place', pose: pose(pi, fc + TW * fsc / 2, 11.15, LIE * fsc, 0, 0, fsc, f.id) }); fc += TW * fsc + .04; }
      // discards in rows of six
      p.discards.forEach((d, i) => {
        let row = Math.floor(i / 6), col = i % 6;
        if (i >= 24){ row = 1 + Math.floor((i - 24) / 3) % 3; col = 6 + (i - 24) % 3; }
        const lifted = S.ui && S.ui.mode === 'claim' && S.lastDiscard && S.lastDiscard.id === d.id;
        want.set(d.id, { where: 'main', arc: pi !== 0, snd: 'place', pose: pose(pi, (col - 2.5) * 1.02, 3.8 + row * 1.36, LIE + (lifted ? .34 : 0), 0, 0, 1, d.id) });
      });
    });
  }
  // apply
  let dealRank = 0;
  for (const o of tiles){
    const w = want.get(o.id);
    const h = hand.get(o.id);
    if (!w){ o.g.visible = false; o.shadow.visible = false; o.active = false; o.tgt = null; o.where = 'none'; if (h){ h.g.visible = false; h.active = false; h.tgt = null; } continue; }
    if (fresh && dealPhase === 1){
      // the wall slides in from beyond the table edge, a stack at a time
      const p = w.pose, k = S.slot.get(o.id), r = Math.hypot(p.x, p.z) || 1;
      o.g.visible = true; o.where = 'main'; o.xferAt = 0; o.pendingHand = null;
      if (h){ h.g.visible = false; h.active = false; h.tgt = null; }
      const side = SIDE_ORDER[Math.floor(slotStack(k, S.dealer, S.handNo).g / 18)], [ox, oz] = seatXZ(side, 0, 30);
      o.tgt = Object.assign({}, p, { x: p.x + ox, z: p.z + oz, y: p.y + .6 }); snap(o);
      setTarget(o, p, { wait: (slotStack(k, S.dealer, S.handNo).g % 18) * .022 + Math.floor(slotStack(k, S.dealer, S.handNo).g / 18) * .03, snd: k % 2 ? 'deal' : null, keepPos: true });
      continue;
    }
    if (w.where === 'main'){
      if (o.where === 'hand' && h && h.g.visible){ o.g.visible = true; fromHandToMain(h, o); h.g.visible = false; h.active = false; h.tgt = null; o.tgt = null; setTarget(o, w.pose, { keepPos: true, snd: w.snd || 'place' }); }
      else {
        const was = o.tgt; o.g.visible = true;
        if (!was || moved(was, w.pose)) setTarget(o, w.pose, { hop: !!was && Math.cos(was.rx) < -.5 && Math.cos(w.pose.rx) > .5, arc: !!was && w.arc, snd: was ? (dealPhase === 2 ? 'deal' : w.snd) : null, keepPos: !!was, wait: dealPhase === 2 && was ? (S.slot.get(o.id) || 0) * .016 : 0 });
      }
      o.where = 'main'; o.pendingHand = null; o.xferAt = 0;
    } else { // into your hand
      const hh = handTile(o.id);
      if (o.where === 'main' && o.g.visible){
        o.pendingHand = w.pose;
        if (dealPhase === 2){ o.xferAt = performance.now() + (S.slot.get(o.id) || 0) * 16; } else { o.xferAt = 0; doXfer(o); }
      } else if (o.pendingHand){ o.pendingHand = w.pose; }
      else {
        hh.g.visible = true;
        const was = hh.tgt; if (!was || moved(was, w.pose, true)) setTarget(hh, Object.assign({}, w.pose), { keepPos: !!was });
      }
      o.where = 'hand';
    }
  }
  // highlights: last discard on the table; selection, hover and hint on the rack
  const ld = S.lastDiscard ? S.lastDiscard.id : null;
  if (ld !== lastDiscardId){ if (lastDiscardId !== null) tiles[lastDiscardId].rim.visible = false; if (ld !== null) tiles[ld].rim.visible = true; lastDiscardId = ld; }
  if (ld !== null) tiles[ld].rim.material = S.ui && S.ui.mode === 'claim' ? M.rim : M.rimSoft;
  // plaques, the round marker, the dealer's disc and the lamps
  for (let s = 0; s < 4; s++){ plaques[s].g.visible = true; drawPlaque(s); }
  marker.g.visible = true; drawMarker();
  { const [dx, dz] = seatXZ(S.dealer, S.dealer === 2 ? 5.1 : -5.1, 13.95); dealerDisc.visible = true; dealerDisc.position.set(dx, .86, dz); }
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
    if (drawn && drawn.t === S.ui_tip) tipId = drawn.id; else { const f = sortTiles(me.hand.filter(x => x.id !== me.drawnId)).find(x => x.t === S.ui_tip); if (f) tipId = f.id; }
  }
  tipDot.visible = false;
  for (const h of hand.values()){
    if (!h.g.visible || !h.tgt || (drag && drag.moved && drag.id === h.id)) continue;
    const base = h.base || (h.base = {});
    if (!h.tgt._b){ h.tgt._b = { y: h.tgt.y, rx: h.tgt.rx }; }
    const b = h.tgt._b, sel = S.selected === h.id, hint = S.hintId === h.id, hov = can && (hoverId === h.id || focusId === h.id);
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

/* ---------- home: a still life on the table ---------- */
function stillLife(){
  const order = [...Array(144).keys()].sort((a, b) => rand(a + 7) - rand(b + 7));
  const show = new Map();
  const fan = [9, 22, 124, 128, 108, 72, 4]; // 1 Dot, ... chosen for colour
  const picks = [[36, -3.1, .4, -14], [72, -1.95, .1, -6], [124, -.8, 0, 0], [128, .37, .05, 6], [108, 1.55, .2, 12], [16, 2.75, .55, 18]];
  for (const [id, x, z, a] of picks) show.set(id, { x, y: LIE, z: z + 1, rx: 0, ry: -a * DEG, rz: 0, sc: 1 });
  let k = 0;
  for (const id of order){ if (show.has(id)) continue; const st = slotStack(k, 0, 1); show.set(id, wallPose(st.g, st.top ? 1 : 0, id)); k++; if (k >= 136) break; }
  for (const o of tiles){
    const p = show.get(o.id); const h = hand.get(o.id); if (h){ h.g.visible = false; h.active = false; h.tgt = null; }
    o.where = p ? 'main' : 'none'; o.xferAt = 0; o.pendingHand = null; o.rim.visible = false;
    if (!p){ o.g.visible = false; o.shadow.visible = false; o.tgt = null; continue; }
    o.g.visible = true; o.tgt = p; snap(o);
  }
  lastHandKey = null; lastDiscardId = null;
  for (const P of plaques) P.g.visible = false; if (marker){ marker.g.visible = false; dealerDisc.visible = false; } turnIT = 0; warmT = 0;
}

/* ---------- tables: felt, rail, tile backs and the lamp ---------- */
function applyTheme(th){
  theme = th; if (!ok) return;
  M.felt.color.set(th.felt); M.felt.sheenColor.set(th.sheen);
  M.walnut.map = th.wood === 'light' ? woodLight : woodDark; M.walnut.color.set(th.rail); M.walnut.needsUpdate = true;
  M.jade.color.set(cos.back != null ? cos.back : th.back);
  M.rack.map = cos.light ? M.rackMaps.light : M.rackMaps.dark; M.rack.color.set(cos.tint); M.rack.needsUpdate = true;
  lampCol.set(cos.lamp != null ? cos.lamp : th.lamp); spot.color.copy(lampCol); hspot.color.copy(lampCol).lerp(warmCol, warm * .55);
  scene.background.set(th.room); hemiMain.groundColor.set(th.ground);
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
function dragStart(ev){
  if (!S || !S.ui || S.ui.mode !== 'discard') return;
  const id = pick(ev); if (id === null) return;
  const h = hand.get(id); if (!h || !h.tgt) return;
  h.vel.y += 1.6; h.active = true; wake(); // the tile answers the press at once
  drag = { id, x0: ev.clientX, y0: ev.clientY, moved: false, origin: h.pos.clone(), home: Object.assign({}, h.tgt), lastY: ev.clientY, lastT: performance.now(), vy: 0 };
  try { canvas.setPointerCapture(ev.pointerId); } catch(e){}
}
function dragMove(ev){
  if (!drag) return false;
  if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 9) return true;
  const h = hand.get(drag.id); if (!h){ drag = null; return false; }
  if (!drag.moved){ drag.moved = true; snd('pick'); h.rim.visible = true; h.rim.material = M.rim; }
  const p = handPoint(ev, h); if (!p) return true;
  const now = performance.now(), dtm = Math.max(1, now - drag.lastT);
  drag.vy = drag.vy * .6 + (ev.clientY - drag.lastY) / dtm * .4; drag.lastY = ev.clientY; drag.lastT = now;
  const out = ev.clientY < H - handH - 4;
  h.tgt = { x: p.x, y: p.y + .15, z: p.z, rx: UP - LEAN - (out ? 34 * DEG : 8 * DEG), ry: 0, rz: Math.max(-.2, Math.min(.2, (ev.clientX - drag.x0) * -.0012)), sc: out ? 1.04 : 1 };
  h.active = true; wake(); return true;
}
function dragEnd(ev){
  if (!drag) return;
  const d = drag, h = hand.get(d.id); drag = null;
  if (!d.moved || !h) return;
  noClick = performance.now() + 350;
  const out = ev.clientY < H - handH - 4 || d.vy < -.55;
  h.rim.visible = false;
  if (ev.type === 'pointerup' && out && tryDiscard(d.id)) return;
  h.tgt = null; setTarget(h, d.home, { keepPos: true }); if (S) render();
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
function renderTileImages(){
  const iw = 150, ih = 210;
  const sc = new T3.Scene(); sc.environment = scene.environment;
  const key = new T3.DirectionalLight(0xFFE8C8, 3.8); key.position.set(-3, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 20 }); key.shadow.radius = 6; key.shadow.bias = -.0005;
  sc.add(key, new T3.HemisphereLight(0xdfe3e6, 0x6a5c48, 1.1));
  const catcher = new T3.Mesh(new T3.PlaneGeometry(6, 6), new T3.ShadowMaterial({ opacity: .28 })); catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; sc.add(catcher);
  const c = new T3.PerspectiveCamera(14.5, iw / ih, .5, 50); c.position.set(0, 7.4, 3.1); c.lookAt(0, .3, .02);
  const m = makeTileMesh(0, false); m.g.position.y = LIE; sc.add(m.g);
  const oldPR = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(iw, ih, false);
  renderer.setClearColor(0x000000, 0);
  for (let t = 0; t < 42; t++){
    m.face.geometry = faceGeos[t];
    renderer.setViewport(0, 0, iw, ih); renderer.clear(); renderer.render(sc, c);
    IMG[t] = canvas.toDataURL('image/png');
  }
  sc.remove(m.g); renderer.setPixelRatio(oldPR); renderer.setClearColor(0x000000, 1);
  if (ok) resize();
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
  await document.fonts.load("40px TWbrush", '東'); await document.fonts.load("40px TWserif", '1');
  await buildAtlas();
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
  buildTable(); buildRack(); buildTiles();
  ok = true; applyTier();
  window.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; par.tx = (e.clientX / W - .5) * -.7; par.tz = (e.clientY / H - .5) * -.45; wake(); });
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', dragStart);
  canvas.addEventListener('pointerup', dragEnd); canvas.addEventListener('pointercancel', dragEnd);
  canvas.addEventListener('pointermove', e => { if (dragMove(e) && drag && drag.moved) return; const id = pick(e); if (id !== hoverId){ hoverId = id; canvas.style.cursor = id !== null && S && S.ui && S.ui.mode === 'discard' ? 'pointer' : ''; updateHandFx(); } });
  canvas.addEventListener('pointerleave', () => { hoverId = null; updateHandFx(); });
  canvas.addEventListener('click', e => { if (performance.now() < noClick) return; const id = pick(e); if (id !== null){ const b = document.querySelector(`#hand [data-id="${id}"]`); if (b) b.click(); return; } const hit = pickMain(e); if (hit) explainHit(hit); else if (S && S.ui && S.ui.mode === 'read') S.ui.resolve(); else if (e.clientY < H - handH - stripH) toggleLook(); });
  setMode('home');
  window.TW_V = { tiles, hand, cam, hcam, scene, hscene, renderer, M, spot, hspot, get handH(){ return handH; } };
  return true;
}
function setMode(m){
  mode = m;
  if (!ok) return;
  if (m !== 'game'){ stillLife(); pushT = 0; push = 0; pushV = 0; }
  resize();
}
async function deal(){
  if (!ok || mode !== 'game' || autotest) return;
  try {
    dealPhase = 1; lastHandKey = null; render();
    await sleep(760);
    dealPhase = 2; render();
    await sleep(1050);
  } finally { dealPhase = 0; }
}
let look = false;
/* on a tall phone: tap the cloth to lean in over the discards, tap again to sit back */
function toggleLook(){ if (!(W < H) || mode !== 'game') return false; look = !look; pushX = 0; pushZ = .6; pushZoom = .36; pushT = look ? 1 : 0; wake(); return look; }
function pushTo(pi, amt = 1){
  look = false;
  const [x, z] = seatXZ(pi, 0, 8); pushX = x * .45; pushZ = z * .45; pushT = amt;
  // on a tall phone the result slip covers the lower table: slide the table up instead of pushing in
  if (W < 720 && W < H){ pushX = 0; pushZ = pi === 0 ? 13 : pi === 2 ? 3 : 8; pushT = 1; pushZoom = 0; } else pushZoom = .14;
  wake();
}
function nudge(id){ const h = hand.get(id); if (h && h.tgt){ h.rvel.z += 2.4; h.active = true; wake(); } }
function handXY(id){ const h = hand.get(id); if (!h || !h.g.visible) return null; const q = h.tgt || h.pos; return screenXY(hcam, q.x, q.y + STAND, q.z); }
function seatXY(pi, v = 7){ const [x, z] = seatXZ(pi, 0, v); return screenXY(cam, x, 0, z); }
return { init, sync, setMode, deal, pushTo, nudge, applyTheme, renderTileImages, handXY, seatXY, slow(ms = 520){ slowUntil = performance.now() + ms; wake(); }, IMG, get ok(){ return ok; }, setFocus(id){ focusId = id; updateHandFx(); }, fx: updateHandFx, invalidate, positionLabels, setCos(o){ cos = Object.assign({ back: null, lamp: null, tint: 0xffffff, light: false }, o); if (ok && theme) applyTheme(theme); }, thump(a = 1, lamp = false){ if (!ok) return; settleV -= a * 1.1; if (lamp) flick = 1; wake(); }, resize, setTier, get tier(){ return tier; }, get gpu(){ return window.TW_gpu; } };
})();
