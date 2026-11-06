"""James's voice (the user's own cloned Cuban voice on ElevenLabs) for KarmaHouse promos.

    python james.py cuota                          -> characters used and left this month
    python james.py bloques guion.json [salida]    -> salida/bNN.mp3 + bNN.json (word timings) per block
        [--desde N | --solo 3,5] [--stability 0.40] [--style 0.35] [--speed 1.0]
    python james.py --prueba                       -> self-check, no network

guion.json is a list of strings, one per block (one take per block, so the intonation links the sentences).
The key comes from ELEVENLABS_API_KEY (process, then the Windows user scope); it is never printed or stored.
Adapted from artifacts/videos/2026-10-18-inmobiliarias-cinetico/eleven.py.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')  # the Windows console is cp1252
VOICE = 'nHIQAp46desTnCzOPHFm'  # «James Cuban Voice», cloned, es-cuban
API = 'https://api.elevenlabs.io'


def key():
    k = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not k and os.name == 'nt':  # a shell opened before the user saved the key does not see it
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as h:
                k = str(winreg.QueryValueEx(h, 'ELEVENLABS_API_KEY')[0]).strip()
        except OSError:
            pass
    if not k:
        sys.exit('Falta ELEVENLABS_API_KEY: el usuario la guarda con guardar-clave.ps1 en una pestaña del Terminal')
    return k


def pide(path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                 headers={'xi-api-key': key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code}: {e.read().decode()[:300]}')


def cuota():
    u = pide('/v1/user/subscription')
    used, limit = u.get('character_count', 0), u.get('character_limit', 0)
    print(f"plan {u.get('tier')}: {used} de {limit} caracteres usados, quedan {limit - used}")


def palabras(al):
    """ElevenLabs character alignment -> [{text, start, end}] per word."""
    out, w, t0, t1 = [], '', None, None
    for c, s, e in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
        if c.isspace():
            if w:
                out.append({'text': w, 'start': round(t0, 3), 'end': round(t1, 3)})
            w, t0 = '', None
        else:
            if t0 is None:
                t0 = s
            w += c
            t1 = e
    if w:
        out.append({'text': w, 'start': round(t0, 3), 'end': round(t1, 3)})
    return out


def bloque(n, texto, salida, stability=0.40, style=0.35, speed=1.0):
    os.makedirs(salida, exist_ok=True)
    ajustes = {'stability': stability, 'similarity_boost': 0.85, 'style': style, 'use_speaker_boost': True}
    if speed != 1.0:  # only sent when changed: the takes approved so far never sent it
        ajustes['speed'] = speed
    r = pide(f'/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128', {
        'text': texto, 'model_id': 'eleven_multilingual_v2', 'language_code': 'es', 'voice_settings': ajustes})
    base = os.path.join(salida, f'b{n:02d}')
    with open(base + '.mp3', 'wb') as f:
        f.write(base64.b64decode(r['audio_base64']))
    with open(base + '.json', 'w', encoding='utf-8') as f:
        json.dump({'text': texto, 'words': palabras(r['alignment'])}, f, ensure_ascii=False, indent=1)
    print(f'{base}.mp3 ok · {len(texto)} caracteres')


def opcion(args, nombre, defecto):
    return type(defecto)(args[args.index(nombre) + 1]) if nombre in args else defecto


def prueba():
    al = {'characters': list('Oye, mira'), 'character_start_times_seconds': [0, .1, .2, .3, .4, .5, .6, .7, .8],
          'character_end_times_seconds': [.1, .2, .3, .4, .5, .6, .7, .8, .9]}
    assert palabras(al) == [{'text': 'Oye,', 'start': 0, 'end': 0.4}, {'text': 'mira', 'start': 0.5, 'end': 0.9}]
    assert opcion(['--desde', '3'], '--desde', 1) == 3 and opcion([], '--speed', 1.0) == 1.0
    assert opcion(['--solo', '3,5'], '--solo', '') == '3,5'
    print('prueba ok')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--prueba']:
        prueba()
    elif a[:1] == ['cuota']:
        cuota()
    elif a[:1] == ['bloques'] and len(a) >= 2:
        with open(a[1], encoding='utf-8') as f:
            bloques = json.load(f)
        salida = a[2] if len(a) > 2 and not a[2].startswith('--') else 'assets/voice/james'
        solo = {int(n) for n in opcion(a, '--solo', '').split(',') if n}
        elegidos = [(i, t) for i, t in enumerate(bloques, 1) if (i in solo if solo else i >= opcion(a, '--desde', 1))]
        print(f'{sum(len(t) for _, t in elegidos)} caracteres en {len(elegidos)} bloques')
        for i, t in elegidos:
            bloque(i, t, salida, opcion(a, '--stability', 0.40), opcion(a, '--style', 0.35), opcion(a, '--speed', 1.0))
        cuota()
    else:
        sys.exit(__doc__)
