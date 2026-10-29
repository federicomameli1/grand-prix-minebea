"""Genera le frasi del telecronista in public/audio/voice/<lingua>/*.wav.

Italiano con Kokoro-82M (Apache 2.0); inglese e ungherese con Piper (Kokoro non ha l'ungherese).
Le voci Piper (.onnx + .onnx.json) vanno in tools/voce/piper/, scaricate con:
    tools/voce/.venv/Scripts/python -m piper.download_voices en_US-amy-medium hu_HU-anna-medium

Uso (dalla cartella del progetto):
    tools/voce/.venv/Scripts/python tools/voce/genera.py            # tutte le lingue
    tools/voce/.venv/Scripts/python tools/voce/genera.py hu         # solo una lingua

Per cambiare una frase: modificare FRASI e rilanciare. Le chiavi sono usate da src/audio.js.
"""
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'audio' / 'voice'
PIPER = Path(__file__).resolve().parent / 'piper'
VOCI = {'it': 'if_sara', 'en': 'en_US-amy-medium', 'hu': 'hu_HU-anna-medium'}

FRASI = {
    'it': {
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
    },
    'en': {
        'benvenuti': 'Welcome to the Minebea Grand Prix!',
        'via': 'Go!',
        'giro2': 'Lap two!',
        'giro3': 'Lap three!',
        'giro4': 'Lap four!',
        'ultimo': 'Final lap! Come on, come on!',
        'sorpasso1': 'Overtake!',
        'sorpasso2': 'What an overtake!',
        'sorpasso3': 'Spectacular overtake!',
        'testa': "You're in the lead!",
        'testa_g1': 'Player one takes the lead!',
        'testa_g2': 'Player two takes the lead!',
        'salto1': 'What a jump!',
        'salto2': "We're flying!",
        'salto3': 'Spectacular flight!',
        'vittoria': 'Victory! First place at the Minebea Grand Prix!',
        'vittoria_g1': 'Victory for player one!',
        'vittoria_g2': 'Victory for player two!',
        'posto2': 'Finish! Second place, well done!',
        'posto3': "Finish! Third place, you're on the podium!",
        'posto4': 'Finish! Fourth place, great race!',
        'posto2_g1': 'Player one, second place!',
        'posto3_g1': 'Player one, third place!',
        'posto4_g1': 'Player one, fourth place!',
        'posto2_g2': 'Player two, second place!',
        'posto3_g2': 'Player two, third place!',
        'posto4_g2': 'Player two, fourth place!',
        'replay': "Let's watch the finish again!",
        'complimenti': 'Congratulations to all the drivers of the Minebea Grand Prix!',
        'record': 'New record!',
    },
    'hu': {
        'benvenuti': 'Üdvözlünk a Minebea Nagydíjon!',
        'via': 'Rajt!',
        'giro2': 'Második kör!',
        'giro3': 'Harmadik kör!',
        'giro4': 'Negyedik kör!',
        'ultimo': 'Utolsó kör! Hajrá, hajrá!',
        'sorpasso1': 'Előzés!',
        'sorpasso2': 'Micsoda előzés!',
        'sorpasso3': 'Látványos előzés!',
        'testa': 'Te vezetsz!',
        'testa_g1': 'Az egyes játékos vezet!',
        'testa_g2': 'A kettes játékos vezet!',
        'salto1': 'Micsoda ugrás!',
        'salto2': 'Repülünk!',
        'salto3': 'Látványos repülés!',
        'vittoria': 'Győzelem! Első hely a Minebea Nagydíjon!',
        'vittoria_g1': 'Győzött az egyes játékos!',
        'vittoria_g2': 'Győzött a kettes játékos!',
        'posto2': 'Célba értél! Második hely, ügyes vagy!',
        'posto3': 'Célba értél! Harmadik hely, dobogós vagy!',
        'posto4': 'Célba értél! Negyedik hely, szép verseny volt!',
        'posto2_g1': 'Egyes játékos, második hely!',
        'posto3_g1': 'Egyes játékos, harmadik hely!',
        'posto4_g1': 'Egyes játékos, negyedik hely!',
        'posto2_g2': 'Kettes játékos, második hely!',
        'posto3_g2': 'Kettes játékos, harmadik hely!',
        'posto4_g2': 'Kettes játékos, negyedik hely!',
        'replay': 'Nézzük újra a hajrát!',
        'complimenti': 'Gratulálunk a Minebea Nagydíj minden versenyzőjének!',
        'record': 'Új rekord!',
    },
}


def kokoro(frasi, out):
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline
    tts = KPipeline(lang_code='i', repo_id='hexgrad/Kokoro-82M')
    for key, text in frasi.items():
        audio = np.concatenate([np.asarray(a) for _, _, a in tts(text, voice=VOCI['it'], speed=1.12)])
        sf.write(out / f'{key}.wav', audio, 24000)
        print(f'{out.name}/{key}.wav  {text}')


def piper(frasi, out, voce):
    from piper import PiperVoice, SynthesisConfig
    v = PiperVoice.load(PIPER / f'{voce}.onnx')
    cfg = SynthesisConfig(length_scale=0.9)  # un po' più veloce, da telecronista
    for key, text in frasi.items():
        with wave.open(str(out / f'{key}.wav'), 'wb') as w:
            v.synthesize_wav(text, w, syn_config=cfg)
        print(f'{out.name}/{key}.wav  {text}')


def main():
    for lang in sys.argv[1:] or FRASI:
        out = OUT / lang
        out.mkdir(parents=True, exist_ok=True)
        kokoro(FRASI[lang], out) if lang == 'it' else piper(FRASI[lang], out, VOCI[lang])


if __name__ == '__main__':
    main()
