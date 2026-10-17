//! Revolute joint with motor and no angular limits, matching the game's joint setup.
use crate::{
    body::Body,
    contact::pair,
    math::{clamp, Mat22, Vec2},
};

#[derive(Clone, Debug)]
pub struct Revolute {
    pub a: usize,
    pub b: usize,
    pub local_a: Vec2,
    pub local_b: Vec2,
    pub reference_angle: f64,
    pub motor_speed: f64,
    pub max_torque: f64,
    impulse: Vec2,
    motor_impulse: f64,
    mass: Mat22,
    motor_mass: f64,
}
impl Revolute {
    pub fn new(a: usize, b: usize, bodies: &[Body], anchor: Vec2, max_torque: f64) -> Self {
        Self {
            a,
            b,
            local_a: bodies[a].local_point(anchor),
            local_b: bodies[b].local_point(anchor),
            reference_angle: bodies[b].angle - bodies[a].angle,
            motor_speed: 0.0,
            max_torque,
            impulse: Vec2::default(),
            motor_impulse: 0.0,
            mass: Mat22::default(),
            motor_mass: 0.0,
        }
    }
    pub fn angle(&self, bodies: &[Body]) -> f64 {
        bodies[self.b].angle - bodies[self.a].angle - self.reference_angle
    }
    pub fn prepare(&mut self, bodies: &mut [Body], ratio: f64) {
        let (a, b) = pair(bodies, self.a, self.b);
        let ra = a.rot().apply(self.local_a - a.local_center);
        let rb = b.rot().apply(self.local_b - b.local_center);
        self.mass = Mat22 {
            a11: a.inv_mass + b.inv_mass + ra.y * ra.y * a.inv_i + rb.y * rb.y * b.inv_i,
            a12: -ra.y * ra.x * a.inv_i - rb.y * rb.x * b.inv_i,
            a21: -ra.y * ra.x * a.inv_i - rb.y * rb.x * b.inv_i,
            a22: a.inv_mass + b.inv_mass + ra.x * ra.x * a.inv_i + rb.x * rb.x * b.inv_i,
        };
        self.motor_mass = 1.0 / (a.inv_i + b.inv_i);
        self.impulse.x *= ratio;
        self.impulse.y *= ratio;
        self.motor_impulse *= ratio;
        let p = self.impulse;
        a.velocity.x -= a.inv_mass * p.x;
        a.velocity.y -= a.inv_mass * p.y;
        a.omega -= a.inv_i * (ra.x * p.y - ra.y * p.x + self.motor_impulse);
        b.velocity.x += b.inv_mass * p.x;
        b.velocity.y += b.inv_mass * p.y;
        b.omega += b.inv_i * (rb.x * p.y - rb.y * p.x + self.motor_impulse);
    }
    pub fn solve_velocity(&mut self, bodies: &mut [Body], dt: f64) {
        let (a, b) = pair(bodies, self.a, self.b);
        let cdot = b.omega - a.omega - self.motor_speed;
        let mut impulse = self.motor_mass * -cdot;
        let old = self.motor_impulse;
        let max = dt * self.max_torque;
        self.motor_impulse = clamp(self.motor_impulse + impulse, -max, max);
        impulse = self.motor_impulse - old;
        a.omega -= a.inv_i * impulse;
        b.omega += b.inv_i * impulse;
        let ra = a.rot().apply(self.local_a - a.local_center);
        let rb = b.rot().apply(self.local_b - b.local_center);
        let dx = b.velocity.x + -b.omega * rb.y - a.velocity.x - -a.omega * ra.y;
        let dy = b.velocity.y + b.omega * rb.x - a.velocity.y - a.omega * ra.x;
        let p = self.mass.solve(Vec2::new(-dx, -dy));
        self.impulse.x += p.x;
        self.impulse.y += p.y;
        a.velocity.x -= a.inv_mass * p.x;
        a.velocity.y -= a.inv_mass * p.y;
        a.omega -= a.inv_i * (ra.x * p.y - ra.y * p.x);
        b.velocity.x += b.inv_mass * p.x;
        b.velocity.y += b.inv_mass * p.y;
        b.omega += b.inv_i * (rb.x * p.y - rb.y * p.x);
    }
    pub fn solve_position(&self, bodies: &mut [Body]) -> bool {
        let (a, b) = pair(bodies, self.a, self.b);
        let ra = a.rot().apply(self.local_a - a.local_center);
        let rb = b.rot().apply(self.local_b - b.local_center);
        let mut dx = b.center.x + rb.x - a.center.x - ra.x;
        let mut dy = b.center.y + rb.y - a.center.y - ra.y;
        let length2 = dx * dx + dy * dy;
        let error = length2.sqrt();
        if length2 > 0.05 * 0.05 {
            let mass = 1.0 / (a.inv_mass + b.inv_mass);
            let px = mass * -dx;
            let py = mass * -dy;
            a.center.x -= 0.5 * a.inv_mass * px;
            a.center.y -= 0.5 * a.inv_mass * py;
            b.center.x += 0.5 * b.inv_mass * px;
            b.center.y += 0.5 * b.inv_mass * py;
            dx = b.center.x + rb.x - a.center.x - ra.x;
            dy = b.center.y + rb.y - a.center.y - ra.y;
        }
        // Keep K1 + K2 + K3 additions separate, as in b2RevoluteJoint.
        let mass = Mat22 {
            a11: (a.inv_mass + b.inv_mass + a.inv_i * ra.y * ra.y) + b.inv_i * rb.y * rb.y,
            a12: (0.0 + -a.inv_i * ra.x * ra.y) + -b.inv_i * rb.x * rb.y,
            a21: (0.0 + -a.inv_i * ra.x * ra.y) + -b.inv_i * rb.x * rb.y,
            a22: (a.inv_mass + b.inv_mass + a.inv_i * ra.x * ra.x) + b.inv_i * rb.x * rb.x,
        };
        let p = mass.solve(Vec2::new(-dx, -dy));
        a.center.x -= a.inv_mass * p.x;
        a.center.y -= a.inv_mass * p.y;
        a.angle -= a.inv_i * (ra.x * p.y - ra.y * p.x);
        b.center.x += b.inv_mass * p.x;
        b.center.y += b.inv_mass * p.y;
        b.angle += b.inv_i * (rb.x * p.y - rb.y * p.x);
        a.synchronize();
        b.synchronize();
        error <= 0.005
    }
}
