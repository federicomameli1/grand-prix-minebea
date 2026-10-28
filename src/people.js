import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Persone animate con InstancedMesh: 5 draw call in tutto, qualunque sia il numero di persone.
// Tipi: 'walk' (avanti e indietro tra A e B), 'work' (braccia al banco), 'cheer' (tifo con braccia alzate).
const JACKETS = [0xd7ff3a, 0xff8a00, 0x1f4fbf, 0xf2f2f2, 0xd32a2a];
const HELMETS = [0xf2f2f2, 0xf2c200, 0x1f4fbf];
const FAMILY = [0xe85d9b, 0x3ccf4e, 0x7a5cff, 0xff8a00, 0x1f9bbf, 0xf2c200, 0xd32a2a];

export class Crowd {
  people = [];

  add(p) {
    const r = Math.random;
    this.people.push({
      scale: 1, phase: r() * 10, speed: 1 + r() * 0.4,
      jacket: (p.type === 'cheer' ? FAMILY : JACKETS)[Math.floor(r() * (p.type === 'cheer' ? FAMILY.length : JACKETS.length))],
      helmet: p.type === 'cheer' ? null : HELMETS[Math.floor(r() * HELMETS.length)],
      ...p,
    });
  }

  build(scene) {
    const n = this.people.length, mat = new THREE.MeshLambertMaterial();
    const mk = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false; scene.add(m); return m;
    };
    this.torso = mk(new RoundedBoxGeometry(0.46, 0.6, 0.28, 2, 0.08), n);
    this.head = mk(new THREE.SphereGeometry(0.15, 12, 8), n);
    this.hat = mk(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), n);
    this.legs = mk(new THREE.BoxGeometry(0.17, 0.85, 0.2).translate(0, -0.425, 0), n * 2);
    this.arms = mk(new THREE.BoxGeometry(0.12, 0.6, 0.14).translate(0, -0.3, 0), n * 2);
    const c = new THREE.Color();
    this.people.forEach((p, i) => {
      this.torso.setColorAt(i, c.setHex(p.jacket));
      this.head.setColorAt(i, c.setHex(0xf1c27d));
      this.hat.setColorAt(i, c.setHex(p.helmet ?? 0x5a3a22)); // senza caschetto: capelli
      for (const k of [0, 1]) {
        this.legs.setColorAt(i * 2 + k, c.setHex(0x2b3a55));
        this.arms.setColorAt(i * 2 + k, c.setHex(p.jacket));
      }
    });
    this.base = new THREE.Matrix4(); this.m = new THREE.Matrix4(); this.r = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }

  part(mesh, i, px, py, pz, rx = 0, rz = 0) {
    this.m.makeTranslation(px, py, pz).multiply(this.r.makeRotationX(rx)).multiply(this.r.makeRotationZ(rz));
    mesh.setMatrixAt(i, this.m.premultiply(this.base));
  }

  update(t) {
    this.people.forEach((p, i) => {
      let x = p.x, z = p.z, yaw = p.yaw, bob = 0, leg = 0, armX = 0, armZ = 0, wave = 0;
      if (p.type === 'walk') {
        const dx = p.bx - p.ax, dz = p.bz - p.az, len = Math.hypot(dx, dz);
        const u = (t * p.speed / len + p.phase) % 2, f = u < 1 ? u : 2 - u; // avanti e indietro
        x = p.ax + dx * f; z = p.az + dz * f;
        yaw = Math.atan2(dx, dz) + (u < 1 ? 0 : Math.PI);
        const w = t * 7 * p.speed + p.phase;
        leg = Math.sin(w) * 0.5; armX = -leg * 0.8; bob = Math.abs(Math.sin(w)) * 0.04;
      } else if (p.type === 'work') {
        armX = -1.2; wave = Math.sin(t * 5 + p.phase) * 0.3;
      } else { // cheer
        armZ = 2.6; wave = Math.sin(t * 9 + p.phase) * 0.35;
        bob = Math.max(0, Math.sin(t * 5 + p.phase)) * 0.18;
      }
      this.base.compose(this.v.set(x, bob, z), this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), this.s.setScalar(p.scale));
      this.part(this.torso, i, 0, 1.2, 0);
      this.part(this.head, i, 0, 1.66, 0);
      this.part(this.hat, i, 0, 1.72, 0);
      for (const [k, side] of [[0, -1], [1, 1]]) {
        this.part(this.legs, i * 2 + k, side * 0.11, 0.88, 0, leg * side);
        this.part(this.arms, i * 2 + k, side * 0.3, 1.45, 0, armX * (p.type === 'walk' ? side : 1) + wave * side, side * (armZ + wave * (armZ ? 1 : 0)));
      }
    });
    for (const k of ['torso', 'head', 'hat', 'legs', 'arms']) this[k].instanceMatrix.needsUpdate = true;
  }
}
