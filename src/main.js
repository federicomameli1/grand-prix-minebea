import * as THREE from 'three';
import { CONFIG, CHOICES, clamp, wrapAngle } from './config.js';
import { buildTrack } from './track.js';
import { Kart, buildModel, collide, hitObstacles, flameMat } from './kart.js';
import { aiInput } from './ai.js';
import { pollDevices, isConnected, rumble } from './input.js';
import * as audio from './audio.js';
import * as ui from './ui.js';
import { Particles, Skids, CONFETTI, DRIFT_COLORS } from './effects.js';

// --- renderer: una scena, fino a due camere (split-screen verticale)
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9d3dd);
scene.fog = new THREE.Fog(0xc9d3dd, 70, 190);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b717c, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(30, 100, 50);
scene.add(sun);
const track = buildTrack(scene);
const cams = [0, 1].map(() => new THREE.PerspectiveCamera(70, 1, 0.1, 400));
const fx = new Particles(scene);
const skids = new Skids(scene);
if (import.meta.env.DEV) window.__dbg = { THREE, scene, renderer, track, get karts() { return karts; } }; // ispezione da console in sviluppo

function resize() { // render interno al massimo a 1080p (o 720p), il browser scala a schermo intero
  const cap = ui.settings.maxRes;
  const scale = Math.min(1, cap / innerHeight, (cap * 16 / 9) / innerWidth);
  renderer.setSize(Math.round(innerWidth * scale), Math.round(innerHeight * scale), false);
}
addEventListener('resize', resize);

const size = new THREE.Vector2();
function render(list) {
  renderer.getSize(size);
  const w = size.x / list.length;
  renderer.setScissorTest(list.length > 1);
  list.forEach((cam, i) => {
    renderer.setViewport(i * w, 0, w, size.y);
    renderer.setScissor(i * w, 0, w, size.y);
    cam.aspect = w / size.y;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
  });
}

// --- stato
let mode = '', modeT = 0, raceT = 0, time = 0, laps = CONFIG.laps;
let karts = [], players = [], showcase = [], spin = 0;
let pause = null, endT = 0, finishCount = 0, lastCount = 0, shot = 0, lastShot = -1;
let ghostRun = null, ghostMesh = null; // fantasma del record di oggi (solo con 1 giocatore)
let slowT = 0, fwT = 0; // rallentatore e fuochi d'artificio all'arrivo
const voice = (key, important) => audio.say(key, important);
const pick = (...keys) => keys[Math.floor(Math.random() * keys.length)];
let replay = null; // { frames, t, tEnd, focus, spot }
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, depthWrite: false });

const setMode = (m) => { mode = m; modeT = 0; };
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const raceOrder = () => karts.slice().sort((a, b) =>
  (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.prog - a.prog));

function clearKarts() {
  karts.forEach(k => k.dispose()); karts = [];
  if (ghostMesh) scene.remove(ghostMesh);
  ghostMesh = ghostRun = null;
  skids.clear();
}
function clearShowcase() { showcase.forEach(g => scene.remove(g)); showcase = []; }
function stopEngines() { players.forEach((p) => { p.engine?.stop(); p.engine = null; }); }

function pads() {
  for (const k of karts) if (!k.air && track.padHit(k.s, k.d) && k.boost() && k.human) {
    audio.play('boost');
    rumble(players.find(p => p.kart === k)?.dev, 0.2, 0.7, 300);
  }
}

// --- effetti per kart: fiamma turbo, scintille drift e muro, polvere
function kartFx(k) {
  const fwx = Math.sin(k.yaw), fwz = Math.cos(k.yaw), lx = fwz, lz = -fwx;
  const rx = k.pos.x - fwx * 1.1, rz = k.pos.z - fwz * 1.1;
  const r = () => Math.random() - 0.5;
  if (k.boostT > 0) for (const side of [-1, 1]) { // scie luminose del colore del kart
    fx.emit(rx + lx * side * 0.6, 0.35, rz + lz * side * 0.6, 0, 0, 0, k.color === 'bianco' ? 0x9fe3ff : CONFIG.colors[k.color], 0.3, 0.5);
  }
  if (k.drifting || (Math.abs(k.steerVis) > 0.8 && k.v > 10)) { // segni di frenata sotto le ruote posteriori
    for (const side of [-1, 1]) skids.add(rx + lx * side * 0.6, rz + lz * side * 0.6, k.mesh.rotation.y);
  }
  if (k.drifting) {
    const c = DRIFT_COLORS[k.driftLevel()];
    for (const side of [-1, 1]) fx.emit(rx + lx * side * 0.6, 0.15, rz + lz * side * 0.6, r() * 2, 1.5 + Math.random() * 2, r() * 2, c, 0.22, 0.25, 9);
  }
  for (const e of k.events) {
    if (e === 'wallL' || e === 'wallR') {
      const side = e === 'wallL' ? 1 : -1;
      fx.burst(k.pos.x + lx * side * 0.7, 0.6, k.pos.z + lz * side * 0.7, 25, [0xffd23f, 0xffffff, 0xff9a1f], 5, 0.18, 0.5, 12);
    }
    if (e === 'land') fx.burst(k.pos.x, k.pos.y + 0.2, k.pos.z, 30, [0xc9ccd2, 0xb0b4ba], 4, 0.6, 0.6, 2);
    if (e === 'obst') fx.burst(k.pos.x + fwx * 1.2, 0.7, k.pos.z + fwz * 1.2, 30, [0xffd23f, 0xffffff, 0xff9a1f, 0xc89b62], 6, 0.2, 0.6, 12);
  }
  if (k.v > 8 && Math.random() < 0.15) fx.emit(rx - fwx * 0.5, 0.15, rz - fwz * 0.5, r(), 0.4, r(), 0xc9ccd2, 0.35, 0.35, -0.5);
  k.events.length = 0;
  k.bumped = false;
}

// --- ATTRACT: 4 CPU girano, camera cinematografica
function enterAttract() {
  stopEngines(); clearKarts(); clearShowcase();
  players = []; pause = null; shot = 0; lastShot = -1;
  const names = shuffle(CONFIG.cpuNames);
  karts = shuffle(CHOICES).slice(0, 4).map((c, i) => {
    const k = new Kart(scene, track, { ...c, name: names[i] });
    k.place(i * track.L / 4, i % 2 ? 2 : -2);
    k.cpuMult = 0.85 + Math.random() * 0.15;
    return k;
  });
  setMode('attract');
  audio.setMusic('menu');
  ui.setViews(1);
  ui.showAttract(ui.board.list().slice(0, 5));
}

function updateAttract(dt, devs) {
  for (const k of karts) k.step(dt, aiInput(k, track, time), k.cpuMult);
  pads(); collide(karts, track); hitObstacles(karts, track);
  karts.forEach(kartFx);
  const d = devs.find(d => d.startP || d.aP);
  if (d) { audio.init(); audio.play('ok'); enterSelect(d.id); }
}

// --- SELEZIONE: chi preme START per primo è G1 (sinistra)
function enterSelect(dev) {
  players = [{ dev, choice: 0, confirmed: false }];
  voice('benvenuti', true);
  setMode('select');
  ui.setViews(1);
  buildShowcase();
}

function buildShowcase() {
  clearShowcase();
  showcase = players.map((p, i) => {
    const c = CHOICES[p.choice], g = buildModel(c.vehicle, c.color, true), sp = track.showcase[i];
    g.position.set(sp.x, 0.22, sp.z);
    scene.add(g);
    return g;
  });
}

function cycle(p, dir) { // salta la combinazione già presa dall'altro giocatore
  const other = players.find(q => q !== p)?.choice;
  let c = p.choice;
  do c = (c + dir + CHOICES.length) % CHOICES.length; while (c === other);
  return c;
}

function updateSelect(dt, devs) {
  for (const d of devs) {
    const p = players.find(q => q.dev === d.id);
    if (!p) {
      if ((d.startP || d.aP) && players.length < 2) {
        const q = { dev: d.id, choice: players[0].choice, confirmed: false };
        players.push(q);
        q.choice = cycle(q, 1);
        audio.play('ok'); ui.setViews(2); buildShowcase();
      }
      continue;
    }
    if (p.confirmed) continue;
    if (d.leftP || d.rightP) { p.choice = cycle(p, d.rightP ? 1 : -1); audio.play('tick'); buildShowcase(); }
    else if (d.aP || d.startP) { p.confirmed = true; audio.play('ok'); }
    else if (d.bP && p === players[0]) return enterAttract();
  }
  spin += dt * 0.9;
  showcase.forEach(g => (g.rotation.y = spin));
  if (players.every(p => p.confirmed) || modeT > CONFIG.selectTimeout) return startRace();
  ui.showSelect(players.map(p => ({ ...CHOICES[p.choice], confirmed: p.confirmed, dev: p.dev })), Math.ceil(CONFIG.selectTimeout - modeT));
}

// --- GARA
function startRace(skipIntro = false) {
  clearShowcase(); clearKarts();
  laps = ui.settings.laps;
  const free = shuffle(CHOICES.map((_, i) => i).filter(i => !players.some(p => p.choice === i)));
  const names = shuffle(CONFIG.cpuNames);
  const skills = shuffle(CONFIG.cpuSkill);
  const cpus = free.slice(0, 4 - players.length).map((c, i) => Object.assign(new Kart(scene, track, { ...CHOICES[c], name: names[i] }), { skill: skills[i % skills.length] }));
  players.forEach((p, i) => Object.assign(p, {
    kart: new Kart(scene, track, { ...CHOICES[p.choice], name: `G${i + 1}`, human: true }),
    engine: audio.engine(), zone: '', zoneT: 0, lap: 1, camInit: false, camYaw: 0, shake: 0, banner: '', bannerT: 0, initials: null,
  }));
  karts = [...cpus, ...players.map(p => p.kart)]; // CPU in prima fila, umani dietro
  [[-5, -2.2], [-5, 2.2], [-11, -2.2], [-11, 2.2]].forEach(([s, d], i) => karts[i].place(s, d));
  raceT = 0; endT = 0; finishCount = 0; lastCount = 0; pause = null;
  players.forEach(p => Object.assign(p, { rec: [], recNext: 0 }));
  ghostRun = players.length === 1 ? ui.ghost.load() : null;
  if (ghostRun) {
    ghostMesh = buildModel(ghostRun.vehicle, ghostRun.color);
    ghostMesh.traverse(o => { if (o.isMesh) o.material = ghostMat; });
    scene.add(ghostMesh);
    placeGhost(0);
  }
  audio.setMusic('race');
  replay = { frames: [] };
  if (skipIntro) { setMode('countdown'); ui.setViews(players.length); ui.center(''); return; }
  setMode('intro');
  ui.setViews(1);
}

function placeGhost(t) {
  const f = ghostRun.frames, W = 4, n = f.length / W, i = Math.min(n - 1, Math.floor(t * 10)), j = Math.min(n - 1, i + 1), a = Math.min(1, t * 10 - i);
  const lerp = o => f[i * W + o] + (f[j * W + o] - f[i * W + o]) * a;
  ghostMesh.position.set(lerp(0), lerp(3), lerp(1));
  ghostMesh.rotation.y = f[i * W + 2] + wrapAngle(f[j * W + 2] - f[i * W + 2]) * a;
  ghostMesh.visible = t * 10 < n;
}

// --- INTRO: volo sopra il giro (si salta con A)
function updateIntro(dt, devs) {
  const skip = modeT > 0.5 && devs.some(d => players.some(p => p.dev === d.id) && (d.aP || d.startP));
  const s = track.L * Math.min(1, modeT / CONFIG.introTime);
  ui.showIntro(track.zoneAt(s).name, !!ghostRun);
  if (skip || modeT > CONFIG.introTime) { setMode('countdown'); ui.setViews(players.length); ui.center(''); }
}

function introCam(cam) {
  const s = track.L * Math.min(1, modeT / CONFIG.introTime), a = track.point(s - 30, 0), b = track.point(s + 15, 0);
  cam.position.set(a.x, track.height(s - 30) + 6.5, a.z); // sotto le lampade e le capriate
  cam.lookAt(b.x, 0, b.z);
  cam.fov = 60;
  return cam;
}

function updateCountdown() {
  const n = 3 - Math.floor(modeT);
  if (n !== lastCount && n > 0) { lastCount = n; audio.play('count'); }
  if (modeT >= 3) {
    audio.play('go'); audio.play('pop'); setMode('race'); voice('Via!', true);
    players.forEach(p => rumble(p.dev, 0.5, 0.5, 250));
    for (const d of [-6, 6]) { const q = track.point(0, d); fx.burst(q.x, 6.5, q.z, 80, CONFETTI, 8, 0.35, 2, 6); }
  }
  ui.center(ui.lights(Math.min(3, Math.floor(modeT) + 1)));
  hudRace(0);
}

function updateRace(dt, devs) {
  if (pause) return updatePause(dt, devs);
  const pauser = players.findIndex(p => devs.find(d => d.id === p.dev)?.pauseP); // ognuno può mettere in pausa
  if (pauser >= 0) { pause = { player: pauser, menu: true, sel: 0, resumeT: 0 }; players.forEach(p => p.engine.set(0)); audio.play('tick'); return; }
  const lost = players.findIndex(p => !isConnected(p.dev));
  if (lost >= 0) { pause = { player: lost, resumeT: 0 }; players.forEach(p => p.engine.set(0)); return; }
  raceT += dt;

  const byId = Object.fromEntries(devs.map(d => [d.id, d]));
  for (const p of players) {
    const k = p.kart, d = byId[p.dev];
    const rival = players.find(q => q !== p && !q.kart.finished);
    const mult = 1 + (rival && !k.finished ? clamp((rival.kart.prog - k.prog) / 60, 0, 1) * CONFIG.catchUpMax : 0);
    if (d?.resetP && !k.finished) { k.respawn(); audio.play('tick'); }
    k.step(dt, k.finished || !d ? aiInput(k, track, raceT) : { steer: -d.x, brake: d.b || d.y > 0.7, drift: d.drift }, mult);
    if (!k.finished && raceT >= p.recNext) { p.rec.push(+k.pos.x.toFixed(2), +k.pos.z.toFixed(2), +k.yaw.toFixed(3), +k.pos.y.toFixed(2)); p.recNext += 0.1; }
  }
  if (ghostRun) placeGhost(raceT);
  const humans = players.map(p => p.kart);
  for (const k of karts) if (!k.human) { // rubber banding sull'umano più vicino
    const near = humans.reduce((a, h) => (Math.abs(h.prog - k.prog) < Math.abs(a.prog - k.prog) ? h : a));
    const rubber = clamp(1 + CONFIG.rubberK * (near.prog - k.prog) / CONFIG.rubberDist, CONFIG.rubberMin, CONFIG.rubberMax);
    k.step(dt, aiInput(k, track, raceT), rubber * k.skill);
  }
  pads(); collide(karts, track); hitObstacles(karts, track);

  for (const k of karts) if (!k.finished && k.prog >= laps * track.L) {
    Object.assign(k, { finished: true, finishTime: raceT, rank: ++finishCount });
    if (k.human) {
      audio.play('finish'); fx.burst(k.pos.x, 2, k.pos.z, 160, CONFETTI, 9, 0.35, 2.5, 7);
      const p = players.find(q => q.kart === k);
      slowT = 1.6; fwT = 3; p.orbitT = 2.8; p.orbitA = k.yaw + Math.PI;
      rumble(p.dev, 1, 1, 600);
      const g = players.length > 1 ? `_g${players.indexOf(p) + 1}` : '';
      voice(k.rank === 1 ? `vittoria${g}` : `posto${k.rank}${g}`, true);
      replay.focus ??= k; replay.tEnd ??= raceT + 1.2; // il replay mostra l'arrivo del primo umano
      if (laps === CONFIG.laps) ui.ghost.offer({ time: raceT, vehicle: k.vehicle, color: k.color, frames: p.rec });
    }
  }
  for (const p of players) {
    const k = p.kart;
    if (k.bumped) audio.play('bump');
    const lap = Math.min(laps, Math.floor(Math.max(0, k.prog) / track.L) + 1);
    if (lap > p.lap) {
      p.lap = lap; audio.play('lap');
      p.banner = lap === laps ? 'Ultimo giro!' : `Giro ${lap}`; p.bannerT = 2;
      voice(lap === laps ? 'ultimo' : `giro${lap}`, true);
      if (lap === laps && laps > 1) audio.setMusic('race_final');
      fx.burst(k.pos.x, 3, k.pos.z, 60, CONFETTI, 7, 0.3, 1.8, 7);
    }
    for (const e of k.events) {
      if (e === 'wallL' || e === 'wallR' || e === 'obst') { audio.play('wall'); p.shake = e === 'obst' ? 0.5 : 0.35; rumble(p.dev, 0.6, 0.3, 160); }
      if (e === 'jump') { audio.play('whoosh'); if (Math.random() < 0.5) voice(pick('salto1', 'salto2', 'salto3')); }
      if (e === 'land') { audio.play('land'); p.shake = 0.45; rumble(p.dev, 0.9, 0.5, 220); }
      if (e === 'charge') audio.play('charge');
      if (e === 'miniturbo') { audio.play('boost'); rumble(p.dev, 0.2, 0.7, 300); }
    }
    if (k.bumped) rumble(p.dev, 0.3, 0.2, 100);
    const rank = k.finished ? k.rank : raceOrder().indexOf(k) + 1;
    if (!k.finished && p.rank && rank < p.rank) voice(rank === 1 ? (players.length > 1 ? `testa_g${players.indexOf(p) + 1}` : 'testa') : pick('sorpasso1', 'sorpasso2', 'sorpasso3'));
    p.rank = rank;
    p.engine.set(k.v, k.boostT > 0);
  }
  karts.forEach(kartFx);
  recordReplay();

  if (fwT > 0) { // fuochi d'artificio sopra il traguardo
    fwT -= dt;
    if (Math.random() < 0.12) { const q = track.point(0, (Math.random() - 0.5) * 16); fx.firework(q.x, track.height(0) + 11 + Math.random() * 6, q.z, CONFETTI[Math.floor(Math.random() * CONFETTI.length)]); audio.play('firework'); }
  }
  if (players.every(p => p.kart.finished) && (endT += dt) > 3) return enterReplay();
  ui.center(raceT < 1 ? ui.lights(3, true) : '');
  hudRace(dt);
}

function updatePause(dt, devs) {
  const p = players[pause.player];
  if (pause.menu && !pause.resumeT) { // menu di pausa: lo comanda chi l'ha aperto
    const d = devs.find(x => x.id === p.dev);
    if (d?.upP || d?.downP) { pause.sel = (pause.sel + (d.downP ? 1 : 2)) % 3; audio.play('tick'); }
    if (d?.pauseP || d?.bP || (d?.aP && pause.sel === 0)) { pause.resumeT = 3; audio.play('ok'); return; }
    if (d?.aP && pause.sel === 1) { audio.play('ok'); return startRace(true); }
    if (d?.aP && pause.sel === 2) return enterAttract();
    return ui.showPause(players, pause.player, pause.sel);
  }
  if (!pause.resumeT) {
    const fresh = devs.find(d => d.aP && d.id.startsWith('gp') && !players.some(q => q.dev === d.id));
    if (fresh) p.dev = fresh.id;
    if (isConnected(p.dev)) pause.resumeT = 3;
    ui.showDisconnected(pause.player + 1);
  } else {
    pause.resumeT -= dt;
    if (pause.resumeT <= 0) { pause = null; return; }
    ui.showResume(Math.ceil(pause.resumeT));
  }
}

function hudRace(dt) {
  const order = raceOrder();
  players.forEach((p, i) => {
    const k = p.kart, z = track.zoneAt(k.s).name;
    if (z !== p.zone) { p.zone = z; p.zoneT = 2.2; }
    p.zoneT -= dt;
    ui.hud(i, {
      pos: k.finished ? k.rank : order.indexOf(k) + 1,
      lap: [p.lap, laps],
      zone: p.zoneT > 0 && mode === 'race' ? z : '',
      wrong: k.wrongT > 2,
      msg: k.finished ? 'Arrivato!' : (p.bannerT > 0 ? p.banner : ''),
      boost: k.boostT > 0,
      charge: k.drifting ? { frac: Math.min(1, k.charge / CONFIG.driftLvl.at(-1)), lvl: k.driftLevel() } : null,
    });
    p.bannerT -= dt;
  });
}

// --- REPLAY: ultimi secondi prima dell'arrivo del primo umano, rallentati, con camere TV a bordo pista
function recordReplay() {
  const f = { t: raceT, k: karts.map(k => ({
    p: k.mesh.position.toArray(), r: [k.mesh.rotation.x, k.mesh.rotation.y, k.mesh.rotation.z], prog: k.prog,
    b: k.boostT > 0, sy: k.shadow.position.y, w: k.wagons.map(w => [...w.position.toArray(), w.rotation.y]),
  })) };
  replay.frames.push(f);
  // ponytail: finché nessun umano è arrivato tengo solo gli ultimi 12 s; dopo tengo tutto fino al replay
  if (!replay.focus) while (replay.frames[0].t < raceT - 12) replay.frames.shift();
}

function enterReplay() {
  const tEnd = replay.tEnd ?? raceT, frames = replay.frames.filter(f => f.t >= tEnd - 6 && f.t <= tEnd);
  if (frames.length < 10) return enterPodium();
  Object.assign(replay, { frames, t: frames[0].t, tEnd, i: 0, spot: null });
  stopEngines(); slowT = 0;
  karts.forEach(k => { k.static = true; k.flame.visible = false; });
  if (ghostMesh) ghostMesh.visible = false;
  setMode('replay');
  ui.setViews(1);
  ui.showReplay();
  voice('replay', true);
}

function updateReplay(dt, devs) {
  replay.t += dt * 0.6;
  const fr = replay.frames;
  while (replay.i < fr.length - 2 && fr[replay.i + 1].t < replay.t) replay.i++;
  const A = fr[replay.i], B = fr[replay.i + 1] ?? A, u = Math.min(1, Math.max(0, (replay.t - A.t) / ((B.t - A.t) || 1)));
  karts.forEach((k, n) => {
    const a = A.k[n], b = B.k[n], l = (x, y) => x + (y - x) * u;
    k.mesh.position.set(l(a.p[0], b.p[0]), l(a.p[1], b.p[1]), l(a.p[2], b.p[2]));
    k.mesh.rotation.set(a.r[0], a.r[1] + wrapAngle(b.r[1] - a.r[1]) * u, a.r[2]);
    k.flame.visible = a.b;
    k.shadow.position.set(k.mesh.position.x, a.sy, k.mesh.position.z);
    k.wagons.forEach((w, j) => { w.position.set(l(a.w[j][0], b.w[j][0]), l(a.w[j][1], b.w[j][1]), l(a.w[j][2], b.w[j][2])); w.rotation.y = a.w[j][3]; });
    k.replayProg = l(a.prog, b.prog);
  });
  if (replay.t >= replay.tEnd || (modeT > 0.8 && devs.some(d => d.aP || d.startP))) enterPodium();
}

function replayCam(cam) { // camera TV: la postazione a bordo pista appena davanti al kart, con zoom
  const k = replay.focus ?? karts[0], s = k.replayProg ?? k.prog;
  const spot = track.tvSpots.reduce((best, sp) => {
    const ahead = track.wrapDelta(sp.s - s);
    return ahead > -6 && ahead < (best ? track.wrapDelta(best.s - s) : Infinity) ? sp : best;
  }, null) ?? track.tvSpots[0];
  cam.position.set(spot.x, spot.y, spot.z);
  cam.lookAt(k.mesh.position.x, k.mesh.position.y + 0.8, k.mesh.position.z);
  cam.fov = clamp(cam.position.distanceTo(k.mesh.position) * 1.4, 18, 55);
  return cam;
}

// --- PODIO → INIZIALI → CLASSIFICA
function enterPodium() {
  stopEngines();
  slowT = 0; fwT = 0;
  voice('complimenti', true);
  audio.setMusic('menu');
  if (ghostMesh) ghostMesh.visible = false;
  const ranking = raceOrder();
  ranking.forEach((k, i) => k.setStatic(...track.podiumSpots[i], Math.PI));
  audio.play('applause');
  setMode('podium');
  ui.setViews(1);
  ui.showPodium(ranking.map(k => ({ name: k.human ? `Giocatore ${k.name.slice(1)}` : k.name, human: k.human, color: k.color, vehicle: k.vehicle, time: k.finished ? k.finishTime : null })));
}

function toInitials() {
  const q = laps === CONFIG.laps ? players.filter(p => p.kart.finished && ui.board.qualifies(p.kart.finishTime)) : [];
  if (!q.length) return enterBoard([]);
  q.forEach(p => (p.initials = { letters: [0, 0, 0], idx: 0, done: false }));
  setMode('initials');
  ui.setViews(players.length);
}

function updateInitials(dt, devs) {
  for (const p of players) {
    const it = p.initials, d = devs.find(x => x.id === p.dev);
    if (!it || it.done || !d) continue;
    if (d.upP) it.letters[it.idx] = (it.letters[it.idx] + 1) % 26;
    if (d.downP) it.letters[it.idx] = (it.letters[it.idx] + 25) % 26;
    if (d.rightP || d.aP) { if (++it.idx === 3) { it.done = true; audio.play('ok'); } else audio.play('tick'); }
    if ((d.leftP || d.bP) && it.idx > 0) it.idx--;
  }
  const active = players.filter(p => p.initials);
  if (active.every(p => p.initials.done) || modeT > CONFIG.initialsTimeout) {
    const added = active.map((p, i) => {
      const k = p.kart, at = Date.now() + i;
      voice('record', true);
      ui.board.add({ name: ui.cleanName(p.initials.letters.map(n => String.fromCharCode(65 + n)).join('')), time: k.finishTime, vehicle: k.vehicle, color: k.color, at });
      return at;
    });
    return enterBoard(added);
  }
  ui.showInitials(players.map(p => p.initials), Math.ceil(CONFIG.initialsTimeout - modeT));
}

function enterBoard(hl) {
  setMode('board');
  ui.setViews(1);
  ui.showBoard(ui.board.list(), hl);
}

function updateBoard(dt, devs) {
  if (modeT > CONFIG.boardTime || (modeT > 1 && devs.some(d => d.startP))) enterAttract();
}

// --- minimappa (solo con 1 giocatore): sfondo disegnato una volta, poi solo i puntini
const mapEl = document.getElementById('minimap'), mapCtx = mapEl.getContext('2d');
const mapBg = (() => {
  const pts = track.outline, xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, z0 = Math.min(...zs) - 12, z1 = Math.max(...zs) + 12;
  const sc = Math.min(mapEl.width / (x1 - x0), mapEl.height / (z1 - z0));
  const map = (x, z) => [(x - x0) * sc, (z - z0) * sc];
  const c = document.createElement('canvas'); c.width = mapEl.width; c.height = mapEl.height;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(11,27,58,.55)'; g.fillRect(0, 0, c.width, c.height);
  for (const a of track.areas) { const [ax, az] = map(a.x0, a.z0); g.fillStyle = a.color + '88'; g.fillRect(ax, az, (a.x1 - a.x0) * sc, (a.z1 - a.z0) * sc); }
  g.lineJoin = 'round';
  for (const [w, col] of [[11, '#fff'], [7, '#50555d']]) {
    g.beginPath(); pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...map(p.x, p.z))); g.closePath();
    g.lineWidth = w; g.strokeStyle = col; g.stroke();
  }
  return { c, map };
})();
function minimap() {
  if (mapEl.hidden) return;
  mapCtx.drawImage(mapBg.c, 0, 0);
  const dot = (x, z, r, fill) => { const [px, pz] = mapBg.map(x, z); mapCtx.beginPath(); mapCtx.arc(px, pz, r, 0, 7); mapCtx.fillStyle = fill; mapCtx.fill(); mapCtx.lineWidth = 2; mapCtx.strokeStyle = '#0b1b3a'; mapCtx.stroke(); };
  if (ghostMesh?.visible) dot(ghostMesh.position.x, ghostMesh.position.z, 5, '#bfe6ff');
  for (const k of karts) if (!k.human) dot(k.pos.x, k.pos.z, 5, '#' + CONFIG.colors[k.color].toString(16).padStart(6, '0'));
  for (const k of karts) if (k.human) dot(k.pos.x, k.pos.z, 8, '#ffd23f');
}

// --- camere
const v1 = new THREE.Vector3();
function chase(cam, p, dt) {
  // la camera segue il kart in ritardo: si vede il kart girare, non il mondo che scivola
  const k = p.kart;
  if (!p.camInit) p.camYaw = k.yaw;
  p.camYaw += wrapAngle(k.yaw - p.camYaw) * Math.min(1, 4 * dt);
  const fwx = Math.sin(p.camYaw), fwz = Math.cos(p.camYaw);
  if (p.orbitT > 0) { // giro di camera attorno al kart all'arrivo
    p.orbitT -= dt; p.orbitA += dt * 1.3;
    cam.position.set(k.pos.x + Math.sin(p.orbitA) * 6, k.pos.y + 2.2, k.pos.z + Math.cos(p.orbitA) * 6);
    cam.lookAt(k.pos.x, k.pos.y + 1, k.pos.z);
    return cam;
  }
  v1.set(k.pos.x - fwx * 6.5, k.pos.y + 3.2 + (k.air ? 0.8 : 0), k.pos.z - fwz * 6.5);
  if (!p.camInit) { cam.position.copy(v1); p.camInit = true; } else cam.position.lerp(v1, 1 - Math.exp(-10 * dt));
  p.shake = Math.max(0, p.shake - dt);
  const sh = p.shake * 0.6;
  cam.lookAt(k.pos.x + fwx * 5 + (Math.random() - 0.5) * sh, k.pos.y + 1 + (Math.random() - 0.5) * sh, k.pos.z + fwz * 5);
  cam.fov += (70 + (k.boostT > 0 ? 8 : 0) + (k.air ? 6 : 0) - cam.fov) * Math.min(1, 5 * dt);
  return cam;
}

function cinematic(cam, dt) {
  if (modeT > (shot + 1) * 6) shot++;
  const k = karts[shot % karts.length], [back, up, side] = [[-8, 5, 0], [-2, 2, 6], [8, 1.5, 0]][shot % 3];
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  v1.set(k.pos.x + fx * back + fz * side, up, k.pos.z + fz * back - fx * side);
  if (shot !== lastShot) { cam.position.copy(v1); lastShot = shot; } else cam.position.lerp(v1, 1 - Math.exp(-4 * dt));
  cam.lookAt(k.pos.x, 1, k.pos.z);
  cam.fov = 60;
  return cam;
}

function fixedCam(cam, x, z, back, up, fov, lookY = 1) {
  cam.position.set(x, up, z - back);
  cam.lookAt(x, lookY, z);
  cam.fov = fov;
  return cam;
}

function draw(dt) {
  if (mode === 'attract') return render([cinematic(cams[0], dt)]);
  if (mode === 'select') return render(players.map((_, i) => fixedCam(cams[i], track.showcase[i].x, track.showcase[i].z, 7.5, 2.6, 50, 0.2)));
  if (mode === 'intro') return render([introCam(cams[0])]);
  if (mode === 'countdown' || mode === 'race') { minimap(); return render(players.map((p, i) => chase(cams[i], p, dt))); }
  if (mode === 'replay') return render([replayCam(cams[0])]);
  render([fixedCam(cams[0], track.podium.x, track.podium.z, 15, 5, 55, -2.5)]); // kart in alto, classifica sotto
}

// --- loop
function podiumRain() {
  for (let i = 0; i < 4; i++) fx.emit(track.podium.x + (Math.random() - 0.5) * 16, 10, track.podium.z + (Math.random() - 0.5) * 6, 0, -1, 0, CONFETTI[i], 0.3, 3, 1.5);
}

const UPDATE = {
  intro: updateIntro,
  attract: updateAttract, select: updateSelect, countdown: updateCountdown, race: updateRace,
  replay: updateReplay,
  podium: () => { podiumRain(); if (modeT > CONFIG.podiumTime) toInitials(); },
  initials: (dt, devs) => { podiumRain(); updateInitials(dt, devs); },
  board: updateBoard,
};

let last = performance.now(), fpsN = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); // il primo timestamp di rAF può precedere "last"
  last = now; modeT += dt;
  const gdt = slowT > 0 ? dt * 0.3 : dt; // rallentatore all'arrivo: il gioco va piano, camera e interfaccia no
  slowT -= dt; time += gdt;
  UPDATE[mode](gdt, pollDevices());
  track.update(gdt, time);
  for (const tip of track.welding(time)) { // scintille dei robot di saldatura
    for (let i = 0; i < 2; i++) fx.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, Math.random() < 0.5 ? 0xfff3a0 : 0xffffff, 0.14, 0.35, 12);
  }
  fx.update(gdt, renderer.domElement.height);
  flameMat.uniforms.uTime.value = time;
  mapEl.hidden = !((mode === 'countdown' || mode === 'race') && players.length === 1);
  draw(dt);
  fpsN++; fpsT += dt;
  if (fpsT > 0.5) { ui.fps(Math.round(fpsN / fpsT)); fpsN = fpsT = 0; }
}

function applySettings() {
  audio.setVolumes(ui.settings.music, ui.settings.sfx);
  ui.showFps(ui.settings.fps);
  audio.setVoice(ui.settings.voice);
  track.setFancy(ui.settings.fancy);
  resize();
}
ui.initOperator({ onChange: applySettings, onAttract: enterAttract });
audio.init(); // con --autoplay-policy=no-user-gesture-required parte subito; altrimenti al primo tasto
addEventListener('keydown', () => audio.init());
addEventListener('pointerdown', () => audio.init());
applySettings();
enterAttract();
requestAnimationFrame(loop);
