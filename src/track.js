import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG, wrapAngle } from './config.js';
import data from './track.json';
import { Crowd } from './people.js';
import { agvModel } from './models.js';

const N = 2048; // campioni della spline
const C = {
  blue: 0x1f4fbf, red: 0xd32a2a, white: 0xf2f2f2, yellow: 0xf2c200, orange: 0xe8742a,
  card: 0xc89b62, wrap: 0xd5e2ea, wood: 0xa57a45, machine: 0x5d7d8f, dark: 0x3a3f47,
  light: 0xdde2e7, screen: 0x22313f, steel: 0x8d98a6, green: 0x3ccf4e, wall: 0xe8ebee,
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function textTexture(text, w, h, { bg = '#fff', fg = '#1f4fbf', stripe = '#d32a2a' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = stripe; g.fillRect(0, h * 0.86, w, h * 0.14); }
    g.fillStyle = fg;
    g.font = `900 ${Math.round(h * 0.55)}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h * 0.45, w * 0.92);
  });
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- geometrie statiche: tutto finisce in UNA mesh con vertex color (1 draw call)
const parts = [];
function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, l, x, y, z, hex, m) => parts.push(paint(new THREE.BoxGeometry(w, h, l).translate(x, y, z).applyMatrix4(m), hex));
const cyl = (r, h, x, y, z, hex, m) => parts.push(paint(new THREE.CylinderGeometry(r, r, h, 12).translate(x, y, z).applyMatrix4(m), hex));

// --- arredo generico per reparto. Coordinate locali: z lungo la pista, x di lato.
function shelf(m, r) {
  for (const x of [-0.6, 0.6]) for (const z of [-3, 0, 3]) box(0.12, 4.5, 0.12, x, 2.25, z, C.orange, m);
  for (const y of [0.15, 1.6, 3.05, 4.4]) {
    for (const x of [-0.6, 0.6]) box(0.08, 0.14, 6, x, y, 0, C.blue, m);
    if (y < 4) for (const z of [-1.5, 1.5]) if (r() < 0.8) {
      const h = 0.5 + r() * 0.7;
      box(1.0, h, 2.5, 0, y + 0.08 + h / 2, z, r() < 0.7 ? C.card : C.wrap, m);
    }
  }
}
function pallet(m, r) {
  box(1.2, 0.15, 1.2, 0, 0.075, 0, C.wood, m);
  const h = 0.4 + r() * 1.2;
  box(1.1, h, 1.1, 0, 0.15 + h / 2, 0, r() < 0.5 ? C.card : C.wrap, m);
}
function press(m) {
  box(3, 1, 3, 0, 0.5, 0, C.machine, m);
  box(3.06, 0.2, 3.06, 0, 1.0, 0, C.yellow, m);
  for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) box(0.45, 3, 0.45, x, 2.5, z, C.machine, m);
  box(2.2, 0.6, 2.2, 0, 3.2, 0, C.dark, m);
  box(3.3, 1.2, 3.3, 0, 4.6, 0, C.machine, m);
}
function cnc(m) {
  box(2, 2.2, 2.6, 0, 1.1, 0, C.light, m);
  box(2.04, 1.2, 1.3, 0, 1.2, 0.35, C.blue, m);
  box(2.06, 0.45, 0.5, 0, 1.6, -0.9, C.screen, m);
  cyl(0.07, 0.6, 0.7, 2.5, -1.0, C.green, m);
}
function bench(m, r) {
  box(1.2, 0.08, 3, 0, 0.9, 0, C.light, m);
  for (const x of [-0.55, 0.55]) for (const z of [-1.4, 1.4]) box(0.07, 0.9, 0.07, x, 0.45, z, C.dark, m);
  for (const z of [-1.4, 1.4]) box(0.07, 1.0, 0.07, 0.55, 1.4, z, C.dark, m);
  box(0.4, 0.05, 3, 0.45, 1.9, 0, C.blue, m);
  for (let z = -1.1; z <= 1.1; z += 0.55) if (r() < 0.7) box(0.3, 0.2, 0.4, -0.2, 1.04, z, r() < 0.5 ? C.red : C.blue, m);
}
function conveyor(m, r) {
  box(0.9, 0.18, 6, 0, 0.8, 0, C.dark, m);
  for (const x of [-0.48, 0.48]) box(0.06, 0.14, 6, x, 0.94, 0, C.yellow, m);
  for (const z of [-2.6, 0, 2.6]) for (const x of [-0.35, 0.35]) box(0.08, 0.72, 0.08, x, 0.36, z, C.steel, m);
  for (let z = -2.2; z < 2.6; z += 1.4) if (r() < 0.7) box(0.5, 0.35, 0.5, 0, 1.07, z, C.card, m);
}
function booth(m) {
  box(4, 3.5, 5, 0, 1.75, 0, C.light, m);
  box(4.06, 0.3, 5.06, 0, 2.7, 0, C.red, m);
  box(4.08, 1, 2.2, 0, 1.5, 0, C.screen, m);
  box(1, 1.2, 1, 0, 4.1, 1.4, C.steel, m);
}
function drums(m, r) {
  for (const x of [-0.35, 0.35]) for (const z of [-0.7, 0, 0.7]) cyl(0.3, 0.9, x, 0.45, z, [C.blue, C.red, C.yellow][Math.floor(r() * 3)], m);
}
const PROPS = {
  magazzino: [{ len: 6, dep: 1.3, build: shelf }, { len: 1.4, dep: 1.3, build: pallet }],
  stampaggio: [{ len: 3.4, dep: 3.4, build: press }, { len: 2.8, dep: 2.2, build: cnc }],
  assemblaggio: [{ len: 3, dep: 1.3, build: bench }, { len: 6, dep: 1.1, build: conveyor }, { len: 2.8, dep: 2.2, build: cnc }],
  verniciatura: [{ len: 5.2, dep: 4.2, build: booth }, { len: 2.2, dep: 1.6, build: drums }],
  spedizioni: [{ len: 1.4, dep: 1.3, build: pallet }, { len: 1.4, dep: 1.3, build: pallet }, { len: 6, dep: 1.3, build: shelf }],
};

// --- pezzi animati (mesh separate, poche: ognuna è una draw call)
const animMat = hex => new THREE.MeshLambertMaterial({ color: hex });
const MAT = { orange: animMat(C.orange), dark: animMat(C.dark), yellow: animMat(C.yellow), light: animMat(C.light) };
function part(parent, w, h, l, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l).translate(0, h / 2, 0), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
const _tip = new THREE.Vector3();
function robot(scene, x, z, phase) { // braccio robotico che "salda": base, torretta, due segmenti
  const base = new THREE.Group(); base.position.set(x, 0, z); scene.add(base);
  part(base, 1.2, 0.5, 1.2, 0, 0, 0, MAT.dark);
  const turret = new THREE.Group(); turret.position.y = 0.5; base.add(turret);
  part(turret, 0.8, 0.8, 0.8, 0, 0, 0, MAT.orange);
  const arm1 = new THREE.Group(); arm1.position.y = 0.7; turret.add(arm1);
  part(arm1, 0.35, 2.2, 0.35, 0, 0, 0, MAT.orange);
  const arm2 = new THREE.Group(); arm2.position.y = 2.1; arm1.add(arm2);
  part(arm2, 0.28, 1.6, 0.28, 0, 0, 0, MAT.orange);
  part(arm2, 0.3, 0.35, 0.3, 0, 1.6, 0, MAT.dark);
  const f = (t) => {
    turret.rotation.y = Math.sin(t * 0.7 + phase) * 1.6;
    arm1.rotation.x = 0.4 + Math.sin(t * 1.1 + phase) * 0.35;
    arm2.rotation.x = 1.2 + Math.sin(t * 1.7 + phase) * 0.5;
  };
  // punta della pinza in coordinate mondo, solo mentre "salda" (parte del ciclo)
  f.tip = t => (Math.sin(t * 1.7 + phase) > 0.55 ? arm2.localToWorld(_tip.set(0, 1.95, 0)) : null);
  return f;
}
function crane(scene, a) { // carroponte che scorre avanti e indietro nel reparto
  const g = new THREE.Group(); scene.add(g);
  const w = a.x1 - a.x0;
  part(g, w, 0.8, 1.2, 0, 8, 0, MAT.yellow);
  const hook = part(g, 0.15, 3, 0.15, 0, 5, 0, MAT.dark);
  part(hook, 1.2, 0.4, 1.2, 0, -0.4, 0, MAT.dark);
  g.position.x = (a.x0 + a.x1) / 2;
  return (t) => {
    g.position.z = a.z0 + 6 + (a.z1 - a.z0 - 12) * (0.5 + 0.5 * Math.sin(t * 0.12));
    hook.position.x = Math.sin(t * 0.3) * (w / 2 - 2);
  };
}

export function buildTrack(scene) {
  const SC = data.scale ?? 1, m2 = ([x, z]) => [x * SC, z * SC]; // pixel del disegno → metri
  const curve = new THREE.CatmullRomCurve3(data.points.map((q) => { const [x, z] = m2(q); return new THREE.Vector3(x, 0, z); }), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const L = curve.getLength(), hw = CONFIG.roadWidth / 2, step = L / N;
  const X = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N);
  const K = new Float32Array(N), th = new Float32Array(N);
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    curve.getPointAt(i / N, p); curve.getTangentAt(i / N, t);
    X[i] = p.x; Z[i] = p.z; TX[i] = t.x; TZ[i] = t.z; th[i] = Math.atan2(t.x, t.z);
  }
  for (let i = 0; i < N; i++) { // curvatura, media su 9 campioni per togliere rumore
    let s = 0;
    for (let j = -4; j <= 4; j++) { const a = (i + j + N) % N; s += wrapAngle(th[(a + 1) % N] - th[a]); }
    K[i] = s / 9 / step;
  }

  const wrap = s => ((s % L) + L) % L;
  const wrapDelta = ds => { const w = wrap(ds); return w > L / 2 ? w - L : w; };
  const out = { x: 0, z: 0, tx: 0, tz: 1, k: 0 };
  const sample = (s) => { // riusa sempre lo stesso oggetto: copiare i valori subito
    const f = wrap(s) / step, i = Math.floor(f) % N, j = (i + 1) % N, a = f - Math.floor(f);
    out.x = X[i] + (X[j] - X[i]) * a;
    out.z = Z[i] + (Z[j] - Z[i]) * a;
    const tx = TX[i] + (TX[j] - TX[i]) * a, tz = TZ[i] + (TZ[j] - TZ[i]) * a, l = Math.hypot(tx, tz);
    out.tx = tx / l; out.tz = tz / l;
    out.k = K[i] + (K[j] - K[i]) * a;
    return out;
  };
  // d > 0 = sinistra rispetto al senso di marcia
  const point = (s, d) => { const q = sample(s); return { x: q.x + q.tz * d, z: q.z - q.tx * d }; };
  const nearRoad = (x, z, r) => {
    for (let i = 0; i < N; i += 2) if ((X[i] - x) ** 2 + (Z[i] - z) ** 2 < r * r) return true;
    return false;
  };

  const nearestS = (q) => { // s del campione di pista più vicino a un punto [x, z] in pixel
    const [x, z] = m2(q); let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const dd = (X[i] - x) ** 2 + (Z[i] - z) ** 2; if (dd < bd) { bd = dd; best = i; } }
    return best * step;
  };
  const zones = data.zones.map(z => ({ ...z, s: z.at ? nearestS(z.at) : z.from * L })).sort((a, b) => a.s - b.s);
  const zoneAt = (s) => { const w = wrap(s); let z = zones[zones.length - 1]; for (const q of zones) if (q.s <= w) z = q; return z; };
  const pads = data.pads.map(q => ({ s: q.at ? nearestS(q.at) : q.t * L, d: q.d }));
  const areas = (data.areas ?? []).map(a => { const [x0, z0] = m2(a.rect.slice(0, 2)), [x1, z1] = m2(a.rect.slice(2)); return { ...a, x0, z0, x1, z1 }; });
  const inArea = (x, z) => areas.find(a => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);
  // ostacoli = cerchi nello spazio pista (s, d); gli AGV cambiano d nel tempo
  const obstacles = [];
  for (const o of data.obstacles ?? []) {
    const s0 = nearestS(o.at);
    if (o.type === 'cones') for (let s = 0; s <= o.len; s += 2) obstacles.push({ type: 'cone', s: s0 + s, d: o.d, r: 0.35 });
    else obstacles.push({ type: 'pallet', s: s0, d: o.d, r: 0.9 });
  }
  const crossings = (data.crossings ?? []).map((c, i) => ({ s: nearestS(c.at), period: c.period, phase: i * 0.37, reach: hw + 4 }));
  for (const c of crossings) obstacles.push(c.obst = { type: 'agv', s: c.s, d: c.reach, r: 1.0 });
  const startP = point(0, 0);
  // niente arredo nei corridoi degli AGV né davanti alla tribuna della partenza
  const blocked = (x, z, r = 0) => {
    if (Math.hypot(x - startP.x, z - startP.z) < 16 + r) return true;
    if (landmark) { const q = point(landmark.s, 0); if (Math.hypot(x - q.x, z - q.z) < 11 + r) return true; }
    return crossings.some((c) => {
      const a = point(c.s, -c.reach - 2), b = point(c.s, c.reach + 2), dx = b.x - a.x, dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - a.x - dx * u, z - a.z - dz * u) < 2.5 + r;
    });
  };
  // quota della pista: punti chiave raccordati con coseno + rampe da salto (salita lineare, poi stacco netto)
  const H = new Float32Array(N);
  const keys = (data.heights ?? []).map(h => ({ s: nearestS(h.at), y: h.y })).sort((a, b) => a.s - b.s);
  for (let i = 0; i < N && keys.length > 1; i++) {
    const s = i * step;
    let a = keys[keys.length - 1], b = keys[0];
    for (let j = 0; j < keys.length; j++) if (keys[j].s <= s) { a = keys[j]; b = keys[(j + 1) % keys.length]; }
    const span = wrap(b.s - a.s) || L, u = wrap(s - a.s) / span;
    H[i] = a.y + (b.y - a.y) * (1 - Math.cos(Math.PI * Math.min(1, u))) / 2;
  }
  const jumps = (data.jumps ?? []).map(j => ({ s: nearestS(j.at), len: j.len, h: j.h }));
  for (const j of jumps) { // un campione alla volta: nessun doppio conteggio
    const i0 = Math.round(j.s / step), n = Math.round(j.len / step);
    for (let i = 0; i <= n; i++) H[(i0 + i) % N] += j.h * (i / n) ** 1.3;
  }
  const height = (s) => { const f = wrap(s) / step, i = Math.floor(f) % N; return H[i] + (H[(i + 1) % N] - H[i]) * (f - Math.floor(f)); };
  const landmark = data.landmark ? { s: nearestS(data.landmark.at) } : null;

  const padHit = (s, d) => pads.some(q => Math.abs(wrapDelta(s - q.s)) < 2.4 && Math.abs(d - q.d) < 1.3 + CONFIG.kartRadius * 0.5);

  // --- nastro di triangoli che segue la pista tra s0..s1 e d0..d1
  function ribbon(s0, s1, d0, d1, y, segs, vScale, colorFn) {
    const pos = [], uv = [], col = [], nor = [], c = new THREE.Color();
    for (let i = 0; i < segs; i++) {
      const sa = s0 + (s1 - s0) * i / segs, sb = s0 + (s1 - s0) * (i + 1) / segs;
      const a0 = point(sa, d0), a1 = point(sa, d1), b0 = point(sb, d0), b1 = point(sb, d1);
      const va = (sa - s0) * vScale, vb = (sb - s0) * vScale;
      const ya = y + height(sa), yb = y + height(sb);
      pos.push(a0.x, ya, a0.z, b0.x, yb, b0.z, a1.x, ya, a1.z, a1.x, ya, a1.z, b0.x, yb, b0.z, b1.x, yb, b1.z);
      uv.push(0, va, 0, vb, 1, va, 1, va, 0, vb, 1, vb);
      if (colorFn) { c.setHex(colorFn((sa + sb) / 2)); for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  // pareti verticali lungo il bordo pista dove è sopraelevata (fianchi del soppalco, guardrail)
  function wallRibbon(dd, yBot, yTop, minH, colorFn) {
    const pos = [], col = [], c = new THREE.Color(), segs = Math.round(L / 0.6);
    for (let i = 0; i < segs; i++) {
      const sa = L * i / segs, sb = L * (i + 1) / segs;
      if (Math.max(height(sa), height(sb)) < minH) continue;
      const a = point(sa, dd), b = point(sb, dd), a0 = yBot(sa), a1 = yTop(sa), b0 = yBot(sb), b1 = yTop(sb);
      pos.push(a.x, a0, a.z, b.x, b0, b.z, a.x, a1, a.z, a.x, a1, a.z, b.x, b0, b.z, b.x, b1, b.z);
      c.setHex(colorFn((sa + sb) / 2)); for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  // --- strada: corsia di fabbrica con strisce gialle
  const roadTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#50555d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? '#585d65' : '#484c53'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.fillStyle = '#f2c200'; g.fillRect(10, 0, 16, h); g.fillRect(w - 26, 0, 16, h);
    g.fillStyle = '#e8e8e8'; g.fillRect(124, 0, 8, h / 2);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const tile = L / Math.round(L / 8);
  scene.add(new THREE.Mesh(ribbon(0, L, -hw, hw, 0.01, Math.round(L / 0.5), 1 / tile), new THREE.MeshLambertMaterial({ map: roadTex })));
  // fianchi in cemento + guardrail giallo/nero dove la pista è alta, piloni sotto il soppalco
  const sideMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const sides = [];
  for (const sd of [-1, 1]) {
    sides.push(wallRibbon(sd * (hw + 0.8), () => 0, s => height(s) + 0.02, 0.05, () => C.steel));
    sides.push(wallRibbon(sd * (hw + 0.85), s => height(s), s => height(s) + 0.7, 0.4, s => (Math.floor(s / 2) % 2 ? C.yellow : C.dark)));
  }
  scene.add(new THREE.Mesh(mergeGeometries(sides), sideMat));
  // rampe da salto: superficie a strisce gialle/nere sopra la strada
  const rampTex = canvasTex(64, 64, (g) => { g.fillStyle = '#111'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f2c200'; for (let i = 0; i < 64; i += 16) g.fillRect(0, i, 64, 8); });
  rampTex.wrapT = THREE.RepeatWrapping;
  for (const j of jumps) scene.add(new THREE.Mesh(ribbon(j.s, j.s + j.len - step, -hw, hw, 0.03, 12, 1 / 1.2), new THREE.MeshLambertMaterial({ map: rampTex })));

  const kerbFn = s => (Math.floor(s / 2) % 2 ? C.red : C.white);
  const kerbSegs = Math.round(L / 0.5);
  scene.add(new THREE.Mesh(
    mergeGeometries([ribbon(0, L, hw, hw + 0.8, 0.02, kerbSegs, 1, kerbFn), ribbon(0, L, -hw - 0.8, -hw, 0.02, kerbSegs, 1, kerbFn)]),
    new THREE.MeshLambertMaterial({ vertexColors: true })));

  const checker = canvasTex(256, 64, (g) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 32, y * 32, 32, 32); }
  });
  scene.add(new THREE.Mesh(ribbon(-1, 1, -hw, hw, 0.025, 2, 0.5), new THREE.MeshLambertMaterial({ map: checker })));

  // --- turbo "nastro trasportatore"
  const padTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcc00';
    for (const y0 of [8, 72]) { g.beginPath(); g.moveTo(8, y0 + 40); g.lineTo(32, y0); g.lineTo(56, y0 + 40); g.lineTo(56, y0 + 54); g.lineTo(32, y0 + 16); g.lineTo(8, y0 + 54); g.fill(); }
  });
  padTex.wrapT = THREE.RepeatWrapping;
  padTex.repeat.y = 2;
  scene.add(new THREE.Mesh(
    mergeGeometries(pads.map(q => ribbon(q.s - 2.25, q.s + 2.25, q.d - 1.3, q.d + 1.3, 0.03, 4, 1 / 4.5))),
    new THREE.MeshBasicMaterial({ map: padTex })));

  // --- capannone: limiti, pavimento, muri
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minZ = Math.min(minZ, Z[i]); maxZ = Math.max(maxZ, Z[i]); }
  const x0 = minX - 30, x1 = maxX + 30, z0 = minZ - 30, z1 = maxZ + 30, W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const podium = { x: (minX + maxX) / 2, z: maxZ + 18 };
  const showcase = [{ x: podium.x - 20, z: podium.z }, { x: podium.x + 20, z: podium.z }];

  const floorTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a7a9a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#aeb0ab' : '#9fa19c'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#8f918c'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 6, D / 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.position.set(cx, -0.01, cz);
  scene.add(floor);

  const ID = new THREE.Matrix4();
  const rngShaft = mulberry32(3);
  // --- tetto a shed (denti di sega): falda inclinata opaca + vetrata verticale rivolta a nord, capriate, lampade
  const WALL_H = 9, TOOTH = 10, RISE = 4.2;
  const roofPos = [], glassPos = [];
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let z = z0; z < z1 - 0.1; z += TOOTH) {
    const zz = Math.min(z + TOOTH, z1);
    quad(roofPos, [x0, WALL_H, z], [x1, WALL_H, z], [x1, WALL_H + RISE, zz], [x0, WALL_H + RISE, zz]);
    quad(glassPos, [x0, WALL_H + RISE, zz], [x1, WALL_H + RISE, zz], [x1, WALL_H, zz], [x0, WALL_H, zz]);
    for (let x = x0 + 3; x < x1; x += 3) box(0.12, RISE, 0.12, x, WALL_H + RISE / 2, zz - 0.06, C.dark, ID); // montanti vetrata
    box(W, 0.35, 0.3, cx, WALL_H - 0.2, zz, C.steel, ID);                                              // trave
    box(W, 0.2, 0.2, cx, WALL_H - 1.4, zz, C.steel, ID);                                               // corrente inferiore capriata
    for (let x = x0 + 2; x < x1; x += 4) box(0.12, 1.2, 0.12, x, WALL_H - 0.8, zz, C.steel, ID);       // montanti capriata
  }
  const mkFlat = (pos, mat) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat));
  };
  mkFlat(roofPos, new THREE.MeshLambertMaterial({ color: 0xd9dde2, side: THREE.DoubleSide }));
  mkFlat(glassPos, new THREE.MeshBasicMaterial({ color: 0xe6f4ff, side: THREE.DoubleSide, fog: false })); // vetrate luminose

  // lampade industriali sotto le capriate + pozza di luce a terra
  const lampGlow = [], pools = [];
  for (let z = z0 + TOOTH / 2; z < z1; z += TOOTH * 2) for (let x = x0 + 10; x < x1 - 5; x += 16) {
    cyl(0.03, 1.4, x, WALL_H - 1.4 - 0.7, z, C.dark, ID);
    parts.push(paint(new THREE.CylinderGeometry(0.25, 0.75, 0.6, 14, 1, true).translate(x, 6.9, z), C.dark));
    lampGlow.push(new THREE.CircleGeometry(0.7, 16).rotateX(Math.PI / 2).translate(x, 6.6, z));
    pools.push(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2).translate(x, 0.035, z));
  }
  scene.add(new THREE.Mesh(mergeGeometries(lampGlow), new THREE.MeshBasicMaterial({ color: 0xfff1cc })));
  const poolTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,236,190,0.55)'); r.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const fancy = [];
  const poolMesh = new THREE.Mesh(mergeGeometries(pools), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(poolMesh); fancy.push(poolMesh);

  // fasci di luce dalle vetrate: piani inclinati con sfumatura, additivi
  const shaftTex = canvasTex(8, 128, (g) => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,250,230,0.22)'); r.addColorStop(1, 'rgba(255,250,230,0)'); g.fillStyle = r; g.fillRect(0, 0, 8, 128); });
  const shafts = [];
  for (let z = z0 + TOOTH; z < z1; z += TOOTH) for (let x = x0 + 8; x < x1 - 4; x += 13) {
    if (rngShaft() < 0.45) continue;
    const g = new THREE.PlaneGeometry(4 + rngShaft() * 3, 15);
    g.rotateX(-0.55); // inclinato: la luce entra dalla vetrata e scende verso sud
    g.translate(x, WALL_H + RISE / 2 - 6.5, z - 3.5);
    shafts.push(g);
  }
  const shaftMesh = new THREE.Mesh(mergeGeometries(shafts), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  scene.add(shaftMesh); fancy.push(shaftMesh);

  for (const [w, l, x, z] of [[W, 1, cx, z0], [W, 1, cx, z1], [1, D, x0, cz], [1, D, x1, cz]]) {
    box(w, 9, l, x, 4.5, z, C.wall, ID);
    box(w + 0.2, 1.5, l + 0.2, x, 0.75, z, C.blue, ID);
    box(w + 0.2, 0.25, l + 0.2, x, 1.65, z, C.red, ID);
  }
  // colonne del capannone, dove non intralciano
  for (let x = x0 + 12; x < x1 - 6; x += 24) for (let z = z0 + 12; z < z1 - 6; z += 24) {
    if (nearRoad(x, z, hw + 3) || (z > maxZ + 6 && Math.abs(x - podium.x) < 30)) continue;
    box(0.6, 9, 0.6, x, 4.5, z, C.steel, ID);
    box(0.66, 1.2, 0.66, x, 0.6, z, C.yellow, ID);
  }

  // --- striscioni sui muri (logo se presente in public/assets/logo.png)
  const bannerTex = textTexture(`${CONFIG.company} · FAMILY DAY`, 1024, 256);
  const logo = new Image();
  logo.onload = () => {
    const c = bannerTex.image, g = c.getContext('2d'), h = c.height * 0.8, w = logo.width * h / logo.height;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height * 0.86);
    g.drawImage(logo, (c.width - w) / 2, c.height * 0.04, w, h);
    bannerTex.needsUpdate = true;
  };
  logo.src = import.meta.env.BASE_URL + 'assets/logo.png';
  const banners = [];
  const addBanner = (x, z, ry) => banners.push(new THREE.PlaneGeometry(16, 4).rotateY(ry).translate(x, 5.5, z));
  for (let x = x0 + 25; x < x1 - 15; x += 45) { addBanner(x, z1 - 0.6, Math.PI); addBanner(x, z0 + 0.6, 0); }
  for (let z = z0 + 25; z < z1 - 15; z += 45) { addBanner(x0 + 0.6, z, Math.PI / 2); addBanner(x1 - 0.6, z, -Math.PI / 2); }
  scene.add(new THREE.Mesh(mergeGeometries(banners), new THREE.MeshBasicMaterial({ map: bannerTex })));

  // --- portali: partenza + uno per reparto
  const gantry = (s, text, colors) => {
    const q = sample(s), yaw = Math.atan2(q.tx, q.tz), m = new THREE.Matrix4().makeRotationY(yaw).setPosition(q.x, 0, q.z), hb = height(s);
    for (const x of [-hw - 1.2, hw + 1.2]) box(0.5, 6.4 + hb, 0.5, x, (6.4 + hb) / 2, 0, C.dark, m);
    box(CONFIG.roadWidth + 3, 0.5, 0.5, 0, hb + 6.2, 0, C.dark, m);
    box(CONFIG.roadWidth + 1.2, 2.4, 0.2, 0, hb + 4.9, -0.2, C.dark, m);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.roadWidth + 1, 2.2), new THREE.MeshBasicMaterial({ map: textTexture(text, 1024, 224, colors) }));
    sign.position.set(0, hb + 4.9, -0.35).applyMatrix4(m);
    sign.rotation.y = yaw + Math.PI;
    scene.add(sign);
  };
  const gantryS = [0, ...zones.map(z => z.s + 12)];
  gantry(0, 'PARTENZA · ARRIVO', {});
  for (const z of zones) gantry(z.s + 12, z.name, { bg: '#1f4fbf', fg: '#fff', stripe: '#d32a2a' });

  // --- arredo automatico lungo i bordi, in base al reparto
  const rng = mulberry32(7);
  const crowd = new Crowd();
  for (const side of [1, -1]) {
    let s = 6;
    while (s < L - 6) {
      const defs = PROPS.magazzino, def = defs[Math.floor(rng() * defs.length)]; // fuori dai reparti: logistica
      const q = sample(s + def.len / 2), d = side * (hw + 2.2 + def.dep / 2);
      const x = q.x + q.tz * d, z = q.z - q.tx * d, ex = q.tx * def.len / 2, ez = q.tz * def.len / 2;
      const free = !inArea(x, z) && !blocked(x, z, def.len / 2) && !nearRoad(x, z, hw + 1 + def.dep / 2) && !nearRoad(x + ex, z + ez, hw + 1) && !nearRoad(x - ex, z - ez, hw + 1);
      if (free && rng() < 0.85) def.build(new THREE.Matrix4().makeRotationY(Math.atan2(q.tx, q.tz)).setPosition(x, 0, z), rng);
      s += def.len + 1.5 + rng() * 4;
    }
  }

  // --- reparti dal disegno: pavimento colorato, bordo, cartello, arredo che riempie l'area, robot e carroponte animati
  const anim = [];
  for (const a of areas) {
    const w = a.x1 - a.x0, l = a.z1 - a.z0, cxA = (a.x0 + a.x1) / 2, czA = (a.z0 + a.z1) / 2;
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.22, depthWrite: false }));
    tint.position.set(cxA, 0.004, czA);
    scene.add(tint);
    for (const [bw, bl, bx, bz] of [[w, 0.4, cxA, a.z0], [w, 0.4, cxA, a.z1], [0.4, l, a.x0, czA], [0.4, l, a.x1, czA]]) box(bw, 0.03, bl, bx, 0.015, bz, C.yellow, ID);

    const defs = PROPS[a.kind] ?? PROPS.magazzino;
    let robots = 0;
    for (let x = a.x0 + 4; x < a.x1 - 3; x += 8) for (let z = a.z0 + 4; z < a.z1 - 3; z += 8) {
      const px = x + (rng() - 0.5) * 2, pz = z + (rng() - 0.5) * 2;
      if (a.kind === 'assemblaggio' && robots < 6 && !nearRoad(px, pz, hw + 3.5) && nearRoad(px, pz, hw + 8) && rng() < 0.5) {
        anim.push(robot(scene, px, pz, rng() * 6)); robots++; continue;
      }
      const def = defs[Math.floor(rng() * defs.length)];
      if (nearRoad(px, pz, hw + 1.5 + Math.max(def.len, def.dep) / 2) || blocked(px, pz, Math.max(def.len, def.dep) / 2) || rng() < 0.15) continue;
      const rot = rng() < 0.5 ? 0 : Math.PI / 2;
      def.build(new THREE.Matrix4().makeRotationY(rot).setPosition(px, 0, pz), rng);
      if (def.build !== drums && rng() < 0.4) { // operatore davanti al macchinario, rivolto verso di esso
        const off = def.dep / 2 + 0.55, wx = px - Math.cos(rot) * off, wz = pz + Math.sin(rot) * off;
        if (!nearRoad(wx, wz, hw + 1.2)) crowd.add({ type: 'work', x: wx, z: wz, yaw: rot + Math.PI / 2 });
      }
    }
    if (a.kind === 'stampaggio') anim.push(crane(scene, a));

    // cartello alto al centro del reparto, girato verso la pista
    let bi = 0, bd = Infinity;
    for (let i = 0; i < N; i += 4) { const dd = (X[i] - cxA) ** 2 + (Z[i] - czA) ** 2; if (dd < bd) { bd = dd; bi = i; } }
    const yaw = Math.atan2(X[bi] - cxA, Z[bi] - czA), sm = new THREE.Matrix4().makeRotationY(yaw).setPosition(cxA, 0, czA);
    for (const x of [-3.5, 3.5]) box(0.3, 9, 0.3, x, 4.5, -0.3, C.dark, sm);
    box(9.4, 2.6, 0.2, 0, 8, -0.25, C.dark, sm);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.3), new THREE.MeshBasicMaterial({ map: textTexture(a.name, 1024, 256, { bg: a.color, fg: '#fff', stripe: '#fff' }) }));
    sign.position.set(cxA, 8, czA); sign.rotation.y = yaw;
    sign.position.add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-0.1));
    scene.add(sign);
  }

  // --- ostacoli in pista
  for (const o of obstacles) {
    const q = sample(o.s), x = q.x + q.tz * o.d, z = q.z - q.tx * o.d, m = new THREE.Matrix4().makeRotationY(Math.atan2(q.tx, q.tz)).setPosition(x, height(o.s), z);
    if (o.type === 'pallet') { box(1.3, 0.15, 1.3, 0, 0.075, 0, C.wood, m); box(1.2, 1.0, 1.2, 0, 0.65, 0, C.wrap, m); box(1.22, 0.12, 1.22, 0, 0.9, 0, C.red, m); }
    if (o.type === 'cone') {
      box(0.5, 0.05, 0.5, C.orange, 0, 0.025, 0, m);
      parts.push(paint(new THREE.CylinderGeometry(0.05, 0.22, 0.7, 10).translate(0, 0.4, 0).applyMatrix4(m), C.orange));
      parts.push(paint(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 10).translate(0, 0.42, 0).applyMatrix4(m), C.white));
    }
  }

  // --- incroci AGV: strisce gialle/nere sulla pista + carrello che attraversa
  const zebra = canvasTex(64, 64, (g) => { g.fillStyle = '#111'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f2c200'; for (let i = -64; i < 64; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 80, 64); g.lineTo(i + 64, 64); g.fill(); } });
  zebra.wrapS = zebra.wrapT = THREE.RepeatWrapping;
  zebra.repeat.set(1, 1);
  for (const c of crossings) {
    scene.add(new THREE.Mesh(ribbon(c.s - 1.6, c.s + 1.6, -hw, hw, 0.027, 2, 1 / 3.2), new THREE.MeshLambertMaterial({ map: zebra })));
    c.mesh = agvModel();
    scene.add(c.mesh);
  }
  const updateCrossings = (t) => {
    for (const c of crossings) { // va, aspetta, torna, aspetta
      const u = (t / c.period + c.phase) % 1, D = c.reach;
      const d = u < 0.4 ? -D + 2 * D * (u / 0.4) : u < 0.5 ? D : u < 0.9 ? D - 2 * D * ((u - 0.5) / 0.4) : -D;
      c.obst.d = d;
      const q = sample(c.s), yaw = Math.atan2(q.tx, q.tz) + (u < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      c.mesh.position.set(q.x + q.tz * d, height(c.s), q.z - q.tx * d);
      c.mesh.rotation.y = yaw;
    }
  };

  // --- tribuna alla partenza: transenne + famiglie che fanno il tifo (alcuni bambini)
  {
    const q = sample(0), yaw = Math.atan2(q.tx, q.tz);
    for (const side of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(q.x + q.tz * side * (hw + 1.8), 0, q.z - q.tx * side * (hw + 1.8));
      for (let s = -10; s <= 10; s += 2.5) box(0.08, 1.0, 0.08, 0, 0.5, s, C.dark, m);
      for (const y of [0.55, 0.95]) for (let s = -10; s < 10; s += 2.5) box(0.06, 0.12, 2.5, 0, y, s + 1.25, Math.round((s + 10) / 2.5) % 2 ? C.yellow : C.dark, m);
      for (const dd of [2.8, 3.8]) for (let s = -9; s <= 9; s += 1.1) {
        const p = point(s, side * (hw + dd + (rng() - 0.5) * 0.3));
        crowd.add({ type: 'cheer', x: p.x, z: p.z, yaw: yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), scale: rng() < 0.35 ? 0.6 + rng() * 0.15 : 0.95 + rng() * 0.1 });
      }
    }
  }

  // --- pedoni sui camminamenti a lato pista (solo nei tratti dritti, lontano da curve e incroci)
  for (let tries = 0, n = 0; tries < 200 && n < 16; tries++) {
    const s = rng() * L, side = rng() < 0.5 ? 1 : -1, d = side * (hw + 1.7);
    if (Math.abs(sample(s - 6).k) > 0.01 || Math.abs(sample(s + 6).k) > 0.01 || Math.max(height(s - 6), height(s + 6)) > 0.2) continue;
    const a = point(s - 6, d), b = point(s + 6, d), m = point(s, d);
    if ([a, b, m].some(p => nearRoad(p.x, p.z, hw + 1.2) || blocked(p.x, p.z))) continue;
    crowd.add({ type: 'walk', ax: a.x, az: a.z, bx: b.x, bz: b.z }); n++;
  }
  crowd.build(scene);

  // --- piloni sotto il soppalco
  for (let s = 0; s < L; s += 9) {
    const h = height(s);
    if (h < 1.5) continue;
    const q = sample(s), m = new THREE.Matrix4().makeRotationY(Math.atan2(q.tx, q.tz)).setPosition(q.x, 0, q.z);
    for (const x of [-hw + 1, hw - 1]) box(0.7, h, 0.7, x, h / 2, 0, C.steel, m);
    box(CONFIG.roadWidth + 1.6, 0.5, 0.8, 0, h - 0.25, 0, C.steel, m);
  }

  // --- monumento: maniglia d'auto gigante cromata (Minebea Pianezza) ad arco sopra la pista
  if (landmark) {
    const q = sample(landmark.s), yaw = Math.atan2(q.tx, q.tz), hb = height(landmark.s);
    const g = new THREE.Group();
    g.position.set(q.x, hb, q.z); g.rotation.y = yaw;
    const chrome = new THREE.MeshPhongMaterial({ color: 0xd5dbe2, specular: 0xffffff, shininess: 120 });
    const dark = new THREE.MeshPhongMaterial({ color: 0x2e333b, shininess: 60 });
    const path = new THREE.CatmullRomCurve3([[-7.2, 0.6], [-7.2, 4.5], [-5.6, 7.6], [0, 8.4], [5.6, 7.6], [7.2, 4.5], [7.2, 0.6]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.55, 14).scale(1, 1, 2.2), chrome)); // impugnatura piatta
    for (const x of [-7.2, 7.2]) {
      const base = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 3.2, 3, 0.4), chrome);
      base.position.set(x, 0.6, 0); g.add(base);
    }
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 20).rotateX(Math.PI / 2), dark); // cilindretto serratura
    lock.position.set(-7.2, 0.9, -1.7); g.add(lock);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshBasicMaterial({ map: textTexture(`${CONFIG.company} · PIANEZZA`, 1024, 205, { bg: '#1f4fbf', fg: '#fff', stripe: '#d32a2a' }) }));
    sign.position.set(0, 9.9, -1.3); sign.rotation.y = Math.PI; g.add(sign);
    const sback = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2, 0.15), dark);
    sback.position.set(0, 9.9, -1.15); g.add(sback);
    for (const x of [-3, 3]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), dark); rod.position.set(x, 9.1, -1.15); g.add(rod); }
    scene.add(g);
  }

  // --- podio e pedane di selezione
  box(14, 0.06, 8, podium.x, 0.03, podium.z, C.red, ID);
  box(3, 1.6, 3, podium.x, 0.8, podium.z, C.yellow, ID);
  // la camera guarda verso +z, quindi +x è a sinistra sullo schermo: 2° a sinistra, 3° a destra
  box(3, 1.1, 3, podium.x + 3.2, 0.55, podium.z, C.light, ID);
  box(3, 0.7, 3, podium.x - 3.2, 0.35, podium.z, C.orange, ID);
  for (const sp of showcase) { cyl(2.4, 0.2, sp.x, 0.1, sp.z, C.blue, ID); cyl(2.2, 0.22, sp.x, 0.11, sp.z, C.white, ID); }
  const podiumSpots = [[podium.x, 1.6, podium.z], [podium.x + 3.2, 1.1, podium.z], [podium.x - 3.2, 0.7, podium.z], [podium.x - 6.4, 0.06, podium.z - 1.5]];

  scene.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  parts.length = 0;

  return {
    L, hw, wrap, wrapDelta, sample, point, height, zoneAt, padHit, podium, podiumSpots, showcase, areas, obstacles,
    outline: Array.from({ length: 128 }, (_, i) => ({ x: X[i * N / 128], z: Z[i * N / 128] })),
    update(dt, time) { padTex.offset.y -= dt * 1.5; anim.forEach(f => f(time)); updateCrossings(time); crowd.update(time); },
    welding: t => anim.map(f => f.tip?.(t)).filter(Boolean),
    setFancy(on) { fancy.forEach(m => (m.visible = on)); },
    // postazioni delle camere TV per il replay: ogni 30 m, alternate sui due lati
    tvSpots: Array.from({ length: Math.floor(L / 30) }, (_, i) => {
      const s = i * 30, p = point(s, (i % 2 ? 1 : -1) * (hw + 4.5));
      return { s, x: p.x, y: height(s) + 2.6, z: p.z };
    }).filter(sp => gantryS.every(g => Math.abs(wrapDelta(sp.s - g)) > 10)), // niente camere dietro i portali
  };
}
