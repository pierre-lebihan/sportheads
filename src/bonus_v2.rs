//! Five opt-in bonuses, separate from the original Flash pickup rules.
use crate::{body::Shape, game::Game, math::Vec2, world::DT};

pub const FIRST: u32 = 19;
pub const LAST: u32 = 26;
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BonusesV2 {
    pub charged: [u32; 2],
    pub shield: [u32; 2],
    pub spring: [u32; 2],
    pub heavy: u32,
    pub trampoline: u32,
    pub shot_trail: u32,
    pub shield_flash: [u32; 2],
    pub trampoline_flash: u32,
    pub spring_flash: [u32; 2],
    spring_cooldown: [u32; 2],
    trampoline_cooldown: [u32; 3],
}
impl BonusesV2 {
    pub fn value(&self, field: u32) -> u32 {
        match field {
            1..=2 => self.charged[field as usize - 1],
            3..=4 => self.shield[field as usize - 3],
            5..=6 => self.spring[field as usize - 5],
            7 => self.heavy,
            8 => self.trampoline,
            9 => self.shot_trail,
            10..=11 => self.shield_flash[field as usize - 10],
            12 => self.trampoline_flash,
            13..=14 => self.spring_flash[field as usize - 13],
            _ => 0,
        }
    }
}
fn radius(game: &Game, index: usize) -> f64 {
    match game.world.bodies[index].shape {
        Shape::Circle { radius } => radius,
        _ => 0.0,
    }
}
fn capped(velocity: Vec2) -> Vec2 {
    let length = velocity.length();
    if length > 520.0 {
        velocity * (520.0 / length)
    } else {
        velocity
    }
}
impl Game {
    pub fn set_bonus_mode(&mut self, mode: u32) {
        let mode = mode.min(2);
        if mode != 2 {
            if self.v2.heavy > 0 {
                self.scale_ball_mass(0.5);
            }
            self.v2 = BonusesV2::default();
            self.pickups.retain(|pickup| pickup.kind <= 18);
            if self.notice > 18 {
                self.notice = 0;
                self.notice_ticks = 0;
            }
        }
        if mode == 0 {
            self.pickups.clear();
        }
        self.bonus_mode = mode;
        self.bonus_enabled = self.bonus_mode != 0;
    }
    pub(crate) fn scale_ball_mass(&mut self, factor: f64) {
        let ball = &mut self.world.bodies[self.ball];
        ball.mass *= factor;
        ball.inertia *= factor;
        ball.inv_mass /= factor;
        ball.inv_i /= factor;
        ball.wake();
    }
    pub fn collect_id(&mut self, kind: u32, side: usize) {
        if side >= 2 {
            return;
        }
        if let Some(original) = crate::powerups::Kind::from_id(kind) {
            self.collect(original, side);
            return;
        }
        if self.bonus_mode != 2 || !(FIRST..=LAST).contains(&kind) {
            return;
        }
        self.notice = kind;
        self.notice_ticks = 70;
        self.sounds |= 32;
        match kind {
            19 | 24 => self.v2.charged[if kind == 24 { 1 - side } else { side }] = 240,
            20 | 25 => self.v2.shield[if kind == 25 { 1 - side } else { side }] = 150,
            21 => {
                if self.v2.heavy == 0 {
                    self.scale_ball_mass(2.0);
                }
                self.v2.heavy = 180;
            }
            22 | 26 => self.v2.spring[if kind == 26 { 1 - side } else { side }] = 180,
            23 => self.v2.trampoline = 180,
            _ => unreachable!(),
        }
    }
    pub(crate) fn tick_v2(&mut self) {
        if self.v2.heavy == 1 {
            self.scale_ball_mass(0.5);
        }
        for array in [
            &mut self.v2.charged,
            &mut self.v2.shield,
            &mut self.v2.spring,
            &mut self.v2.shield_flash,
            &mut self.v2.spring_flash,
            &mut self.v2.spring_cooldown,
        ] {
            for timer in array {
                *timer = timer.saturating_sub(1);
            }
        }
        for timer in &mut self.v2.trampoline_cooldown {
            *timer = timer.saturating_sub(1);
        }
        for timer in [
            &mut self.v2.heavy,
            &mut self.v2.trampoline,
            &mut self.v2.shot_trail,
            &mut self.v2.trampoline_flash,
        ] {
            *timer = timer.saturating_sub(1);
        }
    }
    pub(crate) fn before_v2_step(&mut self) -> [(Vec2, f64); 3] {
        if self.v2.heavy > 0 {
            self.world.bodies[self.ball].velocity.y += 300.0 * DT;
            self.world.bodies[self.ball].wake();
        }
        [self.player[0], self.player[1], self.ball].map(|index| {
            let body = &self.world.bodies[index];
            (body.position, body.velocity.y)
        })
    }
    pub(crate) fn after_v2_step(&mut self, input: u32, before: [(Vec2, f64); 3]) {
        if self.v2.charged == [0; 2]
            && self.v2.shield == [0; 2]
            && self.v2.spring == [0; 2]
            && self.v2.trampoline == 0
        {
            return;
        }
        let contacts = self.world.contact_pairs();
        let touching = |a, b| {
            contacts
                .iter()
                .any(|&(x, y, count)| count > 0 && ((a == x && b == y) || (a == y && b == x)))
        };
        for side in 0..2 {
            if self.v2.charged[side] > 0
                && input & (8 << (side * 4)) != 0
                && !self.powerups.broken[side]
                && !self.powerups.bombed[side]
                && touching(self.ball, self.foot[side])
            {
                let offset = self.world.bodies[self.ball].position
                    - self.world.bodies[self.foot[side]].position;
                let normal = if offset.length() > 0.001 {
                    offset * (1.0 / offset.length())
                } else {
                    Vec2::new(if side == 0 { 1.0 } else { -1.0 }, 0.0)
                };
                let ball = &mut self.world.bodies[self.ball];
                ball.velocity = capped(ball.velocity + normal * 220.0);
                ball.wake();
                self.v2.charged[side] = 0;
                self.v2.shot_trail = 12;
                self.sounds |= 1;
            }
            if self.v2.spring[side] > 0
                && self.v2.spring_cooldown[side] == 0
                && touching(self.ball, self.player[side])
            {
                let offset = self.world.bodies[self.ball].position
                    - self.world.bodies[self.player[side]].position;
                let normal = if offset.length() > 0.001 {
                    offset * (1.0 / offset.length())
                } else {
                    Vec2::new(0.0, -1.0)
                };
                let ball = &mut self.world.bodies[self.ball];
                ball.velocity =
                    capped(ball.velocity + normal * (240.0 - ball.velocity.dot(normal)).max(0.0));
                ball.wake();
                self.v2.spring_cooldown[side] = 6;
                self.v2.spring_flash[side] = 10;
                self.last_touch = side;
                self.sounds |= 16;
            }
        }
        if self.v2.trampoline > 0 {
            for (slot, index) in [self.player[0], self.player[1], self.ball]
                .into_iter()
                .enumerate()
            {
                let p = self.world.bodies[index].position;
                if self.v2.trampoline_cooldown[slot] == 0
                    && before[slot].1 >= 0.0
                    && (320.0..=480.0).contains(&p.x)
                    && touching(index, 11)
                {
                    self.world.bodies[index].velocity.y = if slot == 2 { -360.0 } else { -310.0 };
                    self.world.bodies[index].wake();
                    self.v2.trampoline_cooldown[slot] = 10;
                    self.v2.trampoline_flash = 10;
                    self.sounds |= 2;
                }
            }
        }
        // Swept interception prevents a fast ball crossing both shield and goal
        // during one substep. Only incoming balls hit the one-use protection.
        let old = before[2].0;
        for side in 0..2 {
            if self.v2.shield[side] == 0 {
                continue;
            }
            let ball = &self.world.bodies[self.ball];
            let new = ball.position;
            let r = radius(self, self.ball);
            let plane = if side == 0 { 85.0 + r } else { 715.0 - r };
            let crossed = if side == 0 {
                old.x >= plane && new.x < plane
            } else {
                old.x <= plane && new.x > plane
            };
            if !crossed {
                continue;
            }
            let fraction = (plane - old.x) / (new.x - old.x);
            let y = old.y + (new.y - old.y) * fraction;
            if y + r < 460.0 - self.goal_height(side) as f64 || y - r > 460.0 {
                continue;
            }
            let vx = ball.velocity.x.abs().max(140.0) * if side == 0 { 1.0 } else { -1.0 };
            let angle = ball.angle;
            self.world
                .set_transform(self.ball, Vec2::new(plane, y), angle);
            self.world.bodies[self.ball].velocity.x = vx;
            self.world.bodies[self.ball].wake();
            self.v2.shield[side] = 0;
            self.v2.shield_flash[side] = 12;
            self.sounds |= 16;
        }
    }
}
