// Testi in italiano, inglese e ungherese. La lingua si sceglie dal menu operatore (Ctrl+Shift+O) e ricarica la pagina,
// così anche i cartelli 3D della pista vengono ridisegnati. Anche le frasi del telecronista sono per lingua: public/audio/voice/<lang>/.
export const LANGS = { it: 'Italiano', en: 'English', hu: 'Magyar' };

const T = {
  it: {
    assemblaggio: 'ASSEMBLAGGIO', stampaggio: 'STAMPAGGIO', verniciatura: 'VERNICIATURA',
    startFinish: 'PARTENZA · ARRIVO', familyDay: 'FAMILY DAY',
    cpuNames: ['CAPOTURNO', 'MAGAZZINIERE', 'MANUTENTORE', 'COLLAUDATORE', 'CARRELLISTA', 'SALDATORE'],
    muletto: 'Muletto', tugger: 'Tugger',
    enterName: 'Come ti chiami?', nameConfirm: 'VIA',
    nameHelp: 'Pad: ▲ ▼ ◀ ▶ scegli, A scrive, B cancella, START conferma',
    nameKeyboard: 'Tastiera: scrivi il nome e premi Invio · Esc torna alla scelta · Vuoto = nome automatico',
    itemTurbo: 'Turbo!', itemShield: 'Scudo',
    turnAround: 'Gira!', lap: 'Giro', entering: 'Stai entrando in', lastLap: 'Ultimo giro!', lapN: n => `Giro ${n}`, finished: 'Arrivato!',
    boardTitle: 'Tabellone di oggi', boardEmpty: 'Ancora nessun tempo: il primo record può essere il tuo.',
    steer: 'sterza', brake: 'frena', drift: 'drift', respawn: 'torna in pista', pause: 'pausa',
    stick: 'Levetta', rShift: 'Shift destro', lShift: 'Shift sinistro', end: 'Fine', enter: 'Invio', space: 'Spazio',
    devGp: 'Controller', devKb1: 'Tastiera, frecce', devKb2: 'Tastiera, WASD',
    resume: 'Riprendi', restart: 'Ricomincia la gara', quit: 'Esci al menu', pauseTitle: 'Pausa',
    pauseWho: (n, k) => `Sceglie il giocatore ${n} con ▲ ▼ e ${k}`, player: n => `Giocatore ${n}`,
    grandPrix: 'Gran Premio', pressStart: 'Premi START per giocare', chipPad: 'Controller: START', chipKb: 'Tastiera: Invio o Spazio',
    chipTwo: 'In due? Il secondo entra nella scelta del veicolo',
    ready: 'Pronto, si aspetta l’altro giocatore', change: k => `◀ ▶ cambia, ${k} conferma`, readyStamp: 'Pronto!',
    pickVehicle: 'Scegli il veicolo', p2join: 'Giocatore 2? Premi START, Invio o Spazio', greatRace: 'Grande gara!', leaderboard: 'Classifica',
    recon: 'Giro di ricognizione', dept: 'Reparto', ghost: 'Sfida il fantasma del record di oggi!', skip: 'A per saltare',
    padOff: 'Controller scollegato', padOffHelp: n => `Ricollega il controller del giocatore ${n}`, replay: 'Replay',
    opTitle: 'Menu operatore', opLang: 'Lingua', opLaps: 'Giri (classifica solo con 3)', opMusic: 'Musica', opSfx: 'Effetti',
    opRes: 'Risoluzione max', opFps: 'Mostra FPS', opVoice: 'Telecronista', opFancy: 'Fasci di luce (spegnere se scatta)',
    opAttract: 'Torna al titolo', opReset: 'Azzera classifica', opClose: 'Chiudi (Ctrl+Shift+O)', opResetAsk: 'Azzerare la classifica?',
  },
  en: {
    assemblaggio: 'ASSEMBLY', stampaggio: 'MOULDING', verniciatura: 'PAINT SHOP',
    startFinish: 'START · FINISH', familyDay: 'FAMILY DAY',
    cpuNames: ['SHIFT LEAD', 'STOREKEEPER', 'MECHANIC', 'TESTER', 'DRIVER', 'WELDER'],
    muletto: 'Forklift', tugger: 'Tugger',
    enterName: 'What is your name?', nameConfirm: 'GO',
    nameHelp: 'Pad: ▲ ▼ ◀ ▶ choose, A types, B deletes, START confirms',
    nameKeyboard: 'Keyboard: type your name and press Enter · Esc goes back · Leave blank for an automatic name',
    itemTurbo: 'Turbo!', itemShield: 'Shield',
    turnAround: 'Turn around!', lap: 'Lap', entering: 'Now entering', lastLap: 'Final lap!', lapN: n => `Lap ${n}`, finished: 'Finished!',
    boardTitle: 'Today’s leaderboard', boardEmpty: 'No times yet: the first record could be yours.',
    steer: 'steer', brake: 'brake', drift: 'drift', respawn: 'back on track', pause: 'pause',
    stick: 'Stick', rShift: 'Right Shift', lShift: 'Left Shift', end: 'End', enter: 'Enter', space: 'Space',
    devGp: 'Controller', devKb1: 'Keyboard, arrows', devKb2: 'Keyboard, WASD',
    resume: 'Resume', restart: 'Restart race', quit: 'Back to menu', pauseTitle: 'Paused',
    pauseWho: (n, k) => `Player ${n} chooses with ▲ ▼ and ${k}`, player: n => `Player ${n}`,
    grandPrix: 'Grand Prix', pressStart: 'Press START to play', chipPad: 'Controller: START', chipKb: 'Keyboard: Enter or Space',
    chipTwo: 'Two players? The second joins on the vehicle screen',
    ready: 'Ready, waiting for the other player', change: k => `◀ ▶ change, ${k} confirm`, readyStamp: 'Ready!',
    pickVehicle: 'Choose your vehicle', p2join: 'Player 2? Press START, Enter or Space', greatRace: 'Great race!', leaderboard: 'Leaderboard',
    recon: 'Track preview', dept: 'Department', ghost: 'Beat the ghost of today’s record!', skip: 'A to skip',
    padOff: 'Controller disconnected', padOffHelp: n => `Reconnect player ${n}’s controller`, replay: 'Replay',
    opTitle: 'Operator menu', opLang: 'Language', opLaps: 'Laps (leaderboard only with 3)', opMusic: 'Music', opSfx: 'Effects',
    opRes: 'Max resolution', opFps: 'Show FPS', opVoice: 'Commentator', opFancy: 'Light beams (turn off if it stutters)',
    opAttract: 'Back to title', opReset: 'Reset leaderboard', opClose: 'Close (Ctrl+Shift+O)', opResetAsk: 'Reset the leaderboard?',
  },
  hu: {
    assemblaggio: 'ÖSSZESZERELÉS', stampaggio: 'FRÖCCSÖNTÉS', verniciatura: 'FESTÉS',
    startFinish: 'RAJT · CÉL', familyDay: 'CSALÁDI NAP',
    cpuNames: ['MŰSZAKVEZETŐ', 'RAKTÁROS', 'KARBANTARTÓ', 'TESZTELŐ', 'TARGONCÁS', 'HEGESZTŐ'],
    muletto: 'Targonca', tugger: 'Vontató',
    enterName: 'Mi a neved?', nameConfirm: 'RAJT',
    nameHelp: 'Kontroller: ▲ ▼ ◀ ▶ választás, A beírás, B törlés, START megerősítés',
    nameKeyboard: 'Billentyűzet: írd be a neved, majd Enter · Esc: vissza · Üresen: automatikus név',
    itemTurbo: 'Turbó!', itemShield: 'Pajzs',
    turnAround: 'Fordulj meg!', lap: 'Kör', entering: 'Következik', lastLap: 'Utolsó kör!', lapN: n => `${n}. kör`, finished: 'Célba értél!',
    boardTitle: 'A mai ranglista', boardEmpty: 'Még nincs idő: az első rekord a tiéd lehet.',
    steer: 'kormányzás', brake: 'fék', drift: 'drift', respawn: 'vissza a pályára', pause: 'szünet',
    stick: 'Kar', rShift: 'Jobb Shift', lShift: 'Bal Shift', end: 'End', enter: 'Enter', space: 'Szóköz',
    devGp: 'Kontroller', devKb1: 'Billentyűzet, nyilak', devKb2: 'Billentyűzet, WASD',
    resume: 'Folytatás', restart: 'Verseny újraindítása', quit: 'Vissza a menübe', pauseTitle: 'Szünet',
    pauseWho: (n, k) => `${n === 1 ? 'Az' : 'A'} ${n}. játékos választ: ▲ ▼ és ${k}`, player: n => `${n}. játékos`,
    grandPrix: 'Nagydíj', pressStart: 'Nyomd meg a START gombot', chipPad: 'Kontroller: START', chipKb: 'Billentyűzet: Enter vagy Szóköz',
    chipTwo: 'Ketten vagytok? A második a járműválasztásnál csatlakozik',
    ready: 'Kész, várunk a másik játékosra', change: k => `◀ ▶ váltás, ${k} megerősítés`, readyStamp: 'Kész!',
    pickVehicle: 'Válassz járművet', p2join: '2. játékos? Nyomd meg: START, Enter vagy Szóköz', greatRace: 'Remek verseny!', leaderboard: 'Ranglista',
    recon: 'Pályabemutató', dept: 'Részleg', ghost: 'Győzd le a mai rekord szellemét!', skip: 'A: átugrás',
    padOff: 'A kontroller nincs csatlakoztatva', padOffHelp: n => `Csatlakoztasd újra ${n === 1 ? 'az' : 'a'} ${n}. játékos kontrollerét`, replay: 'Visszajátszás',
    opTitle: 'Operátor menü', opLang: 'Nyelv', opLaps: 'Körök (ranglista csak 3 körrel)', opMusic: 'Zene', opSfx: 'Effektek',
    opRes: 'Max. felbontás', opFps: 'FPS mutatása', opVoice: 'Kommentátor', opFancy: 'Fénynyalábok (kapcsold ki, ha akad)',
    opAttract: 'Vissza a címképernyőre', opReset: 'Ranglista törlése', opClose: 'Bezárás (Ctrl+Shift+O)', opResetAsk: 'Törlöd a ranglistát?',
  },
};

// Letta direttamente da localStorage (stessa chiave delle impostazioni in ui.js) per evitare import circolari.
let saved;
try { saved = JSON.parse(localStorage.getItem('gpf_settings_v1'))?.lang; } catch { /* storage bloccato: italiano */ }
export const lang = T[saved] ? saved : 'it';
document.documentElement.lang = lang;

export const t = (key, ...a) => { const v = T[lang][key] ?? T.it[key]; return typeof v === 'function' ? v(...a) : v; };

// sanity check rapido in console: tutte le lingue hanno tutte le chiavi
if (import.meta.env?.DEV) for (const l in T) for (const k in T.it) if (!(k in T[l])) console.warn(`i18n: manca ${l}.${k}`);
