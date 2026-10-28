# HANDOFF — Gran Premio Minebea

Documento per riprendere il lavoro da un altro PC (o da un'altra persona / sessione AI) senza perdere contesto.
Ultimo aggiornamento: 2026-10-28.

---

## 1. Cos'è

Racing game 3D arcade stile Mario Kart, in **three.js**, per il **family day** dello stabilimento **Minebea di Pianezza** (produzione di maniglie per auto).
Si gioca su **2-3 postazioni fisse** (portatili aziendali, eventualmente collegati a una TV), bambini **6-12 anni**, **1-2 giocatori** in split-screen verticale + CPU, **4 kart** in pista, partite di **~2-3 minuti**, **totalmente offline**.

- Specifica completa e decisioni di design: [SPEC.md](SPEC.md) (scritta dopo un'intervista dettagliata, poi aggiornata ad ogni iterazione).
- Crediti di musica e voce: [CREDITS.txt](CREDITS.txt).

## 2. Avvio rapido

Requisiti: **Node.js ≥ 20** (sviluppato con Node 24), un browser Chromium (Chrome/Vivaldi/Edge).

```bash
npm install
npm run dev          # http://localhost:5173 — ricarica automatica alle modifiche
npm run build        # crea dist/
npm run preview      # serve dist/ su http://localhost:8080 (quello che usano le postazioni)
```

Postazione all'evento: `npm run build` una volta, poi doppio clic su [avvia.bat](avvia.bat) (server + Vivaldi in kiosk con autoplay audio).

### Comandi

| | Gamepad (mapping standard, testato col design per 8BitDo Ultimate 2C cablato) | Tastiera G1 | Tastiera G2 |
|---|---|---|---|
| Sterzo | levetta sx / croce | frecce | WASD |
| Conferma / START | A / START | Invio | Spazio |
| Freno / indietro | B | Backspace / giù | Q / S |
| Drift (+ mini-turbo al rilascio) | LB, RB, LT, RT | Shift destro | Shift sinistro |
| Rimettimi in pista | Y | Fine | E |
| Pausa (menu: riprendi / ricomincia / esci) | START | Esc | Tab |

La legenda dei comandi compare nella selezione veicolo (per il dispositivo di ciascun giocatore) e nel menu di pausa. Il menu di pausa lo comanda chi l'ha aperto (▲▼ + A, B/pausa per riprendere); alla ripresa c'è un conto alla rovescia di 3 s.

**Menu operatore**: `Ctrl+Shift+O` (giri, volumi, risoluzione max, FPS, telecronista, fasci di luce, azzera classifica, torna al titolo).

## 3. Stato attuale (cosa funziona)

Verificato nel browser durante lo sviluppo (screenshot + controlli numerici), salvo dove indicato:

- Flusso completo: **attract** (CPU in giro, camera cinematografica) → **selezione** (1-2 giocatori, muletto/tugger × bianco/blu/rosso, pedana rotante) → **volo d'intro** sulla pista → **semaforo** → **gara** → **replay TV** → **podio** con coriandoli → **iniziali arcade** (se top 10) → **classifica** → attract.
- Pista dal **disegno della planimetria** (assemblaggio a sinistra, stampaggio in alto a destra, verniciatura in basso a destra), con chicane, curva a S, **soppalco a 5 m** con salita/discesa, **2 rampe da salto**, bancali e coni in pista, **2 incroci AGV**, turbo pad, **maniglia d'auto gigante** come arco/monumento.
- Fisica arcade su spline (niente motore fisico): sterzo assistito, muri che rimbalzano, **drift con 3 livelli di mini-turbo**, collisioni morbide tra kart, **fisica verticale** (voli e atterraggi), auto-respawn + tasto Y.
- CPU imperfette (errori di traiettoria, velocità diverse), rubber banding, aiuto per l'umano dietro l'altro umano.
- Effetti: particelle (turbo, drift, scintille, polvere, coriandoli, fuochi), segni di frenata, fiamma turbo con shader, linee di velocità, scossa camera, arrivo al rallentatore con camera orbitante.
- Capannone: **tetto a shed** con vetrate, capriate, lampade industriali con pozze di luce, fasci di luce, robot di saldatura con scintille, carroponte, **~110 persone animate** (tribuna alla partenza, operatori ai macchinari, pedoni).
- Audio: **musica CC0** (menu / gara / ultimo giro con dissolvenza), effetti sintetizzati, **telecronista** con 30 frasi generate in locale (Kokoro, voce femminile `if_sara`), vibrazione gamepad.
- Fantasma del record di oggi (1 giocatore), minimappa (1 giocatore), classifica top 10 per postazione in `localStorage`.

**Mai verificato su hardware reale** (vedi §9): prestazioni sui portatili aziendali con grafica integrata, gamepad fisico (mapping, vibrazione, pausa su scollegamento), ascolto di voce/musica/mix.

## 4. Architettura

JavaScript puro + three.js, bundler Vite. Nessun framework UI: HUD e menu sono DOM sopra il canvas. Nessun asset 3D esterno: **tutti i modelli sono procedurali**.

```
index.html          canvas + overlay DOM (HUD, menu operatore) + tutto il CSS
src/main.js         loop, macchina a stati, camere, split-screen, replay, minimappa, effetti per kart
src/config.js       TUTTI i numeri da tarare (guida, drift, CPU, rubber banding, tempi, colori)
src/track.json      pista: punti, quote, rampe, reparti, zone, turbo, ostacoli, incroci AGV, monumento
src/track.js        costruisce la pista e il capannone da track.json; espone sample/point/height/zoneAt/...
src/kart.js         classe Kart (fisica in spazio pista), collisioni kart-kart e kart-ostacoli, fiamma turbo
src/models.js       modelli procedurali (muletto, tugger, vagoni, AGV, pilota) fusi in 2 mesh per veicolo
src/people.js       persone animate (InstancedMesh, 5 draw call totali)
src/ai.js           input delle CPU (linea, errori, schivata ostacoli)
src/effects.js      particelle (1 draw call) e segni di frenata (InstancedMesh)
src/input.js        gamepad + 2 tastiere virtuali, fronti di pressione, vibrazione
src/audio.js        effetti sintetizzati (Web Audio), musica da file, voce da file
src/ui.js           HUD, schermate, classifica, fantasma, impostazioni, menu operatore
public/audio/       music/*.ogg (CC0), voice/*.wav (generati)
tools/voce/         genera.py: rigenera le frasi del telecronista con Kokoro
avvia.bat           launcher postazione
```

### Macchina a stati (`main.js`)

`attract → select → intro → countdown → race (→ pausa se un pad si scollega) → replay → podium → initials (solo se record) → board → attract`.
Ogni stato ha `enterX()` + `updateX(dt, devs)` registrata in `UPDATE`; `draw(dt)` sceglie le camere per stato. `modeT` = secondi nello stato corrente, `raceT` = tempo di gara (tempo di gioco, rallentato durante lo slow-mo).

### Il kart vive nello spazio della pista (concetto chiave)

Un kart **non** ha posizione libera: ha `prog` (metri percorsi, cresce oltre `L` ad ogni giro), `d` (offset laterale, **positivo = sinistra**), `h` (angolo rispetto alla tangente), `v`, e in verticale `y`, `vy`, `air`.
La posizione 3D si ricava con `track.sample(prog)` (punto + tangente + curvatura) e `track.height(prog)`.
Conseguenze: niente scorciatoie, niente kart ribaltati, giri contati da `prog`, collisioni in coordinate `(prog, d)`. La pista curva "sotto" il kart (`h -= curvatura * ds`), da cui la sensazione di dover sterzare.

### Rendering e prestazioni

- Render interno **max 1080p** (o 720p dal menu), upscaling del browser; `pixelRatio = 1`.
- Split-screen = **una scena, due camere**, `setViewport/setScissor` (sx = G1, dx = G2).
- Tutta la geometria statica (arredo, muri, colonne, capriate, ostacoli, piloni) è **fusa in una sola mesh** a vertex color; ogni veicolo = 2 mesh (opaca + luci); persone e segni di frenata = InstancedMesh; particelle = 1 `Points`.
- Niente ombre dinamiche (blob shadow), niente post-processing, materiali Lambert/Basic.
- Sul PC di sviluppo (RTX 4080 laptop) ~110-130 fps. **Sui portatili aziendali non ancora misurato.**

## 5. Dove si toccano le cose più comuni

| Voglio... | Dove |
|---|---|
| Cambiare difficoltà / sensazione di guida | `src/config.js` (`assist`, `steerRate`, `vMax`, `wallBounce`, `driftSteer`, `driftMaxAngle`, ...) |
| Rendere le CPU più/meno forti | `config.js`: `cpuSkill`, `cpuMistakeEvery`, `rubberK`, `rubberDist`, `rubberMin/Max`; logica in `ai.js` |
| Rifare la pista dalla planimetria vera | `src/track.json` → vedi §6 |
| Spostare turbo, ostacoli, AGV, rampe, quote | `src/track.json` |
| Cambiare frasi o voce del telecronista | `tools/voce/genera.py` → §7 |
| Cambiare musica | sostituire `public/audio/music/{menu,race,race_final}.ogg` |
| Aggiungere il logo aziendale | mettere `public/assets/logo.png` (compare sugli striscioni, nessun codice da cambiare) |
| Cambiare testi/HUD | `src/ui.js` + CSS in `index.html` |
| Modelli dei veicoli | `src/models.js` (classe `Parts`: box arrotondati, cilindri, sfere, `limb` per le braccia) |
| Arredo dei reparti | `src/track.js`: funzioni `shelf/press/cnc/bench/conveyor/booth/drums` e tabella `PROPS` |

## 6. Formato di `track.json`

Coordinate in **pixel del disegno** (x a destra, y in basso), convertite in metri con `scale` (0,45 m/px). Il **primo punto è la linea di partenza**, il verso di marcia segue l'ordine dei punti. Ovunque compaia `at: [x, y]` il valore viene agganciato al punto di pista più vicino.

```jsonc
{
  "scale": 0.45,
  "points": [[188, 450], ...],                       // spline chiusa Catmull-Rom (centripetal)
  "zones":  [{ "name": "ASSEMBLAGGIO", "kind": "assemblaggio", "at": [188, 450] }], // banner HUD + portali
  "areas":  [{ "name": "...", "kind": "...", "color": "#8a0a1e", "rect": [x0, y0, x1, y1] }], // reparti: pavimento, arredo, cartello
  "pads":   [{ "at": [196, 260], "d": 0 }],          // turbo; d = offset laterale in metri (+ = sinistra)
  "heights":[{ "at": [240, 66], "y": 5 }],           // quote in metri, raccordate a coseno
  "jumps":  [{ "at": [202, 175], "len": 6, "h": 1.6 }], // rampa: sale per len m fino a h, poi stacco netto
  "obstacles": [{ "type": "pallet", "at": [...], "d": -1.8 }, { "type": "cones", "at": [...], "d": 3, "len": 14 }],
  "crossings": [{ "at": [199, 230], "period": 8 }],  // AGV che attraversa la pista
  "landmark": { "at": [204, 147] }                   // maniglia gigante
}
```

Suggerimento: per controllare la pista dall'alto in sviluppo, in console c'è `window.__dbg` (`THREE`, `scene`, `renderer`, `track`, `karts`) solo con `npm run dev`.
Larghezza strada 9 m: tratti di pista paralleli devono distare almeno ~15 m (centro-centro), altrimenti i bordi si sovrappongono.

## 7. Audio

- **Effetti**: sintetizzati in `audio.js` (`play(name)`), nessun file.
- **Musica**: `public/audio/music/` — *Pure Raceway* (gara), *Pure Raceway climax* (ultimo giro), *Sunny City* (menu), tutti **CC0** di MintoDog/OpenGameArt. `audio.setMusic(name)` fa la dissolvenza.
- **Telecronista**: 30 WAV in `public/audio/voice/<chiave>.wav`, chiavi elencate in `audio.js` (`VOICE`) e in `genera.py` (`FRASI`). `audio.say(chiave, importante)`; le frasi non importanti vengono scartate se sta già parlando.
- Rigenerare le voci (serve Python; il venv non è nel repo):

```bash
uv venv --python 3.12 tools/voce/.venv
VIRTUAL_ENV=tools/voce/.venv uv pip install kokoro soundfile
tools/voce/.venv/Scripts/python tools/voce/genera.py if_sara    # oppure im_nicola (maschile)
```

Kokoro **non** si installa con Python 3.13 (dipendenze): usare 3.12. Gira bene anche su CPU; al primo avvio scarica il modello (~330 MB) da Hugging Face.
Aggiungendo una frase: aggiungerla a `FRASI` in `genera.py` **e** a `VOICE` in `audio.js`, poi chiamarla con `voice('chiave')` in `main.js`.

## 8. Postazioni all'evento

- `avvia.bat` avvia `npm run preview` (porta 8080) e Vivaldi in `--kiosk --autoplay-policy=no-user-gesture-required`.
- **Attualmente usa il profilo personale di Vivaldi** (scelta per i test a casa): chiudere Vivaldi prima di lanciarlo. **Per i PC aziendali** tornare a un profilo dedicato aggiungendo `--user-data-dir=C:\gpf-profile` e completare una volta la configurazione iniziale di Vivaldi in quel profilo (Vivaldi mostra la sua procedura di benvenuto anche con `--no-first-run`).
- La classifica è in `localStorage` del profilo del browser: una per postazione. Azzerare la mattina dell'evento dal menu operatore.
- Checklist portatile completa in SPEC.md §12 (sospensione, Windows Update, notifiche, uscita audio, ecc.).

## 9. Cose da fare / rischi aperti (in ordine di priorità)

1. **Test sui portatili aziendali** (grafica integrata, eventualmente TV 4K). Se scatta: menu operatore → 720p e togliere "fasci di luce"; poi valutare di ridurre persone/arredo, `antialias: false` in `main.js`, meno lampade.
2. **Test col gamepad vero** (8BitDo Ultimate 2C cablato, modalità XInput): mapping, drift sui dorsali, vibrazione, pausa/ripresa staccando il cavo, ingresso G2 dalla selezione.
3. **Playtest con bambini** 6 e 12 anni: tarare `assist`, `rubberDist/rubberMin`, `cpuSkill`, frequenza errori CPU, durata gara (oggi un giro "pulito" delle CPU ≈ 40 s; un umano che non tocca nulla impiega molto di più a causa di ostacoli e AGV).
4. **Planimetria reale**: sostituire `points` / `areas` / zone in `track.json` (oggi deriva da uno schizzo), mantenendo i tratti paralleli ad almeno ~15 m.
5. **Ascoltare il mix audio**: volume musica vs voce vs effetti, eventualmente ridurre le frasi del telecronista se ripetitive.
6. **Logo** Minebea in `public/assets/logo.png`.
7. Profilo browser dedicato sui PC aziendali (§8).
8. Facoltativi già discussi ma non fatti: modelli Blender di macchinari iconici, modalità notte, scatole oggetto (power-up), banking delle curve.

### Problemi noti / stranezze

- Il fantasma è salvato con la chiave `gpf_ghost_v2` (il formato include la quota); cambiando il formato dei frame aumentare la versione.
- Nessun test automatico: la verifica è stata fatta a mano nel browser (screenshot + misure via `window.__dbg`). Se si aggiunge logica delicata (fisica, giri, classifica) conviene un piccolo test eseguibile.
- `vite build` avvisa che il bundle supera 500 kB (è three.js): irrilevante in locale.
- In sviluppo, se il kart umano non viene comandato, va lento e sbatte (ostacoli/AGV): è normale, non un bug.

## 10. Storia delle decisioni (perché è così)

- **Fisica a spline invece di un motore fisico**: prevedibile, leggera, nessun kart ribaltato o incastrato; adatta ai bambini e a un mese di sviluppo.
- **Feedback del primo playtest** (giocatore esperto di Mario Kart, arrivato ultimo, "guida a saponetta"): camera con ritardo di rotazione, muri che rimbalzano, assistenza ridotta, drift + mini-turbo, CPU con errori e velocità diverse.
- **Drift rifatto** perché girava troppo e portava contro il muro: arco ampio regolabile con la levetta, ingresso graduale, angolo massimo ~30° rispetto alla pista.
- **Pista più impegnativa** su richiesta, anche se devia dal reale: chicane, S, ostacoli, AGV, poi soppalco e salti per la tridimensionalità.
- **Maniglia gigante** al posto di un cuscinetto: Pianezza produce maniglie per auto.
- **Voce**: la sintesi di Windows era giudicata pessima → frasi pre-generate con Kokoro (Apache 2.0) in locale; scelta la voce femminile.
- **Musica**: brani CC0 per evitare qualsiasi problema di licenza.
- **Offline e dati locali**: Wi-Fi inaffidabile ai family day; classifica per postazione.

## 11. Per una sessione AI che riprende il lavoro

- Leggere prima SPEC.md (requisiti e decisioni) e questo file; poi `config.js` e `track.json`.
- Mantenere lo stile esistente: JS puro, commenti in italiano, codice compatto, niente nuove dipendenze se evitabili, `// ponytail:` per segnare le semplificazioni volute.
- Verificare ogni modifica visiva in browser (`npm run dev`); per controlli numerici usare `window.__dbg`.
- Attenzione alle prestazioni: ogni nuova mesh separata è una draw call ×2 in split-screen; preferire geometrie fuse o InstancedMesh.
