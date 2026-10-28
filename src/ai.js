import { CONFIG, clamp } from './config.js';

// CPU "umane": linea verso l'interno curva ma imprecisa, compensazione curva parziale,
// e ogni tanto un errore (sterzata sbagliata per ~0.8 s) che le manda larghe o contro il muro.
export function aiInput(k, track, t) {
  const [minE, maxE] = CONFIG.cpuMistakeEvery;
  k.nextMistake ??= t + minE * Math.random() + 3;
  if (t > k.nextMistake) {
    k.mistakeEnd = t + 0.5 + Math.random() * 0.6;
    k.mistakeDir = Math.random() < 0.5 ? -1 : 1;
    k.nextMistake = t + minE + Math.random() * (maxE - minE);
  }
  const mistake = t < (k.mistakeEnd ?? 0) ? k.mistakeDir * 0.7 : 0;

  const lim = track.hw - 1.6;
  const kk = (track.sample(k.prog + 6).k + track.sample(k.prog + 16).k) / 2;
  let target = clamp(kk * CONFIG.aiLine * 0.7 + Math.sin(t * 0.35 + k.seed) * 2, -lim, lim);
  for (const o of track.obstacles) { // scansa bancali, coni e AGV in pista nei prossimi 22 m
    const ds = track.wrapDelta(o.s - k.prog), clear = o.r + CONFIG.kartRadius + 0.6;
    if (ds > 0 && ds < 22 && Math.abs(o.d) < track.hw + 0.5 && Math.abs(target - o.d) < clear) {
      target = clamp(o.d + (target >= o.d ? clear : -clear), -lim, lim);
    }
  }
  const want = Math.atan2(target - k.d, 9);
  const feedForward = 0.75 * kk * k.v / (CONFIG.steerRate * k.stats.steer); // compensa la curva solo in parte
  return { steer: clamp((want - k.h) * 2 + feedForward + mistake, -1, 1), brake: false };
}
