use crate::{
    body::Body,
    collision::Manifold,
    math::{clamp, Mat22, Vec2},
};

#[derive(Clone, Debug)]
pub struct ContactPoint {
    pub a: usize,
    pub b: usize,
    pub manifold: Manifold,
    pub normal_impulse: f64,
    pub tangent_impulse: f64,
    r_a: Vec2,
    r_b: Vec2,
    normal_mass: f64,
    tangent_mass: f64,
    equalized_mass: f64,
    bias: f64,
    friction: f64,
}
impl ContactPoint {
    pub fn new(a: usize, b: usize, manifold: Manifold) -> Self {
        Self {
            a,
            b,
            manifold,
            normal_impulse: 0.0,
            tangent_impulse: 0.0,
            r_a: Vec2::default(),
            r_b: Vec2::default(),
            normal_mass: 0.0,
            tangent_mass: 0.0,
            equalized_mass: 0.0,
            bias: 0.0,
            friction: 0.0,
        }
    }
    pub fn prepare(&mut self, bodies: &mut [Body]) {
        let (a, b) = pair(bodies, self.a, self.b);
        let n = self.manifold.normal;
        let t = Vec2::new(n.y, -n.x);
        self.r_a = a.rot().apply(self.manifold.local_a - a.local_center);
        self.r_b = b.rot().apply(self.manifold.local_b - b.local_center);
        let rn_a = self.r_a.cross(n);
        let rn_b = self.r_b.cross(n);
        let ra2 = rn_a * rn_a;
        let rb2 = rn_b * rn_b;
        self.normal_mass = 1.0 / (a.inv_mass + b.inv_mass + a.inv_i * ra2 + b.inv_i * rb2);
        let equal = a.mass * a.inv_mass + b.mass * b.inv_mass;
        self.equalized_mass = 1.0 / (equal + (a.mass * a.inv_i * ra2 + b.mass * b.inv_i * rb2));
        let rt_a = self.r_a.cross(t);
        let rt_b = self.r_b.cross(t);
        self.tangent_mass =
            1.0 / (a.inv_mass + b.inv_mass + a.inv_i * (rt_a * rt_a) + b.inv_i * (rt_b * rt_b));
        self.friction = (a.friction * b.friction).sqrt();
        self.bias = 0.0;
        if self.manifold.separation > 0.0 {
            self.bias = -60.0 * self.manifold.separation;
        } else {
            let dv = relative_velocity(a, b, self.r_a, self.r_b);
            let vn = n.dot(dv);
            if vn < -1.0 {
                self.bias += -a.restitution.max(b.restitution) * vn;
            }
        }
    }
    fn warm_start(&mut self, bodies: &mut [Body], dt_ratio: f64) {
        let (a, b) = pair(bodies, self.a, self.b);
        let n = self.manifold.normal;
        let t = Vec2::new(n.y, -n.x);
        self.normal_impulse *= dt_ratio;
        self.tangent_impulse *= dt_ratio;
        let p = n * self.normal_impulse + t * self.tangent_impulse;
        apply_impulse(a, b, self.r_a, self.r_b, p);
    }
    pub fn solve_velocity(&mut self, bodies: &mut [Body]) {
        let (a, b) = pair(bodies, self.a, self.b);
        let n = self.manifold.normal;
        let t = Vec2::new(n.y, -n.x);
        let dv = relative_velocity(a, b, self.r_a, self.r_b);
        let mut pn = -self.normal_mass * (dv.dot(n) - self.bias);
        let mut pt = self.tangent_mass * -dv.dot(t);
        let next_n = (self.normal_impulse + pn).max(0.0);
        pn = next_n - self.normal_impulse;
        // Original one-point solver clamps friction using the previous normal impulse.
        let max_friction = self.friction * self.normal_impulse;
        let next_t = clamp(self.tangent_impulse + pt, -max_friction, max_friction);
        pt = next_t - self.tangent_impulse;
        apply_impulse(a, b, self.r_a, self.r_b, n * pn + t * pt);
        self.normal_impulse = next_n;
        self.tangent_impulse = next_t;
    }
    pub fn solve_position(&self, bodies: &mut [Body]) -> f64 {
        let (a, b) = pair(bodies, self.a, self.b);
        let n = self.manifold.normal;
        let ra = a.rot().apply(self.manifold.local_a - a.local_center);
        let rb = b.rot().apply(self.manifold.local_b - b.local_center);
        let pa = a.center + ra;
        let pb = b.center + rb;
        let d = pb - pa;
        let separation = d.x * n.x + d.y * n.y + self.manifold.separation;
        let correction = 0.5 * clamp(separation + 0.005, -0.2, 0.0);
        let magnitude = -self.equalized_mass * correction;
        let p = n * magnitude;
        let ma = a.mass * a.inv_mass;
        let ia = a.mass * a.inv_i;
        let mb = b.mass * b.inv_mass;
        let ib = b.mass * b.inv_i;
        a.center.x -= ma * p.x;
        a.center.y -= ma * p.y;
        a.angle -= ia * (ra.x * p.y - ra.y * p.x);
        a.synchronize();
        b.center.x += mb * p.x;
        b.center.y += mb * p.y;
        b.angle += ib * (rb.x * p.y - rb.y * p.x);
        b.synchronize();
        separation
    }
}

/// A manifold must be solved as a block when it has two support points.
#[derive(Clone, Debug)]
pub struct Contact {
    pub a: usize,
    pub b: usize,
    pub points: Vec<ContactPoint>,
    count: usize,
    k: Mat22,
    normal_matrix: Mat22,
}
impl Contact {
    pub fn new(a: usize, b: usize, manifolds: Vec<Manifold>) -> Self {
        let count = manifolds.len();
        Self {
            a,
            b,
            points: manifolds
                .into_iter()
                .map(|m| ContactPoint::new(a, b, m))
                .collect(),
            count,
            k: Mat22::default(),
            normal_matrix: Mat22::default(),
        }
    }
    pub fn reuse(&mut self, previous: &Self) {
        for point in &mut self.points {
            if let Some(old) = previous
                .points
                .iter()
                .find(|p| p.manifold.id == point.manifold.id)
            {
                point.normal_impulse = old.normal_impulse;
                point.tangent_impulse = old.tangent_impulse;
            }
        }
    }
    pub fn prepare(&mut self, bodies: &mut [Body]) {
        for point in &mut self.points {
            point.prepare(bodies);
        }
        self.count = self.points.len();
        if self.count == 2 {
            let (a, b) = (&bodies[self.a], &bodies[self.b]);
            let p = &self.points[0];
            let q = &self.points[1];
            let n = p.manifold.normal;
            let na1 = p.r_a.cross(n);
            let nb1 = p.r_b.cross(n);
            let na2 = q.r_a.cross(n);
            let nb2 = q.r_b.cross(n);
            let k11 = a.inv_mass + b.inv_mass + a.inv_i * na1 * na1 + b.inv_i * nb1 * nb1;
            let k22 = a.inv_mass + b.inv_mass + a.inv_i * na2 * na2 + b.inv_i * nb2 * nb2;
            let k12 = a.inv_mass + b.inv_mass + a.inv_i * na1 * na2 + b.inv_i * nb1 * nb2;
            if k11 * k11 < 100.0 * (k11 * k22 - k12 * k12) {
                self.k = Mat22 {
                    a11: k11,
                    a12: k12,
                    a21: k12,
                    a22: k22,
                };
                let inv = 1.0 / (k11 * k22 - k12 * k12);
                self.normal_matrix = Mat22 {
                    a11: inv * k22,
                    a12: -inv * k12,
                    a21: -inv * k12,
                    a22: inv * k11,
                };
            } else {
                self.count = 1;
            }
        }
    }
    pub fn warm_start(&mut self, bodies: &mut [Body], ratio: f64) {
        for p in &mut self.points[..self.count] {
            p.warm_start(bodies, ratio);
        }
    }
    pub fn solve_velocity(&mut self, bodies: &mut [Body]) {
        if self.count == 1 {
            self.points[0].solve_velocity(bodies);
            return;
        }
        let (a, b) = pair(bodies, self.a, self.b);
        let p = &self.points[0];
        let q = &self.points[1];
        let n = p.manifold.normal;
        let tangent = Vec2::new(n.y, -n.x);
        let a1 = p.normal_impulse;
        let a2 = q.normal_impulse;
        let dv1 = relative_velocity(a, b, p.r_a, p.r_b);
        let dv2 = relative_velocity(a, b, q.r_a, q.r_b);
        let mut b1 = dv1.dot(n) - p.bias;
        let mut b2 = dv2.dot(n) - q.bias;
        b1 -= self.k.a11 * a1 + self.k.a12 * a2;
        b2 -= self.k.a21 * a1 + self.k.a22 * a2;
        let x1 = -(self.normal_matrix.a11 * b1 + self.normal_matrix.a12 * b2);
        let x2 = -(self.normal_matrix.a21 * b1 + self.normal_matrix.a22 * b2);
        let impulse = if x1 >= 0.0 && x2 >= 0.0 {
            Some((x1, x2))
        } else {
            let x1 = -p.normal_mass * b1;
            if x1 >= 0.0 && self.k.a21 * x1 + b2 >= 0.0 {
                Some((x1, 0.0))
            } else {
                let x2 = -q.normal_mass * b2;
                if x2 >= 0.0 && self.k.a12 * x2 + b1 >= 0.0 {
                    Some((0.0, x2))
                } else if b1 >= 0.0 && b2 >= 0.0 {
                    Some((0.0, 0.0))
                } else {
                    None
                }
            }
        };
        if let Some((x1, x2)) = impulse {
            let p1 = n * (x1 - a1);
            let p2 = n * (x2 - a2);
            a.velocity.x -= a.inv_mass * (p1.x + p2.x);
            a.velocity.y -= a.inv_mass * (p1.y + p2.y);
            a.omega -=
                a.inv_i * (p.r_a.x * p1.y - p.r_a.y * p1.x + q.r_a.x * p2.y - q.r_a.y * p2.x);
            b.velocity.x += b.inv_mass * (p1.x + p2.x);
            b.velocity.y += b.inv_mass * (p1.y + p2.y);
            b.omega +=
                b.inv_i * (p.r_b.x * p1.y - p.r_b.y * p1.x + q.r_b.x * p2.y - q.r_b.y * p2.x);
            self.points[0].normal_impulse = x1;
            self.points[1].normal_impulse = x2;
        }
        for point in &mut self.points[..self.count] {
            let dv = relative_velocity(a, b, point.r_a, point.r_b);
            let mut impulse = point.tangent_mass * -dv.dot(tangent);
            let max = point.friction * point.normal_impulse;
            let next = clamp(point.tangent_impulse + impulse, -max, max);
            impulse = next - point.tangent_impulse;
            apply_impulse(a, b, point.r_a, point.r_b, tangent * impulse);
            point.tangent_impulse = next;
        }
    }
    pub fn solve_position(&self, bodies: &mut [Body]) -> f64 {
        let mut min: f64 = 0.0;
        for point in &self.points[..self.count] {
            min = min.min(point.solve_position(bodies));
        }
        min
    }
}
fn relative_velocity(a: &Body, b: &Body, ra: Vec2, rb: Vec2) -> Vec2 {
    Vec2::new(
        b.velocity.x + -b.omega * rb.y - a.velocity.x - -a.omega * ra.y,
        b.velocity.y + b.omega * rb.x - a.velocity.y - a.omega * ra.x,
    )
}
fn apply_impulse(a: &mut Body, b: &mut Body, ra: Vec2, rb: Vec2, p: Vec2) {
    a.omega -= a.inv_i * (ra.x * p.y - ra.y * p.x);
    a.velocity.x -= a.inv_mass * p.x;
    a.velocity.y -= a.inv_mass * p.y;
    b.omega += b.inv_i * (rb.x * p.y - rb.y * p.x);
    b.velocity.x += b.inv_mass * p.x;
    b.velocity.y += b.inv_mass * p.y;
}
pub(crate) fn pair(bodies: &mut [Body], i: usize, j: usize) -> (&mut Body, &mut Body) {
    assert_ne!(i, j);
    if i < j {
        let (a, b) = bodies.split_at_mut(j);
        (&mut a[i], &mut b[0])
    } else {
        let (a, b) = bodies.split_at_mut(i);
        (&mut b[0], &mut a[j])
    }
}
