"""Builds web/public/email/puerta.gif: a Cuban door opening into a home, for the Auth emails.

Run from the repo root: python infra/email-templates/puerta-gif.py [--scale 1]
Needs Pillow, numpy and ffmpeg on PATH. The room is web/public/interior.jpg («Imagen ilustrativa»).
"""
import argparse, math, subprocess, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / 'web/public/interior.jpg'
OUT = ROOT / 'web/public/email/puerta.gif'

W, H = 480, 400            # design units = display pixels in the email
WHITE, CAL, CASING, SAND = (255, 255, 255), (250, 246, 238), (243, 236, 223), (230, 220, 203)
FLOOR, STEP = (239, 230, 214), (226, 211, 188)
PERSIANA, PERSIANA_DARK, PERSIANA_LIGHT, SLAT = (63, 107, 79), (47, 82, 64), (85, 127, 99), (90, 138, 107)
SOL, TERRACOTA, BLUE = (227, 176, 75), (168, 76, 51), (1, 83, 168)
PANES = [SOL, TERRACOTA, BLUE, TERRACOTA, SOL]   # left to right, then the hub in sol

# Door geometry (design units)
CX, LEAF, DOOR_TOP, DOOR_BOTTOM = 240, 85, 132, 352
X0, X1 = CX - LEAF, CX + LEAF
FAN_Y, FAN_R, HUB_R, CASE = 124, 85, 26, 12
FPS, OPEN_DEG = 15, 82


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def ease(t):
    """cubic-bezier(.22,1,.36,1), solved for x by bisection."""
    p1x, p1y, p2x, p2y = .22, 1, .36, 1
    bez = lambda s, a, b: 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if bez(mid, p1x, p2x) < t else (lo, mid)
    return bez((lo + hi) / 2, p1y, p2y)


def coeffs(dst, src):
    """Pillow PERSPECTIVE coefficients mapping output quad dst onto input quad src."""
    rows, rhs = [], []
    for (x, y), (u, v) in zip(dst, src):
        rows += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        rhs += [u, v]
    return np.linalg.solve(np.array(rows, float), np.array(rhs, float)).tolist()


class Scene:
    def __init__(self, k):
        self.k = k                                  # render pixels per design unit
        self.size = (round(W * k), round(H * k))
        self.bg = self.facade()
        self.room = self.photo()
        self.leaf = self.leaf_texture()

    def u(self, v):
        return round(v * self.k)

    def box(self, x0, y0, x1, y1):
        return [self.u(x0), self.u(y0), self.u(x1), self.u(y1)]

    def facade(self):
        img = Image.new('RGB', self.size, WHITE)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle(self.box(0, 0, W, H), radius=self.u(16), fill=CAL)
        d.rectangle(self.box(0, 360, W, H - 16), fill=FLOOR)
        d.rounded_rectangle(self.box(0, 360, W, H), radius=self.u(16), fill=FLOOR)
        d.rectangle(self.box(0, 360, W, 361), fill=SAND)
        d.rectangle(self.box(X0 - CASE - 10, DOOR_BOTTOM, X1 + CASE + 10, 364), fill=STEP)
        for wx in (40, 370):                        # closed louvered shutters either side
            d.rectangle(self.box(wx - 8, 152, wx + 78, 328), fill=CASING, outline=SAND, width=self.u(1))
            d.rectangle(self.box(wx - 12, 328, wx + 82, 335), fill=CASING, outline=SAND, width=self.u(1))
            for lx in (wx, wx + 36):
                d.rectangle(self.box(lx, 160, lx + 34, 320), fill=PERSIANA)
                for y in range(166, 316, 6):
                    d.rectangle(self.box(lx + 4, y, lx + 30, y + 2), fill=SLAT)
                    d.rectangle(self.box(lx + 4, y + 2, lx + 30, y + 3), fill=PERSIANA_DARK)
        # door casing: arch band and jambs
        d.pieslice(self.box(CX - FAN_R - CASE, FAN_Y - FAN_R - CASE, CX + FAN_R + CASE, FAN_Y + FAN_R + CASE),
                   180, 360, fill=CASING, outline=SAND, width=self.u(1))
        d.rectangle(self.box(X0 - CASE, FAN_Y, X1 + CASE, DOOR_BOTTOM), fill=CASING, outline=SAND, width=self.u(1))
        d.rectangle(self.box(X0 - CASE, FAN_Y - 1, X1 + CASE, FAN_Y + 1), fill=CASING)
        return img

    def photo(self):
        src = Image.open(PHOTO).convert('RGB')
        w, h = self.u(X1) - self.u(X0), self.u(DOOR_BOTTOM) - self.u(DOOR_TOP)
        cw = round(src.height * w / h)
        left = 450 - cw // 2                       # centre on the open balcony doors
        return src.crop((left, 0, left + cw, src.height)).resize((w, h), Image.LANCZOS)

    def leaf_texture(self):
        w, h = self.u(X1) - self.u(CX), self.u(DOOR_BOTTOM) - self.u(DOOR_TOP)
        img = Image.new('RGBA', (w, h), PERSIANA + (255,))
        d = ImageDraw.Draw(img)
        k = self.k
        p = lambda *v: [round(x * k) for x in v]
        d.rectangle([0, 0, w - 1, h - 1], outline=PERSIANA_DARK, width=round(2 * k))
        d.rectangle(p(10, 12, LEAF - 10, 112), fill=PERSIANA_DARK)          # louvered upper panel
        for y in range(16, 108, 6):
            d.rectangle(p(13, y, LEAF - 13, y + 2), fill=SLAT)
        for top, bottom in ((122, 160), (170, 208)):                         # raised lower panels
            d.rectangle(p(10, top, LEAF - 10, bottom), fill=PERSIANA_LIGHT)
            d.rectangle(p(13, top + 3, LEAF - 10, bottom), fill=PERSIANA_DARK)
            d.rectangle(p(13, top + 3, LEAF - 13, bottom - 3), fill=PERSIANA)
        return img

    def fanlight(self, img, lit):
        d = ImageDraw.Draw(img)
        bb = self.box(CX - FAN_R, FAN_Y - FAN_R, CX + FAN_R, FAN_Y + FAN_R)
        for i, colour in enumerate(PANES):
            fill = mix(CAL, colour, .9 if i < lit else .16)
            d.pieslice(bb, 180 + 36 * i, 180 + 36 * (i + 1), fill=fill)
        hub = self.box(CX - HUB_R, FAN_Y - HUB_R, CX + HUB_R, FAN_Y + HUB_R)
        d.pieslice(hub, 180, 360, fill=mix(CAL, SOL, .9 if lit > 5 else .16))
        for i in range(1, 5):
            a = math.radians(180 + 36 * i)
            d.line([self.u(CX + HUB_R * math.cos(a)), self.u(FAN_Y + HUB_R * math.sin(a)),
                    self.u(CX + FAN_R * math.cos(a)), self.u(FAN_Y + FAN_R * math.sin(a))],
                   fill=PERSIANA, width=self.u(4))
        d.arc(hub, 180, 360, fill=PERSIANA, width=self.u(3))
        d.arc(bb, 180, 360, fill=PERSIANA, width=self.u(5))
        d.rectangle(self.box(X0, FAN_Y - 2, X1, DOOR_TOP), fill=PERSIANA)   # transom bar

    def leaves(self, img, deg):
        th = math.radians(deg)
        top, bottom = self.u(DOOR_TOP), self.u(DOOR_BOTTOM)
        eye = top + .55 * (bottom - top)
        shrink = 1 - .1 * math.sin(th)              # the far edge recedes into the room
        w = self.u(X1) - self.u(CX)
        tex = ImageEnhance.Brightness(self.leaf).enhance(1 - .32 * math.sin(th))
        for side, hinge in ((-1, self.u(X0)), (1, self.u(X1))):
            leaf = tex if side < 0 else tex.transpose(Image.FLIP_LEFT_RIGHT)
            inner = hinge - side * w * math.cos(th)
            yt, yb = eye - (eye - top) * shrink, eye + (bottom - eye) * shrink
            src = [(0, 0), (w, 0), (w, leaf.height), (0, leaf.height)]
            if side < 0:
                dst = [(hinge, top), (inner, yt), (inner, yb), (hinge, bottom)]
            else:
                dst = [(inner, yt), (hinge, top), (hinge, bottom), (inner, yb)]
            layer = leaf.transform(self.size, Image.PERSPECTIVE, coeffs(dst, src), Image.BICUBIC)
            img.paste(layer, (0, 0), layer)
            if deg == 0:                            # knob on the inner edge, only while closed
                d = ImageDraw.Draw(img)
                kx = CX + side * 7
                d.ellipse(self.box(kx - 3.5, 238, kx + 3.5, 245), fill=SOL)

    def frame(self, lit, deg):
        img = self.bg.copy()
        img.paste(self.room, (self.u(X0), self.u(DOOR_TOP)))
        self.leaves(img, deg)
        self.fanlight(img, lit)
        return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=1, help='output pixels per display pixel')
    ap.add_argument('--colors', type=int, default=128)
    ap.add_argument('--review', help='folder to save key frames as PNG')
    args = ap.parse_args()
    scene = Scene(args.scale * 2)                   # 2x supersampling, then downscale
    out_size = (round(W * args.scale), round(H * args.scale))
    states = [(0, 0)] * 6                           # closed, panes dark: Outlook's still frame
    for lit in range(1, 7):
        states += [(lit, 0)] * 2                    # pane by pane
    states += [(6, 0)]
    steps = round(1.2 * FPS)
    states += [(6, OPEN_DEG * ease(i / steps)) for i in range(1, steps + 1)]
    with tempfile.TemporaryDirectory() as tmp:
        for i, (lit, deg) in enumerate(states):
            scene.frame(lit, deg).resize(out_size, Image.LANCZOS).save(f'{tmp}/{i:03d}.png')
        OUT.parent.mkdir(parents=True, exist_ok=True)
        graph = (f'split[a][b];[a]palettegen=max_colors={args.colors}:stats_mode=full[p];'
                 '[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', f'{tmp}/%03d.png',
                        '-vf', graph, '-loop', '-1', str(OUT)], check=True)
        if args.review:                             # key frames to look at
            for i in (0, 13, 26, len(states) - 1):
                Image.open(f'{tmp}/{i:03d}.png').save(Path(args.review) / f'puerta-{i:02d}.png')
    print(f'{OUT} {OUT.stat().st_size // 1024} KB, {len(states)} frames, {out_size[0]}x{out_size[1]}')


if __name__ == '__main__':
    main()
