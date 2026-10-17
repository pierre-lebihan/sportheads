//! Double-precision operations in the order used by the embedded AS3 engine.
use std::ops::{Add, Mul, Neg, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}
impl Vec2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    pub fn dot(self, b: Self) -> f64 {
        self.x * b.x + self.y * b.y
    }
    pub fn cross(self, b: Self) -> f64 {
        self.x * b.y - self.y * b.x
    }
    pub fn length(self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}
impl Add for Vec2 {
    type Output = Self;
    fn add(self, b: Self) -> Self {
        Self::new(self.x + b.x, self.y + b.y)
    }
}
impl Sub for Vec2 {
    type Output = Self;
    fn sub(self, b: Self) -> Self {
        Self::new(self.x - b.x, self.y - b.y)
    }
}
impl Mul<f64> for Vec2 {
    type Output = Self;
    fn mul(self, k: f64) -> Self {
        Self::new(self.x * k, self.y * k)
    }
}
impl Neg for Vec2 {
    type Output = Self;
    fn neg(self) -> Self {
        Self::new(-self.x, -self.y)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Rot {
    pub c: f64,
    pub s: f64,
}
impl Rot {
    pub fn new(angle: f64) -> Self {
        Self {
            c: angle.cos(),
            s: angle.sin(),
        }
    }
    pub fn apply(self, v: Vec2) -> Vec2 {
        Vec2::new(self.c * v.x + -self.s * v.y, self.s * v.x + self.c * v.y)
    }
    pub fn transpose(self, v: Vec2) -> Vec2 {
        Vec2::new(v.x * self.c + v.y * self.s, v.x * -self.s + v.y * self.c)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Mat22 {
    pub a11: f64,
    pub a12: f64,
    pub a21: f64,
    pub a22: f64,
}
impl Mat22 {
    pub fn solve(self, b: Vec2) -> Vec2 {
        let det = self.a11 * self.a22 - self.a12 * self.a21;
        let inv = if det != 0.0 { 1.0 / det } else { 0.0 };
        Vec2::new(
            inv * (self.a22 * b.x - self.a12 * b.y),
            inv * (self.a11 * b.y - self.a21 * b.x),
        )
    }
}

pub fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    x.max(lo).min(hi)
}
