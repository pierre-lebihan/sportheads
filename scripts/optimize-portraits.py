"""Build the mobile portrait atlas from the unchanged original artwork.

Requires Pillow with WebP support only when regenerating artwork; the resulting
atlas is committed, so normal builds and CI require no image dependencies.
"""
import json
from pathlib import Path
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import { AVATAR_SOURCE_FRAMES, PORTRAIT_TILE_SIZE, PORTRAIT_COLUMNS } from './web/players.js'; console.log(JSON.stringify({frames: AVATAR_SOURCE_FRAMES, tile: PORTRAIT_TILE_SIZE, columns: PORTRAIT_COLUMNS}));",
], cwd=ROOT))
frames, TILE, COLUMNS = metadata['frames'], metadata['tile'], metadata['columns']
rows = (len(frames) + COLUMNS - 1) // COLUMNS
atlas = Image.new('RGBA', (TILE * COLUMNS, TILE * rows))
for index, frame in enumerate(frames):
    with Image.open(ROOT / 'web/assets' / frame['file']) as original:
        x, y, w, h = frame['sourceRect']
        bounds = (round(x * original.width), round(y * original.height),
                  round((x + w) * original.width), round((y + h) * original.height))
        portrait = original.convert('RGBA').crop(bounds).resize((TILE, TILE), Image.Resampling.LANCZOS)
        atlas.paste(portrait, ((index % COLUMNS) * TILE, (index // COLUMNS) * TILE))
output = ROOT / 'web/assets/portraits.webp'
atlas.save(output, format='WEBP', lossless=True, method=6)
print(f'{len(frames)} portraits: {atlas.width}x{atlas.height}, {output.stat().st_size} bytes, {atlas.width * atlas.height * 4} decoded bytes')
