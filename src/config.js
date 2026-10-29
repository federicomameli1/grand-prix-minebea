// Tutti i numeri da tarare in playtest stanno qui.
export const CONFIG = {
  company: 'MINEBEA',
  laps: 3,               // giri "ufficiali": la classifica si aggiorna solo con questo valore
  roadWidth: 12,
  vMax: 15,             // m/s
  accel: 7,
  brake: 14,
  coast: 4,             // decelerazione quando si è sopra la velocità target (fine turbo)
  steerRate: 2.2,       // rad/s a sterzo pieno
  assist: 1.5,          // ponytail: manopola di difficoltà, più alto = il kart si riallinea da solo quando molli lo sterzo
  boostMult: 1.5,
  boostTime: 1.2,
  kartRadius: 1.1,
  wallBounce: 0.4,      // al contatto col muro il kart viene rimbalzato via (niente "saponetta" lungo il bordo)
  wallSlow: 0.85,
  wallEscape: 0.2,      // rad: angolo minimo con cui il kart si stacca dal muro
  driftSteer: [0.15, 0.45, 0.9], // drift: frazione dello sterzo pieno con levetta contro / al centro / dentro la curva
  driftMaxAngle: 0.55,  // rad: in drift il kart non punta mai più di ~30° fuori dalla direzione della pista
  driftEase: 0.3,       // s per entrare in drift (niente scatto iniziale)
  driftLvl: [0.7, 1.6, 2.6], // secondi di drift per mini-turbo blu / arancione / viola
  miniTurbo: [0.55, 1.0, 1.5],
  introTime: 7,
  gravity: 16,          // m/s² "arcade": salti brevi e incisivi
  cpuSkill: [0.93, 0.97, 1.0], // velocità relativa delle CPU
  cpuMistakeEvery: [6, 14],     // ogni quanti secondi una CPU sbaglia una traiettoria
  aiLine: 110,          // quanto le CPU tagliano verso l'interno curva
  rubberK: 1.0,
  rubberDist: 80,       // metri di distacco per ottenere l'effetto pieno
  rubberMin: 0.8,
  rubberMax: 1.15,
  catchUpMax: 0.08,     // bonus max per l'umano dietro all'altro umano
  podiumTime: 7,
  boardTime: 8,
  vehicles: {
    muletto: { name: 'MULETTO', vMax: 1.0, steer: 1.1, accel: 1.05 },
    tugger: { name: 'TUGGER', vMax: 1.05, steer: 0.9, accel: 0.95 },
  },
  colors: { bianco: 0xf2f2f2, blu: 0x1f4fbf, rosso: 0xd32a2a },
};

export const CHOICES = Object.keys(CONFIG.vehicles).flatMap(vehicle =>
  Object.keys(CONFIG.colors).map(color => ({ vehicle, color })));

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
