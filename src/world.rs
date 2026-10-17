use crate::{
    body::{Body, Shape},
    collision,
    contact::Contact,
    joint::Revolute,
    math::Vec2,
};

pub const DT: f64 = 1.0 / 96.0;
pub const ITERATIONS: usize = 48;

/// Discrete kernel. Continuous collision detection, sleep and complete contact
/// graph ordering remain necessary before replacing the entire Flash world.
pub struct World {
    pub bodies: Vec<Body>,
    pub joints: Vec<Revolute>,
    pub gravity: Vec2,
    contacts: Vec<Contact>,
    first_step: bool,
}
impl World {
    pub fn new(gravity: Vec2) -> Self {
        Self {
            bodies: vec![],
            joints: vec![],
            gravity,
            contacts: vec![],
            first_step: true,
        }
    }
    pub fn add_body(&mut self, body: Body) -> usize {
        self.bodies.push(body);
        self.bodies.len() - 1
    }
    pub fn add_joint(&mut self, a: usize, b: usize, anchor: Vec2, torque: f64) -> usize {
        self.joints
            .push(Revolute::new(a, b, &self.bodies, anchor, torque));
        self.joints.len() - 1
    }
    pub fn tick(&mut self) {
        for _ in 0..3 {
            self.step();
        }
    }
    fn detect(&mut self) {
        let old = std::mem::take(&mut self.contacts);
        let mut next = vec![];
        for i in 0..self.bodies.len() {
            for j in i + 1..self.bodies.len() {
                let (a, b) = (&self.bodies[i], &self.bodies[j]);
                if a.is_static() && b.is_static() {
                    continue;
                }
                if a.group != 0 && a.group == b.group && a.group < 0 {
                    continue;
                }
                if self
                    .joints
                    .iter()
                    .any(|joint| (joint.a == i && joint.b == j) || (joint.a == j && joint.b == i))
                {
                    continue;
                }
                let (ia, ib) = if matches!(a.shape, Shape::Circle { .. })
                    && matches!(b.shape, Shape::Polygon { .. })
                {
                    (j, i)
                } else {
                    (i, j)
                };
                let manifolds = collision::collide(&self.bodies[ia], &self.bodies[ib]);
                if !manifolds.is_empty() {
                    let mut c = Contact::new(ia, ib, manifolds);
                    if let Some(prev) = old.iter().find(|p| p.a == ia && p.b == ib) {
                        c.reuse(prev);
                    }
                    next.push(c);
                }
            }
        }
        self.contacts = next;
    }
    pub fn step(&mut self) {
        self.detect();
        for body in &mut self.bodies {
            if !body.is_static() {
                body.velocity.x += DT * (self.gravity.x + body.inv_mass * 0.0);
                body.velocity.y += DT * (self.gravity.y + body.inv_mass * 0.0);
                // No external forces/damping are used by this first game slice.
                if body.velocity.dot(body.velocity) > 6000.0 * 6000.0 {
                    let length = body.velocity.length();
                    body.velocity = body.velocity * (1.0 / length);
                    body.velocity.x *= 6000.0;
                    body.velocity.y *= 6000.0;
                }
                if body.omega * body.omega > 2500.0 * 2500.0 {
                    body.omega = if body.omega < 0.0 { -2500.0 } else { 2500.0 };
                }
            }
        }
        let ratio = if self.first_step { 0.0 } else { 1.0 };
        for c in &mut self.contacts {
            c.prepare(&mut self.bodies);
        }
        for c in &mut self.contacts {
            c.warm_start(&mut self.bodies, ratio)
        }
        for j in &mut self.joints {
            j.prepare(&mut self.bodies, ratio)
        }
        for _ in 0..ITERATIONS {
            for j in &mut self.joints {
                j.solve_velocity(&mut self.bodies, DT)
            }
            for c in &mut self.contacts {
                c.solve_velocity(&mut self.bodies)
            }
        }
        for body in &mut self.bodies {
            if !body.is_static() {
                body.center.x += DT * body.velocity.x;
                body.center.y += DT * body.velocity.y;
                body.angle += DT * body.omega;
                body.synchronize();
            }
        }
        for _ in 0..ITERATIONS {
            let mut min_separation: f64 = 0.0;
            for c in &self.contacts {
                min_separation = min_separation.min(c.solve_position(&mut self.bodies));
            }
            let mut joints_ok = true;
            for j in &self.joints {
                joints_ok = j.solve_position(&mut self.bodies) && joints_ok;
            }
            if min_separation >= -1.5 * 0.005 && joints_ok {
                break;
            }
        }
        self.first_step = false;
    }
}
