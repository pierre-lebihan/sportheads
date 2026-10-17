//! Exact static geometry captured from the original playable blueprints.
//! Regenerate: python3 scripts/generate-pitches.py
//! Oracle: tests/fixtures/pitches/original.json; Flash int/uint truncation is preserved.
use crate::{body::Body, math::Vec2, world::World};

enum Obstacle {
    Circle(f64, f64, f64),
    Box(f64, f64, f64, f64, f64),
}

const PITCHES: [&[Obstacle]; 19] = [
    // Blueprint frame 2 (two-player selection 1).
    &[
        Obstacle::Box(410.0, 133.0, 24.5, 12.5, 1.5733903546989312),
        Obstacle::Circle(410.0, 99.0, 19.0),
        Obstacle::Circle(410.0, 165.0, 19.0),
    ],
    // Blueprint frame 3 (two-player selection 2).
    &[Obstacle::Circle(400.0, 140.0, 40.0)],
    // Blueprint frame 4 (two-player selection 3).
    &[
        Obstacle::Circle(590.0, 200.0, 40.0),
        Obstacle::Circle(230.0, 200.0, 40.0),
    ],
    // Blueprint frame 5 (two-player selection 4).
    &[
        Obstacle::Box(400.0, 30.0, 20.5, 20.5, 0.0),
        Obstacle::Circle(400.0, 55.0, 25.0),
    ],
    // Blueprint frame 6 (two-player selection 5).
    &[
        Obstacle::Circle(670.0, 120.0, 15.0),
        Obstacle::Box(206.0, 160.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(533.0, 198.0, 15.0),
        Obstacle::Box(600.0, 160.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(276.0, 200.0, 15.0),
        Obstacle::Circle(136.0, 120.0, 15.0),
    ],
    // Blueprint frame 7 (two-player selection 6).
    &[
        Obstacle::Circle(400.0, 80.0, 25.0),
        Obstacle::Circle(580.0, 200.0, 25.0),
        Obstacle::Circle(220.0, 200.0, 25.0),
    ],
    // Blueprint frame 8 (two-player selection 7).
    &[],
    // Blueprint frame 9 (two-player selection 8).
    &[
        Obstacle::Circle(400.0, 120.0, 15.0),
        Obstacle::Box(469.0, 160.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(538.0, 200.0, 15.0),
        Obstacle::Box(330.0, 160.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(261.0, 200.0, 15.0),
    ],
    // Blueprint frame 10 (two-player selection 9).
    &[],
    // Blueprint frame 11 (two-player selection 10).
    &[Obstacle::Circle(400.0, 5.0, 150.0)],
    // Blueprint frame 12 (two-player selection 11).
    &[],
    // Blueprint frame 13 (two-player selection 12).
    &[
        Obstacle::Circle(400.0, 120.0, 15.0),
        Obstacle::Box(400.0, 190.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(538.0, 200.0, 15.0),
        Obstacle::Box(260.0, 110.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(261.0, 200.0, 15.0),
    ],
    // Blueprint frame 14 (two-player selection 13).
    &[
        Obstacle::Box(550.0, 179.0, 66.5, 12.5, 1.573388462166497),
        Obstacle::Box(255.0, 171.0, 66.5, 12.5, 1.573388462166497),
    ],
    // Blueprint frame 15 (two-player selection 14).
    &[
        Obstacle::Circle(400.0, 120.0, 15.0),
        Obstacle::Box(653.0, 214.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(530.0, 140.0, 15.0),
        Obstacle::Box(159.0, 213.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(280.0, 140.0, 15.0),
    ],
    // Blueprint frame 16 (two-player selection 15).
    &[
        Obstacle::Circle(390.0, 60.0, 15.0),
        Obstacle::Box(653.0, 214.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(610.0, 270.0, 15.0),
        Obstacle::Box(159.0, 213.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(200.0, 270.0, 15.0),
    ],
    // Blueprint frame 17 (two-player selection 16).
    &[
        Obstacle::Circle(450.0, 214.0, 15.0),
        Obstacle::Circle(510.0, 290.0, 15.0),
        Obstacle::Circle(390.0, 132.0, 15.0),
        Obstacle::Circle(330.0, 214.0, 15.0),
        Obstacle::Circle(280.0, 290.0, 15.0),
    ],
    // Blueprint frame 18 (two-player selection 17).
    &[
        Obstacle::Circle(390.0, 60.0, 15.0),
        Obstacle::Box(510.0, 140.0, 66.5, 12.0, 0.5235840914210356),
        Obstacle::Circle(390.0, 180.0, 15.0),
        Obstacle::Box(267.0, 137.0, 66.5, 12.0, 2.6179822516015756),
        Obstacle::Circle(390.0, 120.0, 15.0),
    ],
    // Blueprint frame 19 (two-player selection 18).
    &[Obstacle::Box(390.0, 110.0, 66.5, 12.0, 2.6179822516015756)],
    // Blueprint frame 20 (two-player selection 19).
    &[Obstacle::Box(394.0, 111.0, 66.5, 12.0, 0.5669407551885389)],
];

/// Append props after the seventeen base match bodies, as onRender does.
/// The original two-player selector exposes blueprint frames 2 through 20.
pub fn spawn(world: &mut World, pitch: u32) {
    let Some(props) = pitch.checked_sub(2).and_then(|i| PITCHES.get(i as usize)) else {
        return;
    };
    for prop in *props {
        match *prop {
            Obstacle::Circle(x, y, radius) => {
                world.add_body(Body::circle(Vec2::new(x, y), radius, 0.0, 0.5, 0.0, false));
            }
            Obstacle::Box(x, y, hx, hy, angle) => {
                let position = Vec2::new(x, y);
                let i = world.add_body(Body::rectangle(position, hx, hy, 0.0, 0.5, 0.0, false));
                world.set_transform(i, position, angle);
            }
        }
    }
}
