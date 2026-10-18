use sportheads_core::{game::*, math::Vec2, powerups::Kind};

fn ready() -> Game {
    let mut game = Game::score_match(123, 7, false);
    game.phase = Phase::Playing;
    game.countdown = 0;
    game
}

#[test]
fn every_assistance_level_strengthens_only_the_selected_players_controls() {
    for side in 0..2 {
        let mask = (LEFT_RIGHT | LEFT_JUMP | LEFT_KICK) << (side * 4);
        let mut neutral = ready();
        neutral.step(mask);
        for level in 1..=5 {
            let mut helped = ready();
            helped.set_assistance(side, level);
            helped.step(mask);
            let factor = [1.1, 1.2, 1.3, 1.4, 1.52][(level - 1) as usize];
            assert!((helped.xspeed[side] - neutral.xspeed[side] * factor).abs() < 1e-10);
            assert_eq!(helped.xspeed[1 - side], 0.0);
            assert!(
                helped.world.bodies[helped.player[side]].velocity.y
                    < neutral.world.bodies[neutral.player[side]].velocity.y
            );
            assert!(
                (helped.world.joints[helped.joints[side]].motor_speed
                    - neutral.world.joints[neutral.joints[side]].motor_speed * factor)
                    .abs()
                    < 1e-10
            );
            assert_eq!(helped.assistance[1 - side], 0);
        }
    }
}

#[test]
fn assistance_composes_with_pickups_and_does_not_bypass_frozen_or_broken_controls() {
    let mut game = ready();
    game.set_assistance(0, 5);
    game.collect(Kind::SpeedGood, 0);
    game.collect(Kind::JumpGood, 0);
    game.step(LEFT_RIGHT | LEFT_JUMP);
    assert!((game.xspeed[0] - 110.0 * 1.52 * 0.7).abs() < 1e-10);
    let mut frozen = ready();
    frozen.set_assistance(0, 5);
    frozen.collect(Kind::IceBad, 0);
    frozen.step(LEFT_RIGHT);
    assert_eq!(frozen.xspeed[0], 0.0);
    let mut broken = ready();
    broken.set_assistance(0, 5);
    broken.collect(Kind::BreakBad, 0);
    let speed = broken.world.joints[broken.joints[0]].motor_speed;
    broken.step(LEFT_KICK);
    assert_eq!(broken.world.joints[broken.joints[0]].motor_speed, speed);
}

#[test]
fn assistance_survives_goals_and_is_not_persistent_progression() {
    let mut game = ready();
    game.set_assistance(0, 1);
    game.set_assistance(1, 5);
    let ball = game.ball;
    game.world.set_transform(ball, Vec2::new(40.0, 400.0), 0.0);
    game.world.bodies[ball].velocity = Vec2::new(0.0, 0.0);
    game.step(0);
    assert_eq!(game.phase, Phase::Goal);
    for _ in 0..GOAL_TICKS {
        game.step(0);
    }
    assert_eq!(game.phase, Phase::Countdown);
    assert_eq!(game.assistance, [0, 5]);
    assert_eq!(Game::score_match(123, 7, false).assistance, [0, 0]);
}

#[test]
fn assistance_bounds_are_safe_and_cosmetic_roster_uses_equal_default_heights() {
    let mut game = ready();
    assert_eq!(game.head_height, [43.0; 2]);
    game.set_assistance(0, u32::MAX);
    game.set_assistance(10, 2);
    assert_eq!(game.assistance, [5, 0]);
    game.set_assistance(0, 0);
    assert_eq!(game.assistance, [0, 0]);
}

#[test]
fn helping_one_camp_removes_the_other_camps_assistance() {
    let mut game = ready();
    game.set_assistance(0, 1);
    assert_eq!(game.assistance, [1, 0]);
    game.set_assistance(1, 2);
    assert_eq!(game.assistance, [0, 2]);
    game.set_assistance(0, 5);
    game.set_assistance(1, 0);
    assert_eq!(game.assistance, [5, 0]);
}
