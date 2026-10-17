use crate::math::{Rot, Vec2};

#[derive(Clone, Debug)]
pub enum Shape {
    Circle {
        radius: f64,
    },
    Polygon {
        vertices: Vec<Vec2>,
        normals: Vec<Vec2>,
    },
}

#[derive(Clone, Debug)]
pub struct Body {
    pub position: Vec2,
    pub angle: f64,
    pub velocity: Vec2,
    pub omega: f64,
    pub mass: f64,
    pub inv_mass: f64,
    pub inertia: f64,
    pub inv_i: f64,
    pub local_center: Vec2,
    pub center: Vec2,
    pub shape: Shape,
    pub friction: f64,
    pub restitution: f64,
    pub fixed_rotation: bool,
    pub group: i32,
    pub active: bool,
    pub sleeping: bool,
    pub sleep_time: f64,
    pub allow_sleep: bool,
    pub bullet: bool,
    pub linear_damping: f64,
    pub angular_damping: f64,
}
impl Body {
    pub fn circle(
        position: Vec2,
        radius: f64,
        density: f64,
        friction: f64,
        restitution: f64,
        fixed: bool,
    ) -> Self {
        let mass = density * std::f64::consts::PI * radius * radius;
        let inertia = mass * (0.5 * radius * radius);
        Self::make(
            position,
            Shape::Circle { radius },
            mass,
            inertia,
            Vec2::default(),
            friction,
            restitution,
            fixed,
        )
    }
    pub fn rectangle(
        position: Vec2,
        hx: f64,
        hy: f64,
        density: f64,
        friction: f64,
        restitution: f64,
        fixed: bool,
    ) -> Self {
        let vertices = vec![
            Vec2::new(-hx, -hy),
            Vec2::new(hx, -hy),
            Vec2::new(hx, hy),
            Vec2::new(-hx, hy),
        ];
        Self::polygon(position, vertices, density, friction, restitution, fixed)
    }
    pub fn polygon(
        position: Vec2,
        vertices: Vec<Vec2>,
        density: f64,
        friction: f64,
        restitution: f64,
        fixed: bool,
    ) -> Self {
        assert!((3..=8).contains(&vertices.len()));
        for i in 0..vertices.len() {
            let edge = vertices[(i + 1) % vertices.len()] - vertices[i];
            assert!(edge.length() > 0.005);
            // The Flash API requires strictly convex counter-clockwise vertices.
            for j in 0..vertices.len() {
                if j != i && j != (i + 1) % vertices.len() {
                    assert!(edge.cross(vertices[j] - vertices[i]) > 0.0);
                }
            }
        }
        // b2PolygonShape.ComputeMass, not a rearranged closed-form box formula.
        let mut area = 0.0;
        let mut center = Vec2::default();
        let mut integral = 0.0;
        let third = 1.0 / 3.0;
        for i in 0..vertices.len() {
            let p = vertices[i];
            let q = vertices[(i + 1) % vertices.len()];
            let d = p.cross(q);
            let tri = 0.5 * d;
            area += tri;
            center.x += tri * third * (p.x + q.x);
            center.y += tri * third * (p.y + q.y);
            let ix = p.x * p.x + q.x * p.x + q.x * q.x;
            let iy = p.y * p.y + q.y * p.y + q.y * q.y;
            integral += (0.25 * third * d) * (ix + iy);
        }
        let inv_area = 1.0 / area;
        center.x *= inv_area;
        center.y *= inv_area;
        let normals = (0..vertices.len())
            .map(|i| {
                let e = vertices[(i + 1) % vertices.len()] - vertices[i];
                let inv = 1.0 / e.length();
                Vec2::new(e.y * inv, -e.x * inv)
            })
            .collect();
        Self::make(
            position,
            Shape::Polygon { vertices, normals },
            density * area,
            density * integral,
            center,
            friction,
            restitution,
            fixed,
        )
    }
    // Preserve the one-to-one mapping to the original shape and mass properties.
    #[allow(clippy::too_many_arguments)]
    fn make(
        position: Vec2,
        shape: Shape,
        mass: f64,
        mut inertia: f64,
        local_center: Vec2,
        friction: f64,
        restitution: f64,
        fixed: bool,
    ) -> Self {
        let inv_mass = if mass > 0.0 { 1.0 / mass } else { 0.0 };
        let inv_i = if inertia > 0.0 && !fixed {
            inertia -= mass * local_center.dot(local_center);
            1.0 / inertia
        } else {
            inertia = 0.0;
            0.0
        };
        Self {
            position,
            angle: 0.0,
            velocity: Vec2::default(),
            omega: 0.0,
            mass,
            inv_mass,
            inertia,
            inv_i,
            local_center,
            center: position + local_center,
            shape,
            friction,
            restitution,
            fixed_rotation: fixed,
            group: 0,
            active: true,
            sleeping: false,
            sleep_time: 0.0,
            allow_sleep: true,
            bullet: false,
            linear_damping: 0.0,
            angular_damping: 0.0,
        }
    }
    pub fn wake(&mut self) {
        self.sleeping = false;
        self.sleep_time = 0.0;
    }
    pub fn is_static(&self) -> bool {
        self.inv_mass == 0.0 && self.inv_i == 0.0
    }
    pub fn rot(&self) -> Rot {
        Rot::new(self.angle)
    }
    pub fn world_point(&self, p: Vec2) -> Vec2 {
        self.position + self.rot().apply(p)
    }
    pub fn local_point(&self, p: Vec2) -> Vec2 {
        self.rot().transpose(p - self.position)
    }
    pub fn synchronize(&mut self) {
        self.position = self.center - self.rot().apply(self.local_center);
    }
    pub fn set_transform(&mut self, p: Vec2, angle: f64) {
        self.position = p;
        self.angle = angle;
        self.center = p + self.rot().apply(self.local_center);
    }
}
