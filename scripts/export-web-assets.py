"""Export original SWF graphics/audio as standalone browser assets; no Flash runtime.

Run once with the local reference and JPEXS installed. Generated assets are checked
in, so normal web builds never need the original SWF or a Java installation.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SPRITES = {
    'heads': 312, 'foot-right': 315, 'foot-left': 318, 'goal': 145,
    'body-right': 85, 'body-left': 84, 'body-effect': 80, 'speed-bolt': 83,
    'ball': 89, 'ball-inside': 88, 'bomb': 75, 'streaker': 26,
    'streaker-head': 139, 'explosion': 66, 'dust': 72,
    'ring': 109, 'ring-good': 97, 'ring-bad': 94, 'trail': 99,
    'background': 335, 'stadium': 333, 'blueprints': 505,
    'ground': 117, 'ground-blinker': 532, 'shadow': 578,
    'counter': 538, 'goal-words': 543,
    'pu-1': 165, 'pu-2': 164, 'pu-3': 161, 'pu-4': 160,
    'pu-5': 157, 'pu-6': 156, 'pu-7': 147, 'pu-8': 146,
    'pu-9': 153, 'pu-10': 150, 'pu-11': 149, 'pu-12': 141,
    'pu-13': 148, 'pu-14': 132, 'pu-15': 131, 'pu-16': 128,
    'pu-17': 123, 'pu-18': 140,
}
SHAPES = {'bottom-bar': 502}
IMAGES = {'ground-texture': (110, 789, 22)}
SOUNDS = {
    'music-match': 1, 'music-menu': 2, 'whistle': 3, 'pop': 4,
    'kick': 5, 'jump': 6, 'explosion': 7, 'die': 8, 'coin': 9, 'cheer': 10,
}
EVENTS = {
    'explosion': [{'frame': 21, 'event': 'remove'}],
    'ring': [{'frame': 10, 'event': 'remove'}],
    'ring-good': [{'frame': 10, 'event': 'remove'}],
    'ring-bad': [{'frame': 10, 'event': 'remove'}],
    'counter': [{'frame': 1, 'event': 'stop'}, {'frame': 90, 'event': 'unpause-and-hide'}],
    'heads': [{'frame': 1, 'event': 'stop'}, {'frame': 11, 'event': 'stop'}],
}
SVG = '{http://www.w3.org/2000/svg}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--swf', type=Path, default=ROOT / 'reference/original.swf')
    parser.add_argument('--ffdec', type=Path, default=ROOT / 'tools/ffdec/ffdec.jar')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/assets')
    args = parser.parse_args()
    output = args.output
    cache = ROOT / 'evidence/web-asset-export'
    cache.mkdir(parents=True, exist_ok=True)
    ids = sorted(set(SPRITES.values()) | set(SHAPES.values()) | set(SOUNDS.values()) | {value[0] for value in IMAGES.values()})
    with (cache / 'export.log').open('w') as log:
        subprocess.run([
            'java', '-Djava.awt.headless=true', '-jar', str(args.ffdec),
            '-format', 'sprite:svg,shape:svg,sound:mp3_wav,image:png',
            '-selectid', ','.join(map(str, ids)), '-export', 'sprite,shape,sound,image',
            str(cache), str(args.swf),
        ], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'sprites').mkdir(exist_ok=True)
    (output / 'sounds').mkdir(exist_ok=True)
    manifest = {
        'version': 1, 'fps': 30,
        'sourceSha256': hashlib.sha256(args.swf.read_bytes()).hexdigest(),
        'source': 'Sports Heads Football European Edition; original local SWF assets',
        'sprites': {}, 'sounds': {},
    }
    seen = {}

    def svg_frame(source, name, number):
        text = source.read_text()
        root = ET.fromstring(text)
        width = float(root.get('width', '0').removesuffix('px'))
        height = float(root.get('height', '0').removesuffix('px'))
        group = root.find(SVG + 'g')
        matrix = re.search(r'matrix\(([^)]+)\)', group.get('transform', '') if group is not None else '')
        values = [float(v.strip()) for v in matrix[1].split(',')] if matrix else [1, 0, 0, 1, 0, 0]
        # FFDec shifts its exported crop to a positive raster origin. Retain that
        # registration point for position/rotation matching the Flash MovieClip.
        origin_x, origin_y = values[4:6]
        text = text.replace('<svg ', f'<svg viewBox="0 0 {width} {height}" ', 1)
        # SVGs must remain self-contained and safe to decode as canvas images.
        references = re.findall(r'(?:xlink:href|href)="([^"]+)"', text)
        assert all(ref.startswith(('#', 'data:')) for ref in references), source
        digest = hashlib.sha256(text.encode()).hexdigest()
        file = seen.get(digest)
        if file is None:
            file = f'sprites/{name}-{number:03}.svg'
            (output / file).write_text(text)
            seen[digest] = file
        return {'file': file, 'width': width, 'height': height, 'originX': origin_x, 'originY': origin_y}

    for name, character_id in SPRITES.items():
        folders = list((cache / 'sprites').glob(f'DefineSprite_{character_id}')) + list((cache / 'sprites').glob(f'DefineSprite_{character_id}_*'))
        assert len(folders) == 1, (name, folders)
        sources = sorted(folders[0].glob('*.svg'), key=lambda p: int(p.stem))
        assert sources, name
        manifest['sprites'][name] = {
            'characterId': character_id,
            'frames': [svg_frame(file, name, int(file.stem)) for file in sources],
            'events': EVENTS.get(name, []),
        }
    for name, character_id in SHAPES.items():
        source = cache / 'shapes' / f'{character_id}.svg'
        manifest['sprites'][name] = {'characterId': character_id, 'frames': [svg_frame(source, name, 1)], 'events': []}
    for name, (character_id, width, height) in IMAGES.items():
        destination = f'sprites/{name}.png'
        shutil.copyfile(cache / 'images' / f'{character_id}.png', output / destination)
        manifest['sprites'][name] = {'characterId': character_id, 'events': [], 'frames': [{
            'file': destination, 'width': width, 'height': height,
            'originX': width / 2, 'originY': height / 2,
        }]}
    for name, character_id in SOUNDS.items():
        sources = list((cache / 'sounds').glob(f'{character_id}_*'))
        assert len(sources) == 1, (name, sources)
        destination = f'sounds/{name}{sources[0].suffix}'
        shutil.copyfile(sources[0], output / destination)
        manifest['sounds'][name] = destination
    (output / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f"Exported {len(manifest['sprites'])} sprites, {sum(len(v['frames']) for v in manifest['sprites'].values())} frames, {len(SOUNDS)} sounds")


if __name__ == '__main__':
    main()
