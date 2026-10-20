"""Package the playable WASM match and the recorded comparison bench."""
import json
import os
import re
import hashlib
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'evidence/physics-parity.json').read_text())
if report['unexpectedErrors'] or not report['cases'] or any(not c['passed'] for c in report['cases']):
    raise SystemExit('Publication refused: physics comparison did not pass')
for case in report['cases']:
    if len(case['flash']) != case['spec']['ticks'] + 1 or len(case['rust']) != len(case['flash']):
        raise SystemExit('Publication refused: incomplete replay')

site = root / '_site'
if site.exists():
    shutil.rmtree(site)
(site / 'data').mkdir(parents=True)
html = (root / 'probe/physics.html').read_text()
replacements = {
    '/evidence/physics-parity.json': './data/physics-parity.json',
    '<a href="/probe/?file=instrumented&amp;boot=play">Ouvrir la référence du jeu</a>':
        '<a href="https://github.com/pierre-lebihan/sportheads">Code source sur GitHub</a>',
    '/docs/physics-progress.md': 'https://github.com/pierre-lebihan/sportheads/blob/main/docs/physics-progress.md',
}
for old, new in replacements.items():
    if html.count(old) != 1:
        raise SystemExit(f'Expected exactly one occurrence of {old}')
    html = html.replace(old, new)
(site / 'physics.html').write_text(html)
browser_files = ('index.html', 'compat.js', 'game.js', 'game.css', 'render.js', 'rooms.js', 'ice-diagnostics.js', 'ice-signaling.js', 'ice-servers.js', 'net-state.js', 'net-render.js', 'selection.js', 'players.js', 'roster-access.js', 'touch-controls.js', 'touch-layout.js', 'bonuses.js', 'balance.js', 'balance-ui.js', 'arena-ui.js', 'setup-ui.js', 'opponent.js', 'engine-contract.js', 'assets.js', 'app-state.js', 'game-ui.js', 'room-session.js', 'planner.js', 'planner-runtime.js', 'planner-worker.js', 'performance.js', 'fixed-step.js', 'tick-blend.js', 'frame-pacing.js', 'performance-ui.js', 'engine-view.js', 'manifest.webmanifest', 'terrains.html', 'terrains.js', 'pitch-geometry.js')
# Optional TURN credential service (see relay/). It is a public URL, not a secret.
turn_url = os.environ.get('SPORTHEADS_TURN_URL', '').strip()
if turn_url and not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::\d+)?(?:/[A-Za-z0-9._~/-]*)?', turn_url):
    raise SystemExit('SPORTHEADS_TURN_URL must be a plain https:// URL')
def web_source(name):
    data = (root / 'web' / name).read_bytes()
    if name == 'ice-servers.js' and turn_url:
        data, count = re.subn(rb"^export const TURN_CREDENTIALS_URL = '[^']*';$",
            f"export const TURN_CREDENTIALS_URL = '{turn_url}';".encode(), data, flags=re.M)
        if count != 1:
            raise SystemExit('TURN URL constant not found in ice-servers.js')
    return data
# Every app module uses the same revision, including its transitive imports.
# A refreshed page must not mix a new UI with cached networking code.
revision = hashlib.sha256(b''.join(web_source(name) for name in browser_files)
    + (root / 'probe/physics-core.wasm').read_bytes()
    + (root / 'web/assets/manifest.json').read_bytes() + (root / 'web/assets/runtime.json').read_bytes()
    + (root / 'web/assets/portraits.webp').read_bytes()).hexdigest()[:12]
for filename in browser_files:
    source = web_source(filename).decode()
    if filename.endswith(('.js', '.html')):
        for quote in ("'", '"'):
            source = source.replace(f'{quote}./physics-core.wasm{quote}', f'{quote}./physics-core.wasm?v={revision}{quote}')
        for dependency in browser_files:
            if dependency.endswith(('.js', '.css')):
                for quote in ("'", '"'):
                    source = source.replace(f'{quote}./{dependency}{quote}', f'{quote}./{dependency}?v={revision}{quote}')
    (site / filename).write_text(source)
manifest = json.loads((root / 'web/assets/manifest.json').read_text())
catalogue = json.loads((root / 'web/assets/runtime.json').read_text())
# Archive originals in Git, but publish only graphics reachable by the game.
names = {spec if isinstance(spec, str) else spec['sprite'] for spec in catalogue['boot'] + catalogue['common'] + catalogue['bonuses']}
manifest['sprites'] = {name: sprite for name, sprite in manifest['sprites'].items() if name in names}
files = {frame['file'] for sprite in manifest['sprites'].values() for frame in sprite['frames']}
files.update(manifest['sounds'].values())
files.update(['runtime.json', catalogue['portraitAtlas']])
(site / 'assets').mkdir()
for filename in sorted(files):
    source = root / 'web/assets' / filename
    if not source.is_file():
        raise SystemExit(f'Missing runtime asset: {filename}')
    destination = site / 'assets' / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
(site / 'assets/manifest.json').write_text(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False))
shutil.copytree(root / 'web/vendor', site / 'vendor')
shutil.copytree(root / 'web/icons', site / 'icons')
# Precache what a match needs offline, with the exact URLs the page requests:
# modules and images carry ?v=revision, sounds and vendor code do not. Music
# is cached when first played, so the install stays light on mobile data.
offline = ['./', 'manifest.webmanifest', f'physics-core.wasm?v={revision}', 'vendor/peerjs-1.5.5.min.js']
offline += [f'{name}?v={revision}' for name in browser_files if name.endswith(('.js', '.css')) and not name.startswith('terrains')]
offline += [f'icons/{icon.name}' for icon in sorted((root / 'web/icons').iterdir())]
match_frames = {frame['file'] for spec in catalogue['boot'] + catalogue['common'] + catalogue['bonuses']
    for frame in (manifest['sprites'][spec]['frames'] if isinstance(spec, str)
        else [manifest['sprites'][spec['sprite']]['frames'][number - 1] for number in spec['frames']])}
offline += [f'assets/{name}?v={revision}' for name in sorted(match_frames | {'manifest.json', 'runtime.json', catalogue['portraitAtlas']})]
offline += [f'assets/{name}' for name in sorted(manifest['sounds'].values()) if not Path(name).name.startswith('music-')]
worker = (root / 'web/sw.js').read_text()
for old, new in (("REVISION = 'dev'", f"REVISION = '{revision}'"), ('FILES = []', 'FILES = ' + json.dumps(offline))):
    if worker.count(old) != 1:
        raise SystemExit(f'Expected exactly one occurrence of {old} in sw.js')
    worker = worker.replace(old, new)
(site / 'sw.js').write_text(worker)
shutil.copyfile(root / 'probe/physics-core.wasm', site / 'physics-core.wasm')
# Omit runtime diagnostics; publish only numeric scenes and measured results.
public_report = {key: report[key] for key in ('scope', 'tolerance', 'cases', 'unexpectedErrors')}
(site / 'data/physics-parity.json').write_text(json.dumps(public_report, separators=(',', ':'), allow_nan=False))
(site / '.nojekyll').touch()
print(f'Packaged {len(report["cases"])} validated replays in {site.name}/' + (f' with TURN override {turn_url}' if turn_url else ''))
