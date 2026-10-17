"""Explicitly regenerate Rust pitch geometry from the captured Flash reference."""
from pathlib import Path
import json
captured = json.loads(Path('tests/fixtures/pitches/original.json').read_text())
assert [pitch['frame'] for pitch in captured['pitches']] == list(range(2, 21))

def number(value):
    return repr(float(value))

lines = [
    '//! Exact static geometry captured from the original playable blueprints.',
    '//! Regenerate: python3 scripts/generate-pitches.py',
    '//! Oracle: tests/fixtures/pitches/original.json; Flash int/uint truncation is preserved.',
    'use crate::{body::Body, math::Vec2, world::World};',
    '',
    'enum Obstacle {',
    '    Circle(f64, f64, f64),',
    '    Box(f64, f64, f64, f64, f64),',
    '}',
    '',
    'const PITCHES: [&[Obstacle]; 19] = [',
]
for pitch in captured['pitches']:
    lines.append(f"    // Blueprint frame {pitch['frame']} (two-player selection {pitch['frame'] - 1}).")
    lines.append('    &[')
    for body in pitch['obstacles']:
        shape = body['shapes'][0]
        assert shape['density'] == 0 and shape['friction'] == .5 and shape['restitution'] == 0 and shape['group'] == 0
        if shape['type'] == 0:
            values = [body['x'], body['y'], shape['radius']]
            variant = 'Circle'
        else:
            vertices = shape['vertices']
            hx, hy = vertices[2]
            assert vertices == [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]
            values = [body['x'], body['y'], hx, hy, body['angle']]
            variant = 'Box'
        lines.append(f"        Obstacle::{variant}({', '.join(map(number, values))}),")
    lines.append('    ],')
lines.extend([
    '];',
    '',
    '/// Append props after the seventeen base match bodies, as onRender does.',
    '/// The original two-player selector exposes blueprint frames 2 through 20.',
    'pub fn spawn(world: &mut World, pitch: u32) {',
    '    let Some(props) = pitch.checked_sub(2).and_then(|i| PITCHES.get(i as usize)) else { return; };',
    '    for prop in *props {',
    '        match *prop {',
    '            Obstacle::Circle(x, y, radius) => {',
    '                world.add_body(Body::circle(Vec2::new(x, y), radius, 0.0, 0.5, 0.0, false));',
    '            }',
    '            Obstacle::Box(x, y, hx, hy, angle) => {',
    '                let position = Vec2::new(x, y);',
    '                let i = world.add_body(Body::rectangle(position, hx, hy, 0.0, 0.5, 0.0, false));',
    '                world.set_transform(i, position, angle);',
    '            }',
    '        }',
    '    }',
    '}',
])
Path('src/pitches.rs').write_text('\n'.join(lines) + '\n')
print('Generated src/pitches.rs from the 19 captured original blueprints')
