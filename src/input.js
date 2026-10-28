import { clamp } from './config.js';

// Dispositivi: gamepad (gp0, gp1…) + due "gamepad" da tastiera per sviluppo/operatore.
const keys = new Set(), tapped = new Set(); // tapped: premuti dall'ultimo poll, anche se già rilasciati
addEventListener('keydown', (e) => {
  keys.add(e.code); tapped.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const KB = {
  kb1: { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', a: 'Enter', b: 'Backspace', dr: 'ShiftRight', rs: 'End' },
  kb2: { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', a: 'Space', b: 'KeyQ', dr: 'ShiftLeft', rs: 'KeyE' },
};
const DEAD = 0.2;
const ZERO = { x: 0, y: 0, a: false, b: false, start: false };
const prev = new Map();

export function pollDevices() {
  const raw = [];
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp?.connected) continue;
    const btn = i => +!!gp.buttons[i]?.pressed;
    const ax = (i) => { const v = gp.axes[i] ?? 0; return Math.abs(v) < DEAD ? 0 : v; };
    // mapping "standard" (8BitDo in modalità XInput, pad Xbox): 0=A 1=B 3=Y 4/5=LB/RB 6/7=grilletti 9=START 12-15=croce
    raw.push({
      id: 'gp' + gp.index,
      x: clamp(ax(0) + btn(15) - btn(14), -1, 1),
      y: clamp(ax(1) + btn(13) - btn(12), -1, 1),
      a: !!btn(0), b: !!btn(1), start: !!btn(9), drift: !!(btn(4) || btn(5) || btn(6) || btn(7)), reset: !!btn(3),
    });
  }
  for (const [id, m] of Object.entries(KB)) {
    const k = c => +(keys.has(c) || tapped.has(c));
    raw.push({ id, x: k(m.r) - k(m.l), y: k(m.d) - k(m.u), a: !!k(m.a), b: !!k(m.b), start: !!k(m.a), drift: keys.has(m.dr), reset: !!k(m.rs) });
  }
  tapped.clear();
  return raw.map((d) => {
    const p = prev.get(d.id) ?? ZERO; // ZERO: la prima pressione che "sveglia" il pad conta già
    prev.set(d.id, d);
    return {
      ...d,
      aP: d.a && !p.a, bP: d.b && !p.b, startP: d.start && !p.start, resetP: d.reset && !p.reset,
      leftP: d.x < -0.5 && p.x >= -0.5, rightP: d.x > 0.5 && p.x <= 0.5,
      upP: d.y < -0.5 && p.y >= -0.5, downP: d.y > 0.5 && p.y <= 0.5,
    };
  });
}

// vibrazione: l'8BitDo cablato in XInput la supporta; altri pad la ignorano senza errori
export function rumble(id, strong, weak, ms) {
  if (!id?.startsWith('gp')) return;
  navigator.getGamepads?.()[+id.slice(2)]?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
}

export const isConnected = id => id.startsWith('kb') || !!navigator.getGamepads?.()[+id.slice(2)]?.connected;
