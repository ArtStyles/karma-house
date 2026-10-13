"""Builds the house walk for the web from the generated photos in artifacts/tour/casa (git-ignored, see
artifacts/tour/casa/steps.txt and the scripts beside it for how they were made).

Writes, per photo NNN: web/public/casa/NNN-1280.webp and NNN-720.webp (colour-matched photo) and NNN-d.webp (depth
map for the morph); the hero poster hero-1280.webp / hero-720.webp (first photo in the pause duotone, so the page
paints before WebGL starts); and web/src/tour-data.json with the photo order and the morph model of each step.

Usage, from the repo root: python -P web/scripts/tour-assets.py
"""
import json
import pathlib

import numpy as np
from PIL import Image
from skimage.color import lab2rgb, rgb2lab

root = pathlib.Path(__file__).resolve().parents[2]
src = root / 'artifacts' / 'tour' / 'casa'
out = root / 'web' / 'public' / 'casa'
out.mkdir(parents=True, exist_ok=True)
names = sorted(p.stem for p in src.glob('casa-[0-9][0-9][0-9].png'))
pairs = json.loads((src / 'align.json').read_text())
assert len(pairs) == len(names) - 1, 'align.json is stale: run align_seq.py again'

# Chained generation drifts warmer and more saturated. Pull each photo's Lab mean and spread 75 % of the way back to
# the porch photo; the rooftop and the sea at sunset (from photo 350) keep their light.
KEEP_WARM = 350


def stats(rgb):
    lab = rgb2lab(rgb).reshape(-1, 3)
    return lab.mean(0), lab.std(0)


REF = stats(np.asarray(Image.open(src / 'casa-000.png').convert('RGB').resize((512, 341)), dtype=np.float64) / 255)


def normalise(im, strength=0.75):
    lab = rgb2lab(np.asarray(im, dtype=np.float64) / 255)
    mean, std = lab.reshape(-1, 3).mean(0), lab.reshape(-1, 3).std(0)
    lab = (lab - mean) / np.maximum(std, 1e-6) * (std + strength * (REF[1] - std)) + mean + strength * (REF[0] - mean)
    return Image.fromarray((np.clip(lab2rgb(lab), 0, 1) * 255).round().astype(np.uint8))


def duotone(im):
    """Same as the pause filter in src/tour-gl.ts at full strength: navy to cream by luminance, dimmed."""
    c = np.asarray(im, dtype=np.float64) / 255
    l = c @ [0.299, 0.587, 0.114]
    t = np.clip((l - 0.04) / 0.94, 0, 1)
    t = t * t * (3 - 2 * t)
    navy, cream = np.array([0.04, 0.1, 0.17]), np.array([0.93, 0.89, 0.8])
    duo = (navy + (cream - navy) * t[..., None]) * 0.7
    return Image.fromarray((duo * 255).round().astype(np.uint8))


def save(im, name, width, quality):
    im.resize((width, round(width * im.height / im.width)), Image.LANCZOS).save(out / name, 'WEBP', quality=quality, method=6)


for i, n in enumerate(names):
    num = n[5:]
    im = Image.open(src / f'{n}.png').convert('RGB')
    if int(num) < KEEP_WARM:
        im = normalise(im)
    save(im, f'{num}-1280.webp', 1280, 72)
    save(im, f'{num}-720.webp', 720, 70)
    save(Image.open(src / 'depth' / f'{n}-depth.png').convert('RGB'), f'{num}-d.webp', 384, 80)
    if i == 0:
        save(duotone(im), 'hero-1280.webp', 1280, 76)
        save(duotone(im), 'hero-720.webp', 720, 74)

r4 = lambda v: [round(float(x), 4) for x in v]
data = {'frames': [n[5:] for n in names],
        'pairs': [p and {'f': r4(p['f']), 'fwd': r4(p['fwd']), 'bwd': r4(p['bwd'])} for p in pairs]}
(root / 'web' / 'src' / 'tour-data.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
size = lambda pattern: sum(f.stat().st_size for f in out.glob(pattern)) // 1024
print(f'{len(names)} photos, {sum(1 for p in pairs if p)} aligned steps; '
      f'1280: {size("*-1280.webp")} KB, 720: {size("*-720.webp")} KB, depth: {size("*-d.webp")} KB')
