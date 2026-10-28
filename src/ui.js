import { CONFIG, clamp } from './config.js';

const $ = s => document.querySelector(s);
const SKEY = 'gpf_settings_v1', BKEY = 'gpf_leaderboard_v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage pieno/bloccato: il gioco continua */ } };

export const settings = { laps: CONFIG.laps, music: 0.5, sfx: 0.8, maxRes: 1080, fps: false, voice: true, fancy: true, ...load(SKEY, {}) };
const saveSettings = () => save(SKEY, settings);

export const board = {
  list: () => load(BKEY, []),
  qualifies(time) { const l = this.list(); return l.length < 10 || time < l[l.length - 1].time; },
  add(e) { save(BKEY, [...this.list(), e].sort((a, b) => a.time - b.time).slice(0, 10)); },
  reset: () => save(BKEY, []),
};

// Fantasma: il giro migliore di oggi su questa postazione (posizioni a 10 Hz).
const GKEY = 'gpf_ghost_v2';
const today = () => new Date().toDateString();
export const ghost = {
  load() { const g = load(GKEY, null); return g?.day === today() ? g : null; },
  offer(g) { const cur = this.load(); if (!cur || g.time < cur.time) save(GKEY, { ...g, day: today() }); },
};

const BAD = ['CAZ', 'CUL', 'FIG', 'MER', 'PUT', 'TRO', 'STR', 'VAF', 'FAN', 'PEN', 'SEX', 'DIO', 'ANO', 'NEG', 'GAY', 'FAG', 'ASS', 'WTF'];
export const cleanName = n => (BAD.includes(n) ? '???' : n);

const VNAME = { muletto: 'MULETTO', tugger: 'TUGGER' };
const CNAME = { bianco: 'BIANCO', blu: 'BLU', rosso: 'ROSSO' };
const css = c => '#' + CONFIG.colors[c].toString(16).padStart(6, '0');
const dot = c => `<span class="dot" style="background:${css(c)}"></span>`;
export const fmtTime = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

const html = (el, s) => { if (el && el._h !== s) { el._h = s; el.innerHTML = s; } }; // tocca il DOM solo se cambia
const viewsEl = $('#views'), centerEl = $('#center');
export const center = s => html(centerEl, s);

export function setViews(n) {
  viewsEl.className = n === 2 ? 'split' : '';
  viewsEl.innerHTML = Array.from({ length: n }, (_, i) =>
    `<div class="view" style="left:${i * 100 / n}%;width:${100 / n}%"><div class="speed"></div><div class="pos"></div><div class="lap"></div><div class="zone"></div><div class="wrong" hidden>↻ GIRA!</div><div class="msg"></div><div class="panel"></div><div class="charge"><i></i></div></div>`).join('');
}

const CHARGE_COLORS = ['#ffffff', '#4fc3ff', '#ff9a1f', '#c04dff'];
export function hud(i, { pos, lap, zone, wrong, msg, boost, charge }) {
  const v = viewsEl.children[i];
  if (!v) return;
  const [speedEl, posEl, lapEl, zoneEl, wrongEl, msgEl, , chargeEl] = v.children;
  speedEl.classList.toggle('on', !!boost);
  chargeEl.classList.toggle('on', !!charge);
  if (charge) { chargeEl.firstChild.style.width = `${charge.frac * 100}%`; chargeEl.firstChild.style.background = CHARGE_COLORS[charge.lvl]; }
  html(posEl, `${pos}°`);
  posEl.className = `pos p${pos}`;
  html(lapEl, lap);
  html(zoneEl, zone ? `Stai entrando in:<br><b>${zone}</b>` : '');
  wrongEl.hidden = !wrong;
  html(msgEl, msg);
}
const panel = (i, s) => html(viewsEl.children[i]?.querySelector('.panel'), s);

const table = (list, hl = []) => `<table class="board">${list.map((e, i) =>
  `<tr class="${hl.includes(e.at) ? 'hl' : ''}"><td>${i + 1}°</td><td>${e.name}</td><td>${dot(e.color)}${VNAME[e.vehicle]}</td><td>${fmtTime(e.time)}</td></tr>`).join('')}</table>`;

export const lights = (lit, go = false) =>
  `<div class="lights ${go ? 'go' : ''}">${[0, 1, 2].map(i => `<i class="${go || i < lit ? 'on' : ''}"></i>`).join('')}</div>`;

export function showAttract(top) {
  center(`<div class="title">GRAN PREMIO<br>${CONFIG.company}</div><div class="blink">PREMI START</div>${top.length ? table(top) : ''}`);
}

export function showSelect(ps, left) {
  ps.forEach((p, i) => panel(i, `<div class="card"><div class="who g${i + 1}">GIOCATORE ${i + 1}</div><div class="choice">◀ ${VNAME[p.vehicle]} ▶</div><div>${dot(p.color)}${CNAME[p.color]}</div><div class="hint">${p.confirmed ? 'PRONTO!' : 'A = CONFERMA'}</div></div>`));
  center(`<div class="top">SCEGLI IL VEICOLO · ${left}</div>${ps.length < 2 ? '<div class="join blink">2° GIOCATORE? PREMI START</div>' : ''}`);
}

export function showPodium(rows) {
  center(`<div class="podium">${rows.map((r, i) =>
    `<div class="row ${r.human ? 'me' : ''}"><b>${i + 1}°</b> ${r.name} ${dot(r.color)} <span>${r.time != null ? fmtTime(r.time) : ''}</span></div>`).join('')}<div class="cheer">GRANDE GARA!</div></div>`);
}

export function showInitials(list, left) {
  list.forEach((it, i) => panel(i, it
    ? `<div class="card"><div class="who">NUOVO RECORD!</div><div class="letters">${it.letters.map((n, j) => `<span class="${j === it.idx && !it.done ? 'cur' : ''}">${String.fromCharCode(65 + n)}</span>`).join('')}</div><div class="hint">${it.done ? 'FATTO!' : '▲▼ LETTERA · ▶ AVANTI'}</div></div>`
    : '<div class="card"><div class="who">BRAVO!</div></div>'));
  center(`<div class="top">SCRIVI LE TUE INIZIALI · ${left}</div>`);
}

export function showBoard(list, hl) {
  center(`<div class="title small">CLASSIFICA</div>${list.length ? table(list, hl) : '<div>Nessun record</div>'}`);
}

export const showFps = (on) => { $('#fps').hidden = !on; };
export const fps = (n) => { $('#fps').textContent = `${n} fps`; };

// Menu operatore: Ctrl+Shift+O (tastiera nascosta sotto il tavolo)
export function initOperator({ onChange, onAttract }) {
  const f = $('#op');
  const fill = () => {
    f.laps.value = settings.laps; f.music.value = settings.music; f.sfx.value = settings.sfx;
    f.maxRes.value = settings.maxRes; f.fps.checked = settings.fps; f.voice.checked = settings.voice; f.fancy.checked = settings.fancy;
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyO') { e.preventDefault(); f.hidden = !f.hidden; fill(); }
  });
  f.addEventListener('input', () => {
    settings.laps = clamp(Math.round(+f.laps.value) || CONFIG.laps, 1, 5);
    settings.music = +f.music.value;
    settings.sfx = +f.sfx.value;
    settings.maxRes = +f.maxRes.value;
    settings.fps = f.fps.checked;
    settings.voice = f.voice.checked;
    settings.fancy = f.fancy.checked;
    saveSettings(); onChange();
  });
  f.addEventListener('submit', e => e.preventDefault());
  f.resetBoard.onclick = () => { if (confirm('Azzerare la classifica?')) board.reset(); };
  f.toAttract.onclick = onAttract;
  f.closeOp.onclick = () => { f.hidden = true; };
}
