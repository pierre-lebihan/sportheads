//! The Rust game core. Browser-independent and shared by native and WASM builds.
//! Current slice: discrete circle/polygon contacts and motorized revolute joints.
pub mod body;
pub mod collision;
pub mod contact;
pub mod joint;
pub mod math;
mod polygon;
pub mod world;

use body::Body;
use math::Vec2;
use std::cell::RefCell;
use world::World;
thread_local! {static WORLD:RefCell<World>=RefCell::new(World::new(Vec2::default()));}

#[no_mangle]
pub extern "C" fn core_reset(gx: f64, gy: f64) {
    WORLD.with(|w| *w.borrow_mut() = World::new(Vec2::new(gx, gy)));
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
    WORLD.with(|w| w.borrow_mut().joints[index as usize].motor_speed = speed);
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
