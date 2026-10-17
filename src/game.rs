//! Two-player match rules and bonuses transcribed from the original ActionScript.
//! Left player: A/D/W/Space. Right player: arrows/P. No opponent AI or upgrades.
use crate::{
    body::Body,
    math::Vec2,
    powerups::{Effect, Kind, Powerups},
    world::World,
};
use std::f64::consts::PI;

pub const LEFT_LEFT: u32 = 1;
pub const LEFT_RIGHT: u32 = 2;
pub const LEFT_JUMP: u32 = 4;
pub const LEFT_KICK: u32 = 8;
pub const RIGHT_LEFT: u32 = 16;
pub const RIGHT_RIGHT: u32 = 32;
pub const RIGHT_JUMP: u32 = 64;
pub const RIGHT_KICK: u32 = 128;
pub const MATCH_TICKS: u32 = 60 * 30;
pub const COUNTDOWN_TICKS: u32 = 89;
pub const GOAL_TICKS: u32 = 15;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Phase {
    Countdown = 0,
    Playing = 1,
    Goal = 2,
    Finished = 3,
}

#[derive(Clone, Debug)]
pub struct Pickup {
    pub kind: Kind,
    pub position: Vec2,
    pub ttl: i32,
}
#[derive(Clone, Debug)]
pub struct Bomb {
    pub position: Vec2,
    pub vy: f64,
}
#[derive(Clone, Debug)]
pub struct VisualEffect {
    pub kind: u32,
    pub position: Vec2,
    pub velocity: Vec2,
    pub age: u32,
    pub width: f64,
    pub height: f64,
}
pub struct Game {
    pub world: World,
    /// Left, then right, throughout this API.
    pub player: [usize; 2],
    pub foot: [usize; 2],
    pub joints: [usize; 2],
    pub ball: usize,
    pub score: [u32; 2],
    pub phase: Phase,
    pub remaining_ticks: u32,
    pub countdown: u32,
    pub tick_number: u32,
    pub last_scorer: Option<usize>,
    pub xspeed: [f64; 2],
    /// Flash tests the current head bitmap's height when deciding to jump.
    pub head_height: [f64; 2],
    random_state: u32,
    pub powerups: Powerups,
    pub pickups: Vec<Pickup>,
    pub bombs: Vec<Bomb>,
    pub effects: Vec<VisualEffect>,
    pub streaker: Option<usize>,
    streaker_target: f64,
    pub bonus_enabled: bool,
    pub mode: u32,
    pub target_score: u32,
    pub pitch: u32,
    pub goal_style: u32,
    pub active_ticks: u32,
    spawn_timer: u32,
    pub last_touch: usize,
    pub notice: u32,
    pub notice_ticks: u32,
    pub sounds: u32,
}

impl Default for Game {
    fn default() -> Self {
        Self::new(1)
    }
}

impl Game {
    pub fn new(seed: u32) -> Self {
        Self::on_pitch(seed, 8)
    }

    fn on_pitch(seed: u32, pitch: u32) -> Self {
        let mut game = Self {
            world: World::new(Vec2::new(0.0, 300.0)),
            player: [0; 2],
            foot: [0; 2],
            joints: [0; 2],
            ball: 0,
            score: [0; 2],
            phase: Phase::Countdown,
            remaining_ticks: MATCH_TICKS,
            countdown: COUNTDOWN_TICKS,
            tick_number: 0,
            last_scorer: None,
            xspeed: [0.0; 2],
            head_height: [43.0; 2],
            random_state: seed,
            powerups: Powerups::new(),
            pickups: vec![],
            bombs: vec![],
            effects: vec![],
            streaker: None,
            streaker_target: 400.0,
            bonus_enabled: false,
            mode: 0,
            target_score: 7,
            pitch: pitch.clamp(2, 20),
            goal_style: 0,
            active_ticks: 0,
            spawn_timer: 0,
            last_touch: 1,
            notice: 0,
            notice_ticks: 0,
            sounds: 0,
        };
        // startLevel consumes one random value for the inactive streaker first.
        game.random();
        game.reset_pitch();
        game
    }

    pub fn configured(seed: u32, mode: u32, goal_style: u32, bonus: bool) -> Self {
        let mut g = Self::new(seed);
        g.mode = mode.min(2);
        g.goal_style = goal_style.min(2);
        g.bonus_enabled = bonus;
        g.apply_goal_style();
        g
    }
    pub fn score_match(seed: u32, target: u32, bonus: bool) -> Self {
        Self::score_match_on(seed, target, bonus, 8)
    }
    pub fn score_match_on(seed: u32, target: u32, bonus: bool, pitch: u32) -> Self {
        let mut game = Self::on_pitch(seed, pitch);
        game.mode = 1;
        game.bonus_enabled = bonus;
        game.target_score = target.clamp(1, 99);
        game
    }
    pub fn set_skin(&mut self, side: usize, skin: usize) {
        const HEIGHTS: [f64; 26] = [
            43.0, 44.0, 42.0, 45.0, 45.0, 43.0, 43.0, 50.0, 45.0, 44.0, 45.0, 46.0, 42.0, 43.0,
            44.0, 44.0, 46.0, 50.0, 42.0, 48.0, 42.0, 45.0, 43.0, 46.0, 46.0, 50.0,
        ];
        if side < 2 && (1..=HEIGHTS.len()).contains(&skin) {
            self.head_height[side] = HEIGHTS[skin - 1];
        }
    }
    fn apply_goal_style(&mut self) {
        let height = match self.goal_style {
            1 => 140,
            2 => 60,
            _ => 100,
        };
        for side in 0..2 {
            self.powerups.goal_height[side] = height;
            if self.goal_style != 0 {
                self.powerups.timers.goals[side] = 0;
            }
            self.resize_goal(side, height);
        }
    }
    pub fn restart(&mut self, seed: u32) {
        *self = Self::new(seed);
    }

    fn random(&mut self) -> f64 {
        // The same explicit generator as the seeded Flash comparison oracle.
        self.random_state = self
            .random_state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        f64::from(self.random_state) / 4_294_967_296.0
    }

    fn reset_pitch(&mut self) {
        self.world = World::with_bounds(
            Vec2::new(0.0, 300.0),
            Vec2::new(-20.0, -20.0),
            Vec2::new(820.0, 540.0),
        );
        self.world.continuous = true;
        self.world.allow_sleep = true;
        // MainTimeline.initLevel border bodies, in their original creation order.
        for (x, y, width, height, degrees, group) in [
            (-5.0, 240.0, 20.0, 480.0, 0.0, 0),
            (805.0, 240.0, 20.0, 480.0, 0.0, 0),
            (400.0, -5.0, 800.0, 20.0, 0.0, 0),
            (50.0, 50.0, 60.0, 200.0, 45.0, 0),
            (750.0, 50.0, 60.0, 200.0, -45.0, 0),
            (-20.0, 240.0, 60.0, 520.0, 8.0, 0),
            (820.0, 240.0, 60.0, 520.0, -8.0, 0),
            (240.0, -20.0, 520.0, 60.0, -8.0, 0),
            (560.0, -20.0, 520.0, 60.0, 8.0, 0),
            (40.0, 345.0, 80.0, 10.0, 0.0, 0),
            (760.0, 345.0, 80.0, 10.0, 0.0, 0),
            (400.0, 470.0, 800.0, 20.0, 0.0, -1),
        ] {
            let position = Vec2::new(x, y);
            let mut body =
                Body::rectangle(position, width / 2.0, height / 2.0, 0.0, 0.5, 0.0, false);
            body.set_transform(position, degrees * PI / 180.0);
            body.group = group;
            self.world.add_body(body);
        }
        let mut ball = Body::circle(Vec2::new(400.0, 230.0), 10.0, 1.5, 1.0, 0.6, false);
        ball.velocity = Vec2::new(-150.0 + self.random() * 300.0, -100.0);
        self.ball = self.world.add_body(ball);
        // initLevel also initializes that inactive streaker's next location.
        self.streaker_target = 100.0 + self.random() * 600.0;
        // Right player is created first in Flash (hero), then left (opp).
        for (side, x, offset, angle) in [(1, 600.0, 4.0, PI + 1.37), (0, 200.0, -4.0, PI - 1.37)] {
            let center = Vec2::new(x, 440.0);
            self.player[side] = self
                .world
                .add_body(Body::circle(center, 20.0, 100.0, 0.0, 0.01, true));
            let foot_position = Vec2::new(x + offset, 455.6);
            let spawn = Vec2::new(x - if side == 1 { 20.0 } else { -20.0 }, 440.0);
            let mut foot = Body::rectangle(spawn, 20.0, 5.0, 2.0, 0.5, 1.0, false);
            foot.group = -1;
            self.foot[side] = self.world.add_body(foot);
            self.world
                .set_transform(self.foot[side], foot_position, angle);
            self.joints[side] =
                self.world
                    .add_joint(self.player[side], self.foot[side], center, 100_000_000.0);
        }
        self.pickups.clear();
        crate::pitches::spawn(&mut self.world, self.pitch);
        self.bombs.clear();
        self.effects.clear();
        self.streaker = None;
        self.powerups.reset_round();
        self.last_touch = 1;
        self.apply_goal_style();
        self.phase = Phase::Countdown;
        self.countdown = COUNTDOWN_TICKS;
    }

    /// Apply one original 30 Hz game frame; the world performs three 1/96 steps.
    pub fn step(&mut self, input: u32) {
        self.sounds = 0;
        if self.phase == Phase::Finished {
            return;
        }
        self.tick_number = self.tick_number.wrapping_add(1);
        if self.phase == Phase::Countdown {
            self.countdown = self.countdown.saturating_sub(1);
            if self.countdown == 0 {
                self.phase = Phase::Playing;
                self.sounds |= 8;
            }
            return;
        }
        let celebrating = self.phase == Phase::Goal;
        self.apply_controls(input);
        self.update_bonuses();
        for _ in 0..3 {
            self.world.step();
            for (a, b, speed) in self.world.contact_events.clone() {
                if a == self.ball || b == self.ball {
                    let other = if a == self.ball { b } else { a };
                    for side in 0..2 {
                        if other == self.player[side] || other == self.foot[side] {
                            self.last_touch = side;
                        }
                    }
                    if speed > 200.0 {
                        self.sounds |= 1;
                        self.emit_effect(0, self.world.bodies[self.ball].position, 20.0, 20.0);
                    }
                }
            }
        }
        if !celebrating {
            if let Some(scorer) = self.goal_scorer() {
                self.score[scorer] += 1;
                self.last_scorer = Some(scorer);
                if let Some(i) = self.streaker.take() {
                    self.world.remove_body(i);
                    self.powerups.streaker_alive = false;
                }
                self.phase = Phase::Goal;
                self.countdown = GOAL_TICKS;
                self.sounds |= 4;
                if self.mode == 2 || (self.mode == 1 && self.score[scorer] >= self.target_score) {
                    self.phase = Phase::Finished;
                    self.countdown = 0;
                    self.sounds |= 8;
                    return;
                }
            }
        }
        // The original clock continues during its 15-frame goal celebration.
        if self.mode == 0 {
            self.remaining_ticks = self.remaining_ticks.saturating_sub(1);
        }
        if self.mode == 0 && self.remaining_ticks == 0 {
            self.phase = Phase::Finished;
            self.countdown = 0;
            self.sounds |= 8;
            return;
        }
        if celebrating {
            self.countdown -= 1;
            if self.countdown == 0 {
                self.reset_pitch();
            }
        }
    }

    fn apply_controls(&mut self, input: u32) {
        // Preserve the asymmetries in the original game: only the right head can
        // jump off its opponent, and the x<720 restriction only guards rightward motion.
        for side in [1, 0] {
            let shift = side * 4;
            let keys = (input >> shift) & 15;
            let index = self.player[side];
            let other = self.player[1 - side];
            let position = self.world.bodies[index].position;
            let other_position = self.world.bodies[other].position;
            let moving = !self.powerups.freeze[side] && !self.powerups.bombed[side];
            if keys & 1 != 0 && moving {
                self.xspeed[side] -= 50.0 + 30.0 * self.powerups.speed[side] as f64;
            }
            if keys & 2 != 0 && position.x < 720.0 && moving {
                self.xspeed[side] += 50.0 + 30.0 * self.powerups.speed[side] as f64;
            }
            if moving && position.y > 439.0 && self.active_ticks.is_multiple_of(2) {
                for direction in [1, 2] {
                    if keys & direction != 0 && (direction == 1 || position.x < 720.0) {
                        let vy = self.random() * -2.0;
                        let vx =
                            (self.random() * 2.0 + 2.0) * if direction == 1 { 1.0 } else { -1.0 };
                        self.effects.push(VisualEffect {
                            kind: 4,
                            position: Vec2::new(position.x, 460.0),
                            velocity: Vec2::new(vx, vy),
                            age: 0,
                            width: 10.0,
                            height: 10.0,
                        });
                    }
                }
            }
            let on_head = side == 1
                && (position.x - other_position.x).abs() < 30.0
                && position.y < other_position.y
                && position.y > other_position.y - 45.0
                && self.world.bodies[index].velocity.y >= 1.0;
            if keys & 4 != 0
                && !self.powerups.bombed[side]
                && (position.y + self.head_height[side] * self.powerups.scale[side] / 2.0 > 459.0
                    || on_head)
            {
                self.world.bodies[index].velocity.y =
                    -150.0 - 50.0 * self.powerups.jump[side] as f64;
                self.sounds |= 2;
                let kind = if self.powerups.jump[side] == 0 { 2 } else { 1 };
                self.emit_effect(kind, Vec2::new(position.x, position.y + 20.0), 60.0, 30.0);
                if self.powerups.jump[side] == 2 {
                    self.emit_effect(kind, position, 60.0, 30.0);
                }
            }
            self.xspeed[side] *= 0.7;
            let body = &mut self.world.bodies[index];
            body.velocity.x = self.xspeed[side];
            body.velocity.y += 5.0;
            body.wake();
            let joint = &mut self.world.joints[self.joints[side]];
            let angle = joint.angle(&self.world.bodies);
            if !self.powerups.bombed[side] && (keys & 8 == 0 || !self.powerups.broken[side]) {
                joint.motor_speed = match (side, keys & 8 != 0) {
                    (1, false) => -6.0 * (angle + PI - 1.2 - 1.67),
                    (1, true) => -12.0 * (angle - 0.2 - 1.67),
                    (0, false) => -6.0 * (angle - 0.2 - PI / 2.0 + 1.67),
                    (0, true) => -12.0 * (angle + PI - 1.2 - PI / 2.0 + 1.67),
                    _ => unreachable!(),
                };
                self.world.bodies[self.foot[side]].wake();
            }
        }
    }

    /// Flash uses display-object AABB overlap, not a center crossing the goal line.
    /// Bounds are from root frame 23 / symbol 564 and PUHandler.resetGoalSizes.
    fn ball_display_bounds(&self) -> ((i32, i32), (i32, i32)) {
        let ball = &self.world.bodies[self.ball];
        let degrees = (ball.angle * (180.0 / PI)) % 360.0;
        let radians = degrees * PI / 180.0;
        let scale = (5.0 + self.powerups.ball_size as f64 * 5.0) / 10.0;
        let a = (20.0 * scale / 20.45 * radians.cos()) as f32;
        let b = (20.0 * scale / 20.45 * radians.sin()) as f32;
        let tx = (ball.position.x * 20.0) as i32;
        let ty = (ball.position.y * 20.0) as i32;
        let mut lo = (i32::MAX, i32::MAX);
        let mut hi = (i32::MIN, i32::MIN);
        for x in [-205.0_f32, 204.0] {
            for y in [-204.0_f32, 205.0] {
                let px = (a * x + -b * y).round_ties_even() as i32 + tx;
                let py = (b * x + a * y).round_ties_even() as i32 + ty;
                lo.0 = lo.0.min(px);
                lo.1 = lo.1.min(py);
                hi.0 = hi.0.max(px);
                hi.1 = hi.1.max(py);
            }
        }
        (lo, hi)
    }
    pub fn goal_scorer(&self) -> Option<usize> {
        let (lo, hi) = self.ball_display_bounds();
        if lo.1 > 9200 {
            return None;
        }
        if hi.0 >= -110 && lo.0 <= 1290 && hi.1 >= (460 - self.powerups.goal_height[0] as i32) * 20
        {
            Some(1)
        } else if hi.0 >= 14700
            && lo.0 <= 16100
            && hi.1 >= (460 - self.powerups.goal_height[1] as i32) * 20
        {
            Some(0)
        } else {
            None
        }
    }
    pub fn collect(&mut self, kind: Kind, side: usize) {
        self.notice = kind as u32;
        self.notice_ticks = 70;
        self.sounds |= 32;
        let effects = self.powerups.apply(kind, side);
        self.apply_effects(effects);
    }
    fn resize_goal(&mut self, side: usize, height: u32) {
        let i = if side == 0 { 9 } else { 10 };
        let x = if side == 0 { 40.0 } else { 760.0 };
        self.world
            .set_transform(i, Vec2::new(x, 460.0 - height as f64 - 15.0), 0.0);
    }
    fn emit_effect(&mut self, kind: u32, position: Vec2, width: f64, height: f64) {
        if self.effects.len() < 256 {
            self.effects.push(VisualEffect {
                kind,
                position,
                velocity: Vec2::default(),
                age: 0,
                width,
                height,
            });
        }
    }
    fn apply_effects(&mut self, effects: Vec<Effect>) {
        for effect in effects {
            match effect {
                Effect::GoalSize(side, height) => self.resize_goal(side, height),
                Effect::ResizeBall(size, bounce) => {
                    let old = self.world.bodies[self.ball].clone();
                    self.world.remove_body(self.ball);
                    let mut b = Body::circle(
                        old.position,
                        5.0 + size as f64 * 5.0,
                        0.6,
                        1.0,
                        0.3 + bounce as f64 * 0.3,
                        false,
                    );
                    b.velocity = old.velocity;
                    b.omega = old.omega;
                    self.ball = self.world.add_body(b);
                    self.emit_effect(0, old.position, 40.0, 40.0);
                }
                Effect::ResizePlayer(side, scale) => {
                    let p = self.world.bodies[self.player[side]].position;
                    self.world.remove_body(self.player[side]);
                    self.player[side] =
                        self.world
                            .add_body(Body::circle(p, 20.0 * scale, 100.0, 0.0, 0.01, true));
                    self.world.remove_body(self.foot[side]);
                    let sign = if side == 1 { 1.0 } else { -1.0 };
                    let fp = p + Vec2::new(sign * 4.0 * scale, 15.6 * scale);
                    let spawn = p + Vec2::new(-sign * 20.0 * scale, 0.0);
                    let mut foot =
                        Body::rectangle(spawn, 20.0 * scale, 5.0 * scale, 2.0, 0.5, 1.0, false);
                    foot.group = -1;
                    self.foot[side] = self.world.add_body(foot);
                    self.world
                        .set_transform(self.foot[side], fp, PI + sign * 1.37);
                    self.joints[side] =
                        self.world
                            .add_joint(self.player[side], self.foot[side], p, 100_000_000.0);
                }
                Effect::SpawnBomb => {
                    let x = 20.0 + self.random() * 760.0;
                    self.bombs.push(Bomb {
                        position: Vec2::new(x, 50.0),
                        vy: 0.0,
                    });
                    self.emit_effect(0, Vec2::new(x, 50.0), 40.0, 40.0);
                }
                Effect::SpawnStreaker => {
                    if self.streaker.is_none() {
                        let i = self.world.add_body(Body::circle(
                            Vec2::new(400.0, 300.0),
                            20.0,
                            100.0,
                            0.0,
                            0.01,
                            true,
                        ));
                        self.streaker = Some(i);
                    }
                }
                Effect::RemoveStreaker => {
                    if let Some(i) = self.streaker.take() {
                        self.world.remove_body(i);
                    }
                }
            }
        }
    }
    fn update_bonuses(&mut self) {
        if let Some(i) = self.streaker {
            let p = self.world.bodies[i].position;
            if (p.x - self.streaker_target).abs() < 10.0 {
                self.streaker_target = 100.0 + self.random() * 600.0;
            } else {
                self.world.bodies[i].velocity.x = if p.x < self.streaker_target {
                    100.0
                } else {
                    -100.0
                };
            }
            if p.y > 439.0 {
                self.world.bodies[i].velocity.y = -300.0;
            }
            self.world.bodies[i].wake();
        }
        let (lo, hi) = self.ball_display_bounds();
        for side in 0..2 {
            let x = if side == 0 { 0 } else { 720 } * 20;
            let y = (430 - self.powerups.goal_height[side] as i32) * 20;
            if hi.0 >= x && lo.0 <= x + 1600 && hi.1 >= y && lo.1 <= y + 200 {
                self.world.bodies[self.ball].velocity.x += if side == 0 { 2.0 } else { -2.0 };
                self.world.bodies[self.ball].wake();
                break;
            }
        }
        self.active_ticks = self.active_ticks.wrapping_add(1);
        if self.active_ticks.is_multiple_of(2) {
            self.emit_effect(5, self.world.bodies[self.ball].position, 15.0, 15.0);
        }
        if self.notice_ticks > 0 {
            self.notice_ticks -= 1;
        }
        if self.bonus_enabled {
            self.spawn_timer += 1;
            if self.spawn_timer > 200 {
                self.spawn_timer = 0;
                let kind = Kind::from_id((self.random() * 18.0).ceil().max(1.0) as u32).unwrap();
                let p = Vec2::new(220.0 + self.random() * 360.0, 150.0 + self.random() * 270.0);
                self.pickups.push(Pickup {
                    kind,
                    position: p,
                    ttl: 600,
                });
                self.emit_effect(0, p, 40.0, 40.0);
                self.sounds |= 16;
            }
        }
        let ball = self.world.bodies[self.ball].position;
        let mut collected = vec![];
        self.pickups.retain_mut(|p| {
            p.ttl -= 1;
            if (p.position - ball).length() < 35.0 {
                collected.push(p.kind);
                false
            } else {
                p.ttl >= 0
            }
        });
        for kind in collected {
            self.collect(kind, self.last_touch);
        }
        let effects = self.powerups.step();
        self.apply_effects(effects);
        let mut explosions = vec![];
        self.bombs.retain_mut(|b| {
            b.vy += 0.2;
            b.position.y += b.vy;
            if b.position.y >= 470.0 {
                explosions.push(Vec2::new(b.position.x, 470.0));
                false
            } else {
                true
            }
        });
        for p in explosions {
            for side in 0..2 {
                if (p - self.world.bodies[self.player[side]].position).length() < 50.0 {
                    self.powerups.bombed[side] = true;
                }
            }
            self.emit_effect(3, p, 80.0, 80.0);
            self.sounds |= 64;
        }
        self.effects.retain_mut(|e| {
            e.age += 1;
            e.position = e.position + e.velocity;
            match e.kind {
                3 => e.age <= 21,
                4 => e.age <= 10,
                5 => e.age <= 7,
                _ => e.age <= 10,
            }
        });
    }
}
