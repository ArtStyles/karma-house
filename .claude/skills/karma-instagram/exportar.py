"""Turn the slide snapshots of one post into lamina-N.jpg and build revisar.png.

Usage: python exportar.py <post folder> [--textos]
                python exportar.py --prueba
Expects <post>/laminas/snapshots/frame-*.png (from `hyperframes snapshot laminas --at 0.5,1.5,... --no-end`)
and texto.txt, comentario.txt and alt.txt in <post>. Writes <post>/lamina-1.jpg ... and <post>/revisar.png: every
slide in a row with the caption, first comment and alt texts underneath, to check the post at a glance.

First it checks the texts (alone with --textos, for a reel-only post): strips invisible characters from the three
.txt files in place, prints what the feed shows before «… más», and warns when the hook does not fit in it or the
caption and first comment carry more than 5 hashtags between them. --prueba runs the self-check.
Adapted from ig-caption and ig-human in github.com/Jakeschincariol/instagram-agent-skill (MIT, Jake Schincariol).
"""
import re
import sys
import textwrap
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')  # the Windows console is cp1252; captions carry accents and «»

FEED = 125      # Roughly where the feed cuts the caption to «… más».
HASHTAGS = 5    # Instagram's cap per post since 18-12-2025, caption and first comment together.
LENGTH = 2200   # Instagram's hard caption limit.
# Zero-width and format characters that ride along in generated text. ZWJ (U+200D) and the variation selectors
# stay: compound emoji are built with them.
INVISIBLE = re.compile('[­͏؜᠎​‌‎‏‪-‮⁠-⁤⁦-⁯'
                       '﻿\U000e0000-\U000e007f]')
HARD_SPACE = re.compile('[   ]')
HASHTAG = re.compile(r'(?<![\w&])#\w*[^\W\d_]\w*')  # needs a letter: Instagram does not tag «#1»


def clean(text):
    """Text without invisible characters and with plain spaces, plus how many characters changed."""
    out = HARD_SPACE.sub(' ', INVISIBLE.sub('', text))
    return out, len(INVISIBLE.findall(text)) + len(HARD_SPACE.findall(text))


def warnings(caption, comment):
    """What to fix in the caption and first comment before the post ships."""
    found = []
    first = caption.strip().split('\n', 1)[0]
    if len(first) > FEED:
        found.append(f'el gancho (primera línea) tiene {len(first)} caracteres: el feed lo corta en {FEED}')
    if len(caption) > LENGTH:
        found.append(f'el pie tiene {len(caption)} caracteres: Instagram admite {LENGTH}')
    tags = HASHTAG.findall(caption + '\n' + comment)
    if len(tags) > HASHTAGS:
        found.append(f'{len(tags)} hashtags entre pie y comentario: Instagram admite {HASHTAGS} ({" ".join(tags)})')
    return found


def check_texts(post):
    texts = {}
    for name in ('texto.txt', 'comentario.txt', 'alt.txt'):
        p = post / name
        if not p.exists():
            print(f'AVISO falta {name}')
            texts[name] = ''
            continue
        raw = p.read_text(encoding='utf-8')
        text, changed = clean(raw)
        if changed:
            p.write_text(text, encoding='utf-8', newline='')
            print(f'{name}: {changed} caracteres invisibles o espacios duros corregidos')
        texts[name] = text
    caption = texts['texto.txt'].strip()
    print(f'\nLO QUE ENSEÑA EL FEED ({FEED} caracteres):')
    print(caption[:FEED] + (' … más' if len(caption) > FEED else ''))
    found = warnings(caption, texts['comentario.txt'])
    print('\n' + '\n'.join(f'AVISO {w}' for w in found) if found else '\nTextos sin avisos.')


def selftest():
    assert clean('Pega​ tu anuncio﻿') == ('Pega tu anuncio', 3)
    assert clean('👨‍👩‍👧')[1] == 0, 'compound emoji must survive'
    hook = 'Pega el anuncio y el formulario se rellena solo.'
    assert warnings(hook, '#KarmaHouse #CasasEnCuba') == []
    assert len(warnings('x' * 130, '')) == 1
    assert 'hashtags' in warnings(hook + ' #Cuba', '#a #b #c #d #e')[0]
    assert HASHTAG.findall('#PermutaEnCuba #VedadoÑ, paso #1, &#39;, #2x') == ['#PermutaEnCuba', '#VedadoÑ', '#2x']
    print('prueba ok')


if sys.argv[1] == '--prueba':
    selftest()
    sys.exit()

post = Path(sys.argv[1])
check_texts(post)
if '--textos' in sys.argv[2:]:
    sys.exit()
print()

from PIL import Image, ImageDraw, ImageFont

frames = sorted((post / 'laminas' / 'snapshots').glob('frame-*.png'))
if not frames:
    sys.exit('no snapshots in laminas/snapshots: run hyperframes snapshot first')

slides = []
for i, f in enumerate(frames, 1):
    im = Image.open(f).convert('RGB')
    im.save(post / f'lamina-{i}.jpg', quality=92, optimize=True)
    slides.append(im)
    print(f'lamina-{i}.jpg {im.size[0]}x{im.size[1]}')


def read(name):
    p = post / name
    return p.read_text(encoding='utf-8').strip() if p.exists() else f'(falta {name})'


W, PAD, GAP = 380, 40, 24
thumbs = [s.resize((W, round(s.size[1] * W / s.size[0])), Image.LANCZOS) for s in slides]
th = max(t.size[1] for t in thumbs)
body = ImageFont.truetype('arial.ttf', 24)
head = ImageFont.truetype('arialbd.ttf', 26)
cols = max(len(thumbs), 3) * (W + GAP) - GAP
blocks = [('Texto', read('texto.txt')), ('Primer comentario', read('comentario.txt')), ('Texto alternativo', read('alt.txt'))]
lines = []
for title, text in blocks:
    lines.append((head, title))
    for para in text.splitlines():
        for l in textwrap.wrap(para, width=int(cols / 12.5)) or ['']:
            lines.append((body, l))
    lines.append((body, ''))
H = PAD + th + PAD + len(lines) * 32 + PAD
out = Image.new('RGB', (cols + 2 * PAD, H), (250, 246, 238))
d = ImageDraw.Draw(out)
for i, t in enumerate(thumbs):
    x = PAD + i * (W + GAP)
    out.paste(t, (x, PAD))
    d.text((x + 8, PAD + 8), str(i + 1), font=head, fill=(227, 176, 75))
y = PAD + th + PAD
for font, l in lines:
    d.text((PAD, y), l, font=font, fill=(26, 43, 59) if font is head else (77, 90, 102))
    y += 32
out.save(post / 'revisar.png', optimize=True)
print('revisar.png', out.size)
