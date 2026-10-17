//! Separating axes and incident-edge clipping, including original contact IDs.
use crate::{body::Body, collision::Manifold, math::Vec2};
#[derive(Clone, Copy)]
struct ClipVertex {
    point: Vec2,
    id: u32,
}

fn edge_separation(a: &Body, b: &Body, av: &[Vec2], an: &[Vec2], bv: &[Vec2], edge: usize) -> f64 {
    let normal = a.rot().apply(an[edge]);
    let local = b.rot().transpose(normal);
    let mut support = 0;
    let mut best = f64::MAX;
    for (i, v) in bv.iter().enumerate() {
        let d = v.x * local.x + v.y * local.y;
        if d < best {
            best = d;
            support = i;
        }
    }
    let delta = b.world_point(bv[support]) - a.world_point(av[edge]);
    delta.x * normal.x + delta.y * normal.y
}
fn find_separation(a: &Body, b: &Body, av: &[Vec2], an: &[Vec2], bv: &[Vec2]) -> (usize, f64) {
    let delta = a.rot().transpose(b.position - a.position);
    let mut face = 0;
    let mut best = -f64::MAX;
    for (i, n) in an.iter().enumerate() {
        let d = n.dot(delta);
        if d > best {
            best = d;
            face = i;
        }
    }
    let middle = edge_separation(a, b, av, an, bv, face);
    if middle > 0.0 {
        return (face, middle);
    }
    let previous = (face + av.len() - 1) % av.len();
    let left = edge_separation(a, b, av, an, bv, previous);
    if left > 0.0 {
        return (previous, left);
    }
    let next = (face + 1) % av.len();
    let right = edge_separation(a, b, av, an, bv, next);
    if right > 0.0 {
        return (next, right);
    }
    let (direction, mut current, mut value) = if left > middle && left > right {
        (-1, previous, left)
    } else if right > middle {
        (1, next, right)
    } else {
        return (face, middle);
    };
    loop {
        let candidate = if direction < 0 {
            (current + av.len() - 1) % av.len()
        } else {
            (current + 1) % av.len()
        };
        let s = edge_separation(a, b, av, an, bv, candidate);
        if s > 0.0 {
            return (candidate, s);
        }
        if s <= value {
            return (current, value);
        }
        current = candidate;
        value = s;
    }
}
fn clip(input: &[ClipVertex], normal: Vec2, offset: f64) -> Vec<ClipVertex> {
    let d0 = normal.dot(input[0].point) - offset;
    let d1 = normal.dot(input[1].point) - offset;
    let mut out = vec![];
    if d0 <= 0.0 {
        out.push(input[0]);
    }
    if d1 <= 0.0 {
        out.push(input[1]);
    }
    if d0 * d1 < 0.0 {
        let f = d0 / (d0 - d1);
        out.push(ClipVertex {
            point: Vec2::new(
                input[0].point.x + f * (input[1].point.x - input[0].point.x),
                input[0].point.y + f * (input[1].point.y - input[0].point.y),
            ),
            id: if d0 > 0.0 { input[0].id } else { input[1].id },
        });
    }
    out
}
pub fn collide(
    a: &Body,
    b: &Body,
    av: &[Vec2],
    an: &[Vec2],
    bv: &[Vec2],
    bn: &[Vec2],
) -> Vec<Manifold> {
    let (ea, sa) = find_separation(a, b, av, an, bv);
    if sa > 0.0 {
        return vec![];
    }
    let (eb, sb) = find_separation(b, a, bv, bn, av);
    if sb > 0.0 {
        return vec![];
    }
    let (reference, incident, rv, rn, iv, inn, edge, flip) = if sb > 0.98 * sa + 0.001 {
        (b, a, bv, bn, av, an, eb, 1u32)
    } else {
        (a, b, av, an, bv, bn, ea, 0u32)
    };
    let normal = incident.rot().transpose(reference.rot().apply(rn[edge]));
    let mut incident_edge = 0;
    let mut best = f64::MAX;
    for (i, n) in inn.iter().enumerate() {
        let d = normal.x * n.x + normal.y * n.y;
        if d < best {
            best = d;
            incident_edge = i;
        }
    }
    let j = (incident_edge + 1) % iv.len();
    let input = [
        ClipVertex {
            point: incident.world_point(iv[incident_edge]),
            id: edge as u32 | ((incident_edge as u32) << 8),
        },
        ClipVertex {
            point: incident.world_point(iv[j]),
            id: edge as u32 | ((j as u32) << 8) | (1 << 16),
        },
    ];
    let first = rv[edge];
    let second = rv[(edge + 1) % rv.len()];
    let tangent = reference.rot().apply(second - first);
    let tangent = tangent * (1.0 / tangent.length());
    let outward = Vec2::new(tangent.y, -tangent.x);
    let first = reference.world_point(first);
    let second = reference.world_point(second);
    let front = outward.dot(first);
    let side1 = -tangent.dot(first);
    let side2 = tangent.dot(second);
    let points = clip(&input, -tangent, side1);
    if points.len() < 2 {
        return vec![];
    }
    let points = clip(&points, tangent, side2);
    if points.len() < 2 {
        return vec![];
    }
    let normal = if flip != 0 { -outward } else { outward };
    let mut out = vec![];
    for p in points {
        let separation = outward.x * p.point.x + outward.y * p.point.y - front;
        if separation <= 0.0 {
            out.push(Manifold {
                normal,
                local_a: a.local_point(p.point),
                local_b: b.local_point(p.point),
                separation,
                id: p.id | (flip << 24),
            });
        }
    }
    out
}
