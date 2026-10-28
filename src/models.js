import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';

// Modelli procedurali dettagliati. Tutti i pezzi di un veicolo vengono fusi in 2 mesh
// (una opaca + una "luci" non illuminata), quindi più dettaglio non costa draw call.
// Le geometrie fuse sono in cache per (veicolo, colore): kart uguali condividono la GPU.

const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();

class Parts {
  solid = []; glow = [];
  add(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, glow = false) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(x, y, z));
    _c.setHex(hex);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) _c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (glow ? this.glow : this.solid).push(g);
    return this;
  }
  box(w, h, l, hex, x, y, z, r = 0.05, rot = [0, 0, 0], glow = false) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, l / 2 - 0.001);
    const geo = rr > 0.005 ? new RoundedBoxGeometry(w, h, l, 2, rr) : new THREE.BoxGeometry(w, h, l);
    return this.add(geo, hex, x, y, z, ...rot, glow);
  }
  cyl(rTop, rBot, h, hex, x, y, z, rot = [0, 0, 0], seg = 16, glow = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, x, y, z, ...rot, glow);
  }
  sphere(r, hex, x, y, z, scale = [1, 1, 1], glow = false) {
    return this.add(new THREE.SphereGeometry(r, 14, 10).scale(...scale), hex, x, y, z, 0, 0, 0, glow);
  }
  torus(r, t, hex, x, y, z, rot = [0, 0, 0]) {
    return this.add(new THREE.TorusGeometry(r, t, 8, 20), hex, x, y, z, ...rot);
  }
  limb(a, b, r, hex) { // cilindro da a a b: braccia che arrivano davvero alle mani
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 8)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir.normalize()))
      .translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.add(g, hex);
  }
  wheel(r, w, x, y, z, hub) { // gomma + cerchione + mozzo colorato
    const side = Math.sign(x) || 1, rz = [0, 0, Math.PI / 2];
    this.cyl(r, r, w, 0x1c1c1c, x, y, z, rz, 18);
    this.cyl(r * 0.62, r * 0.62, w + 0.02, 0xc9ced6, x, y, z, rz, 14);
    this.cyl(r * 0.25, r * 0.25, w + 0.05, hub, x + side * 0.01, y, z, rz, 10);
    return this;
  }
  build() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeGeometries(this.solid), solidMat));
    if (this.glow.length) g.add(new THREE.Mesh(mergeGeometries(this.glow), glowMat));
    return g;
  }
}

const C = {
  dark: 0x2e333b, black: 0x1c1c1c, steel: 0x6b737e, light: 0xc9ced6, skin: 0xf1c27d, yellow: 0xf2c200,
  hiVis: 0xd7ff3a, head: 0xfff4c2, tail: 0xff2a2a, beacon: 0xff8a00, card: 0xc89b62, bin: 0x2d6cdf,
};

function driver(p, y, z, hex, [wx, wy, wz]) { // [wx, wy, wz] = centro del volante
  const jacket = hex === CONFIG.colors.bianco ? CONFIG.colors.blu : 0xf2f2f2;
  p.box(0.52, 0.55, 0.34, jacket, 0, y + 0.3, z, 0.12);                     // busto
  p.box(0.54, 0.06, 0.36, C.hiVis, 0, y + 0.42, z, 0.02);                   // banda catarifrangente
  for (const s of [-1, 1]) {                                               // spalla → gomito → mano sul volante
    const sh = [s * 0.27, y + 0.5, z + 0.02], hand = [wx + s * 0.15, wy, wz - 0.02];
    const el = [(sh[0] + hand[0]) / 2 + s * 0.08, (sh[1] + hand[1]) / 2 - 0.12, (sh[2] + hand[2]) / 2];
    p.sphere(0.075, jacket, ...sh);
    p.limb(sh, el, 0.065, jacket);
    p.sphere(0.065, jacket, ...el);
    p.limb(el, hand, 0.06, jacket);
    p.sphere(0.07, C.skin, ...hand);
  }
  p.cyl(0.08, 0.09, 0.1, C.skin, 0, y + 0.62, z, [0, 0, 0], 10);            // collo
  p.sphere(0.21, C.skin, 0, y + 0.8, z, [1, 1.05, 1]);                      // testa
  for (const s of [-1, 1]) p.sphere(0.035, C.black, s * 0.08, y + 0.83, z + 0.19); // occhi
  p.sphere(0.23, hex, 0, y + 0.88, z, [1, 0.75, 1.05]);                     // caschetto
  p.box(0.3, 0.03, 0.14, hex, 0, y + 0.86, z + 0.22, 0.01);                 // visiera
}

function forklift(hex) {
  const p = new Parts();
  p.box(1.2, 0.5, 1.9, hex, 0, 0.55, 0.05, 0.12);                           // telaio
  p.box(1.26, 0.85, 0.55, C.dark, 0, 0.72, -0.85, 0.15);                    // contrappeso
  for (let i = 0; i < 5; i++) p.box(0.14, 0.12, 0.02, i % 2 ? C.black : C.yellow, -0.4 + i * 0.2, 0.75, -1.135, 0, [0, 0, 0.6]); // strisce
  p.cyl(0.2, 0.2, 0.85, C.light, 0, 1.35, -0.9, [0, 0, Math.PI / 2]);       // bombola GPL
  p.sphere(0.2, C.light, 0.42, 1.35, -0.9); p.sphere(0.2, C.light, -0.42, 1.35, -0.9);
  p.box(0.62, 0.14, 0.52, C.black, 0, 0.88, -0.25, 0.06);                   // sedile
  p.box(0.62, 0.5, 0.12, C.black, 0, 1.15, -0.5, 0.06);
  p.box(1.0, 0.35, 0.3, C.dark, 0, 0.95, 0.6, 0.06);                        // cruscotto
  p.cyl(0.03, 0.03, 0.45, C.dark, 0, 1.15, 0.45, [-0.5, 0, 0], 8);          // piantone
  p.torus(0.17, 0.03, C.black, 0, 1.33, 0.36, [-0.9, 0, 0]);                // volante
  driver(p, 0.95, -0.22, hex, [0, 1.33, 0.36]);
  for (const x of [-0.56, 0.56]) for (const z of [0.55, -0.6]) p.cyl(0.04, 0.04, 1.45, C.dark, x, 1.6, z, [0, 0, 0], 8); // montanti
  p.box(1.2, 0.07, 1.25, C.dark, 0, 2.33, -0.03, 0.03);                      // tettuccio
  for (const z of [-0.3, 0, 0.3]) p.box(1.15, 0.05, 0.05, C.steel, 0, 2.38, z, 0);
  p.cyl(0.07, 0.07, 0.12, C.beacon, 0.45, 2.44, -0.5, [0, 0, 0], 12, true); // lampeggiante
  for (const x of [-0.5, 0.5]) {
    p.box(0.12, 0.1, 0.04, C.head, x, 1.9, 0.6, 0.02, [0, 0, 0], true);     // fari
    p.box(0.12, 0.1, 0.04, C.tail, x * 0.9, 0.9, -1.14, 0.02, [0, 0, 0], true); // stop
  }
  for (const x of [-0.42, 0.42]) {                                         // montante sollevamento
    p.box(0.1, 2.3, 0.12, C.steel, x, 1.25, 1.05, 0.02);
    p.box(0.07, 2.1, 0.1, C.light, x * 0.82, 1.3, 1.12, 0.02);
    p.box(0.03, 2.0, 0.03, C.black, x * 0.6, 1.25, 1.0, 0);                 // catene
  }
  for (const y of [0.4, 1.4, 2.35]) p.box(0.9, 0.08, 0.1, C.steel, 0, y, 1.05, 0.02);
  p.cyl(0.05, 0.05, 1.8, C.light, 0, 1.15, 0.98, [0, 0, 0], 8);             // pistone
  p.box(0.92, 0.32, 0.06, C.dark, 0, 0.42, 1.2, 0.02);                      // piastra porta-forche
  for (let x = -0.4; x <= 0.41; x += 0.2) p.box(0.04, 0.55, 0.04, C.dark, x, 0.85, 1.2, 0); // griglia
  for (const x of [-0.26, 0.26]) {                                         // forche
    p.box(0.12, 0.4, 0.05, C.steel, x, 0.42, 1.25, 0.01);
    p.box(0.12, 0.05, 1.0, C.steel, x, 0.24, 1.73, 0.01);
  }
  for (const s of [-1, 1]) { p.wheel(0.33, 0.28, s * 0.62, 0.33, 0.62, hex); p.wheel(0.27, 0.24, s * 0.6, 0.27, -0.62, hex); }
  return p.build();
}

function tugger(hex) {
  const p = new Parts();
  p.box(1.15, 0.45, 1.85, hex, 0, 0.52, 0, 0.12);                           // telaio
  p.box(1.08, 0.5, 0.72, hex, 0, 0.98, 0.52, 0.18);                         // cofano
  p.box(0.7, 0.25, 0.04, C.dark, 0, 0.88, 0.89, 0.02);                      // griglia
  for (const x of [-0.38, 0.38]) p.cyl(0.08, 0.08, 0.05, C.head, x, 1.02, 0.89, [Math.PI / 2, 0, 0], 12, true); // fari
  p.box(1.25, 0.16, 0.16, C.dark, 0, 0.38, 0.95, 0.06);                     // paraurti
  for (const x of [-0.6, 0.6]) for (const z of [-0.55, 0.55]) p.box(0.32, 0.08, 0.72, C.dark, x, 0.72, z, 0.04); // parafanghi
  p.box(0.6, 0.14, 0.52, C.black, 0, 0.82, -0.38, 0.06);                    // sedile
  p.box(0.6, 0.55, 0.12, C.black, 0, 1.1, -0.66, 0.06);
  p.cyl(0.03, 0.03, 0.55, C.dark, 0, 1.2, 0.1, [-0.6, 0, 0], 8);
  p.torus(0.17, 0.03, C.black, 0, 1.42, 0.0, [-0.9, 0, 0]);
  driver(p, 0.88, -0.36, hex, [0, 1.42, 0.0]);
  p.cyl(0.03, 0.03, 1.0, C.dark, 0.48, 1.3, -0.8, [0, 0, 0], 8);           // asta lampeggiante
  p.cyl(0.08, 0.08, 0.14, C.beacon, 0.48, 1.86, -0.8, [0, 0, 0], 12, true);
  for (const x of [-0.42, 0.42]) p.box(0.14, 0.08, 0.04, C.tail, x, 0.62, -0.93, 0.02, [0, 0, 0], true);
  p.box(0.14, 0.14, 0.45, C.dark, 0, 0.35, -1.05, 0.03);                    // gancio traino
  for (const x of [-0.62, 0.62]) for (const z of [-0.55, 0.55]) p.wheel(0.3, 0.26, x, 0.3, z, hex);
  return p.build();
}

function wagon(hex) {
  const p = new Parts();
  p.box(1.05, 0.1, 1.45, C.dark, 0, 0.38, 0, 0.03);                         // telaio
  p.box(1.0, 0.04, 1.4, hex, 0, 0.45, 0, 0.01);                             // pianale
  for (const x of [-0.5, 0.5]) p.cyl(0.025, 0.025, 1.4, C.steel, x, 0.72, 0, [Math.PI / 2, 0, 0], 6); // sponde
  for (const x of [-0.5, 0.5]) for (const z of [-0.68, 0.68]) p.cyl(0.025, 0.025, 0.3, C.steel, x, 0.6, z, [0, 0, 0], 6);
  for (const x of [-0.22, 0.22]) for (const z of [-0.33, 0.33]) {           // cassette KLT blu
    p.box(0.4, 0.28, 0.58, C.bin, x, 0.62, z, 0.03);
    p.box(0.42, 0.04, 0.6, 0x1f4fbf, x, 0.77, z, 0.01);
  }
  p.box(0.08, 0.08, 0.5, C.dark, 0, 0.3, 0.92, 0.02);                       // timone
  for (const x of [-0.42, 0.42]) for (const z of [-0.5, 0.5]) p.wheel(0.17, 0.12, x, 0.17, z, C.light);
  return p.build();
}

function agv() { // carrello a guida automatica che attraversa la pista
  const p = new Parts();
  p.box(1.0, 0.32, 1.5, C.beacon, 0, 0.26, 0, 0.1);
  p.box(0.96, 0.05, 1.46, C.dark, 0, 0.44, 0, 0.02);
  p.box(1.04, 0.1, 0.1, C.black, 0, 0.16, 0.78, 0.03);
  p.box(1.04, 0.1, 0.1, C.black, 0, 0.16, -0.78, 0.03);
  p.cyl(0.08, 0.08, 0.1, C.dark, 0, 0.5, 0.6, [0, 0, 0], 12);              // lidar
  p.cyl(0.06, 0.06, 0.1, C.beacon, 0.38, 0.52, -0.6, [0, 0, 0], 10, true);
  for (const z of [-0.33, 0.33]) { p.box(0.42, 0.3, 0.58, C.bin, 0, 0.62, z, 0.03); p.box(0.44, 0.04, 0.6, 0x1f4fbf, 0, 0.78, z, 0.01); }
  for (const s of [-1, 1]) p.box(0.04, 0.06, 0.5, 0x3ccf4e, s * 0.51, 0.3, 0, 0.01, [0, 0, 0], true); // luci di stato
  return p.build();
}

const cache = new Map();
const cachedBuild = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key).clone(); // clone condivide geometrie e materiali
};

export const kartModel = (vehicle, color) =>
  cachedBuild(`${vehicle}/${color}`, () => (vehicle === 'tugger' ? tugger : forklift)(CONFIG.colors[color]));
export const wagonModel = color => cachedBuild(`wagon/${color}`, () => wagon(CONFIG.colors[color]));
export const agvModel = () => cachedBuild('agv', agv);
