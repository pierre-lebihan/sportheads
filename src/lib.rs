//! The Rust game core. Browser-independent and shared by native and WASM builds.
//! Local two-player rules, eighteen original bonuses and Box2D-style physics.
pub mod body;
pub mod broadphase;
pub mod collision;
pub mod contact;
pub mod continuous;
pub mod game;
pub mod joint;
pub mod math;
pub mod pitches;
mod polygon;
pub mod powerups;
pub mod world;

use body::Body;
use math::Vec2;
use std::cell::RefCell;
use world::World;
thread_local! {static WORLD:RefCell<World>=RefCell::new(World::new(Vec2::default()));}

#[no_mangle]
pub extern "C" fn core_reset(gx: f64, gy: f64) {
    WORLD.with(|w| {
        let mut world = World::new(Vec2::new(gx, gy));
        world.continuous = false;
        world.allow_sleep = false;
        *w.borrow_mut() = world;
    });
}
#[no_mangle]
pub extern "C" fn core_circle(
    x: f64,
    y: f64,
    r: f64,
    density: f64,
    friction: f64,
    restitution: f64,
    fixed: u32,
    vx: f64,
    vy: f64,
    omega: f64,
) -> u32 {
    WORLD.with(|w| {
        let mut b = Body::circle(
            Vec2::new(x, y),
            r,
            density,
            friction,
            restitution,
            fixed != 0,
        );
        b.velocity = Vec2::new(vx, vy);
        b.omega = omega;
        w.borrow_mut().add_body(b) as u32
    })
}
#[no_mangle]
pub extern "C" fn core_box(
    x: f64,
    y: f64,
    hx: f64,
    hy: f64,
    angle: f64,
    density: f64,
    friction: f64,
    restitution: f64,
    fixed: u32,
    vx: f64,
    vy: f64,
    omega: f64,
) -> u32 {
    WORLD.with(|w| {
        let mut b = Body::rectangle(
            Vec2::new(x, y),
            hx,
            hy,
            density,
            friction,
            restitution,
            fixed != 0,
        );
        b.set_transform(Vec2::new(x, y), angle);
        b.velocity = Vec2::new(vx, vy);
        b.omega = omega;
        w.borrow_mut().add_body(b) as u32
    })
}
#[no_mangle]
pub extern "C" fn core_joint(a: u32, b: u32, x: f64, y: f64, torque: f64) -> u32 {
    WORLD.with(|w| {
        w.borrow_mut()
            .add_joint(a as usize, b as usize, Vec2::new(x, y), torque) as u32
    })
}
#[no_mangle]
pub extern "C" fn core_motor(index: u32, speed: f64) {
    WORLD.with(|w| {
        let mut w = w.borrow_mut();
        let j = &mut w.joints[index as usize];
        j.motor_speed = speed;
        let (a, b) = (j.a, j.b);
        w.bodies[a].wake();
        w.bodies[b].wake();
    });
}
#[no_mangle]
pub extern "C" fn core_joint_angle(index: u32) -> f64 {
    WORLD.with(|w| {
        let w = w.borrow();
        w.joints[index as usize].angle(&w.bodies)
    })
}
#[no_mangle]
pub extern "C" fn core_joint_anchor_error(index: u32) -> f64 {
    WORLD.with(|w| {
        let w = w.borrow();
        let j = &w.joints[index as usize];
        let a = w.bodies[j.a].world_point(j.local_a);
        let b = w.bodies[j.b].world_point(j.local_b);
        (b - a).length()
    })
}
#[no_mangle]
pub extern "C" fn core_tick() {
    WORLD.with(|w| w.borrow_mut().tick());
}
#[no_mangle]
pub extern "C" fn core_body_value(index: u32, field: u32) -> f64 {
    WORLD.with(|w| {
        let w = w.borrow();
        let b = &w.bodies[index as usize];
        match field {
            0 => b.position.x,
            1 => b.position.y,
            2 => b.velocity.x,
            3 => b.velocity.y,
            4 => b.angle,
            5 => b.omega,
            6 => b.mass,
            7 => b.inertia,
            _ => f64::NAN,
        }
    })
}

thread_local! {
    static VERTICES:RefCell<Vec<Vec2>> = const { RefCell::new(Vec::new()) };
    static GAME:RefCell<game::Game> = RefCell::new(game::Game::new(1));
}
#[no_mangle]
pub extern "C" fn core_settings(continuous: u32, sleeping: u32) {
    WORLD.with(|w| {
        let mut w = w.borrow_mut();
        w.continuous = continuous != 0;
        w.allow_sleep = sleeping != 0;
    });
}
#[no_mangle]
pub extern "C" fn core_body_flags(i: u32, group: i32, bullet: u32, allow_sleep: u32) {
    WORLD.with(|w| {
        let mut w = w.borrow_mut();
        let b = &mut w.bodies[i as usize];
        b.group = group;
        b.bullet = bullet != 0;
        b.allow_sleep = allow_sleep != 0;
        w.refilter(i as usize);
    });
}
#[no_mangle]
pub extern "C" fn core_vertex(x: f64, y: f64) {
    VERTICES.with(|v| v.borrow_mut().push(Vec2::new(x, y)));
}
#[no_mangle]
pub extern "C" fn core_polygon(
    x: f64,
    y: f64,
    angle: f64,
    density: f64,
    friction: f64,
    restitution: f64,
    fixed: u32,
) -> u32 {
    let vertices = VERTICES.with(|v| std::mem::take(&mut *v.borrow_mut()));
    WORLD.with(|w| {
        let mut w = w.borrow_mut();
        let mut b = Body::polygon(
            Vec2::new(x, y),
            vertices,
            density,
            friction,
            restitution,
            fixed != 0,
        );
        b.set_transform(Vec2::new(x, y), angle);
        w.add_body(b) as u32
    })
}
#[no_mangle]
pub extern "C" fn core_velocity(i: u32, vx: f64, vy: f64, omega: f64) {
    WORLD.with(|w| {
        let mut w = w.borrow_mut();
        let b = &mut w.bodies[i as usize];
        b.velocity = Vec2::new(vx, vy);
        b.omega = omega;
        b.wake();
    });
}
#[no_mangle]
pub extern "C" fn core_sleeping(i: u32) -> u32 {
    WORLD.with(|w| w.borrow().bodies[i as usize].sleeping as u32)
}
#[no_mangle]
pub extern "C" fn game_reset(seed: u32) {
    GAME.with(|g| *g.borrow_mut() = game::Game::new(seed));
}
#[no_mangle]
pub extern "C" fn game_tick(keys: u32) {
    GAME.with(|g| g.borrow_mut().step(keys));
}
#[no_mangle]
pub extern "C" fn game_value(field: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        match field {
            0 => g.phase as u32 as f64,
            1 => g.remaining_ticks as f64,
            2 => g.score[0] as f64,
            3 => g.score[1] as f64,
            4 => g.countdown as f64,
            5 => g.last_scorer.map_or(-1.0, |s| s as f64),
            6 => g.tick_number as f64,
            7 => g.sounds as f64,
            8 => g.powerups.goal_height[0] as f64,
            9 => g.powerups.goal_height[1] as f64,
            10 => g.notice as f64,
            11 => g.notice_ticks as f64,
            12 => g.mode as f64,
            13 => g.powerups.bounce as f64,
            14 => g.target_score as f64,
            15 => g.pitch as f64,
            _ => f64::NAN,
        }
    })
}
#[no_mangle]
pub extern "C" fn game_body_count() -> u32 {
    GAME.with(|g| g.borrow().world.bodies.len() as u32)
}
#[no_mangle]
pub extern "C" fn game_body_value(i: u32, field: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        let b = &g.world.bodies[i as usize];
        match field {
            0 => b.position.x,
            1 => b.position.y,
            2 => b.velocity.x,
            3 => b.velocity.y,
            4 => b.angle,
            5 => b.omega,
            6 => b.mass,
            7 => b.inertia,
            8 => match b.shape {
                body::Shape::Circle { radius } => radius,
                _ => 0.0,
            },
            9 => {
                if i as usize == g.player[0] {
                    1.0
                } else if i as usize == g.player[1] {
                    2.0
                } else if i as usize == g.ball {
                    3.0
                } else if i as usize == g.foot[0] {
                    4.0
                } else if i as usize == g.foot[1] {
                    5.0
                } else if Some(i as usize) == g.streaker {
                    6.0
                } else {
                    0.0
                }
            }
            10 => b.active as u32 as f64,
            _ => f64::NAN,
        }
    })
}
#[no_mangle]
pub extern "C" fn game_vertex_count(i: u32) -> u32 {
    GAME.with(|g| match &g.borrow().world.bodies[i as usize].shape {
        body::Shape::Polygon { vertices, .. } => vertices.len() as u32,
        _ => 0,
    })
}
#[no_mangle]
pub extern "C" fn game_vertex_value(i: u32, j: u32, axis: u32) -> f64 {
    GAME.with(|g| match &g.borrow().world.bodies[i as usize].shape {
        body::Shape::Polygon { vertices, .. } => {
            let v = vertices[j as usize];
            if axis == 0 {
                v.x
            } else {
                v.y
            }
        }
        _ => f64::NAN,
    })
}

/// Deterministic setup used only by the original-game differential harness.
#[no_mangle]
pub extern "C" fn game_probe_start(x: f64, y: f64, vx: f64, vy: f64) {
    game_probe_pitch_start(x, y, vx, vy, 8);
}

#[no_mangle]
pub extern "C" fn game_probe_pitch_start(x: f64, y: f64, vx: f64, vy: f64, pitch: u32) {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        *g = game::Game::score_match_on(123, 7, false, pitch);
        g.mode = 0;
        g.phase = game::Phase::Playing;
        g.countdown = 0;
        let i = g.ball;
        g.world.bodies[i].set_transform(Vec2::new(x, y), 0.0);
        g.world.bodies[i].velocity = Vec2::new(vx, vy);
    });
}

#[no_mangle]
pub extern "C" fn game_contact_count() -> u32 {
    GAME.with(|g| g.borrow().world.contact_pairs().len() as u32)
}
#[no_mangle]
pub extern "C" fn game_contact_value(i: u32, f: u32) -> u32 {
    GAME.with(|g| {
        let g = g.borrow();
        let (a, b, n) = g.world.contact_pairs()[i as usize];
        match f {
            0 => a as u32,
            1 => b as u32,
            _ => n as u32,
        }
    })
}

thread_local! {static PU_PROBE:RefCell<powerups::Powerups>=RefCell::new(powerups::Powerups::new());}
#[no_mangle]
pub extern "C" fn pu_probe_reset() {
    PU_PROBE.with(|p| *p.borrow_mut() = powerups::Powerups::new());
}
#[no_mangle]
pub extern "C" fn pu_probe_apply(kind: u32, side: u32) {
    PU_PROBE.with(|p| {
        if let Some(k) = powerups::Kind::from_id(kind) {
            p.borrow_mut().apply(k, side as usize);
        }
    });
}
#[no_mangle]
pub extern "C" fn pu_probe_tick() {
    PU_PROBE.with(|p| {
        p.borrow_mut().step();
    });
}
#[no_mangle]
pub extern "C" fn pu_probe_value(f: u32) -> f64 {
    PU_PROBE.with(|p| {
        let p = p.borrow();
        let t = &p.timers;
        match f {
            0..=1 => p.speed[f as usize] as f64,
            2..=3 => p.jump[f as usize - 2] as f64,
            4..=5 => p.freeze[f as usize - 4] as u32 as f64,
            6..=7 => p.broken[f as usize - 6] as u32 as f64,
            8..=9 => p.bombed[f as usize - 8] as u32 as f64,
            10 => p.ball_size as f64,
            11 => p.bounce as f64,
            12..=13 => p.goal_height[f as usize - 12] as f64,
            14..=15 => p.scale[f as usize - 14],
            16 => p.fire as u32 as f64,
            17 => p.streaker_alive as u32 as f64,
            18..=19 => t.speed[f as usize - 18] as f64,
            20..=21 => t.jump[f as usize - 20] as f64,
            22..=23 => t.ice[f as usize - 22] as f64,
            24..=25 => t.goals[f as usize - 24] as f64,
            26..=27 => t.size[f as usize - 26] as f64,
            28..=29 => t.broken[f as usize - 28] as f64,
            30 => t.fire as f64,
            31 => t.ball_size as f64,
            32 => t.bounce as f64,
            33 => t.streaker as f64,
            34..=35 => p.goal_flags[f as usize - 34] as u32 as f64,
            _ => f64::NAN,
        }
    })
}

#[no_mangle]
pub extern "C" fn game_manifold_value(i: u32, p: u32, f: u32) -> f64 {
    GAME.with(|g| g.borrow().world.debug_manifold(i as usize, p as usize, f))
}

#[no_mangle]
pub extern "C" fn game_start(seed: u32, mode: u32, goals: u32, bonus: u32) {
    GAME.with(|g| *g.borrow_mut() = game::Game::configured(seed, mode, goals, bonus != 0));
}
#[no_mangle]
pub extern "C" fn game_start_match(seed: u32, target: u32, bonus: u32) {
    GAME.with(|g| *g.borrow_mut() = game::Game::score_match(seed, target, bonus != 0));
}
#[no_mangle]
pub extern "C" fn game_start_on_pitch(seed: u32, target: u32, bonus: u32, pitch: u32) {
    GAME.with(|g| *g.borrow_mut() = game::Game::score_match_on(seed, target, bonus != 0, pitch));
}
#[no_mangle]
pub extern "C" fn game_start_balanced_pitch(seed: u32, target: u32, bonus: u32, pitch: u32) {
    GAME.with(|g| {
        *g.borrow_mut() = game::Game::score_match_on_balanced(seed, target, bonus != 0, pitch)
    });
}
#[no_mangle]
pub extern "C" fn game_set_assistance(side: u32, level: u32) {
    GAME.with(|g| g.borrow_mut().set_assistance(side as usize, level));
}
#[no_mangle]
pub extern "C" fn game_set_skin(side: u32, skin: u32) {
    GAME.with(|g| g.borrow_mut().set_skin(side as usize, skin as usize));
}
#[no_mangle]
pub extern "C" fn game_collect(kind: u32, side: u32) {
    GAME.with(|g| {
        if let Some(k) = powerups::Kind::from_id(kind) {
            if side < 2 {
                g.borrow_mut().collect(k, side as usize);
            }
        }
    });
}
#[no_mangle]
pub extern "C" fn game_player_value(side: u32, f: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        let p = &g.powerups;
        let s = side.min(1) as usize;
        match f {
            0 => p.speed[s] as f64,
            1 => p.jump[s] as f64,
            2 => p.freeze[s] as u32 as f64,
            3 => p.broken[s] as u32 as f64,
            4 => p.bombed[s] as u32 as f64,
            5 => p.scale[s],
            6 => g.assistance[s] as f64,
            _ => f64::NAN,
        }
    })
}
#[no_mangle]
pub extern "C" fn game_pickup_count() -> u32 {
    GAME.with(|g| g.borrow().pickups.len() as u32)
}
#[no_mangle]
pub extern "C" fn game_pickup_value(i: u32, f: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        let p = &g.pickups[i as usize];
        match f {
            0 => p.kind as u32 as f64,
            1 => p.position.x,
            2 => p.position.y,
            _ => p.ttl as f64,
        }
    })
}
#[no_mangle]
pub extern "C" fn game_bomb_count() -> u32 {
    GAME.with(|g| g.borrow().bombs.len() as u32)
}
#[no_mangle]
pub extern "C" fn game_bomb_value(i: u32, f: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        let b = &g.bombs[i as usize];
        if f == 0 {
            b.position.x
        } else {
            b.position.y
        }
    })
}
#[no_mangle]
pub extern "C" fn game_effect_count() -> u32 {
    GAME.with(|g| g.borrow().effects.len() as u32)
}
#[no_mangle]
pub extern "C" fn game_effect_value(i: u32, f: u32) -> f64 {
    GAME.with(|g| {
        let g = g.borrow();
        let e = &g.effects[i as usize];
        match f {
            0 => e.kind as f64,
            1 => e.position.x,
            2 => e.position.y,
            3 => e.age as f64,
            4 => e.width,
            5 => e.height,
            _ => f64::NAN,
        }
    })
}
