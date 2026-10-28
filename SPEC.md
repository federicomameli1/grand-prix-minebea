# SPEC — "Gran Premio della Fabbrica"

Racing game 3D arcade stile Mario Kart, in three.js, per le postazioni del family day aziendale.
Sviluppatore: 1 persona, < 1 mese. Tutto ciò che non è in questo documento è **fuori scope**.

---

## 1. Contesto e vincoli

| Vincolo | Decisione |
|---|---|
| Dove si gioca | 2-3 postazioni fisse allo stand, fila di bambini |
| Target | Bambini 6-12 anni |
| Hardware | Portatili aziendali, grafica integrata Intel, eventualmente collegati a TV (anche 4K) |
| Rete | **Totalmente offline**. Nessuna chiamata esterna, nessun CDN |
| Input | Gamepad (modello ancora da decidere) + tastiera solo per sviluppo/operatore |
| Giocatori | 1 o 2 umani in split-screen verticale + CPU, **4 kart totali** |
| Durata gara | 2-3 minuti, 3 giri (~45-55 s a giro) |
| Lingua | Solo italiano |
| HSE | Nessun vincolo: tono cartoon, nessun messaggio sicurezza |

## 2. Loop di gioco

```
ATTRACT ──START──> SELEZIONE ──> COUNTDOWN ──> GARA ──> PODIO ──> [INIZIALI] ──> CLASSIFICA ──> ATTRACT
   ^                                                                                              |
   └──────────────────────────── inattività 30 s su menu/classifica ──────────────────────────────┘
```

1. **Attract mode**: 4 CPU girano in pista, camera cinematica che passa tra i reparti, overlay "PREMI START" lampeggiante + top 5 classifica a rotazione.
2. **Selezione**: il primo pad che preme START diventa **G1 (metà sinistra)**. Si parte subito in **schermo intero, 1 giocatore**.
   - Per 2 giocatori: nella schermata di selezione un secondo pad che preme START entra come **G2 (metà destra)**. La gara parte quando tutti i giocatori entrati hanno confermato (con 1 solo giocatore: appena G1 conferma), o allo scadere del timeout.
   - Ogni giocatore sceglie: veicolo (muletto / tugger) e colore (bianco / blu / rosso). Due umani non possono avere stesso veicolo+colore.
   - Timeout selezione 20 s → conferma automatica della scelta corrente.
3. **Countdown** 3-2-1-VIA con SFX. Nessun "turbo partenza" (troppo difficile per i piccoli).
4. **Gara** 3 giri (configurabile dall'operatore, 1-5).
5. **Fine gara**: finisce **quando tutti gli umani hanno tagliato il traguardo**. Le CPU non ancora arrivate vengono piazzate in base alla posizione corrente.
6. **Podio**: kart sul podio 3D, posizioni 1°-4°. Tono sempre positivo ("Grande gara!") anche per il 4°.
7. **Iniziali** (solo se il tempo totale entra in top 10): 3 lettere stile sala giochi.
8. **Classifica** per 8 s, poi ritorno all'attract.

## 3. Guida e fisica (arcade, scritta a mano)

**Nessun motore fisico.** I kart vivono nello spazio della pista, non nello spazio 3D libero.

### Modello
Ogni kart ha stato:
- `s` — progresso lungo la spline centrale (metri, 0..lunghezzaGiro)
- `d` — offset laterale dalla linea centrale (metri, `±larghezzaPista/2`)
- `heading` — angolo rispetto alla tangente della spline (rad)
- `speed` — m/s

Posizione/rotazione 3D derivate da `curve.getPointAt(s/L)` + normale × `d`. Fisica a **timestep fisso 60 Hz** con accumulatore; rendering interpolato.

### Regole
- **Accelerazione automatica**: il kart accelera sempre fino a `vMax`. Pulsante B / X = freno (opzionale, i piccoli lo ignoreranno).
- **Sterzo** = levetta sinistra o croce direzionale, modifica `heading`.
- **Drift opzionale (stile Mario Kart)**: tenendo LB/RB/grilletti (tastiera: Shift) mentre si sterza, il kart entra in derapata: direzione fissa, la levetta stringe/allarga, scintille bianche → blu → arancioni. Al rilascio mini-turbo (0,55 s / 1 s). I bambini possono ignorarlo.
- **Sterzo assistito**: `heading` tende a riallinearsi alla tangente quando la levetta è a riposo (`CONFIG.assist`, manopola di difficoltà).
- **Muri**: impossibile uscire di pista. Al contatto il kart viene rimbalzato verso la pista (−15% velocità, scintille, scossa camera), invece di scivolare lungo il bordo (sensazione "saponetta" segnalata in playtest).
- **Turbo a terra**: pad "nastro trasportatore" (strisce animate con frecce, texture scorrevole). Passandoci sopra: `speed = vMax × 1.5` per 1.2 s, poi decadimento. Unico power-up del gioco.
- **Collisioni kart-kart**: cerchi in spazio `(s, d)`, raggio = motrice. Spinta di separazione leggera + scambio minimo di velocità. Nessuna sbandata, nessuna perdita di controllo.

### Veicoli (leggere differenze)
| | Muletto | Tugger train |
|---|---|---|
| vMax | 100% | 105% |
| Sterzo | 110% | 90% |
| Accelerazione | 105% | 95% |

Valori in un unico oggetto di config. Differenze volutamente piccole (±10%): obiettivo "sensazione diversa", non vantaggio. **Da validare in playtest**: se un veicolo vince sistematicamente, si azzerano le differenze.

- **Tugger**: motrice + **1-2 vagoncini corti puramente estetici**. Ogni vagone segue la storia delle posizioni della motrice (buffer di `s,d` campionati, ritardo ~0.6 m). Nessuna collisione: hitbox = solo motrice.
- Piloti con colori aziendali **bianco / blu / rosso**.

### Contromano e recupero
- **Contromano**: se `cos(heading) < 0` per > 2 s → grossa freccia animata "GIRA!" al centro della propria vista.
- **Auto-respawn**: se `speed < 1 m/s` **oppure** contromano per > 4 s → fade breve, il kart riappare allo stesso `s` con `d = 0`, `heading = 0`, velocità 50%. Invulnerabile (attraversabile) 1 s.
- **Conteggio giri**: basato su `s` (incremento quando `s` passa da fine a inizio andando avanti). Con il modello a spline non esistono scorciatoie, quindi niente checkpoint.

## 4. CPU e bilanciamento

- CPU = stessa fisica degli umani, input generato: inseguono una linea verso l'interno curva, ma **volutamente imperfetta** (compensazione curva parziale, oscillazione, un errore di traiettoria ogni 6-14 s). Ogni CPU ha una velocità propria (`cpuSkill` 93-100%). Il primo playtest (giocatore esperto arrivato ultimo) ha mostrato CPU troppo precise.
- **Rubber banding**:
  - `vMaxCPU = vMaxBase × skill × clamp(1 + k × (s_umanoPiùVicino − s_cpu)/rubberDist, 0.8, 1.15)` con `rubberDist` = 80 m
  - Effetto: se l'umano è avanti le CPU accelerano (ma restano battibili), se è indietro rallentano. Tarare `k` in playtest con un bambino vero.
  - **Catch-up tra umani**: l'umano in seconda posizione (tra i due umani) riceve fino a +8% vMax in base al distacco. Serve a non far umiliare il fratello piccolo dal grande.
- CPU usano anche i pad turbo (passano sopra se capitano sulla loro linea).
- Nomi CPU: reparti/ruoli aziendali divertenti (es. "Capoturno", "Magazziniere") — lista in config.

## 5. Pista "riconoscibile"

### Pipeline (ibrida)
1. **Tracciato**: punti presi dal **disegno della planimetria** in pixel, convertiti con `scale` (0,45 m/px). Salvati in `track.json`. Reparti dal disegno: ASSEMBLAGGIO (lato sinistro), STAMPAGGIO (in alto a destra), VERNICIATURA (in basso a destra, accanto alla pista). Ogni reparto è un rettangolo (`areas`) con pavimento colorato, bordo giallo, cartello alto e arredo che lo riempie; fuori dai reparti scaffali e bancali di logistica.
2. **Strada**: generata in codice da `CatmullRomCurve3` chiusa → mesh estrusa (larghezza ~8 m, sufficiente per 4 kart affiancati), cordoli bianco/rosso alternati, linea del traguardo.
3. **Arredo**: kit modulare low-poly CC0 (es. Kenney, Quaternius — **verificare licenza di ogni pack**) + primitive three.js per scaffali, bancali, nastri, colonne. Piazzati in `track.json` (tipo, posizione, rotazione). Oggetti ripetuti → `InstancedMesh`.
4. **Pezzi iconici in Blender → glTF**: ingresso/facciata con logo, 1-2 elementi riconoscibili. Massimo 3 modelli custom, compressi.
5. **Identità aziendale**:
   - Cartelli reparto ("STAMPAGGIO", "MAGAZZINO", "VERNICIATURA"…) agli ingressi di ogni zona.
   - Logo su striscioni, sul traguardo, sulle pareti.
   - Foto (facciata, macchinari) come texture su pannelli/cartelloni. **Ridimensionate a max 1024 px**.

### Zone
`track.json` definisce le zone come frazione del giro (0..1), ognuna dura fino all'inizio della successiva; `kind` sceglie l'arredo generico:
```json
{ "zones": [ { "name": "STAMPAGGIO", "kind": "stampaggio", "from": 0.38 }, ... ] }
```
Entrando in una nuova zona: banner HUD "Stai entrando in: STAMPAGGIO" per 2 s. Possibile anche colore luci/nebbia leggermente diverso per zona.

### Effetti
- Un solo sistema di particelle (1 draw call): fiamma turbo, scintille drift colorate per livello, scintille contro i muri, polvere dietro i kart, coriandoli al via, a ogni giro, all'arrivo e sul podio.
- Linee di velocità a schermo e FOV allargato durante il turbo; scossa camera sugli urti.
- Banner "GIRO 2" / "ULTIMO GIRO!".
- Scenografia animata: bracci robotici in assemblaggio, carroponte in stampaggio.
- Camera che segue il kart con un leggero ritardo di rotazione: si vede il kart girare (più "grip" percepito).
- Ispirazione: cloni Mario Kart in three.js (drift + mini-turbo, particelle di drift, fiamme del turbo) e pmndrs/racing-game (polvere, scie, segni di frenata).

### Funzioni aggiunte dopo il primo playtest
- **Drift più dolce**: arco ampio e controllabile (levetta contro/centro/dentro = 15/45/90% dello sterzo), ingresso graduale in 0,3 s, angolo massimo ~30° rispetto alla pista. 3 livelli di mini-turbo (blu, arancione, viola) con **barra di carica** a schermo.
- **Segni di frenata** a terra in drift e nelle sterzate strette.
- **Volo d'apertura** (7 s) sopra il giro con i nomi dei reparti prima del 3-2-1; A per saltarlo.
- **Scie luminose** del colore del kart e **fiamma del turbo** con shader animato.
- **Fantasma del record di oggi** (solo 1 giocatore): il giro più veloce della giornata sulla postazione, salvato in locale.
- **Tasto Y "rimettimi in pista"** (tastiera: Fine / E).
- **Minimappa** con reparti e posizioni (solo 1 giocatore).
- **Modelli dettagliati** procedurali (muletto con montante, forche, bombola GPL, lampeggiante, fari; tugger con cofano, fari, parafanghi; vagoni con cassette KLT; pilota con caschetto e gilet). Ogni veicolo è fuso in 2 mesh per non pesare sulla grafica integrata.

### Pista più impegnativa (deviazioni volute dal disegno reale)
- **Chicane** sul rettilineo di Assemblaggio dopo la partenza e **curva a S** sul rettilineo in alto.
- **Ostacoli** (`obstacles` in `track.json`): bancali in mezzo alla pista (si sceglie da che parte passare), file di coni che restringono la carreggiata. Urto = −35% (bancale) / −15% (cono), scintille, scossa camera.
- **Incroci AGV** (`crossings`): un carrello automatico attraversa la pista a ciclo fisso (va, aspetta, torna), con strisce gialle/nere a terra. Le CPU scansano ostacoli e AGV, ma non sempre in tempo.

### Tridimensionalità ed effetto wow
- **Dislivelli** (`heights` in `track.json`): salita sul soppalco a 5 m (curva in alto a sinistra), tratto alto sul rettilineo superiore, discesa lungo Stampaggio. Fianchi in cemento, guardrail giallo/nero, piloni sotto. Fisica verticale: a terra il kart segue la quota, se la pista "cade" più in fretta della gravità (16 m/s²) il kart vola.
- **Rampe da salto** (`jumps`): una dopo l'incrocio AGV del rettilineo di sinistra (si atterra sotto la maniglia), una nella discesa di Verniciatura subito dopo il turbo.
- **Monumento**: maniglia d'auto gigante cromata ad arco sopra la pista, "MINEBEA · PIANEZZA" (lo stabilimento di Pianezza produce maniglie per auto).
- **Vibrazione del gamepad** su urti, turbo, salti, atterraggi, via e arrivo (Gamepad API `dual-rumble`).
- **Telecronista**: 30 frasi pre-generate con **Kokoro-82M** (Apache 2.0, voce `if_sara`) in `public/audio/voice/*.wav` tramite `tools/voce/genera.py`; la musica si abbassa mentre parla. Disattivabile dal menu operatore.
- **Arrivo al rallentatore** (1,6 s a 0,3×) con camera che gira attorno al kart e fuochi d'artificio sopra il traguardo.
- **Semaforo di partenza** a 3 luci rosse → verdi al posto del 3-2-1.

### Capannone, luci, replay, musica
- **Tetto a shed** (denti di sega) con vetrate verticali luminose, capriate in acciaio, **lampade industriali** sospese con pozze di luce a terra, **fasci di luce** dalle vetrate (disattivabili dal menu operatore se i portatili scattano), **scintille di saldatura** dai robot.
- **Replay** dopo la gara: gli ultimi 6 s prima dell'arrivo del primo umano, al 60% della velocità, con camere TV a bordo pista e zoom; A per saltarlo.
- **Musica** CC0 di MintoDog (OpenGameArt): *Sunny City* nei menu, *Pure Raceway* in gara, versione *climax* all'ultimo giro, con dissolvenza.

### Persone in scena
- InstancedMesh (5 draw call in tutto): **operatori** ai macchinari che lavorano, **pedoni** che camminano sui camminamenti a lato pista, **tribuna** alla partenza con famiglie e bambini che fanno il tifo dietro le transenne.

### Turbo pad
Posizioni in `track.json` come `{ "t": 0.27, "d": -2 }` (frazione del giro, offset laterale). 4-6 per giro, in rettilineo e all'uscita delle curve, mai prima di una curva stretta.

## 6. Camera, split-screen, HUD

- **Camera**: chase dietro e sopra il kart, inseguimento smorzato (lerp posizione + lookAt anticipato lungo la spline). FOV allargato di +8° durante il turbo.
- **Split-screen verticale** (sinistra G1 / destra G2), adatto a TV: un solo renderer, una scena, due camere, `setViewport` + `setScissor`. Con 1 giocatore: vista intera.
- **HUD** in DOM sopra il canvas (non in WebGL: più semplice e testo nitido), uno per vista:
  - **Posizione** gigante in alto ("1°"), colorata (oro/argento/bronzo/blu).
  - **Giro X/3**.
  - **Banner reparto** quando si entra in una zona.
  - Freccia **contromano** quando serve.
  - Niente minimappa, niente tachimetro.
- Font grande, alto contrasto, bordo scuro sul testo. Leggibile da 2 m su TV e da 50 cm su portatile 15".

## 7. Input

- **Gamepad API**, mapping "standard" (Xbox-like). Supporto: levetta sinistra + croce, A = conferma/START, B = indietro/freno, START = start/pausa.
- **Attenzione**: il browser espone un gamepad solo dopo la prima pressione di un tasto. L'attract mode deve polling-are `navigator.getGamepads()` ogni frame e attivarsi alla prima pressione.
- Deadzone levetta 0.2. Pad wireless: testare la latenza.
- **Il modello di gamepad è ancora da decidere**: comprare **subito** i pad definitivi e testarli sul portatile in settimana 1 (alcuni pad economici non riportano `mapping: "standard"` → serve una tabella di rimappatura).
- **Disconnessione durante la gara** (`gamepaddisconnected`): pausa globale + overlay "Ricollega il controller del Giocatore N". Riprende con countdown 3 s quando il pad torna (stesso indice o primo nuovo pad).
- **Tastiera** (nascosta sotto il tavolo, solo dev/operatore): frecce = G1, WASD = G2, Invio = START.

## 8. Classifica

- Per postazione, in `localStorage` (offline). Chiave versionata (`gpf_leaderboard_v1`).
- **Top 10 per miglior tempo totale gara** (3 giri). Un record vale solo se la gara è stata col numero di giri standard (3); con giri diversi la classifica non viene aggiornata.
- **Inserimento 3 lettere arcade**: su/giù cambia lettera, destra/A conferma, sinistra torna indietro. In 2 giocatori, entrambi inseriscono **in contemporanea** nella propria metà schermo.
- **Timeout 15 s** → salvato con le lettere correnti (default "AAA").
- Ogni voce: iniziali, tempo, veicolo, colore (mostrato come icona: aiuta i bambini che non ricordano le iniziali).
- Reset solo dal menu operatore.
- Filtro parole: blacklist minima di combinazioni di 3 lettere inappropriate in italiano → sostituite con "???".
- `localStorage` sopravvive al riavvio di Chrome **solo se non si usa un profilo temporaneo/incognito**: il launcher usa un `--user-data-dir` fisso.

## 9. Menu operatore

Accesso: combinazione tastiera nascosta (es. `Ctrl+Shift+O`). Gestisce:
- Numero giri (1-5)
- Volume musica / SFX
- Risoluzione massima (720p / 1080p)
- Reset classifica (con conferma)
- Torna all'attract / interrompi gara
- Contatore FPS on/off

Impostazioni salvate in `localStorage`.

## 10. Audio

- Web Audio API (o `THREE.Audio`). Musica loop royalty-free/CC0 (verificare licenza), SFX: motore (pitch legato alla velocità, un loop per kart umano), turbo, urto, countdown, traguardo, applausi podio.
- Volume regolabile dal menu operatore. Default moderato: 2-3 postazioni vicine.
- **Autoplay**: Chrome blocca l'audio senza gesto utente, e una pressione di gamepad **non conta** come gesto utente. Soluzione: il launcher avvia Chrome con `--autoplay-policy=no-user-gesture-required`.

## 11. Performance (grafica integrata)

Target: **60 fps in split-screen a 1080p**, minimo accettabile 40 fps.

- **Render cap 1080p**: canvas interno max 1920×1080 (o 1280×720 da menu), `setPixelRatio(1)`, upscaling CSS a schermo intero. Su TV 4K si renderizza comunque a 1080p.
- Niente ombre dinamiche: blob shadow (quad con texture radiale) sotto ogni kart. Luce "cotta" nei colori vertex/texture.
- Materiali `MeshLambertMaterial` / `MeshBasicMaterial`, niente PBR, niente post-processing.
- `Fog` per tagliare il far plane (~150 m).
- `InstancedMesh` per oggetti ripetuti; obiettivo < 150 draw call per vista.
- Texture max 1024 px, atlas dove possibile. glTF compressi (meshopt o Draco se servono, altrimenti niente).
- Split-screen = scena renderizzata 2 volte: il budget per vista è metà.
- **Test sul portatile reale dalla settimana 1**, non solo sul PC di sviluppo.

## 12. Deploy e postazione

- **Stack**: Vite + three.js (unica dipendenza runtime). JavaScript puro, nessun framework UI.
- Build: `vite build` → `dist/` copiata su ogni portatile.
- Server locale: `npx vite preview` o `python -m http.server` sulla cartella `dist/` (moduli ES e glTF non funzionano da `file://`).
- **Launcher** `avvia.bat` nella cartella Esecuzione automatica di Windows:
  1. avvia il server locale
  2. avvia Vivaldi (Chromium, stessi flag; cerca prima in %LOCALAPPDATA%, poi in Program Files):
     ```
     vivaldi --kiosk --autoplay-policy=no-user-gesture-required http://localhost:8080
     ```
     Per ora usa il profilo personale di Vivaldi (sviluppo; Vivaldi va chiuso prima). **Sui PC aziendali** tornare a un profilo dedicato con `--user-data-dir=C:\gpf-profile` e completare una volta la configurazione iniziale di Vivaldi in quel profilo.
- **Checklist portatile** (prima dell'evento):
  - [ ] Risparmio energia: mai sospensione, mai spegnimento schermo, piano "Prestazioni elevate", alimentatore collegato
  - [ ] Windows Update e notifiche disattivate / modalità "Non disturbare"
  - [ ] Screen saver disattivato
  - [ ] Antivirus/agent aziendali che non aprono popup
  - [ ] Uscita audio corretta (TV HDMI vs altoparlanti)
  - [ ] Gamepad testati, etichette G1/G2 non necessarie (assegnazione per START)
  - [ ] Classifica vuota (reset) la mattina dell'evento
- Esposti al pubblico **solo i gamepad**; tastiera e touchpad coperti/sotto il tavolo.

## 13. Struttura file

```
index.html          canvas + overlay HUD/menu (DOM)
src/main.js         loop, stati di gioco, render split-screen
src/track.js        spline, mesh strada, arredo, zone, turbo pad
src/kart.js         fisica arcade, veicoli, vagoni tugger
src/ai.js           CPU + rubber banding
src/input.js        gamepad + tastiera, assegnazione giocatori
src/ui.js           HUD, menu, podio, iniziali, classifica, menu operatore
src/audio.js        musica e SFX
public/track.json   tracciato, arredo, zone, turbo pad
public/assets/      glTF, texture, audio
```
Un solo `config` (veicoli, rubber banding, giri, timeout) in cima a `main.js`.

## 14. Piano di lavoro (< 1 mese)

| Settimana | Obiettivo | "Fatto" quando |
|---|---|---|
| 1 | Spline da planimetria, strada, 1 kart con fisica arcade, gamepad, camera chase. **Test su portatile reale + pad definitivi** | Un kart gira in pista a 60 fps sul portatile |
| 2 | 4 kart, CPU + rubber banding, collisioni, giri, posizioni, split-screen, turbo pad, contromano/respawn | Gara completa giocabile in 2, senza UI |
| 3 | Flusso completo (attract → podio → classifica), selezione veicoli, HUD, audio, arredo + pezzi iconici + logo/foto | Si può lasciare in mano a un bambino |
| 4 | **Playtest con bambini veri** (6 e 12 anni), tuning, menu operatore, launcher, checklist portatili, prova di 2 ore continue | Nessun crash in 2 ore, nessun bambino frustrato |

**Tagli in ordine se si è in ritardo**: pezzi Blender (sostituiti da primitive + foto) → vagoni tugger (motrice sola) → attract mode cinematica (schermata statica) → differenze tra veicoli.

## 15. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| FPS bassi su grafica integrata in split | Cap 1080p, budget draw call, test settimana 1, opzione 720p |
| Gamepad non standard / non riconosciuti | Comprare e testare i pad subito, tabella rimappatura |
| Audio muto all'avvio | Flag `--autoplay-policy` nel launcher |
| Portatile va in sospensione / Windows Update durante l'evento | Checklist §12 |
| Bambino piccolo frustrato | Accelerazione automatica, sterzo assistito, muri morbidi, rubber banding, catch-up umano, podio sempre positivo |
| Fila troppo lunga | 3 giri ~2,5 min; operatore può scendere a 2 giri (la classifica non si aggiorna) |
| Iniziali inappropriate | Blacklist 3 lettere |
| Memory leak in ore di uso continuo | Riutilizzare la scena tra gare (reset stato, non ricreare mesh); test di 2 ore con contatore FPS |
| Licenze asset | Solo CC0 o asset aziendali; elenco fonti in `CREDITS.txt` |

## 16. Fuori scope (esplicitamente)

Power-up raccoglibili, proiettili, segni di frenata, più piste, multiplayer in rete, classifica condivisa tra postazioni, supporto mobile/touch, volanti, ombre dinamiche, salvataggi su server, localizzazione, messaggi HSE.

## 17. Decisioni ancora aperte

- Modello di gamepad (da comprare entro la settimana 1).
- Nomi e confini dei reparti lungo il tracciato (da definire sulla planimetria).
- Quali 1-3 elementi iconici modellare in Blender.
- Musica: quale traccia CC0/royalty-free.
