"""Package the playable WASM match and the recorded comparison bench."""
import json
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
for filename in ('index.html', 'game.js', 'game.css', 'render.js', 'rooms.js', 'net-state.js', 'selection.js', 'players.js', 'touch-controls.js', 'balance.js', 'arena-ui.js', 'setup-ui.js'):
    shutil.copyfile(root / 'web' / filename, site / filename)
manifest=json.loads((root/'web/assets/manifest.json').read_text())
for sprite in manifest['sprites'].values():
    for frame in sprite['frames']:
        if not (root/'web/assets'/frame['file']).is_file():
            raise SystemExit(f"Missing sprite frame: {frame['file']}")
for sound in manifest['sounds'].values():
    if not (root/'web/assets'/sound).is_file():
        raise SystemExit(f"Missing sound: {sound}")
shutil.copytree(root / 'web/assets', site / 'assets')
shutil.copytree(root / 'web/vendor', site / 'vendor')
shutil.copyfile(root / 'probe/physics-core.wasm', site / 'physics-core.wasm')
# Omit runtime diagnostics; publish only numeric scenes and measured results.
public_report = {key: report[key] for key in ('scope', 'tolerance', 'cases', 'unexpectedErrors')}
(site / 'data/physics-parity.json').write_text(json.dumps(public_report, separators=(',', ':'), allow_nan=False))
(site / '.nojekyll').touch()
print(f'Packaged {len(report["cases"])} validated replays in {site.name}/')
