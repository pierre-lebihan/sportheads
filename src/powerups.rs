//! The original 18 pickup rules. Side 0 is opp/left; side 1 is hero/right.
//! Timer mistakes and asymmetric durations are preserved from PUHandler_116.as.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Kind {
    SpeedGood = 1,
    SpeedBad,
    JumpGood,
    JumpBad,
    IceGood,
    IceBad,
    GoalBig,
    GoalSmall,
    Bombs,
    BigBall,
    BouncyBall,
    SmallBall,
    DeadBall,
    PlayerBig,
    PlayerSmall,
    BreakGood,
    BreakBad,
    Streaker,
}

impl Kind {
    pub const ALL: [Self; 18] = [
        Self::SpeedGood,
        Self::SpeedBad,
        Self::JumpGood,
        Self::JumpBad,
        Self::IceGood,
        Self::IceBad,
        Self::GoalBig,
        Self::GoalSmall,
        Self::Bombs,
        Self::BigBall,
        Self::BouncyBall,
        Self::SmallBall,
        Self::DeadBall,
        Self::PlayerBig,
        Self::PlayerSmall,
        Self::BreakGood,
        Self::BreakBad,
        Self::Streaker,
    ];

    pub fn from_id(id: u32) -> Option<Self> {
        id.checked_sub(1)
            .and_then(|index| Self::ALL.get(index as usize).copied())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Effect {
    ResizePlayer(usize, f64),
    /// Original PUSize/PUBouncy values, not pixel radii: radius=5+size*5.
    ResizeBall(u8, u8),
    /// Physical goal side and display hit-box height; bottom remains y=460.
    GoalSize(usize, u32),
    SpawnBomb,
    SpawnStreaker,
    RemoveStreaker,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Timers {
    pub speed: [u32; 2],
    pub jump: [u32; 2],
    pub ice: [u32; 2],
    pub goals: [u32; 2],
    pub size: [u32; 2],
    pub broken: [u32; 2],
    pub fire: u32,
    pub ball_size: u32,
    pub bounce: u32,
    pub streaker: u32,
}

impl Default for Timers {
    fn default() -> Self {
        Self {
            speed: [10_000; 2],
            jump: [10_000; 2],
            ice: [10_000; 2],
            goals: [10_000; 2],
            size: [10_000; 2],
            broken: [10_000; 2],
            fire: 10_000,
            ball_size: 10_000,
            bounce: 10_000,
            streaker: 10_000,
        }
    }
}

impl Timers {
    fn advance(&mut self) {
        for array in [
            &mut self.speed,
            &mut self.jump,
            &mut self.ice,
            &mut self.goals,
            &mut self.size,
            &mut self.broken,
        ] {
            for timer in array {
                *timer = timer.wrapping_add(1);
            }
        }
        for timer in [
            &mut self.fire,
            &mut self.ball_size,
            &mut self.bounce,
            &mut self.streaker,
        ] {
            *timer = timer.wrapping_add(1);
        }
    }
}

#[derive(Clone, Debug)]
pub struct Powerups {
    pub speed: [u8; 2],
    pub jump: [u8; 2],
    pub freeze: [bool; 2],
    pub broken: [bool; 2],
    pub bombed: [bool; 2],
    pub scale: [f64; 2],
    pub goal_height: [u32; 2],
    /// The original *PUBombs flags are goal-size bookkeeping, not falling bombs.
    pub goal_flags: [bool; 2],
    pub ball_size: u8,
    pub bounce: u8,
    pub fire: bool,
    pub streaker_alive: bool,
    pub timers: Timers,
}

impl Default for Powerups {
    fn default() -> Self {
        Self {
            speed: [1; 2],
            jump: [1; 2],
            freeze: [false; 2],
            broken: [false; 2],
            bombed: [false; 2],
            scale: [1.0; 2],
            goal_height: [100; 2],
            goal_flags: [true; 2],
            ball_size: 1,
            bounce: 1,
            fire: false,
            streaker_alive: false,
            timers: Timers::default(),
        }
    }
}

impl Powerups {
    pub fn new() -> Self {
        Self::default()
    }

    /// Called at PUColissions, before step() in the same active game frame.
    pub fn apply(&mut self, kind: Kind, collector: usize) -> Vec<Effect> {
        assert!(collector < 2);
        let other = 1 - collector;
        let mut effects = Vec::new();
        match kind {
            Kind::SpeedGood | Kind::SpeedBad => {
                self.speed[collector] = if kind == Kind::SpeedGood { 2 } else { 0 };
                self.timers.speed[collector] = 0;
            }
            Kind::JumpGood => {
                self.jump[collector] = 2;
                self.timers.jump[collector] = 0;
            }
            Kind::JumpBad => {
                self.jump[collector] = 0;
                // Hero's low-jump branch resets its speed timer by mistake.
                if collector == 1 {
                    self.timers.speed[collector] = 0;
                } else {
                    self.timers.jump[collector] = 0;
                }
            }
            Kind::IceGood => {
                self.freeze[other] = true;
                // Hero's beneficial ice pickup resets opp speed, not opp ice.
                if collector == 1 {
                    self.timers.speed[other] = 0;
                } else {
                    self.timers.ice[other] = 0;
                }
            }
            Kind::IceBad => {
                self.freeze[collector] = true;
                self.timers.ice[collector] = 0;
            }
            Kind::GoalBig => {
                self.goal_height[other] = 140;
                self.goal_flags[other] = true;
                // Opp's branch also sets its own flag without resetting that timer.
                if collector == 0 {
                    self.goal_flags[collector] = true;
                }
                self.timers.goals[other] = 0;
                effects.push(Effect::GoalSize(other, 140));
            }
            Kind::GoalSmall => {
                // The original malus shrinks the opponent's goal as well.
                self.goal_height[other] = 60;
                self.goal_flags[collector] = true;
                self.timers.goals[collector] = 0;
                effects.push(Effect::GoalSize(other, 60));
            }
            Kind::Bombs => {
                self.fire = true;
                self.timers.fire = 0;
            }
            Kind::BigBall => {
                self.ball_size = 2;
                effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
                self.timers.ball_size = 0;
            }
            Kind::BouncyBall => {
                self.bounce = 2;
                effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
                // Original typo: resets size timer, not bounciness timer.
                self.timers.ball_size = 0;
            }
            Kind::SmallBall => {
                self.ball_size = 0;
                effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
                // Original typo: resets bounce timer, not size timer.
                self.timers.bounce = 0;
            }
            Kind::DeadBall => {
                self.bounce = 0;
                effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
                self.timers.bounce = 0;
            }
            Kind::PlayerBig | Kind::PlayerSmall => {
                self.scale[collector] = if kind == Kind::PlayerBig { 1.5 } else { 0.5 };
                self.timers.size[collector] = 0;
                effects.push(Effect::ResizePlayer(collector, self.scale[collector]));
            }
            Kind::BreakGood | Kind::BreakBad => {
                let target = if kind == Kind::BreakGood {
                    other
                } else {
                    collector
                };
                self.broken[target] = true;
                self.timers.broken[target] = 0;
            }
            Kind::Streaker => {
                if !self.streaker_alive {
                    self.streaker_alive = true;
                    effects.push(Effect::SpawnStreaker);
                }
                self.timers.streaker = 0;
            }
        }
        effects
    }

    /// PUHandler.Update increments all uint timers, then tests exact equality.
    pub fn step(&mut self) -> Vec<Effect> {
        self.timers.advance();
        let mut effects = Vec::new();
        // Preserve hero-before-opp ordering if multiple timers expire together.
        for side in [1, 0] {
            if self.timers.speed[side] == 200 {
                self.speed[side] = 1;
            }
            if self.timers.jump[side] == 200 {
                self.jump[side] = 1;
            }
            if self.timers.ice[side] == 200 {
                self.freeze[side] = false;
            }
            if self.timers.goals[side] == 600 {
                self.goal_flags[side] = false;
                self.reset_goals(&mut effects);
            }
            if self.timers.size[side] == 600 {
                self.scale[side] = 1.0;
                effects.push(Effect::ResizePlayer(side, 1.0));
            }
            if self.timers.broken[side] == if side == 1 { 200 } else { 400 } {
                self.broken[side] = false;
            }
        }
        if self.timers.fire == 700 {
            self.fire = false;
            self.bombed = [false; 2];
        }
        if self.timers.ball_size == 400 {
            self.ball_size = 1;
            effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
        }
        if self.timers.bounce == 200 {
            self.bounce = 1;
            effects.push(Effect::ResizeBall(self.ball_size, self.bounce));
        }
        if self.timers.streaker == 1000 {
            self.streaker_alive = false;
            effects.push(Effect::RemoveStreaker);
        }
        if matches!(self.timers.fire, 1 | 40 | 80) {
            effects.push(Effect::SpawnBomb);
        }
        effects
    }

    fn reset_goals(&mut self, effects: &mut Vec<Effect>) {
        self.goal_height = [100; 2];
        // resetGoalSizes overwrites the flag just set false by the expiry branch.
        self.goal_flags = [true; 2];
        effects.extend([Effect::GoalSize(0, 100), Effect::GoalSize(1, 100)]);
    }

    /// resetPUVars + freshly constructed pitch; timers and broken legs survive.
    pub fn reset_round(&mut self) {
        self.speed = [1; 2];
        self.jump = [1; 2];
        self.freeze = [false; 2];
        self.bombed = [false; 2];
        self.scale = [1.0; 2];
        self.goal_height = [100; 2];
        self.goal_flags = [true; 2];
        self.ball_size = 1;
        self.bounce = 1;
        self.fire = false;
        self.streaker_alive = false;
    }
}
