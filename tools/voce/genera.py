"""Genera le frasi del telecronista con Kokoro-82M (Apache 2.0) in public/audio/voice/*.wav.

Uso (dalla cartella del progetto):
    tools/voce/.venv/Scripts/python tools/voce/genera.py            # tutte le frasi
    tools/voce/.venv/Scripts/python tools/voce/genera.py if_sara    # con un'altra voce

Per cambiare una frase: modificare FRASI e rilanciare. Le chiavi sono usate da src/audio.js.
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOCE = sys.argv[1] if len(sys.argv) > 1 else 'im_nicola'  # voci italiane: im_nicola, if_sara
OUT = Path(__file__).resolve().parents[2] / 'public' / 'audio' / 'voice'

FRASI = {
    'benvenuti': 'Benvenuti al Gran Premio Minebea!',
    'via': 'Via!',
    'giro2': 'Secondo giro!',
    'giro3': 'Terzo giro!',
    'giro4': 'Quarto giro!',
    'ultimo': 'Ultimo giro! Forza, forza!',
    'sorpasso1': 'Sorpasso!',
    'sorpasso2': 'Che sorpasso!',
    'sorpasso3': 'Sorpasso spettacolare!',
    'testa': 'Sei in testa!',
    'testa_g1': 'Giocatore uno in testa!',
    'testa_g2': 'Giocatore due in testa!',
    'salto1': 'Che salto!',
    'salto2': 'Si vola!',
    'salto3': 'Volo spettacolare!',
    'vittoria': 'Vittoria! Primo posto al Gran Premio Minebea!',
    'vittoria_g1': 'Vittoria per il giocatore uno!',
    'vittoria_g2': 'Vittoria per il giocatore due!',
    'posto2': 'Traguardo! Secondo posto, bravissimo!',
    'posto3': 'Traguardo! Terzo posto, sei sul podio!',
    'posto4': 'Traguardo! Quarto posto, bella gara!',
    'posto2_g1': 'Giocatore uno, secondo posto!',
    'posto3_g1': 'Giocatore uno, terzo posto!',
    'posto4_g1': 'Giocatore uno, quarto posto!',
    'posto2_g2': 'Giocatore due, secondo posto!',
    'posto3_g2': 'Giocatore due, terzo posto!',
    'posto4_g2': 'Giocatore due, quarto posto!',
    'replay': 'Rivediamo il finale!',
    'complimenti': 'Complimenti a tutti i piloti del Gran Premio Minebea!',
    'record': 'Nuovo record!',
}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tts = KPipeline(lang_code='i', repo_id='hexgrad/Kokoro-82M')
    for key, text in FRASI.items():
        audio = np.concatenate([np.asarray(a) for _, _, a in tts(text, voice=VOCE, speed=1.12)])
        sf.write(OUT / f'{key}.wav', audio, 24000)
        print(f'{key}.wav  {len(audio) / 24000:.1f}s  {text}')

if __name__ == '__main__':
    main()
