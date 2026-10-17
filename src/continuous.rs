//! Box2D 2.0.2 conservative advancement and core-shape GJK distance.
//!
//! Source: the embedded engine's b2Sweep, b2Distance, b2TimeOfImpact and
//! b2PolygonShape. Keep the original core shrink, iteration limits and arithmetic
//! order: a modern Box2D TOI algorithm has different contact timing.
use crate::{
    body::{Body, Shape},
    math::{Rot, Vec2},
};

const TOI_SLOP: f64 = 8.0 * 0.005;
// ActionScript Number.MIN_VALUE is the least positive subnormal, not epsilon.
const NUMBER_MIN: f64 = f64::from_bits(1);

#[derive(Clone, Copy, Debug)]
pub struct Sweep {
    pub c0: Vec2,
    pub c: Vec2,
    pub a0: f64,
    pub a: f64,
    pub t0: f64,
    pub local_center: Vec2,
}

impl Sweep {
    pub fn advance(&mut self, t: f64) {
        if self.t0 < t && 1.0 - self.t0 > NUMBER_MIN {
            let alpha = (t - self.t0) / (1.0 - self.t0);
            self.c0.x = (1.0 - alpha) * self.c0.x + alpha * self.c.x;
            self.c0.y = (1.0 - alpha) * self.c0.y + alpha * self.c.y;
            self.a0 = (1.0 - alpha) * self.a0 + alpha * self.a;
            self.t0 = t;
        }
    }

    /// Body origin and angle at an absolute fraction of the original timestep.
    pub fn transform(&self, t: f64) -> (Vec2, f64) {
        let (center, angle) = if 1.0 - self.t0 > NUMBER_MIN {
            let alpha = (t - self.t0) / (1.0 - self.t0);
            (
                Vec2::new(
                    (1.0 - alpha) * self.c0.x + alpha * self.c.x,
                    (1.0 - alpha) * self.c0.y + alpha * self.c.y,
                ),
                (1.0 - alpha) * self.a0 + alpha * self.a,
            )
        } else {
            (self.c, self.a)
        };
        (center - Rot::new(angle).apply(self.local_center), angle)
    }
}

struct Core {
    vertices: Vec<Vec2>,
    radius: Option<f64>,
    sweep_radius: f64,
}

impl Core {
    fn new(body: &Body) -> Self {
        match &body.shape {
            Shape::Circle { radius } => Self {
                vertices: vec![Vec2::default()],
                radius: Some(radius - TOI_SLOP),
                sweep_radius: body.local_center.length() + radius - TOI_SLOP,
            },
            Shape::Polygon { vertices, normals } => {
                let mut centroid = Vec2::default();
                let mut area = 0.0;
                let third = 1.0 / 3.0;
                for i in 0..vertices.len() {
                    let p = vertices[i];
                    let q = vertices[(i + 1) % vertices.len()];
                    let triangle = 0.5 * (p.x * q.y - p.y * q.x);
                    area += triangle;
                    centroid.x += triangle * third * (p.x + q.x);
                    centroid.y += triangle * third * (p.y + q.y);
                }
                centroid.x *= 1.0 / area;
                centroid.y *= 1.0 / area;
                let mut core = Vec::with_capacity(vertices.len());
                let mut sweep_radius = 0.0_f64;
                for i in 0..vertices.len() {
                    let n1 = normals[(i + vertices.len() - 1) % vertices.len()];
                    let n2 = normals[i];
                    let d = vertices[i] - centroid;
                    let d1 = n1.x * d.x + n1.y * d.y - TOI_SLOP;
                    let d2 = n2.x * d.x + n2.y * d.y - TOI_SLOP;
                    let inv = 1.0 / (n1.x * n2.y - n1.y * n2.x);
                    let p = Vec2::new(
                        inv * (n2.y * d1 - n1.y * d2) + centroid.x,
                        inv * (n1.x * d2 - n2.x * d1) + centroid.y,
                    );
                    sweep_radius = sweep_radius.max((p - body.local_center).length());
                    core.push(p);
                }
                Self {
                    vertices: core,
                    radius: None,
                    sweep_radius,
                }
            }
        }
    }

    fn proxy(&self, transform: (Vec2, f64)) -> Proxy<'_> {
        Proxy {
            vertices: &self.vertices,
            position: transform.0,
            rotation: Rot::new(transform.1),
        }
    }
}

struct Proxy<'a> {
    vertices: &'a [Vec2],
    position: Vec2,
    rotation: Rot,
}

impl Proxy<'_> {
    fn first(&self) -> Vec2 {
        self.position + self.rotation.apply(self.vertices[0])
    }

    fn support(&self, direction: Vec2) -> Vec2 {
        // b2PolygonShape.Support selects in LOCAL coordinates before transforming
        // the selected vertex. Transforming all vertices first changes tie breaks.
        let local = self.rotation.transpose(direction);
        let mut best = self.vertices[0];
        let mut projection = best.dot(local);
        for &v in &self.vertices[1..] {
            let candidate = v.dot(local);
            if candidate > projection {
                best = v;
                projection = candidate;
            }
        }
        self.position + self.rotation.apply(best)
    }
}

#[derive(Default)]
struct Simplex {
    a: [Vec2; 3],
    b: [Vec2; 3],
    points: [Vec2; 3],
}

impl Simplex {
    fn process_two(&mut self, p1: &mut Vec2, p2: &mut Vec2) -> usize {
        let r = -self.points[1];
        let mut d = self.points[0] - self.points[1];
        let length = d.length();
        d.x /= length;
        d.y /= length;
        let mut lambda = r.x * d.x + r.y * d.y;
        if lambda <= 0.0 || length < NUMBER_MIN {
            *p1 = self.a[1];
            *p2 = self.b[1];
            self.a[0] = self.a[1];
            self.b[0] = self.b[1];
            self.points[0] = self.points[1];
            return 1;
        }
        lambda /= length;
        *p1 = self.a[1] + (self.a[0] - self.a[1]) * lambda;
        *p2 = self.b[1] + (self.b[0] - self.b[1]) * lambda;
        2
    }

    fn process_three(&mut self, p1: &mut Vec2, p2: &mut Vec2) -> usize {
        let a = self.points[0];
        let b = self.points[1];
        let c = self.points[2];
        let ab = b - a;
        let ac = c - a;
        let bc = c - b;
        let ac_a = -(a.x * ac.x + a.y * ac.y);
        let ac_c = c.x * ac.x + c.y * ac.y;
        let bc_b = -(b.x * bc.x + b.y * bc.y);
        let bc_c = c.x * bc.x + c.y * bc.y;
        if ac_c <= 0.0 && bc_c <= 0.0 {
            *p1 = self.a[2];
            *p2 = self.b[2];
            self.a[0] = self.a[2];
            self.b[0] = self.b[2];
            self.points[0] = self.points[2];
            return 1;
        }
        let n = ab.x * ac.y - ab.y * ac.x;
        let va = n * (b.x * c.y - b.y * c.x);
        let vb = n * (c.x * a.y - c.y * a.x);
        let vc = n * (a.x * b.y - a.y * b.x);
        if va <= 0.0 && bc_b >= 0.0 && bc_c >= 0.0 && bc_b + bc_c > 0.0 {
            let lambda = bc_b / (bc_b + bc_c);
            *p1 = self.a[1] + (self.a[2] - self.a[1]) * lambda;
            *p2 = self.b[1] + (self.b[2] - self.b[1]) * lambda;
            self.a[0] = self.a[2];
            self.b[0] = self.b[2];
            self.points[0] = self.points[2];
            return 2;
        }
        if vb <= 0.0 && ac_a >= 0.0 && ac_c >= 0.0 && ac_a + ac_c > 0.0 {
            let lambda = ac_a / (ac_a + ac_c);
            *p1 = self.a[0] + (self.a[2] - self.a[0]) * lambda;
            *p2 = self.b[0] + (self.b[2] - self.b[0]) * lambda;
            self.a[1] = self.a[2];
            self.b[1] = self.b[2];
            self.points[1] = self.points[2];
            return 2;
        }
        let inv = 1.0 / (va + vb + vc);
        let u = va * inv;
        let v = vb * inv;
        let w = 1.0 - u - v;
        p1.x = u * self.a[0].x + v * self.a[1].x + w * self.a[2].x;
        p1.y = u * self.a[0].y + v * self.a[1].y + w * self.a[2].y;
        p2.x = u * self.b[0].x + v * self.b[1].x + w * self.b[2].x;
        p2.y = u * self.b[0].y + v * self.b[1].y + w * self.b[2].y;
        3
    }
}

fn generic_distance(a: &Proxy<'_>, b: &Proxy<'_>) -> (f64, Vec2, Vec2) {
    let mut simplex = Simplex::default();
    let mut count = 0;
    let mut p1 = a.first();
    let mut p2 = b.first();
    let mut distance_squared = 0.0;
    for _ in 0..20 {
        let direction = p2 - p1;
        let sa = a.support(direction);
        let sb = b.support(-direction);
        distance_squared = direction.dot(direction);
        let point = sb - sa;
        let projection = direction.dot(point);
        if distance_squared - projection <= 0.01 * distance_squared {
            if count == 0 {
                p1 = sa;
                p2 = sb;
            }
            return (distance_squared.sqrt(), p1, p2);
        }
        simplex.a[count] = sa;
        simplex.b[count] = sb;
        simplex.points[count] = point;
        count = match count {
            0 => {
                p1 = sa;
                p2 = sb;
                1
            }
            1 => simplex.process_two(&mut p1, &mut p2),
            _ => simplex.process_three(&mut p1, &mut p2),
        };
        if count == 3 {
            return (0.0, p1, p2);
        }
        let mut maximum = -f64::MAX;
        for point in &simplex.points[..count] {
            maximum = maximum.max(point.dot(*point));
        }
        if distance_squared <= 100.0 * NUMBER_MIN * maximum {
            let delta = p2 - p1;
            return (delta.length(), p1, p2);
        }
    }
    (distance_squared.sqrt(), p1, p2)
}

fn polygon_circle(poly: &Proxy<'_>, center: Vec2, radius: f64) -> (f64, Vec2, Vec2) {
    let vertex = [center];
    let point = Proxy {
        vertices: &vertex,
        position: Vec2::default(),
        rotation: Rot::new(0.0),
    };
    let (mut distance, p1, mut p2) = generic_distance(poly, &point);
    if distance > radius {
        distance -= radius;
        let delta = p2 - p1;
        let length = delta.length();
        p2.x -= radius * (delta.x / length);
        p2.y -= radius * (delta.y / length);
    } else {
        distance = 0.0;
        p2 = p1;
    }
    (distance, p1, p2)
}

fn distance(a: &Core, xa: (Vec2, f64), b: &Core, xb: (Vec2, f64)) -> (f64, Vec2, Vec2) {
    match (a.radius, b.radius) {
        (Some(ra), Some(rb)) => {
            let mut delta = xb.0 - xa.0;
            let squared = delta.dot(delta);
            let radius = ra + rb;
            if squared > radius * radius {
                let length = squared.sqrt();
                delta.x /= length;
                delta.y /= length;
                (length - radius, xa.0 + delta * ra, xb.0 - delta * rb)
            } else if squared > NUMBER_MIN * NUMBER_MIN {
                let length = squared.sqrt();
                delta.x /= length;
                delta.y /= length;
                let point = xa.0 + delta * ra;
                (0.0, point, point)
            } else {
                (0.0, xa.0, xa.0)
            }
        }
        (None, Some(radius)) => polygon_circle(&a.proxy(xa), xb.0, radius),
        (Some(radius), None) => {
            let (d, p2, p1) = polygon_circle(&b.proxy(xb), xa.0, radius);
            (d, p1, p2)
        }
        (None, None) => generic_distance(&a.proxy(xa), &b.proxy(xb)),
    }
}

/// Fraction of the interval remaining after `sa.t0` (both sweeps must share t0).
/// The caller converts a result in (0, 1) to absolute time using
/// `(1 - alpha) * t0 + alpha`, just as b2World.SolveTOI does.
pub fn time_of_impact(a: &Body, sa: &Sweep, b: &Body, sb: &Sweep) -> f64 {
    let a = Core::new(a);
    let b = Core::new(b);
    let da = sa.c - sa.c0;
    let db = sb.c - sb.c0;
    let aa = sa.a - sa.a0;
    let ab = sb.a - sb.a0;
    let mut alpha = 0.0;
    let mut target = 0.0;
    let mut iteration = 0;
    loop {
        let t = (1.0 - alpha) * sa.t0 + alpha;
        let (distance, p1, p2) = distance(&a, sa.transform(t), &b, sb.transform(t));
        if iteration == 0 {
            target = if distance > 2.0 * TOI_SLOP {
                1.5 * TOI_SLOP
            } else {
                (0.05 * TOI_SLOP).max(distance - 0.5 * TOI_SLOP)
            };
        }
        if distance - target < 0.05 * TOI_SLOP || iteration == 20 {
            break;
        }
        let mut normal = p2 - p1;
        let length = normal.length();
        normal.x /= length;
        normal.y /= length;
        let approach = normal.x * (da.x - db.x)
            + normal.y * (da.y - db.y)
            + aa.abs() * a.sweep_radius
            + ab.abs() * b.sweep_radius;
        if approach == 0.0 {
            alpha = 1.0;
            break;
        }
        let increment = (distance - target) / approach;
        let next = alpha + increment;
        if !(0.0..=1.0).contains(&next) {
            alpha = 1.0;
            break;
        }
        if next < (1.0 + 100.0 * NUMBER_MIN) * alpha {
            break;
        }
        alpha = next;
        iteration += 1;
    }
    alpha
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sweep(start: Vec2, end: Vec2) -> Sweep {
        Sweep {
            c0: start,
            c: end,
            a0: 0.0,
            a: 0.0,
            t0: 0.0,
            local_center: Vec2::default(),
        }
    }

    fn circle(radius: f64) -> Body {
        Body::circle(Vec2::default(), radius, 1.0, 0.3, 0.5, false)
    }

    #[test]
    fn head_on_circles_use_original_core_target() {
        let a = circle(0.5);
        let b = circle(0.5);
        let sa = sweep(Vec2::new(-5.0, 0.0), Vec2::new(5.0, 0.0));
        let sb = sweep(Vec2::default(), Vec2::default());
        // Shrunk total radius=.92; target=.06: impact at center distance=.98.
        assert!((time_of_impact(&a, &sa, &b, &sb) - 0.402).abs() < 1e-14);
    }

    #[test]
    fn thin_wall_is_detected_between_discrete_endpoints() {
        let wall = Body::rectangle(Vec2::default(), 0.06, 4.0, 0.0, 0.3, 0.0, false);
        let ball = circle(0.25);
        let sw = sweep(Vec2::default(), Vec2::default());
        let sb = sweep(Vec2::new(-5.0, 0.0), Vec2::new(5.0, 0.0));
        assert!((time_of_impact(&wall, &sw, &ball, &sb) - 0.471).abs() < 1e-14);
        assert!((time_of_impact(&ball, &sb, &wall, &sw) - 0.471).abs() < 1e-14);
    }

    #[test]
    fn polygons_use_core_vertices_for_toi() {
        let a = Body::rectangle(Vec2::default(), 0.5, 0.5, 1.0, 0.3, 0.0, false);
        let b = Body::rectangle(Vec2::default(), 0.5, 0.5, 0.0, 0.3, 0.0, false);
        let sa = sweep(Vec2::new(-5.0, 0.0), Vec2::new(5.0, 0.0));
        let sb = sweep(Vec2::default(), Vec2::default());
        assert!((time_of_impact(&a, &sa, &b, &sb) - 0.402).abs() < 1e-14);
    }

    #[test]
    fn separating_and_overlapping_pairs_have_distinct_results() {
        let a = circle(0.5);
        let fixed = sweep(Vec2::default(), Vec2::default());
        assert_eq!(
            time_of_impact(
                &a,
                &sweep(Vec2::new(-2.0, 0.0), Vec2::new(-5.0, 0.0)),
                &a,
                &fixed
            ),
            1.0
        );
        assert_eq!(
            time_of_impact(
                &a,
                &sweep(Vec2::new(-0.5, 0.0), Vec2::new(5.0, 0.0)),
                &a,
                &fixed
            ),
            0.0
        );
    }

    #[test]
    fn advancing_sweep_preserves_absolute_transform() {
        let mut s = sweep(Vec2::new(1.0, 2.0), Vec2::new(9.0, 6.0));
        s.a0 = 0.3;
        s.a = 0.9;
        s.local_center = Vec2::new(0.2, -0.1);
        let expected = s.transform(0.75);
        s.advance(0.25);
        let actual = s.transform(0.75);
        assert!((expected.0 - actual.0).length() < 1e-14);
        assert!((expected.1 - actual.1).abs() < 1e-14);
        s.advance(1.0);
        assert_eq!(s.transform(1.0).1, s.a);
    }
}
