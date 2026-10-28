import * as THREE from 'three';

// Un unico sistema di particelle (1 draw call) per fiamme turbo, scintille, polvere, coriandoli.
// ponytail: buffer circolare a dimensione fissa, le particelle più vecchie vengono sovrascritte.
const MAX = 1500;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX).fill(1);
    this.grav = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          if (length(gl_PointCoord - 0.5) > 0.5 || vAlpha <= 0.0) discard;
          gl_FragColor = vec4(vColor, vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    scene.add(pts);
    this.c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, hex, size, life, grav = 0) {
    const i = this.next; this.next = (i + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.c.setHex(hex).toArray(this.col, i * 3);
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }

  burst(x, y, z, n, colors, speed, size, life, grav) {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      this.emit(x, y, z, Math.cos(a) * speed * (1 - up * 0.5), speed * (0.5 + up), Math.sin(a) * speed * (1 - up * 0.5),
        colors[j % colors.length], size * (0.7 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.4), grav);
    }
  }

  firework(x, y, z, hex) { // esplosione sferica
    for (let j = 0; j < 90; j++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 7 + Math.random() * 2;
      this.emit(x, y, z, r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp, Math.random() < 0.2 ? 0xffffff : hex, 0.4, 1.3 + Math.random() * 0.4, 3);
    }
  }

  update(dt, viewportHeight) {
    this.mat.uniforms.uScale.value = viewportHeight * 0.9; // dimensione in pixel ~coerente a ogni risoluzione
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, (this.life[i] / this.maxLife[i]) * 2);
    }
    for (const k of ['position', 'aAlpha', 'color', 'aSize']) this.geo.attributes[k].needsUpdate = true;
  }
}

export const CONFETTI = [0x1f4fbf, 0xd32a2a, 0xffffff, 0xffd23f, 0x3ccf4e];
export const DRIFT_COLORS = [0xffffff, 0x4fc3ff, 0xff9a1f, 0xc04dff];

// Segni di frenata: quadratini scuri a terra, buffer circolare (i più vecchi spariscono). 1 draw call.
const SKIDS = 2000;
export class Skids {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.5, depthWrite: false }), SKIDS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.next = 0;
    this.o = new THREE.Object3D();
    scene.add(this.mesh);
  }
  add(x, z, yaw) {
    this.o.position.set(x, 0.016, z);
    this.o.rotation.set(0, yaw, 0);
    this.o.updateMatrix();
    this.mesh.setMatrixAt(this.next, this.o.matrix);
    this.next = (this.next + 1) % SKIDS;
    this.mesh.count = Math.max(this.mesh.count, this.next || SKIDS);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.next = 0; }
}
