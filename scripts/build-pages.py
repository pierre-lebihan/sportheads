"""Package only the comparison bench and its recorded numeric test results."""
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
(site / 'index.html').write_text(html)
# Omit runtime diagnostics; publish only numeric scenes and measured results.
public_report = {key: report[key] for key in ('scope', 'tolerance', 'cases', 'unexpectedErrors')}
(site / 'data/physics-parity.json').write_text(json.dumps(public_report, separators=(',', ':'), allow_nan=False))
(site / '.nojekyll').touch()
print(f'Packaged {len(report["cases"])} validated replays in {site.name}/')
