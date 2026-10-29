import * as THREE from 'three';

// Sprite separati dal modello: sempre rivolti alla camera, anche in split-screen e replay.
export class Nameplates {
  constructor(scene) { this.scene = scene; this.labels = []; }

  setKarts(karts) {
    this.clear();
    for (const kart of karts.filter(k => k.human)) {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.font = '700 52px Bahnschrift, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(10,31,77,.85)'; ctx.strokeText(kart.name, 256, 48, 480);
      ctx.fillStyle = '#fff'; ctx.fillText(kart.name, 256, 48, 480);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
      sprite.scale.set(3.5, 0.66, 1);
      this.scene.add(sprite);
      this.labels.push({ kart, sprite });
    }
  }

  update(visible) {
    for (const { kart, sprite } of this.labels) {
      sprite.position.copy(kart.mesh.position); sprite.position.y += 2.8;
      sprite.visible = visible && kart.mesh.visible;
    }
  }

  clear() {
    for (const { sprite } of this.labels) {
      this.scene.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose();
    }
    this.labels = [];
  }
}
