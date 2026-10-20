use sportheads_core::{body::Shape, game::*, math::Vec2, powerups::Kind};

fn ready() -> Game {
    let mut game = Game::score_match(123, 7, false);
    game.phase = Phase::Playing;
    game.countdown = 0;
    game
}
fn radius(game: &Game, side: usize) -> f64 {
    match game.world.bodies[game.player[side]].shape {
        Shape::Circle { radius } => radius,
        _ => panic!("head must be a circle"),
    }
}
#[test]
fn jump_by_itself_does_not_strengthen_speed_or_kick() {
    for side in 0..2 {
        for percent in [1, 10, 23, 30, 50] {
            let mut neutral = ready();
            let mut helped = ready();
            helped.set_buffs(side, percent, 0, 0, 0, 0);
            let input = (LEFT_RIGHT | LEFT_JUMP | LEFT_KICK) << (side * 4);
            neutral.step(input);
            helped.step(input);
            assert_eq!(helped.xspeed, neutral.xspeed);
            assert_eq!(
                helped.world.joints[helped.joints[side]].motor_speed,
                neutral.world.joints[neutral.joints[side]].motor_speed
            );
            assert!(
                helped.world.bodies[helped.player[side]].velocity.y
                    < neutral.world.bodies[neutral.player[side]].velocity.y
            );
            assert_eq!(helped.buffs[1 - side], [0; 5]);
            assert_eq!(radius(&helped, side), 20.0);
            assert_eq!(helped.goal_height(side), 100);
        }
    }
}
#[test]
fn head_and_goal_buffs_apply_to_both_camps_without_enlarging_the_feet() {
    let mut game = ready();
    let original_feet = game.foot.map(|index| game.world.bodies[index].clone());
    game.set_buffs(0, 0, 50, 50, 0, 0);
    game.set_buffs(1, 0, 30, 30, 0, 0);
    assert_eq!(game.buffs, [[0, 50, 50, 0, 0], [0, 30, 30, 0, 0]]);
    for (side, expected) in [30.0, 26.0].into_iter().enumerate() {
        assert_eq!(radius(&game, side), expected);
        assert!(game.world.bodies[game.player[side]].position.y + expected <= 460.0);
        assert_eq!(
            game.world.bodies[game.foot[side]].mass,
            original_feet[side].mass
        );
        assert_eq!(game.world.joints[game.joints[side]].motor_speed, 0.0);
        assert_eq!(
            game.world.bodies[9 + side].position.y,
            445.0 - game.goal_height(side) as f64
        );
    }
    assert_eq!(game.goal_height(0), 75);
    assert_eq!(game.goal_height(1), 85);
    game.set_buffs(0, 0, 0, 0, 0, 0);
    assert_eq!(radius(&game, 0), 20.0);
    assert_eq!(game.goal_height(0), 100);
    assert_eq!(game.buffs[1], [0, 30, 30, 0, 0]);
}
#[test]
fn protected_goal_scoring_matches_its_physical_crossbar() {
    for side in 0..2 {
        let mut game = ready();
        game.set_buffs(side, 0, 0, 50, 0, 0);
        let ball = game.ball;
        let x = if side == 0 { 40.0 } else { 760.0 };
        game.world.set_transform(ball, Vec2::new(x, 370.0), 0.0);
        assert_eq!(game.goal_scorer(), None);
        game.world.set_transform(ball, Vec2::new(x, 430.0), 0.0);
        assert_eq!(game.goal_scorer(), Some(1 - side));
    }
}
#[test]
fn buffs_compose_with_pickups_and_survive_expiry_and_round_resets() {
    let mut game = ready();
    game.set_buffs(0, 30, 50, 50, 15, 37);
    game.set_buffs(1, 10, 23, 17, 48, 9);
    game.collect(Kind::PlayerBig, 0);
    assert_eq!(radius(&game, 0), 45.0);
    assert_eq!(game.powerups.scale[0], 1.5);
    game.collect(Kind::GoalSmall, 1); // Original pickup targets the other goal.
    assert_eq!(game.powerups.goal_height[0], 60);
    assert_eq!(game.goal_height(0), 45);
    game.powerups.timers.size[0] = 599;
    game.powerups.timers.goals[0] = 599;
    game.step(0);
    assert_eq!(radius(&game, 0), 30.0);
    assert_eq!(game.goal_height(0), 75);
    game.world
        .set_transform(game.ball, Vec2::new(40.0, 440.0), 0.0);
    game.world.bodies[game.ball].velocity = Vec2::default();
    game.step(0);
    assert_eq!(game.phase, Phase::Goal);
    for _ in 0..GOAL_TICKS {
        game.step(0);
    }
    assert_eq!(game.phase, Phase::Countdown);
    assert_eq!(game.buffs, [[30, 50, 50, 15, 37], [10, 23, 17, 48, 9]]);
    assert_eq!(radius(&game, 0), 30.0);
    assert_eq!(game.goal_height(0), 75);
    assert_eq!(game.goal_height(1), 92);
    assert_eq!(game.world.bodies[game.player[0]].position.y, 430.0);
    assert_eq!(Game::score_match(1, 7, false).buffs, [[0; 5]; 2]);
}
#[test]
fn settings_are_clamped_and_clear_legacy_speed_and_kick_assistance() {
    let mut game = ready();
    game.set_assistance(0, 5);
    game.set_buffs(0, u32::MAX, 51, 22, u32::MAX, u32::MAX);
    game.set_buffs(99, 50, 50, 50, 0, 0);
    assert_eq!(game.buffs, [[50, 50, 22, 50, 50], [0; 5]]);
    assert_eq!(game.assistance, [0, 0]);
    game.collect(Kind::BreakBad, 0);
    let speed = game.world.joints[game.joints[0]].motor_speed;
    game.step(LEFT_KICK);
    assert_eq!(game.world.joints[game.joints[0]].motor_speed, speed);
}

#[test]
fn speed_and_kick_are_independent_precise_multipliers_and_respect_pickups() {
    for side in 0..2 {
        for percent in [1, 10, 23, 30, 50] {
            let input = (LEFT_RIGHT | LEFT_KICK) << (side * 4);
            let factor = 1.0 + percent as f64 / 100.0;
            let mut neutral = ready();
            neutral.step(input);
            let mut runner = ready();
            runner.set_buffs(side, 0, 0, 0, percent, 0);
            runner.step(input);
            assert!((runner.xspeed[side] - neutral.xspeed[side] * factor).abs() < 1e-10);
            assert_eq!(
                runner.world.joints[runner.joints[side]].motor_speed,
                neutral.world.joints[neutral.joints[side]].motor_speed
            );
            let mut striker = ready();
            striker.set_buffs(side, 0, 0, 0, 0, percent);
            striker.step(input);
            assert_eq!(striker.xspeed, neutral.xspeed);
            assert!(
                (striker.world.joints[striker.joints[side]].motor_speed
                    - neutral.world.joints[neutral.joints[side]].motor_speed * factor)
                    .abs()
                    < 1e-10
            );
            assert_eq!(striker.buffs[1 - side], [0; 5]);
        }
    }
    let mut game = ready();
    game.set_buffs(0, 0, 0, 0, 50, 50);
    game.collect(Kind::SpeedGood, 0);
    game.step(LEFT_RIGHT);
    assert!((game.xspeed[0] - 110.0 * 1.5 * 0.7).abs() < 1e-10);
    game.collect(Kind::IceBad, 0);
    let before = game.xspeed[0];
    game.step(LEFT_RIGHT);
    assert_eq!(game.xspeed[0], before * 0.7);
}

#[test]
fn goal_protection_has_half_the_effect_for_both_camps_and_pickup_sizes() {
    for side in 0..2 {
        for (percent, expected) in [
            (0, [60, 100, 140]),
            (10, [57, 95, 133]),
            (30, [51, 85, 119]),
            (50, [45, 75, 105]),
        ] {
            for (height, wanted) in [60, 100, 140].into_iter().zip(expected) {
                let mut game = ready();
                game.powerups.goal_height[side] = height;
                game.set_buffs(side, 0, 0, percent, 0, 0);
                assert_eq!(game.goal_height(side), wanted);
                assert_eq!(
                    game.world.bodies[9 + side].position.y,
                    445.0 - wanted as f64
                );
                assert_eq!(game.goal_height(1 - side), 100);
                assert_eq!(game.buffs[side], [0, 0, percent, 0, 0]);
            }
        }
        for (percent, expected) in [(1, 100), (17, 92), (49, 76)] {
            let mut game = ready();
            game.set_buffs(side, 0, 0, percent, 0, 0);
            assert_eq!(game.goal_height(side), expected);
        }
    }
}
