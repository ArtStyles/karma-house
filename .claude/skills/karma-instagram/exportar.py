"""Turn the slide snapshots of one post into lamina-N.jpg and build revisar.png.

Usage: python exportar.py <post folder>
Expects <post>/laminas/snapshots/frame-*.png (from `hyperframes snapshot laminas --at 0.5,1.5,... --no-end`)
and texto.txt, comentario.txt and alt.txt in <post>. Writes <post>/lamina-1.jpg ... and <post>/revisar.png: every
slide in a row with the caption, first comment and alt texts underneath, to check the post at a glance.
"""
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

post = Path(sys.argv[1])
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
