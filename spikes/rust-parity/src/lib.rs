//! Feasibility spike: port only collision-free ball integration from Box2D 2.0.2.
//! This is not the game engine, collision solver, AI or a full Box2D port.

const DT: f64 = 1.0 / 96.0;
const GRAVITY_Y: f64 = 300.0;

#[derive(Clone, Copy)]
struct Ball { x: f64, y: f64, vx: f64, vy: f64 }

fn advance(mut ball: Ball, ticks: u32) -> Ball {
    for _ in 0..ticks {
        for _ in 0..3 {
            // Preserve operation order from b2Island.Solve: velocity then position.
            ball.vy += DT * GRAVITY_Y;
            ball.x += DT * ball.vx;
            ball.y += DT * ball.vy;
        }
    }
    ball
}

#[no_mangle]
pub extern "C" fn ball_x(x: f64, y: f64, vx: f64, vy: f64, ticks: u32) -> f64 {
    advance(Ball { x, y, vx, vy }, ticks).x
}

#[no_mangle]
pub extern "C" fn ball_y(x: f64, y: f64, vx: f64, vy: f64, ticks: u32) -> f64 {
    advance(Ball { x, y, vx, vy }, ticks).y
}

#[no_mangle]
pub extern "C" fn ball_vy(x: f64, y: f64, vx: f64, vy: f64, ticks: u32) -> f64 {
    advance(Ball { x, y, vx, vy }, ticks).vy
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn first_tick_matches_recorded_flash_integration() {
        let ball = advance(Ball { x: 400.0, y: 300.0, vx: 75.0, vy: -100.0 }, 1);
        assert_eq!(ball.x, 402.34375);
        assert_eq!(ball.y, 297.0703125);
        assert_eq!(ball.vy, -90.625);
    }
}
