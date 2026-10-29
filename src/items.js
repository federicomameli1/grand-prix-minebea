import * as THREE from 'three';
import { CONFIG } from './config.js';

export const ITEM_RESPAWN_TIME = 7;
export const ITEM_TURBO_DURATION = 2.4;
export const ITEM_SHIELD_DURATION = 5;
export const ITEM_ROW_COUNT = 6;

const BOX_SIZE = 1.05, BOX_HEIGHT = 1.15, BOB = 0.12;
let boxGeometry, boxMaterial;

function boxAssets() {
  if (!boxGeometry) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#668cc9');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 7; ctx.strokeRect(6, 6, 116, 116);
    ctx.strokeStyle = '#344c83'; ctx.lineWidth = 2; ctx.strokeRect(13, 13, 102, 102);
    ctx.font = 'bold 94px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#263c75'; ctx.fillText('?', 66, 70);
    ctx.fillStyle = '#ffffff'; ctx.fillText('?', 63, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    boxGeometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    boxMaterial = new THREE.MeshBasicMaterial({ map: texture });
  }
  return { geometry: boxGeometry, material: boxMaterial };
}

/** Auto-applies pickups; callers own race lifecycle and human-only UI/audio.
 * Construct after buildTrack(), reset() at race start, update() after kart physics.
 * boxes exposes { s, d, x, y, z, cooldown, active } per instance (y is its base centre).
 */
export class ItemBoxes {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.boxes = [];
    this.visible = true;
    this.transform = new THREE.Object3D();
    this.buildPositions();
    const { geometry, material } = boxAssets();
    this.mesh = new THREE.InstancedMesh(geometry, material, this.boxes.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Rotation/bobbing and zero-scale cooldown instances change the bounds every frame.
    this.mesh.frustumCulled = false;
    const colors = [0x65eaff, 0xffcf65, 0xc5a0ff];
    const color = new THREE.Color();
    this.boxes.forEach((box, i) => this.mesh.setColorAt(i, color.setHex(colors[i % colors.length])));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
    this.reset();
  }

  buildPositions() {
    const track = this.track, spacing = track.L / ITEM_ROW_COUNT;
    const lane = Math.min(2.5, Math.max(0, track.hw - 1.6));
    const lanes = lane > 1 ? [-lane, 0, lane] : [0];
    const rows = [];
    for (let row = 0; row < ITEM_ROW_COUNT; row++) {
      const target = (row + 0.65) * spacing;
      // Search near evenly spaced fractions, never cluster rows to force a placement.
      let s = null;
      for (let offset = 0; offset <= spacing * 0.24 && s === null; offset += 2) {
        for (const sign of offset === 0 ? [1] : [1, -1]) {
          const candidate = track.wrap(target + sign * offset);
          if (Math.abs(track.wrapDelta(candidate)) < 20) continue;
          if (rows.some(other => Math.abs(track.wrapDelta(candidate - other)) < spacing * 0.5)) continue;
          // AGVs sweep the whole road: avoid their longitudinal corridor, not just current d.
          if (track.obstacles.some(o => Math.abs(track.wrapDelta(candidate - o.s)) < 8 + o.r)) continue;
          const height = track.height(candidate);
          let safe = true;
          // No jump metadata is exported. Reject ramps, lips and landing approaches by
          // sampling a generous window, including the flight distance beyond a drop.
          for (let ds = -30; ds <= 16; ds++) {
            const h = track.height(candidate + ds);
            if (Math.abs(h - height) > 0.65 || Math.abs(track.height(candidate + ds + 1) - h) > 0.08) {
              safe = false; break;
            }
          }
          if (safe) { s = candidate; break; }
        }
      }
      if (s === null) continue; // A missing row is better than an unreachable/unsafe pickup.
      rows.push(s);
      for (const d of lanes) {
        const p = track.point(s, d);
        this.boxes.push({ s, d, x: p.x, y: track.height(s) + BOX_HEIGHT, z: p.z, cooldown: 0, active: true });
      }
    }
  }

  reset() {
    for (const box of this.boxes) { box.cooldown = 0; box.active = true; }
    this.animate(0);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.mesh.visible = this.visible;
  }

  /** Returns [{ kart, type: 'turbo' | 'shield' }], for CPUs and humans alike. */
  update(dt, time, karts) {
    const pickups = [];
    if (!this.visible) return pickups;
    for (const box of this.boxes) { box.cooldown = Math.max(0, box.cooldown - Math.max(0, dt)); box.active = box.cooldown === 0; }
    // ponytail: sovrapposizione semplice nello spazio pista; uno sweep servirebbe solo se i kart superassero ~3 m a frame
    const reach = CONFIG.kartRadius * 0.75 + BOX_SIZE * 0.75, reachY = 0.55 + BOX_SIZE * 0.75 + BOB;
    for (const kart of karts) {
      if (kart.finished || kart.static || kart.ghostT > 0) continue;
      const box = this.boxes.find(b => b.active && Math.abs(this.track.wrapDelta(kart.prog - b.s)) < reach
        && Math.abs(kart.d - b.d) < reach && Math.abs(kart.y + 0.65 - b.y) < reachY);
      if (!box) continue;
      const type = Math.random() < 0.5 ? 'turbo' : 'shield';
      if (type === 'turbo') kart.boostT = Math.max(kart.boostT || 0, ITEM_TURBO_DURATION);
      else kart.shieldT = Math.max(kart.shieldT || 0, ITEM_SHIELD_DURATION);
      box.cooldown = ITEM_RESPAWN_TIME; box.active = false;
      pickups.push({ kart, type });
    }
    this.animate(time);
    return pickups;
  }

  animate(time) {
    const object = this.transform;
    this.boxes.forEach((box, i) => {
      object.position.set(box.x, box.y + Math.sin(time * 2.8 + i * 0.7) * BOB, box.z);
      object.rotation.set(0.12, time * 1.15 + i * 0.55, Math.sin(time * 1.7 + i) * 0.12);
      object.scale.setScalar(box.active ? 1 : 0);
      object.updateMatrix();
      this.mesh.setMatrixAt(i, object.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose(); // Shared geometry, material and texture belong to the module cache.
  }
}
