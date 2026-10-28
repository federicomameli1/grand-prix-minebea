// Effetti sonori sintetizzati con Web Audio; musica e voce da file (vedi sotto).
let ctx, master, music, sfx, noiseBuf;

export function init() {
  if (ctx) { ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.connect(ctx.destination);
  music = ctx.createGain(); music.connect(master);
  sfx = ctx.createGain(); sfx.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadAll();
}

export function setVolumes(m, s) {
  if (!ctx) return;
  music.gain.value = m;
  sfx.gain.value = s;
  if (voiceOut) voiceOut.gain.value = s;
}

function tone(freq, t, dur, type, vol, out = sfx, freqEnd) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(t, dur, vol, freq, out = sfx) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

export function play(name) {
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'tick': tone(660, t, 0.06, 'square', 0.12); break;
    case 'ok': tone(660, t, 0.08, 'square', 0.15); tone(990, t + 0.08, 0.12, 'square', 0.15); break;
    case 'count': tone(440, t, 0.25, 'square', 0.2); break;
    case 'go': tone(880, t, 0.6, 'square', 0.22); break;
    case 'boost': tone(250, t, 0.45, 'sawtooth', 0.18, sfx, 900); break;
    case 'whoosh': tone(180, t, 0.4, 'sawtooth', 0.1, sfx, 520); noise(t, 0.35, 0.2, 1500); break;
    case 'land': tone(80, t, 0.25, 'sine', 0.5, sfx, 35); noise(t, 0.2, 0.35, 500); break;
    case 'firework': noise(t, 0.08, 0.4, 3000); for (let i = 0; i < 6; i++) noise(t + 0.15 + Math.random() * 0.4, 0.04, 0.25, 4000 + Math.random() * 3000); break;
    case 'charge': tone(1200, t, 0.08, 'square', 0.08); break;
    case 'wall': tone(90, t, 0.2, 'sine', 0.4, sfx, 40); noise(t, 0.15, 0.3, 2500); break;
    case 'pop': noise(t, 0.25, 0.35, 1200); [880, 1320].forEach((f, i) => tone(f, t + i * 0.06, 0.12, 'square', 0.08)); break;
    case 'bump': tone(110, t, 0.15, 'sine', 0.35, sfx, 50); noise(t, 0.08, 0.15, 800); break;
    case 'lap': [784, 988].forEach((f, i) => tone(f, t + i * 0.1, 0.15, 'square', 0.15)); break;
    case 'finish': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.3, 'square', 0.18)); break;
    case 'applause': for (let i = 0; i < 40; i++) noise(t + Math.random() * 2, 0.04 + Math.random() * 0.06, 0.3, 1500 + Math.random() * 2000); break;
  }
}

export function engine() {
  if (!ctx) return { set() {}, stop() {} };
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  f.type = 'lowpass'; f.frequency.value = 600;
  g.gain.value = 0;
  o.connect(f).connect(g).connect(sfx);
  o.start();
  return {
    set(v, boost = false) {
      o.frequency.setTargetAtTime(45 + v * 5 + (boost ? 25 : 0), ctx.currentTime, 0.05);
      g.gain.setTargetAtTime(v > 0.1 ? 0.05 : 0, ctx.currentTime, 0.05);
    },
    stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); o.stop(ctx.currentTime + 0.3); },
  };
}

// Musica (CC0, MintoDog/OpenGameArt) e telecronista (frasi generate con Kokoro, vedi tools/voce/genera.py).
// Se un file manca il gioco funziona lo stesso, solo senza quel suono.
const BASE = import.meta.env.BASE_URL + 'audio/';
const VOICE = ['benvenuti', 'via', 'giro2', 'giro3', 'giro4', 'ultimo', 'sorpasso1', 'sorpasso2', 'sorpasso3', 'testa', 'testa_g1', 'testa_g2',
  'salto1', 'salto2', 'salto3', 'vittoria', 'vittoria_g1', 'vittoria_g2', 'posto2', 'posto3', 'posto4', 'posto2_g1', 'posto3_g1', 'posto4_g1',
  'posto2_g2', 'posto3_g2', 'posto4_g2', 'replay', 'complimenti', 'record'];
const buffers = {};
let duck, voiceOut, track = null, trackName = '', wanted = '', voiceSrc = null, lastSay = -9, voiceOn = true;

async function loadAll() {
  duck = ctx.createGain(); duck.connect(music);
  voiceOut = ctx.createGain(); voiceOut.gain.value = sfx.gain.value; voiceOut.connect(master);
  const load = async (key, path) => {
    try { buffers[key] = await ctx.decodeAudioData(await (await fetch(BASE + path)).arrayBuffer()); } catch { /* file mancante */ }
  };
  await Promise.all([
    ...['menu', 'race', 'race_final'].map(n => load(n, `music/${n}.ogg`)),
    ...VOICE.map(k => load('v_' + k, `voice/${k}.wav`)),
  ]);
  if (wanted) setMusic(wanted);
}

export function setMusic(name) { // dissolvenza incrociata tra i brani
  wanted = name;
  if (!ctx || !duck || name === trackName || !buffers[name]) return;
  const t = ctx.currentTime;
  if (track) { track.g.gain.setTargetAtTime(0, t, 0.3); track.src.stop(t + 1.5); }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffers[name]; src.loop = true;
  g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(1, t, 0.3);
  src.connect(g).connect(duck); src.start(t);
  track = { src, g }; trackName = name;
}

export function setVoice(on) { voiceOn = on; }

export function say(key, important = false) {
  const b = buffers['v_' + key];
  if (!ctx || !voiceOn || !b) return;
  const t = ctx.currentTime;
  if (!important && (voiceSrc || t - lastSay < 2.5)) return; // niente chiacchiere sovrapposte
  if (voiceSrc) voiceSrc.stop();
  const src = ctx.createBufferSource();
  src.buffer = b; src.connect(voiceOut); src.start(t);
  duck.gain.setTargetAtTime(0.35, t, 0.05); // la musica si abbassa mentre parla
  src.onended = () => { if (voiceSrc === src) { voiceSrc = null; duck.gain.setTargetAtTime(1, ctx.currentTime, 0.2); } };
  voiceSrc = src; lastSay = t;
}
