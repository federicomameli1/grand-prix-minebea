import { CONFIG, clamp } from './config.js';
import { t, lang, LANGS } from './i18n.js';

const $ = s => document.querySelector(s);
const SKEY = 'gpf_settings_v1', BKEY = 'gpf_leaderboard_v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage pieno/bloccato: il gioco continua */ } };

export const settings = { lang, laps: CONFIG.laps, music: 0.5, sfx: 0.8, maxRes: 1080, fps: false, voice: true, fancy: true, ...load(SKEY, {}) };
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

const BAD = ['CAZ', 'CUL', 'FIG', 'MER', 'PUT', 'TRO', 'STR', 'VAF', 'FAN', 'PEN', 'SEX', 'DIO', 'ANO', 'NEG', 'GAY', 'FAG', 'ASS', 'WTF', 'FAS', 'FOS', 'KUR', 'GEC', 'BAZ', 'SEG', 'PIC'];
export const cleanName = n => (BAD.includes(n) ? '???' : n);

const VNAME = { muletto: t('muletto'), tugger: t('tugger') };
const css = c => '#' + CONFIG.colors[c].toString(16).padStart(6, '0');
const vdot = e => `<span class="vdot"><i style="background:${css(e.color)}"></i>${VNAME[e.vehicle]}</span>`;
export const fmtTime = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

const html = (el, s) => { if (el && el._h !== s) { el._h = s; el.innerHTML = s; } }; // tocca il DOM solo se cambia
const viewsEl = $('#views'), centerEl = $('#center');
export const center = s => html(centerEl, s);

export function setViews(n) {
  viewsEl.className = n === 2 ? 'split' : '';
  viewsEl.innerHTML = Array.from({ length: n }, (_, i) =>
    `<div class="view" style="left:${i * 100 / n}%;width:${100 / n}%"><div class="speed"></div><div class="pos"></div><div class="lap"></div><div class="zone"></div>`
    + `<div class="wrong" hidden><div class="noentry"></div><span>${t('turnAround')}</span></div><div class="msg"></div><div class="panel"></div>`
    + '<div class="charge"><i><b></b></i><i><b></b></i><i><b></b></i></div></div>').join('');
}

// HUD di gara: lap = [giro, giri], charge = { frac 0..1, lvl } durante il drift
export function hud(i, { pos, lap, zone, wrong, msg, boost, charge }) {
  const v = viewsEl.children[i];
  if (!v) return;
  const [speedEl, posEl, lapEl, zoneEl, wrongEl, msgEl, , chargeEl] = v.children;
  speedEl.classList.toggle('on', !!boost);
  chargeEl.classList.toggle('on', !!charge);
  if (charge) [...chargeEl.children].forEach((seg, j) => { seg.firstChild.style.width = `${clamp(charge.frac * 3 - j, 0, 1) * 100}%`; });
  html(posEl, `<span>${pos}<sup>°</sup></span>`);
  posEl.className = `pos p${pos}`;
  html(lapEl, lap ? `<div class="tag"><small>${t('lap')}</small><b>${lap[0]}<i>/${lap[1]}</i></b></div>` : '');
  html(zoneEl, zone ? `<div class="sign"><small>${t('entering')}</small><b>${zone}</b></div>` : '');
  wrongEl.hidden = !wrong;
  html(msgEl, msg ? `<div class="banner"><span>${msg}</span></div>` : '');
}
const panel = (i, s) => html(viewsEl.children[i]?.querySelector('.panel'), s);

const table = (list, hl = []) => `<div class="board"><h3>${t('boardTitle')}</h3>${list.length
  ? `<ol>${list.map((e, i) => `<li class="${hl.includes(e.at) ? 'hl' : ''}"><span class="rank r${i + 1}">${i + 1}</span><span class="name">${e.name}</span>${vdot(e)}<span class="time">${fmtTime(e.time)}</span></li>`).join('')}</ol>`
  : `<div class="empty">${t('boardEmpty')}</div>`}</div>`;

// partenza: torre andon (rosso, arancio, giallo... verde = via)
export const lights = (lit, go = false) =>
  `<div class="andon ${go ? 'go' : ''}"><div class="stack">${[0, 1, 2, 3].map(i => `<i class="${(go ? i === 3 : i < lit) ? 'on' : ''}"></i>`).join('')}</div><div class="pole"></div><div class="base"></div></div>`;

// Legenda comandi per tipo di dispositivo (gp* = controller, kb1 = frecce, kb2 = WASD)
const LEGEND = {
  gp: [[t('stick'), t('steer')], ['B', t('brake')], ['LB / RB', t('drift')], ['Y', t('respawn')], ['START', t('pause')]],
  kb1: [['← →', t('steer')], ['↓', t('brake')], [t('rShift'), t('drift')], [t('end'), t('respawn')], ['Esc', t('pause')]],
  kb2: [['A  D', t('steer')], ['S', t('brake')], [t('lShift'), t('drift')], ['E', t('respawn')], ['Tab', t('pause')]],
};
const DEVICE = { gp: t('devGp'), kb1: t('devKb1'), kb2: t('devKb2') };
const CONFIRM = { gp: 'A', kb1: t('enter'), kb2: t('space') };
const devKind = dev => (dev.startsWith('gp') ? 'gp' : dev);
export const legend = dev => `<div class="legend"><div class="dev">${DEVICE[devKind(dev)]}</div><div class="keys">${LEGEND[devKind(dev)].map(([k, v]) => `<span class="key">${k}</span><span>${v}</span>`).join('')}</div></div>`;

export function showPause(players, who, sel) {
  const opts = [t('resume'), t('restart'), t('quit')];
  center(`<div class="scrim"></div><div class="pausemenu"><div class="stripe"></div><div class="inner"><h2>${t('pauseTitle')}</h2>
    <div class="whose">${t('pauseWho', who + 1, CONFIRM[devKind(players[who].dev)])}</div>
    <div class="opts">${opts.map((o, i) => `<div class="opt ${i === sel ? 'sel' : ''}">${o}</div>`).join('')}</div>
    <div class="legends">${players.map((p, i) => `<div class="g${i + 1}"><h5>${t('player', i + 1)}</h5>${legend(p.dev)}</div>`).join('')}</div></div></div>`);
}

export function showAttract(top) {
  center(`<div class="scrim"></div><div class="logo"><div class="gp">${t('grandPrix')}</div><div class="brand">${CONFIG.company}</div></div>
    <div class="press"><div class="button"></div>${t('pressStart')}</div>
    <div class="how"><span class="chip">${t('chipPad')}</span><span class="chip">${t('chipKb')}</span><span class="chip">${t('chipTwo')}</span></div>
    ${top.length ? table(top) : ''}`);
}

export function showSelect(ps) {
  ps.forEach((p, i) => panel(i, `<div class="pass g${i + 1}"><header>${t('player', i + 1)}</header><div class="body">
    <div class="picker"><span class="arrow">◀</span><span class="name">${VNAME[p.vehicle]}</span><span class="arrow">▶</span></div>
    <div class="swatches">${Object.keys(CONFIG.colors).map(c => `<i class="${c === p.color ? 'on' : ''}" style="background:${css(c)}"></i>`).join('')}</div>
    <div class="status">${p.confirmed ? t('ready') : t('change', CONFIRM[devKind(p.dev)])}</div>
    ${legend(p.dev)}</div>${p.confirmed ? `<div class="stamp">${t('readyStamp')}</div>` : ''}</div>`));
  center(`<div class="top-title">${t('pickVehicle')}</div>${ps.length < 2 ? `<div class="callout"><span>${t('p2join')}</span></div>` : ''}`);
}

export function showPodium(rows) {
  center(`<div class="podium">${rows.map((r, i) =>
    `<div class="row ${r.human ? 'me' : ''}"><span class="rank r${i + 1}">${i + 1}</span><span>${r.name}</span>${vdot(r)}<span class="time">${r.time != null ? fmtTime(r.time) : ''}</span></div>`).join('')}
    <div class="cheer"><div class="banner"><span>${t('greatRace')}</span></div></div></div>`);
}

export function showInitials(list, left) {
  list.forEach((it, i) => panel(i, it
    ? `<div class="initials"><h4>${t('newRecord')}</h4><div class="flaps">${it.letters.map((n, j) => `<div class="flap ${j === it.idx && !it.done ? 'cur' : ''}">${String.fromCharCode(65 + n)}</div>`).join('')}</div>
       <p>${it.done ? t('done') : t('initialsHelp')}</p></div>`
    : `<div class="initials"><h4>${t('niceRace')}</h4><p>${t('noRecord')}</p></div>`));
  center(`<div class="top-title">${t('leaderboard')} <span class="timer">${left}</span></div>`);
}

export function showBoard(list, hl) { center('<div class="scrim"></div>' + table(list, hl)); }

// schermate di servizio usate da main.js
export const showIntro = (zone, ghost) => center(`<div class="top-title">${t('recon')}</div><div class="sign" style="font-size:1.6vh"><small>${t('dept')}</small><b>${zone}</b></div>
  ${ghost ? `<div class="callout" style="top:auto;bottom:12vh"><span>${t('ghost')}</span></div>` : ''}<div class="bottom"><span class="chip">${t('skip')}</span></div>`);
export const showDisconnected = n => center(`<div class="alert"><b>${t('padOff')}</b><span>${t('padOffHelp', n)}</span></div>`);
export const showResume = n => center(`<div class="resume">${n}</div>`);
export const showReplay = () => center(`<div class="onair"><i></i>${t('replay')}</div><div class="bottom"><span class="chip">${t('skip')}</span></div>`);

export const showFps = (on) => { $('#fps').hidden = !on; };
export const fps = (n) => { $('#fps').textContent = `${n} fps`; };

// Menu operatore: Ctrl+Shift+O (tastiera nascosta sotto il tavolo)
export function initOperator({ onChange, onAttract }) {
  const f = $('#op');
  f.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.dataset.t); });
  f.lang.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const fill = () => {
    f.lang.value = settings.lang; f.laps.value = settings.laps; f.music.value = settings.music; f.sfx.value = settings.sfx;
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
    if (f.lang.value !== settings.lang) { settings.lang = f.lang.value; saveSettings(); return location.reload(); } // ridisegna anche i cartelli 3D
    saveSettings(); onChange();
  });
  f.addEventListener('submit', e => e.preventDefault());
  f.resetBoard.onclick = () => { if (confirm(t('opResetAsk'))) board.reset(); };
  f.toAttract.onclick = onAttract;
  f.closeOp.onclick = () => { f.hidden = true; };
}
