import * as THREE from 'three';
import { CONFIG, wrapAngle } from './config.js';
import { kartModel, wagonModel } from './models.js';

export function buildModel(vehicle, color, withWagon = false) {
  const g = kartModel(vehicle, color);
  if (withWagon && vehicle === 'tugger') { const w = wagonModel(color); w.position.z = -1.9; g.add(w); }
  return g;
}

const shadowGeo = new THREE.PlaneGeometry(1.9, 3).rotateX(-Math.PI / 2);
const shadowMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();

const WAGON_GAP = 1.9;
const shieldGeo = new THREE.SphereGeometry(1, 20, 12);
const shieldMat = new THREE.MeshBasicMaterial({
  color: 0x66ddff, transparent: true, opacity: 0.22,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

// Fiamma del turbo: cono con shader animato, additivo. Uno per kart, visibile solo in turbo.
const flameGeo = new THREE.ConeGeometry(0.28, 1.3, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0.5, -1.65);
export const flameMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main() {
      float t = vUv.y; // 0 = base, 1 = punta
      float flick = 0.7 + 0.3 * sin(uTime * 45.0 + vUv.x * 25.0 + t * 12.0);
      vec3 c = mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.3, 0.05), t);
      gl_FragColor = vec4(c, (1.0 - t) * flick);
      #include <colorspace_fragment>
    }`,
});

// Il kart vive nello spazio della pista: prog (metri percorsi, anche oltre L), d (laterale), h (angolo rispetto alla tangente).
export class Kart {
  constructor(scene, track, { vehicle, color, name, human = false }) {
    Object.assign(this, { scene, track, vehicle, color, name, human });
    this.stats = CONFIG.vehicles[vehicle];
    this.mesh = buildModel(vehicle, color);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.wagons = vehicle === 'tugger' ? [wagonModel(color), wagonModel(color)] : [];
    this.flame = new THREE.Mesh(flameGeo, flameMat);
    this.mesh.add(this.flame);
    this.shield = new THREE.Mesh(shieldGeo, shieldMat);
    this.shield.scale.set(1.45, 1.25, 1.65);
    scene.add(this.mesh, this.shadow, this.shield, ...this.wagons);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.trail = [];
    this.seed = Math.random() * 100;
    this.bumpCD = 0;
    this.place(0, 0);
  }

  get s() { return this.track.wrap(this.prog); }

  get static() { return this._static; }
  set static(value) {
    this._static = value;
    if (value) this.clearShield();
  }

  get finished() { return this._finished; }
  set finished(value) {
    this._finished = value;
    if (value) this.clearShield();
  }

  clearShield() { this.shieldT = 0; this.shield.visible = false; }

  place(prog, d) {
    Object.assign(this, { prog, d, h: 0, v: 0, boostT: 0, shieldT: 0, padCD: 0, ghostT: 0, wrongT: 0, stuckT: 0, wall: false, finished: false, finishTime: 0, static: false,
      drifting: false, driftDir: 0, driftT: 0, driftVis: 0, charge: 0, steerVis: 0, events: [], wallCD: 0,
      y: this.track.height(prog), vy: 0, air: false, airT: 0 });
    this.shield.visible = false;
    this.fillTrail();
    this.sync();
  }

  fillTrail() { // così i vagoni partono già in fila dietro la motrice
    this.trail = [];
    for (let j = 1; j <= 60; j++) this.trail.push({ ...this.track.point(this.prog - j * 0.15, this.d), y: this.track.height(this.prog - j * 0.15) });
  }

  step(dt, input, mult = 1) {
    const n = Math.ceil(dt * 60); // sotto-passi da max 1/60 s
    for (let i = 0; i < n; i++) this._step(dt / n, input, mult);
    this.sync();
  }

  _step(dt, { steer, brake, drift = false }, mult) {
    this.shieldT = Math.max(0, this.shieldT - dt);
    const st = this.stats, k = this.track.sample(this.prog).k;
    const vTop = CONFIG.vMax * st.vMax * mult;

    // drift stile Mario Kart: direzione fissa, la levetta stringe/allarga, al rilascio mini-turbo
    if (drift && !this.drifting && Math.abs(steer) > 0.3 && this.v > 6) {
      Object.assign(this, { drifting: true, driftDir: Math.sign(steer), driftT: 0, charge: 0 });
    } else if (this.drifting && (!drift || this.v < 4)) this.endDrift(true);
    let steerEff = steer;
    if (this.drifting) {
      // arco ampio e controllabile: levetta al centro = curva media, dentro = stretta, contro = larga
      const [wide, mid, tight] = CONFIG.driftSteer, into = steer * this.driftDir;
      const amount = into >= 0 ? mid + (tight - mid) * into : mid + (mid - wide) * into;
      this.driftT += dt;
      steerEff = this.driftDir * amount * Math.min(1, this.driftT / CONFIG.driftEase);
      const lvl = this.driftLevel();
      this.charge += dt * (0.6 + 0.6 * Math.max(0, into));
      if (this.driftLevel() > lvl) this.events.push('charge');
    }
    this.driftVis += ((this.drifting ? this.driftDir * 0.4 : 0) - this.driftVis) * Math.min(1, 6 * dt);
    this.steerVis += (steer - this.steerVis) * Math.min(1, 10 * dt);
    this.h += steerEff * CONFIG.steerRate * st.steer * dt * Math.min(1, this.v / 4);
    if (!this.drifting && Math.abs(steer) < 0.1) this.h -= this.h * Math.min(1, CONFIG.assist * dt); // sterzo assistito
    let target = brake ? 0 : vTop * (this.drifting ? 0.96 : 1);
    if (this.boostT > 0) { target = Math.max(target, vTop * CONFIG.boostMult); this.boostT -= dt; }
    if (this.v < target) this.v = Math.min(target, this.v + CONFIG.accel * st.accel * dt);
    else this.v = Math.max(target, this.v - (brake ? CONFIG.brake : CONFIG.coast) * dt);

    const ds = this.v * Math.cos(this.h) * dt;
    this.prog += ds;
    this.d += this.v * Math.sin(this.h) * dt;
    this.h = wrapAngle(this.h - k * ds); // la pista curva "sotto" il kart

    // quota: a terra il kart segue la pista; se la pista "cade" più in fretta della gravità, si vola
    const g = this.track.height(this.prog), G = CONFIG.gravity;
    if (this.air) {
      this.vy -= G * dt; this.y += this.vy * dt; this.airT += dt;
      if (this.y <= g) { if (this.airT > 0.2) this.events.push('land'); Object.assign(this, { y: g, vy: 0, air: false }); }
    } else {
      const vg = (g - this.y) / dt;
      if (vg < this.vy - G * dt * 1.5 && this.v > 5) {
        Object.assign(this, { air: true, airT: 0 }); this.vy -= G * dt; this.y += this.vy * dt;
        if (this.vy > 2) this.events.push('jump');
      } else { this.y = g; this.vy = vg; }
    }
    if (this.drifting && Math.abs(this.h) > CONFIG.driftMaxAngle) { // il drift segue la curva, non porta contro il muro
      this.h -= (this.h - Math.sign(this.h) * CONFIG.driftMaxAngle) * Math.min(1, 6 * dt);
    }

    // muro: rimbalzo netto verso la pista invece di scivolare lungo il bordo.
    // All'esterno di una curva la pista riporta il kart contro il muro: per non restare incollati
    // si esce sempre con un angolo minimo, e l'urto (rallentamento, suono, vibrazione) vale una volta ogni wallCD.
    const lim = this.track.hw - CONFIG.kartRadius * 0.8;
    if (Math.abs(this.d) > lim) {
      const side = Math.sign(this.d);
      this.d = side * lim;
      if (side * Math.sin(this.h) >= 0 || Math.cos(this.h) < 0) this.h = -side * Math.min(0.6, Math.max(Math.abs(this.h) * CONFIG.wallBounce, CONFIG.wallEscape));
      if (!this.wall && this.wallCD <= 0) {
        if (this.shieldT <= 0) { this.v *= CONFIG.wallSlow; this.endDrift(false); } // lo scudo toglie solo la penalità
        this.hit(); this.events.push(side > 0 ? 'wallL' : 'wallR');
        this.wallCD = 0.5;
      }
      this.wall = true;
    } else if (Math.abs(this.d) < lim - 0.3) this.wall = false; // isteresi: strisciare lungo il muro = un solo contatto

    this.padCD -= dt; this.ghostT -= dt; this.bumpCD -= dt; this.wallCD -= dt;
    this.wrongT = Math.cos(this.h) < 0 ? this.wrongT + dt : 0;
    this.stuckT = this.v < 1 && !brake ? this.stuckT + dt : 0;
    if (this.wrongT > 4 || this.stuckT > 4) this.respawn();
  }

  driftLevel() { return CONFIG.driftLvl.filter(t => this.charge >= t).length; }

  endDrift(reward) {
    if (!this.drifting) return;
    const lvl = this.driftLevel();
    if (reward && lvl) { this.boostT = Math.max(this.boostT, CONFIG.miniTurbo[lvl - 1]); this.events.push('miniturbo'); }
    Object.assign(this, { drifting: false, charge: 0 });
  }

  respawn() {
    this.endDrift(false);
    Object.assign(this, { d: 0, h: 0, v: CONFIG.vMax * 0.5, boostT: 0, shieldT: 0, ghostT: 1, wrongT: 0, stuckT: 0, y: this.track.height(this.prog), vy: 0, air: false });
    this.shield.visible = false;
    this.fillTrail();
  }

  boost() {
    if (this.padCD > 0) return false;
    this.boostT = Math.max(this.boostT, CONFIG.boostTime); this.padCD = 0.6;
    return true;
  }

  hit() { if (this.bumpCD <= 0) { this.bumped = true; this.bumpCD = 0.4; } }

  sync() {
    if (this.static) return;
    const p = this.track.sample(this.prog);
    this.pos.set(p.x + p.tz * this.d, this.y, p.z - p.tx * this.d);
    this.shield.position.copy(this.pos); this.shield.position.y += 0.9;
    this.shield.visible = this.shieldT > 0 && this.ghostT <= 0;
    this.yaw = Math.atan2(p.tx, p.tz) + this.h;
    this.shield.rotation.y = this.yaw;
    this.mesh.position.copy(this.pos);
    // solo estetica: in drift il muso punta dentro la curva, in sterzata il kart si inclina
    this.mesh.rotation.y = this.yaw + this.driftVis + (this.drifting ? 0 : this.steerVis * 0.12);
    this.flame.visible = this.boostT > 0;
    if (this.flame.visible) this.flame.scale.setScalar(0.85 + Math.random() * 0.3);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.x = Math.max(-0.5, Math.min(0.5, -Math.atan2(this.vy, Math.max(this.v, 1)))); // muso su in salita/in volo
    this.mesh.rotation.z = -this.steerVis * 0.06 * Math.min(1, this.v / 10);
    this.mesh.visible = this.ghostT <= 0 || Math.floor(this.ghostT * 12) % 2 === 0;
    const ground = this.track.height(this.prog);
    this.shadow.position.set(this.pos.x, ground + 0.04, this.pos.z);
    this.shadow.rotation.y = this.yaw;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - (this.y - ground) * 0.2));

    const last = this.trail[0];
    if (Math.hypot(last.x - this.pos.x, last.z - this.pos.z) > 0.15) {
      this.trail.unshift({ x: this.pos.x, z: this.pos.z, y: this.pos.y });
      if (this.trail.length > 80) this.trail.pop();
    }
    this.wagons.forEach((w, i) => {
      const a = this.trailAt(WAGON_GAP * (i + 1)), b = this.trailAt(WAGON_GAP * (i + 1) - 0.5);
      w.position.set(a.x, a.y ?? 0, a.z);
      w.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      w.visible = this.mesh.visible;
    });
  }

  trailAt(dist) { // punto a `dist` metri dietro la motrice lungo la sua scia
    let prev = this.pos, acc = 0;
    for (const q of this.trail) {
      const seg = Math.hypot(q.x - prev.x, q.z - prev.z);
      if (acc + seg >= dist) { const a = (dist - acc) / seg; return { x: prev.x + (q.x - prev.x) * a, y: prev.y + (q.y - prev.y) * a, z: prev.z + (q.z - prev.z) * a }; }
      acc += seg; prev = q;
    }
    return prev;
  }

  setStatic(x, y, z, yaw) {
    this.static = true;
    this.shieldT = 0; this.shield.visible = false;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.scale.setScalar(1);
    this.shadow.scale.setScalar(1);
    this.mesh.visible = true;
    this.flame.visible = false;
    this.shadow.position.set(x, y + 0.04, z);
    this.wagons.forEach(w => (w.visible = false));
  }

  dispose() {
    this.shieldT = 0; this.shield.visible = false;
    this.scene.remove(this.mesh, this.shadow, this.shield, ...this.wagons);
  }
}

// Ostacoli (bancali, coni, AGV): il kart viene spinto fuori e rallenta, con scintille.
export function hitObstacles(karts, track) {
  for (const k of karts) {
    if (k.ghostT > 0 || k.static) continue;
    for (const o of track.obstacles) {
      const ds = track.wrapDelta(k.prog - o.s);
      if (Math.abs(ds) > 3) continue;
      const dd = k.d - o.d, dist = Math.hypot(ds, dd) || 0.01, R = CONFIG.kartRadius * 0.8 + o.r;
      if (dist >= R) continue;
      k.prog += (ds / dist) * (R - dist);
      k.d += (dd / dist) * (R - dist);
      if (k.bumpCD <= 0) {
        if (k.shieldT <= 0) { k.v *= o.type === 'cone' ? 0.85 : 0.65; k.endDrift(false); }
        k.events.push('obst');
      }
      k.hit();
    }
  }
}

// Collisioni tra kart: cerchi nello spazio (prog, d), solo una spinta leggera.
export function collide(karts, track) {
  const r2 = CONFIG.kartRadius * 2;
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j];
    if (a.ghostT > 0 || b.ghostT > 0 || a.static || b.static) continue;
    const ds = track.wrapDelta(a.prog - b.prog), dd = a.d - b.d, dist = Math.hypot(ds, dd);
    if (dist >= r2 || dist === 0) continue;
    const push = (r2 - dist) / 2, nx = ds / dist, ny = dd / dist;
    a.prog += nx * push; b.prog -= nx * push;
    a.d += ny * push; b.d -= ny * push;
    const rear = ds > 0 ? b : a;
    if (rear.shieldT <= 0) rear.v *= 0.97; // chi tampona perde un filo di velocità (non con lo scudo)
    a.hit(); b.hit();
  }
}
