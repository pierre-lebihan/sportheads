"""Turn the twelve pro portraits into parodies: bigger noses and ears, plus one gag
prop per parody name. Run once after changing the props, then
scripts/optimize-portraits.py to rebuild the portrait atlas.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'web/assets/modern-players.png'
OUT = ROOT / 'web/assets/modern-players-parody.png'
SS = 4  # supersampling for drawn props

def bulges(cell, items):
    """items: (cx, cy, R, strength) in cell pixels; inverse-mapped magnification."""
    a = np.asarray(cell).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx, sy = xx.copy(), yy.copy()
    for cx, cy, R, s in items:
        dx, dy = sx - cx, sy - cy
        r = np.sqrt(dx * dx + dy * dy)
        f = np.where(r < R, 1 - s * (1 - r / R) ** 2, 1.0)
        sx, sy = cx + dx * f, cy + dy * f
    x0 = np.clip(np.floor(sx).astype(int), 0, w - 2); y0 = np.clip(np.floor(sy).astype(int), 0, h - 2)
    fx = np.clip(sx - x0, 0, 1)[..., None]; fy = np.clip(sy - y0, 0, 1)[..., None]
    p = lambda yo, xo: a[y0 + yo, x0 + xo]
    # premultiplied interpolation keeps transparent edges clean
    def pm(v): return np.concatenate([v[..., :3] * v[..., 3:4] / 255, v[..., 3:4]], -1)
    out = (pm(p(0, 0)) * (1 - fx) * (1 - fy) + pm(p(0, 1)) * fx * (1 - fy) + pm(p(1, 0)) * (1 - fx) * fy + pm(p(1, 1)) * fx * fy)
    al = out[..., 3:4]
    rgb = np.where(al > 0, out[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    return Image.fromarray(np.clip(np.concatenate([rgb, al], -1), 0, 255).astype(np.uint8), 'RGBA')

class Pen:
    def __init__(self, size, k):
        self.k = k * SS  # 300-scale -> supersampled pixels
        self.img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.size = size
    def P(self, pts): return [(x * self.k, y * self.k) for x, y in pts]
    def B(self, x0, y0, x1, y1): return [x0 * self.k, y0 * self.k, x1 * self.k, y1 * self.k]
    def w(self, v): return max(1, round(v * self.k))
    def ellipse(self, cx, cy, rx, ry, fill, ow=3.5, outline=(20, 14, 10, 255)):
        self.d.ellipse(self.B(cx - rx, cy - ry, cx + rx, cy + ry), fill=fill, outline=outline, width=self.w(ow) if ow else 0)
    def poly(self, pts, fill, ow=3.5):
        self.d.polygon(self.P(pts), fill=fill, outline=(20, 14, 10, 255), width=self.w(ow))
    def line(self, pts, fill, width, joint='curve'):
        self.d.line(self.P(pts), fill=fill, width=self.w(width), joint=joint)
    def stroke(self, pts, fill, width, ow=3.0):
        self.line(pts, (20, 14, 10, 255), width + 2 * ow); self.line(pts, fill, width)
        for x, y in (pts[0], pts[-1]):
            self.ellipse(x, y, width / 2 + ow, width / 2 + ow, (20, 14, 10, 255), 0)
            self.ellipse(x, y, width / 2, width / 2, fill, 0)
    def result(self): return self.img.resize((self.size, self.size), Image.Resampling.LANCZOS)

def bezier(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]

# --- props, coordinates in a 300x300 cell ---------------------------------
def mustache(p, cx, cy, span, color=(30, 20, 14, 255)):
    for side in (-1, 1):
        pts = bezier((cx, cy), (cx + side * span * 0.55, cy + 14), (cx + side * span, cy - 6))
        curl = bezier(pts[-1], (cx + side * (span + 14), cy - 24), (cx + side * (span - 6), cy - 20), 10)
        p.stroke(pts + curl[1:], color, 9, 2.5)
    p.ellipse(cx, cy, 9, 7, color, 2.5)

def bulb(p, cx, cy):
    for r, a in ((50, 40), (40, 60), (32, 90)):
        p.ellipse(cx, cy, r, r, (255, 240, 120, a), 0)
    p.poly([(cx - 14, cy + 22), (cx + 14, cy + 22), (cx + 11, cy + 44), (cx - 11, cy + 44)], (170, 170, 180, 255), 3)
    for k in (29, 36):
        p.line([(cx - 13, cy + k), (cx + 13, cy + k)], (90, 90, 100, 255), 2.5)
    p.ellipse(cx, cy, 26, 27, (255, 236, 120, 255), 3.5)
    p.line(bezier((cx - 8, cy + 18), (cx, cy - 12), (cx + 8, cy + 18)), (230, 120, 30, 255), 3)
    for ang in range(200, 341, 35):
        a = math.radians(ang)
        p.stroke([(cx + 36 * math.cos(a), cy + 36 * math.sin(a)), (cx + 48 * math.cos(a), cy + 48 * math.sin(a))], (255, 220, 60, 255), 4, 2)

def plaster(p, cx, cy, ang, L=46, W=16):
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    pts = [(cx + ux * sx * L / 2 + vx * sy * W / 2, cy + uy * sx * L / 2 + vy * sy * W / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    p.poly(pts, (236, 196, 150, 255), 3)
    pad = [(cx + ux * sx * L / 5 + vx * sy * W / 3, cy + uy * sx * L / 5 + vy * sy * W / 3) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    p.poly(pad, (250, 236, 220, 255), 1.5)

def wheat(p, x0, y0, x1, y1):
    p.stroke([(x0, y0), (x1, y1)], (226, 188, 90, 255), 4, 2)
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    for i in range(5):
        t = 0.62 + i * 0.09
        bx, by = x0 + dx * t, y0 + dy * t
        for side in (-1, 1):
            ex, ey = bx + ux * 9 - uy * side * 9, by + uy * 9 + ux * side * 9
            p.ellipse((bx + ex) / 2, (by + ey) / 2, 6, 6, (238, 200, 96, 255), 2)
    p.ellipse(x1 + ux * 4, y1 + uy * 4, 5, 7, (238, 200, 96, 255), 2)

def snout(p, cx, cy):
    p.ellipse(cx, cy, 24, 18, (246, 160, 176, 255), 3.5)
    for s in (-1, 1): p.ellipse(cx + s * 8, cy + 1, 4, 6, (150, 60, 80, 255), 1.5)

def palm(p, cx, cy):
    # tuft of palm fronds sprouting from the top of the head, coconuts at the base
    for ang, L in ((-165, 72), (-132, 66), (-95, 50), (-58, 66), (-15, 72)):
        a = math.radians(ang)
        tip = (cx + L * math.cos(a), cy + L * math.sin(a) * 0.75 + 8)
        mid = (cx + L * 0.5 * math.cos(a), cy + L * math.sin(a) * 0.75 - 14)
        top = bezier((cx, cy), mid, tip, 16)
        n = len(top)
        nx, ny = -math.sin(a), math.cos(a)
        bulge = lambda i: 9 * math.sin(math.pi * i / (n - 1)) ** 0.8
        poly = [(x + nx * bulge(i), y + ny * bulge(i)) for i, (x, y) in enumerate(top)]
        poly += [(x - nx * bulge(i), y - ny * bulge(i)) for i, (x, y) in reversed(list(enumerate(top)))]
        p.poly(poly, (70, 175, 70, 255), 2.5)
        p.line(top[:-2], (40, 120, 45, 255), 1.5)
    for dx in (-9, 9): p.ellipse(cx + dx, cy + 4, 9, 9, (130, 85, 40, 255), 2.5)

def toque(p, cx, top, width):
    for dx, r in ((-width * 0.32, 30), (width * 0.32, 30), (0, 36)):
        p.ellipse(cx + dx, top + 32, r, r, (252, 252, 252, 255), 3.5)
    p.poly([(cx - width * 0.42, top + 40), (cx + width * 0.42, top + 40), (cx + width * 0.48, top + 78), (cx - width * 0.48, top + 78)], (252, 252, 252, 255), 3.5)
    p.line([(cx - width * 0.45, top + 64), (cx + width * 0.45, top + 64)], (210, 210, 215, 255), 2)

def flour(p, cx, cy):
    for dx, dy, r in ((0, 0, 9), (8, 5, 6), (-6, 7, 5), (10, -5, 4)):
        p.ellipse(cx + dx, cy + dy, r, r * 0.8, (255, 255, 255, 190), 0)

def citrus(p, cx, cy, r, rind, flesh, seg, seeds=False):
    p.ellipse(cx, cy, r, r, rind, 3.5)
    p.ellipse(cx, cy, r * 0.82, r * 0.82, flesh, 0)
    for k in range(8):
        a = math.radians(k * 45 + 10)
        p.line([(cx, cy), (cx + r * 0.78 * math.cos(a), cy + r * 0.78 * math.sin(a))], seg, 1.6)
    if seeds:
        p.ellipse(cx, cy, r * 0.28, r * 0.28, (238, 240, 210, 255), 0)
        for k in range(12):
            a = math.radians(k * 30)
            p.ellipse(cx + r * 0.45 * math.cos(a), cy + r * 0.45 * math.sin(a), 1.8, 2.6, (20, 20, 15, 255), 0)
    else:
        p.ellipse(cx, cy, r * 0.14, r * 0.14, seg, 0)

def bear_ears(p, pts):
    for cx, cy in pts:
        p.ellipse(cx, cy, 30, 30, (140, 90, 50, 255), 3.5)
        p.ellipse(cx, cy + 3, 17, 17, (230, 180, 140, 255), 2)

def thermometer(p, x0, y0, x1, y1):
    p.stroke([(x0, y0), (x1, y1)], (235, 240, 250, 255), 9, 2.5)
    p.line([(x0, y0), (x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * 0.6)], (220, 40, 40, 255), 3)
    p.ellipse(x0, y0, 7, 7, (220, 40, 40, 255), 2.5)

def red_nose(p, cx, cy, r=15):
    p.ellipse(cx, cy, r, r, (226, 50, 50, 255), 3.5)
    p.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.22, (255, 200, 200, 230), 0)

def drop(p, cx, cy):
    p.poly([(cx, cy - 10), (cx + 6, cy + 2), (cx, cy + 9), (cx - 6, cy + 2)], (150, 210, 255, 255), 2)

# face data (300-scale): nose tip, ears, extra bulges, prop drawing
FACES = [
    dict(nose=(213, 170), ear=(72, 170), extra=[(150, 245, 70, -0.25)], props=lambda p: mustache(p, 210, 190, 46)),
    dict(nose=(225, 172), ear=(80, 160), extra=[(200, 90, 70, 0.2)], props=lambda p: bulb(p, 110, 52)),
    dict(nose=(200, 185), ear=(65, 185), extra=[], props=lambda p: (plaster(p, 205, 108, 30), plaster(p, 205, 108, -40), plaster(p, 140, 215, 15, 34, 12))),
    dict(nose=(212, 175), ear=(65, 170), extra=[], props=lambda p: wheat(p, 222, 208, 292, 150)),
    dict(nose=(207, 168), ear=(75, 165), extra=[(160, 210, 60, 0.2)], props=lambda p: snout(p, 210, 172)),
    dict(nose=(202, 165), ear=(70, 150), extra=[(160, 90, 70, 0.15)], props=lambda p: palm(p, 152, 40)),
    dict(nose=(205, 170), ear=(55, 155), extra=[], props=lambda p: (toque(p, 160, 6, 150), flour(p, 130, 205), flour(p, 240, 160))),
    dict(nose=(212, 175), ear=(70, 180), extra=[], props=lambda p: (citrus(p, 160, 140, 27, (240, 140, 20, 255), (255, 190, 70, 255), (255, 235, 180, 255)), citrus(p, 232, 140, 24, (240, 140, 20, 255), (255, 190, 70, 255), (255, 235, 180, 255)), p.line([(187, 140), (208, 140)], (20, 14, 10, 255), 4))),
    dict(nose=(215, 160), ear=(75, 150), extra=[(210, 200, 50, 0.2)], props=lambda p: (citrus(p, 165, 118, 28, (120, 85, 45, 255), (130, 190, 60, 255), (200, 230, 150, 255), True), p.line(bezier((140, 135), (110, 190), (120, 240)), (230, 200, 90, 255), 2.5))),
    dict(nose=(197, 157), ear=(55, 150), extra=[], props=lambda p: bear_ears(p, ((95, 45), (235, 40)))),
    dict(nose=(215, 142), ear=(70, 150), extra=[(200, 230, 60, 0.2)], props=lambda p: mustache(p, 212, 160, 42, (25, 18, 12, 255))),
    dict(nose=(196, 147), ear=(55, 145), extra=[], props=lambda p: (red_nose(p, 199, 150, 16), drop(p, 186, 172), thermometer(p, 212, 182, 285, 205))),
]

im = Image.open(SRC).convert('RGBA')
W, H = im.size
out = Image.new('RGBA', (W, H))
for i, f in enumerate(FACES):
    box = (round(i % 4 * W / 4), round(i // 4 * H / 3), round((i % 4 + 1) * W / 4), round((i // 4 + 1) * H / 3))
    cell = im.crop(box)
    k = cell.width / 300
    items = [(f['nose'][0] * k, f['nose'][1] * k, 46 * k, 0.45), (f['ear'][0] * k, f['ear'][1] * k, 34 * k, 0.32)]
    items += [(x * k, y * k, R * k, s) for x, y, R, s in f['extra']]
    warped = bulges(cell, items)
    size = max(cell.size)
    pen = Pen(size, k)
    f['props'](pen)
    layer = pen.result().crop((0, 0) + cell.size)
    warped.alpha_composite(layer)
    out.paste(warped, box[:2])
out.save(OUT)
