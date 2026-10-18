"""Fill the piece hosts in index.html from plan.json and the word timings of the voice.

Usage (from the video project folder): python armar.py

plan.json:
  "transcripcion": path to the whisper word list ([{text, start, end}]).
  "texto": {"frases": [...]}  for texto-voz.html. Each on-screen word takes the next spoken word(s) in
      order: "une": 2 joins two spoken words («Karma»+«House» -> «KarmaHouse»); "voz": false marks a word
      that is not spoken (give it "t"). A "t" already set wins over the transcript (whisper often starts the
      first word of a line inside the silence before it). A phrase's "inicio" defaults to its first word
      minus 0.05 s and its "fin" to the next phrase's "inicio".
  "losa": [...]      for transicion-losa.html (momentos).
  "tarjetas": [...]  for tarjetas-ui.html (grupos).
index.html: the hosts carry id="pz-texto-voz", "pz-losa", "pz-tarjetas" and a data-variable-values="..."
attribute; this script rewrites only that attribute.
"""
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

proj = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
plan = json.loads((proj / 'plan.json').read_text(encoding='utf-8'))
words = json.loads((proj / plan['transcripcion']).read_text(encoding='utf-8'))


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if c.isalnum() and c.isascii())


frases = plan['texto']['frases']
i = 0
for f in frases:
    for linea in f['lineas']:
        for w in linea:
            n = w.pop('une', 1)
            if w.pop('voz', True):
                seg = words[i:i + n]
                i += n
                if not seg:
                    sys.exit(f'faltan palabras en la voz para «{w["p"]}»')
                if norm(w['p']) != ''.join(norm(x['text']) for x in seg):
                    print(f'aviso: «{w["p"]}» en pantalla, «{" ".join(x["text"] for x in seg)}» en la voz')
                w.setdefault('t', round(seg[0]['start'], 2))
    f.setdefault('inicio', round(min(w['t'] for l in f['lineas'] for w in l) - .05, 2))
for f, siguiente in zip(frases, frases[1:] + [None]):
    f.setdefault('fin', siguiente['inicio'] if siguiente else plan.get('duracion', 999))
if i != len(words):
    print(f'aviso: {len(words) - i} palabras de la voz sin usar')

valores = {
    'pz-texto-voz': {'datos': json.dumps(plan['texto'], ensure_ascii=False)},
    'pz-losa': {'momentos': json.dumps(plan.get('losa', []), ensure_ascii=False)},
    'pz-tarjetas': {'grupos': json.dumps(plan.get('tarjetas', []), ensure_ascii=False)},
}
index = proj / 'index.html'
src = index.read_text(encoding='utf-8')
for host, v in valores.items():
    attr = html.escape(json.dumps(v, ensure_ascii=False), quote=True)
    src, k = re.subn(r'(id="' + host + r'"[^>]*?data-variable-values=")[^"]*(")', lambda m: m.group(1) + attr + m.group(2), src)
    if not k:
        print(f'aviso: no encontré el anfitrión {host} en index.html')
index.write_text(src, encoding='utf-8')

for f in frases:
    print(f'{f["inicio"]:6.2f}–{f["fin"]:6.2f}  ' + ' / '.join(' '.join(f'{w["p"]}@{w["t"]}' for w in l) for l in f['lineas']))
