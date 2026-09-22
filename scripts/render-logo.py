"""Derive every brand asset from the flat blue-on-white logo artwork.

Usage: python scripts/render-logo.py <logo.png|logo.webp>

Outputs (assets/): karmahouse-logo.png (full logo, transparent), karmahouse-mark.png
(symbol only), karmahouse-icon.png (1024 app icon, white symbol on brand blue),
karmahouse-favicon.png (64), karmahouse-notification.png (96, white silhouette).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BLUE = (1, 83, 168)  # median of the solid artwork pixels; also colors.primary in src/theme.ts
ROOT = Path(__file__).resolve().parent.parent / 'assets'


def alpha_mask(rgb: np.ndarray) -> np.ndarray:
    """Blue-on-white art: recover coverage from the green channel (white 255, blue 83)."""
    green = rgb[:, :, 1].astype(float)
    alpha = np.clip((255 - green) / (255 - BLUE[1]), 0, 1)
    alpha[alpha < 0.02] = 0  # background texture noise
    return alpha


def tint(alpha: np.ndarray, color) -> Image.Image:
    out = np.zeros(alpha.shape + (4,), dtype=np.uint8)
    out[..., :3] = color
    out[..., 3] = np.round(alpha * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def trim(alpha: np.ndarray):
    rows = np.where((alpha > 0.1).any(axis=1))[0]
    cols = np.where((alpha > 0.1).any(axis=0))[0]
    return rows.min(), rows.max() + 1, cols.min(), cols.max() + 1


def fit(image: Image.Image, canvas: int, fraction: float, background) -> Image.Image:
    """Scale image to `fraction` of the canvas width, centered, over background (None keeps alpha)."""
    scale = canvas * fraction / image.width
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), background or (0, 0, 0, 0))
    out.alpha_composite(resized, ((canvas - resized.width) // 2, (canvas - resized.height) // 2))
    return out


def main(source: str) -> None:
    alpha = alpha_mask(np.array(Image.open(source).convert('RGB')))
    y0, y1, x0, x1 = trim(alpha)
    logo = alpha[y0:y1, x0:x1]
    # Symbol sits above the wordmark; split on the first horizontal gap of blank rows.
    filled = (logo > 0.1).any(axis=1)
    gap = next(i for i in range(1, len(filled)) if filled[i - 1] and not filled[i])
    mark = logo[:gap]
    my0, my1, mx0, mx1 = trim(mark)
    mark = mark[my0:my1, mx0:mx1]

    tint(logo, BLUE).save(ROOT / 'karmahouse-logo.png', optimize=True)
    blue_mark = tint(mark, BLUE)
    blue_mark.resize((384, round(384 * mark.shape[0] / mark.shape[1])), Image.LANCZOS).save(ROOT / 'karmahouse-mark.png', optimize=True)
    white_mark = tint(mark, (255, 255, 255))
    fit(white_mark, 1024, 0.58, BLUE + (255,)).save(ROOT / 'karmahouse-icon.png', optimize=True)
    fit(blue_mark, 64, 0.9, None).save(ROOT / 'karmahouse-favicon.png', optimize=True)
    fit(white_mark, 96, 0.9, None).save(ROOT / 'karmahouse-notification.png', optimize=True)
    print(f'logo {logo.shape[1]}x{logo.shape[0]}  mark {mark.shape[1]}x{mark.shape[0]}  ratio {mark.shape[1] / mark.shape[0]:.3f}')


if __name__ == '__main__':
    main(sys.argv[1])
