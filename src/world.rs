//! Box2D 2.0.2 style islands, sleep and continuous time-of-impact stepping.
use crate::{
    body::{Body, Shape},
    broadphase::{Broadphase, Event},
    collision,
    contact::Contact,
    continuous::{self, Sweep},
    joint::Revolute,
    math::{clamp, Vec2},
};
use std::collections::VecDeque;

pub const DT: f64 = 1.0 / 96.0;
pub const ITERATIONS: usize = 48;

struct Pair {
    a: usize,
    b: usize,
    contact: Option<Contact>,
    toi: Option<f64>,
    updated: bool,
}
#[derive(Default)]
struct Island {
    bodies: Vec<usize>,
    contacts: Vec<usize>,
    joints: Vec<usize>,
}

pub struct World {
    pub bodies: Vec<Body>,
    pub joints: Vec<Revolute>,
    pub gravity: Vec2,
    pub continuous: bool,
    pub allow_sleep: bool,
    /// Number of TOI islands actually solved in the last sub-step.
    pub toi_events: usize,
    pairs: Vec<Pair>,
    broadphase: Broadphase,
    known_transforms: Vec<(Vec2, f64)>,
    body_order: Vec<usize>,
    pub contact_events: Vec<(usize, usize, f64)>,
    first_step: bool,
}
impl World {
    pub fn new(gravity: Vec2) -> Self {
        Self::with_bounds(
            gravity,
            Vec2::new(-10000.0, -10000.0),
            Vec2::new(10000.0, 10000.0),
        )
    }
    pub fn with_bounds(gravity: Vec2, lower: Vec2, upper: Vec2) -> Self {
        Self {
            bodies: vec![],
            joints: vec![],
            gravity,
            continuous: true,
            allow_sleep: true,
            toi_events: 0,
            pairs: vec![],
            broadphase: Broadphase::new(lower, upper),
            known_transforms: vec![],
            body_order: vec![],
            contact_events: vec![],
            first_step: true,
        }
    }
    pub fn add_body(&mut self, body: Body) -> usize {
        let i = self.bodies.len();
        self.known_transforms.push((body.position, body.angle));
        self.bodies.push(body);
        self.body_order.push(i);
        let events = self.broadphase.create(i, aabb(&self.bodies[i]));
        self.apply_events(events);
        i
    }
    pub fn set_transform(&mut self, i: usize, position: Vec2, angle: f64) {
        self.bodies[i].set_transform(position, angle);
        self.broadphase.move_proxy(i, aabb(&self.bodies[i]));
        let events = self.broadphase.commit();
        self.apply_events(events);
        self.known_transforms[i] = (position, angle);
    }
    pub fn remove_body(&mut self, i: usize) {
        if !self.bodies[i].active {
            return;
        }
        self.bodies[i].active = false;
        self.bodies[i].sleeping = true;
        self.bodies[i].velocity = Vec2::default();
        self.bodies[i].omega = 0.0;
        self.body_order.retain(|&b| b != i);
        for j in &mut self.joints {
            if j.a == i || j.b == i {
                j.active = false;
            }
        }
        let events = self.broadphase.destroy(i);
        self.apply_events(events);
    }
    pub fn add_joint(&mut self, a: usize, b: usize, anchor: Vec2, torque: f64) -> usize {
        self.joints
            .push(Revolute::new(a, b, &self.bodies, anchor, torque));
        self.refilter(b);
        self.joints.len() - 1
    }
    pub fn debug_manifold(&self, i: usize, p: usize, f: u32) -> f64 {
        let Some(c) = self
            .pairs
            .iter()
            .rev()
            .nth(i)
            .and_then(|c| c.contact.as_ref())
        else {
            return f64::NAN;
        };
        let p = &c.points[p];
        let m = &p.manifold;
        match f {
            0 => m.normal.x,
            1 => m.normal.y,
            2 => m.local_a.x,
            3 => m.local_a.y,
            4 => m.local_b.x,
            5 => m.local_b.y,
            6 => m.separation,
            7 => m.id as f64,
            8 => p.normal_impulse,
            9 => p.tangent_impulse,
            _ => f64::NAN,
        }
    }
    pub fn contact_pairs(&self) -> Vec<(usize, usize, usize)> {
        self.pairs
            .iter()
            .rev()
            .map(|p| (p.a, p.b, p.contact.as_ref().map_or(0, |c| c.points.len())))
            .collect()
    }
    pub fn tick(&mut self) {
        for _ in 0..3 {
            self.step();
        }
    }
    fn eligible(&self, i: usize, j: usize) -> bool {
        let (a, b) = (&self.bodies[i], &self.bodies[j]);
        a.active
            && b.active
            && !(a.is_static() && b.is_static())
            && !(a.group < 0 && a.group == b.group)
            && !self
                .joints
                .iter()
                .any(|q| q.active && ((q.a == i && q.b == j) || (q.a == j && q.b == i)))
    }
    fn ccd_pair(&self, p: &Pair) -> bool {
        let (a, b) = (&self.bodies[p.a], &self.bodies[p.b]);
        !p.updated || a.is_static() || b.is_static() || a.bullet || b.bullet
    }
    pub fn refilter(&mut self, i: usize) {
        let events = self.broadphase.refilter(i);
        self.apply_events(events);
    }
    fn apply_events(&mut self, events: Vec<Event>) {
        for event in events {
            let (mut a, mut b) = (event.a, event.b);
            if !event.added {
                if let Some(i) = self
                    .pairs
                    .iter()
                    .position(|p| (p.a == a && p.b == b) || (p.a == b && p.b == a))
                {
                    let p = self.pairs.remove(i);
                    if p.contact.is_some() {
                        self.bodies[a].wake();
                        self.bodies[b].wake();
                    }
                }
            } else if self.eligible(a, b) {
                if matches!(self.bodies[a].shape, Shape::Circle { .. })
                    && matches!(self.bodies[b].shape, Shape::Polygon { .. })
                {
                    std::mem::swap(&mut a, &mut b);
                }
                self.pairs.push(Pair {
                    a,
                    b,
                    contact: None,
                    toi: None,
                    updated: false,
                });
            }
        }
    }
    fn sync_teleports(&mut self) {
        for i in 0..self.bodies.len() {
            let current = (self.bodies[i].position, self.bodies[i].angle);
            if self.bodies[i].active && current != self.known_transforms[i] {
                self.broadphase.move_proxy(i, aabb(&self.bodies[i]));
                let events = self.broadphase.commit();
                self.apply_events(events);
            }
        }
    }
    fn synchronize(&mut self, i: usize, sweeps: &[Sweep]) {
        let b = &self.bodies[i];
        if !b.active || b.is_static() || b.sleeping {
            return;
        }
        let now = aabb(b);
        let mut before = b.clone();
        before.center = sweeps[i].c0;
        before.angle = sweeps[i].a0;
        before.synchronize();
        let old = aabb(&before);
        self.broadphase.move_proxy(
            i,
            (
                Vec2::new(now.0.x.min(old.0.x), now.0.y.min(old.0.y)),
                Vec2::new(now.1.x.max(old.1.x), now.1.y.max(old.1.y)),
            ),
        );
    }
    fn update_contact(&mut self, i: usize) {
        let p = &mut self.pairs[i];
        if self.bodies[p.a].sleeping && self.bodies[p.b].sleeping {
            return;
        }
        // Newly-created AS3 contacts have no slowFlag until their first Update.
        p.updated = true;
        let m = collision::collide(&self.bodies[p.a], &self.bodies[p.b]);
        for point in &m {
            if p.contact
                .as_ref()
                .is_none_or(|old| !old.points.iter().any(|q| q.manifold.id == point.id))
            {
                let a = &self.bodies[p.a];
                let b = &self.bodies[p.b];
                let ra = a.rot().apply(point.local_a - a.local_center);
                let rb = b.rot().apply(point.local_b - b.local_center);
                let v = Vec2::new(
                    b.velocity.x - b.omega * rb.y - a.velocity.x + a.omega * ra.y,
                    b.velocity.y + b.omega * rb.x - a.velocity.y - a.omega * ra.x,
                );
                self.contact_events.push((p.a, p.b, v.length()));
            }
        }
        if m.is_empty() {
            if p.contact.is_some() {
                self.bodies[p.a].wake();
                self.bodies[p.b].wake();
            }
            p.contact = None;
        } else {
            let mut c = Contact::new(p.a, p.b, m);
            if let Some(old) = &p.contact {
                c.reuse(old);
            }
            p.contact = Some(c);
        }
    }
    fn islands(&mut self) -> Vec<Island> {
        let mut visited = vec![false; self.bodies.len()];
        let mut contacts = vec![false; self.pairs.len()];
        let mut joints = vec![false; self.joints.len()];
        let mut result = vec![];
        for &seed in self.body_order.iter().rev() {
            if visited[seed] || self.bodies[seed].is_static() || self.bodies[seed].sleeping {
                continue;
            }
            let mut island = Island::default();
            let mut stack = vec![seed];
            visited[seed] = true;
            while let Some(body) = stack.pop() {
                island.bodies.push(body);
                self.bodies[body].sleeping = false;
                if self.bodies[body].is_static() {
                    continue;
                }
                for i in (0..self.pairs.len()).rev() {
                    let p = &self.pairs[i];
                    if contacts[i] || p.contact.is_none() || (p.a != body && p.b != body) {
                        continue;
                    }
                    island.contacts.push(i);
                    contacts[i] = true;
                    let other = if p.a == body { p.b } else { p.a };
                    if !visited[other] {
                        stack.push(other);
                        visited[other] = true;
                    }
                }
                for i in (0..self.joints.len()).rev() {
                    let j = &self.joints[i];
                    if !j.active || joints[i] || (j.a != body && j.b != body) {
                        continue;
                    }
                    island.joints.push(i);
                    joints[i] = true;
                    let other = if j.a == body { j.b } else { j.a };
                    if !visited[other] {
                        stack.push(other);
                        visited[other] = true;
                    }
                }
            }
            for &b in &island.bodies {
                if self.bodies[b].is_static() {
                    visited[b] = false;
                }
            }
            result.push(island);
        }
        result
    }
    fn solve_discrete(&mut self, island: &Island, sweeps: &mut [Sweep]) {
        for &i in &island.bodies {
            let b = &mut self.bodies[i];
            if b.is_static() {
                continue;
            }
            b.velocity.x += DT * (self.gravity.x + b.inv_mass * 0.0);
            b.velocity.y += DT * (self.gravity.y + b.inv_mass * 0.0);
            b.velocity = b.velocity * clamp(1.0 - DT * b.linear_damping, 0.0, 1.0);
            b.omega *= clamp(1.0 - DT * b.angular_damping, 0.0, 1.0);
            if b.velocity.dot(b.velocity) > 6000.0 * 6000.0 {
                let length = b.velocity.length();
                b.velocity = b.velocity * (1.0 / length);
                b.velocity.x *= 6000.0;
                b.velocity.y *= 6000.0;
            }
            if b.omega * b.omega > 2500.0 * 2500.0 {
                b.omega = if b.omega < 0.0 { -2500.0 } else { 2500.0 };
            }
        }
        let ratio = if self.first_step { 0.0 } else { 1.0 };
        for &i in &island.contacts {
            self.pairs[i]
                .contact
                .as_mut()
                .unwrap()
                .prepare(&mut self.bodies);
        }
        for &i in &island.contacts {
            self.pairs[i]
                .contact
                .as_mut()
                .unwrap()
                .warm_start(&mut self.bodies, ratio);
        }
        for &i in &island.joints {
            self.joints[i].prepare(&mut self.bodies, ratio);
        }
        for _ in 0..ITERATIONS {
            for &i in &island.joints {
                self.joints[i].solve_velocity(&mut self.bodies, DT);
            }
            for &i in &island.contacts {
                self.pairs[i]
                    .contact
                    .as_mut()
                    .unwrap()
                    .solve_velocity(&mut self.bodies);
            }
        }
        self.integrate(island, sweeps, DT);
        self.solve_positions(island, 0.5);
        if self.allow_sleep {
            let mut minimum = f64::MAX;
            for &i in &island.bodies {
                let b = &mut self.bodies[i];
                if b.inv_mass == 0.0 {
                    continue;
                }
                if !b.allow_sleep
                    || b.omega * b.omega > (2.0 / 180.0) * (2.0 / 180.0)
                    || b.velocity.dot(b.velocity) > 0.01 * 0.01
                {
                    b.sleep_time = 0.0;
                    minimum = 0.0;
                } else {
                    b.sleep_time += DT;
                    minimum = minimum.min(b.sleep_time);
                }
            }
            if minimum >= 0.5 {
                for &i in &island.bodies {
                    let b = &mut self.bodies[i];
                    b.sleeping = true;
                    b.velocity = Vec2::default();
                    b.omega = 0.0;
                }
            }
        }
    }
    fn integrate(&mut self, island: &Island, sweeps: &mut [Sweep], dt: f64) {
        for &i in &island.bodies {
            let b = &mut self.bodies[i];
            if b.is_static() {
                continue;
            }
            sweeps[i].c0 = b.center;
            sweeps[i].a0 = b.angle;
            b.center.x += dt * b.velocity.x;
            b.center.y += dt * b.velocity.y;
            b.angle += dt * b.omega;
            b.synchronize();
        }
    }
    fn solve_positions(&mut self, island: &Island, baumgarte: f64) {
        for _ in 0..ITERATIONS {
            let mut min: f64 = 0.0;
            for &i in &island.contacts {
                min = min.min(
                    self.pairs[i]
                        .contact
                        .as_ref()
                        .unwrap()
                        .solve_position_with(&mut self.bodies, baumgarte),
                );
            }
            let mut joints_ok = true;
            for &i in &island.joints {
                joints_ok = self.joints[i].solve_position(&mut self.bodies) && joints_ok;
            }
            if min >= -1.5 * 0.005 && joints_ok {
                break;
            }
        }
    }
    fn advance(&mut self, sweeps: &mut [Sweep], i: usize, t: f64) {
        sweeps[i].advance(t);
        sweeps[i].c = sweeps[i].c0;
        sweeps[i].a = sweeps[i].a0;
        self.bodies[i].center = sweeps[i].c;
        self.bodies[i].angle = sweeps[i].a;
        self.bodies[i].synchronize();
    }
    fn solve_continuous(&mut self, sweeps: &mut [Sweep]) {
        for p in &mut self.pairs {
            p.toi = None;
        }
        loop {
            let mut selected = None;
            let mut alpha = 1.0;
            for i in (0..self.pairs.len()).rev() {
                if !self.ccd_pair(&self.pairs[i]) {
                    continue;
                }
                let (a, b) = (self.pairs[i].a, self.pairs[i].b);
                let value = if let Some(t) = self.pairs[i].toi {
                    t
                } else {
                    if (self.bodies[a].is_static() || self.bodies[a].sleeping)
                        && (self.bodies[b].is_static() || self.bodies[b].sleeping)
                    {
                        continue;
                    }
                    let t0 = sweeps[a].t0.max(sweeps[b].t0);
                    sweeps[a].advance(t0);
                    sweeps[b].advance(t0);
                    let mut t = continuous::time_of_impact(
                        &self.bodies[a],
                        &sweeps[a],
                        &self.bodies[b],
                        &sweeps[b],
                    );
                    if t > 0.0 && t < 1.0 {
                        t = ((1.0 - t) * t0 + t).min(1.0);
                    }
                    self.pairs[i].toi = Some(t);
                    t
                };
                if f64::from_bits(1) < value && value < alpha {
                    alpha = value;
                    selected = Some(i);
                }
            }
            let Some(chosen) = selected else {
                break;
            };
            if alpha >= 1.0 {
                break;
            }
            let (a, b) = (self.pairs[chosen].a, self.pairs[chosen].b);
            self.advance(sweeps, a, alpha);
            self.advance(sweeps, b, alpha);
            self.update_contact(chosen);
            self.pairs[chosen].toi = None;
            if self.pairs[chosen].contact.is_none() {
                continue;
            }
            let seed = if self.bodies[a].is_static() { b } else { a };
            let mut island = Island::default();
            let mut queue = VecDeque::from([seed]);
            let mut visited = vec![false; self.bodies.len()];
            visited[seed] = true;
            let mut seen = vec![false; self.pairs.len()];
            while let Some(body) = queue.pop_front() {
                island.bodies.push(body);
                self.bodies[body].sleeping = false;
                if self.bodies[body].is_static() {
                    continue;
                }
                for i in (0..self.pairs.len()).rev() {
                    let p = &self.pairs[i];
                    if island.contacts.len() == 32
                        || seen[i]
                        || p.contact.is_none()
                        || !self.ccd_pair(p)
                        || (p.a != body && p.b != body)
                    {
                        continue;
                    }
                    island.contacts.push(i);
                    seen[i] = true;
                    let other = if p.a == body { p.b } else { p.a };
                    if !visited[other] {
                        if !self.bodies[other].is_static() {
                            self.advance(sweeps, other, alpha);
                            self.bodies[other].wake();
                        }
                        queue.push_back(other);
                        visited[other] = true;
                    }
                }
            }
            // Preserve the AS3 world's joint traversal after its contact BFS.
            if let Some(&last) = island.bodies.last() {
                for i in (0..self.joints.len()).rev() {
                    let j = &self.joints[i];
                    if !j.active || island.joints.len() == 32 || (j.a != last && j.b != last) {
                        continue;
                    }
                    island.joints.push(i);
                    let other = if j.a == last { j.b } else { j.a };
                    if !visited[other] {
                        if !self.bodies[other].is_static() {
                            self.advance(sweeps, other, alpha);
                            self.bodies[other].wake();
                        }
                        // AS3 enqueues this body after the BFS has finished;
                        // it is advanced but never added to this TOI island.
                        visited[other] = true;
                    }
                }
            }
            // TOI does not FinalizeVelocityConstraints in this engine. Keep
            // manifold caches unchanged even though temporary solver impulses evolve.
            let caches: Vec<_> = island
                .contacts
                .iter()
                .map(|&i| {
                    self.pairs[i]
                        .contact
                        .as_ref()
                        .unwrap()
                        .points
                        .iter()
                        .map(|p| (p.normal_impulse, p.tangent_impulse))
                        .collect::<Vec<_>>()
                })
                .collect();
            for &i in &island.contacts {
                self.pairs[i]
                    .contact
                    .as_mut()
                    .unwrap()
                    .prepare(&mut self.bodies);
            }
            for &i in &island.joints {
                self.joints[i].prepare(&mut self.bodies, 0.0);
            }
            for _ in 0..ITERATIONS {
                for &i in &island.contacts {
                    self.pairs[i]
                        .contact
                        .as_mut()
                        .unwrap()
                        .solve_velocity(&mut self.bodies);
                }
                // The embedded 2.0.2 calls InitVelocityConstraints here, not Solve.
                for &i in &island.joints {
                    self.joints[i].prepare(&mut self.bodies, 0.0);
                }
            }
            self.integrate(&island, sweeps, (1.0 - alpha) * DT);
            self.solve_positions(&island, 0.75);
            for (&i, cache) in island.contacts.iter().zip(caches) {
                for (p, (n, t)) in self.pairs[i]
                    .contact
                    .as_mut()
                    .unwrap()
                    .points
                    .iter_mut()
                    .zip(cache)
                {
                    p.normal_impulse = n;
                    p.tangent_impulse = t;
                }
            }
            for &i in &island.bodies {
                sweeps[i].c = self.bodies[i].center;
                sweeps[i].a = self.bodies[i].angle;
            }
            for p in &mut self.pairs {
                // Static bodies can belong to several islands. Their cached
                // contacts with other islands must keep the original TOI.
                if island.bodies.iter().any(|&i| {
                    !self.bodies[i].is_static()
                        && !self.bodies[i].sleeping
                        && (p.a == i || p.b == i)
                }) {
                    p.toi = None;
                }
            }
            for &i in &island.bodies {
                self.synchronize(i, sweeps);
            }
            let events = self.broadphase.commit();
            self.apply_events(events);
            self.toi_events += 1;
        }
    }
    pub fn step(&mut self) {
        self.toi_events = 0;
        self.contact_events.clear();
        self.sync_teleports();
        for i in (0..self.pairs.len()).rev() {
            self.update_contact(i);
        }
        let mut sweeps: Vec<_> = self
            .bodies
            .iter()
            .map(|b| Sweep {
                c0: b.center,
                c: b.center,
                a0: b.angle,
                a: b.angle,
                t0: 0.0,
                local_center: b.local_center,
            })
            .collect();
        for island in self.islands() {
            self.solve_discrete(&island, &mut sweeps);
        }
        for (i, s) in sweeps.iter_mut().enumerate() {
            s.c = self.bodies[i].center;
            s.a = self.bodies[i].angle;
        }
        for i in self.body_order.clone().into_iter().rev() {
            self.synchronize(i, &sweeps);
        }
        let events = self.broadphase.commit();
        self.apply_events(events);
        if self.continuous {
            self.solve_continuous(&mut sweeps);
        }
        self.first_step = false;
        for (i, b) in self.bodies.iter().enumerate() {
            self.known_transforms[i] = (b.position, b.angle);
        }
    }
}
fn aabb(b: &Body) -> (Vec2, Vec2) {
    match &b.shape {
        Shape::Circle { radius: r } => (
            b.position - Vec2::new(*r, *r),
            b.position + Vec2::new(*r, *r),
        ),
        Shape::Polygon { vertices, .. } => {
            let mut lo = Vec2::new(f64::MAX, f64::MAX);
            let mut hi = Vec2::new(-f64::MAX, -f64::MAX);
            for &v in vertices {
                let p = b.world_point(v);
                lo.x = lo.x.min(p.x);
                lo.y = lo.y.min(p.y);
                hi.x = hi.x.max(p.x);
                hi.y = hi.y.max(p.y);
            }
            (lo, hi)
        }
    }
}
