// Controllo di regressione "kart incollato al muro" (bug del 2026-10-28).
// Uso: `npm run dev`, apri la pagina, incolla questo file nella console del browser.
// Un kart senza input viene lanciato contro il muro esterno delle 6 curve più strette con 4 angoli:
// deve staccarsi (pochi urti) e non restare lento. Prima della correzione: fino a 139 urti in 8 s a ~3 m/s.
(() => {
  const { track, karts } = window.__dbg, k = karts[0];
  const curves = [];
  for (let s = 0; s < track.L; s += 2) curves.push({ s, k: track.sample(s).k });
  curves.sort((a, b) => Math.abs(b.k) - Math.abs(a.k));
  const picked = [];
  for (const c of curves) if (picked.every(p => Math.abs(track.wrapDelta(p.s - c.s)) > 25)) { picked.push(c); if (picked.length === 6) break; }
  let worst = 0, slowest = 99;
  for (const c of picked) for (const ang of [0.3, 0.8, 1.3, 2.5]) {
    const side = c.k > 0 ? -1 : 1;
    k.place(c.s, side * (track.hw - 1.2));
    Object.assign(k, { h: side * ang, v: 14, static: false });
    let hits = 0, minV = 99;
    for (let i = 0; i < 480; i++) {
      k._step(1 / 60, { steer: 0, brake: false }, 1);
      hits += k.events.filter(e => e === 'wallL' || e === 'wallR').length;
      k.events.length = 0;
      if (i > 60) minV = Math.min(minV, k.v);
    }
    worst = Math.max(worst, hits); slowest = Math.min(slowest, minV);
  }
  console.assert(worst <= 10, `troppi urti contro il muro: ${worst} in 8 s`);
  console.assert(slowest > 8, `kart rimasto lento contro il muro: ${slowest.toFixed(1)} m/s`);
  return `muri OK? urti max ${worst} in 8 s, velocità minima ${slowest.toFixed(1)} m/s`;
})();
