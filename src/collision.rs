//! Contact geometry ported from b2Collision in the supplied SWF.
use crate::{
    body::{Body, Shape},
    math::Vec2,
};

#[derive(Clone, Copy, Debug)]
pub struct Manifold {
    pub normal: Vec2,
    pub local_a: Vec2,
    pub local_b: Vec2,
    pub separation: f64,
    pub id: u32,
}

pub fn collide(a: &Body, b: &Body) -> Vec<Manifold> {
    match (&a.shape, &b.shape) {
        (Shape::Circle { radius: ra }, Shape::Circle { radius: rb }) => {
            circles(a, b, *ra, *rb).into_iter().collect()
        }
        (Shape::Polygon { vertices, normals }, Shape::Circle { radius }) => {
            polygon_circle(a, b, vertices, normals, *radius)
                .into_iter()
                .collect()
        }
        (
            Shape::Polygon {
                vertices: av,
                normals: an,
            },
            Shape::Polygon {
                vertices: bv,
                normals: bn,
            },
        ) => crate::polygon::collide(a, b, av, an, bv, bn),
        _ => vec![],
    }
}
fn circles(a: &Body, b: &Body, ra: f64, rb: f64) -> Option<Manifold> {
    let d = b.position - a.position;
    let d2 = d.dot(d);
    let radius = ra + rb;
    if d2 > radius * radius {
        return None;
    }
    let (normal, separation) = if d2 < f64::from_bits(1) {
        (Vec2::new(0.0, 1.0), -radius)
    } else {
        let len = d2.sqrt();
        (d * (1.0 / len), len - radius)
    };
    let pa = a.position + normal * ra;
    let pb = b.position - normal * rb;
    let point = Vec2::new(0.5 * (pa.x + pb.x), 0.5 * (pa.y + pb.y));
    Some(Manifold {
        normal,
        local_a: a.local_point(point),
        local_b: b.local_point(point),
        separation,
        id: 0,
    })
}
fn polygon_circle(
    a: &Body,
    b: &Body,
    vertices: &[Vec2],
    normals: &[Vec2],
    radius: f64,
) -> Option<Manifold> {
    let center = a.local_point(b.position);
    let mut face = 0;
    let mut separation = -f64::MAX;
    for i in 0..vertices.len() {
        let s = normals[i].dot(center - vertices[i]);
        if s > radius {
            return None;
        }
        if s > separation {
            separation = s;
            face = i;
        }
    }
    let (normal, distance, id) = if separation < f64::from_bits(1) {
        (
            a.rot().apply(normals[face]),
            separation,
            ((face as u32) << 8) | (255 << 16),
        )
    } else {
        let next = (face + 1) % vertices.len();
        let v = vertices[face];
        let edge = vertices[next] - v;
        let length = edge.length();
        let unit = Vec2::new(edge.x / length, edge.y / length);
        let projection = (center - v).dot(unit);
        let (closest, id) = if projection <= 0.0 {
            (v, (255 << 8) | ((face as u32) << 16))
        } else if projection >= length {
            (vertices[next], (255 << 8) | ((next as u32) << 16))
        } else {
            (
                Vec2::new(unit.x * projection + v.x, unit.y * projection + v.y),
                ((face as u32) << 8) | (255 << 16),
            )
        };
        let delta = center - closest;
        let distance = delta.length();
        if distance > radius {
            return None;
        }
        (
            a.rot()
                .apply(Vec2::new(delta.x / distance, delta.y / distance)),
            distance,
            id,
        )
    };
    let point = b.position - normal * radius;
    Some(Manifold {
        normal,
        local_a: a.local_point(point),
        local_b: b.local_point(point),
        separation: distance - radius,
        id,
    })
}
