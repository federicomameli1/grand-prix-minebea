# Gran Premio Minebea

Racing game 3D arcade (three.js) per il family day dello stabilimento Minebea di Pianezza.

```bash
npm install
npm run dev        # http://localhost:5173
```

- Passaggio di consegne, architettura e cose da fare: [HANDOFF.md](HANDOFF.md)
- Specifica e decisioni di design: [SPEC.md](SPEC.md)
- Crediti: [CREDITS.txt](CREDITS.txt)

## Novità di gioco

- Pista larga **12 m**, con più spazio per sorpassi e drift.
- Scatole oggetto: bonus automatico **turbo** o **scudo**, anche per le CPU.
- Nome prima della gara (max 12 caratteri): scrittura da tastiera oppure tastiera a schermo con gamepad.
- Nomi semitrasparenti senza sfondo sopra i soli kart umani; stesso nome su podio e classifica.

Regressione browser: `node tools/checks/features.mjs [percorso Chromium]` (Node 22+; usa un profilo temporaneo isolato).

## English

3D arcade racing game (three.js) for the Minebea Pianezza family day. Fully offline, 1-2 players plus CPU karts,
gamepad or keyboard. Available in **Italian, English and Hungarian**.

Requirements: Node.js 20+ and a Chromium browser (Chrome, Edge or Vivaldi).

```bash
npm install
npm run build
```

Then double-click **`start.bat`**: it starts the local server on port 8080 and opens the browser in fullscreen kiosk mode
with audio autoplay enabled. Close the browser first, otherwise the kiosk and audio flags are ignored.
For development use `npm run dev` (http://localhost:5173). In PowerShell on locked-down PCs use `npm.cmd` instead of `npm`.

- **Language and settings**: press `Ctrl+Shift+O` for the operator menu (language, laps, volumes, resolution,
  commentator, reset leaderboard). The language is saved per station.
- **Controls**: gamepad (stick, A, B, LB/RB drift, Y back on track, START pause),
  player 1 on arrows + Enter + Right Shift, player 2 on WASD + Space + Left Shift.
- **Translations** are all in [src/i18n.js](src/i18n.js); commentator lines are regenerated with
  [tools/voce/genera.py](tools/voce/genera.py).
