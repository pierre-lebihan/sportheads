"""Draw the home-screen icons from the favicon's ball. Requires Pillow."""
from math import cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BLUE, WHITE, SIZE = (36, 72, 117, 255), (255, 255, 255, 255), 1024


def icon(ball):
    # Maskable icons keep their content inside the central 80 % safe zone.
    image = Image.new('RGBA', (SIZE, SIZE), BLUE)
    draw = ImageDraw.Draw(image)
    centre, radius = SIZE / 2, SIZE * ball / 2
    draw.ellipse((centre - radius, centre - radius, centre + radius, centre + radius), fill=WHITE)
    pentagon = [(centre + radius * .5 * cos(-pi / 2 + i * 2 * pi / 5), centre + radius * .5 * sin(-pi / 2 + i * 2 * pi / 5)) for i in range(5)]
    draw.polygon(pentagon, fill=BLUE)
    for x, y in pentagon:
        draw.line((x, y, centre + (x - centre) * 2, centre + (y - centre) * 2), fill=BLUE, width=round(SIZE * .03))
    return image


for name, ball, size in (('icon-192.png', .82, 192), ('icon-512.png', .82, 512), ('maskable-512.png', .62, 512), ('apple-touch-icon.png', .72, 180)):
    icon(ball).resize((size, size), Image.Resampling.LANCZOS).convert('RGB').save(ROOT / 'web/icons' / name, optimize=True)
