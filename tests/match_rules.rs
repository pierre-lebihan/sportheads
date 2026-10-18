use sportheads_core::{game::*, math::Vec2};

fn play(game: &mut Game) {
    for _ in 0..COUNTDOWN_TICKS {
        game.step(0);
    }
    assert_eq!(game.phase, Phase::Playing);
}

#[test]
fn original_pitch_and_body_parameters() {
    let game = Game::new(42);
    assert_eq!(game.world.bodies.len(), 17);
    assert_eq!(game.world.joints.len(), 2);
    assert_eq!(game.world.gravity.y, 300.0);
    for (side, x) in [(0, 200.0), (1, 600.0)] {
        let head = &game.world.bodies[game.player[side]];
        assert_eq!(head.position.x, x);
        assert_eq!(head.position.y, 440.0);
        assert!(head.fixed_rotation);
        assert_eq!(head.friction, 0.0);
        assert_eq!(head.restitution, 0.01);
        assert!((head.mass - 100.0 * std::f64::consts::PI * 400.0).abs() < 1e-8);
        assert_eq!(game.world.bodies[game.foot[side]].group, -1);
        assert_eq!(
            game.world.joints[game.joints[side]].max_torque,
            100_000_000.0
        );
    }
    assert_eq!(game.world.bodies[game.ball].velocity.y, -100.0);
    assert!(game.world.bodies[game.ball].velocity.x.abs() <= 150.0);
}

#[test]
fn countdown_freezes_physics_and_clock_for_exact_original_duration() {
    let mut game = Game::new(1);
    let x = game.world.bodies[game.ball].position.x;
    for _ in 0..COUNTDOWN_TICKS - 1 {
        game.step(LEFT_RIGHT | RIGHT_LEFT);
    }
    assert_eq!(game.phase, Phase::Countdown);
    assert_eq!(game.remaining_ticks, MATCH_TICKS);
    assert_eq!(game.world.bodies[game.ball].position.x, x);
    game.step(0);
    assert_eq!(game.phase, Phase::Playing);
    game.step(0);
    assert_eq!(game.remaining_ticks, MATCH_TICKS - 1);
}

#[test]
fn both_players_move_jump_and_swing_with_original_controls() {
    let mut game = Game::new(1);
    play(&mut game);
    game.step(LEFT_RIGHT | RIGHT_LEFT | LEFT_JUMP | RIGHT_JUMP | LEFT_KICK | RIGHT_KICK);
    assert_eq!(game.xspeed, [56.0, -56.0]);
    for side in 0..2 {
        let head = &game.world.bodies[game.player[side]];
        assert!(head.position.y < 439.0, "jump must lift both heads");
        assert!(head.velocity.y < -150.0);
    }
    assert!(game.world.bodies[game.player[0]].position.x > 200.0);
    assert!(game.world.bodies[game.player[1]].position.x < 600.0);
    assert!(game.world.joints[game.joints[0]].motor_speed < 0.0);
    assert!(game.world.joints[game.joints[1]].motor_speed > 0.0);
    game.step(0);
    assert_eq!(game.xspeed, [39.199999999999996, -39.199999999999996]);
}

#[test]
fn airborne_jump_does_not_retrigger() {
    let mut game = Game::new(1);
    play(&mut game);
    game.step(LEFT_JUMP | RIGHT_JUMP);
    let before = game.world.bodies[game.player[0]].velocity.y;
    game.step(LEFT_JUMP | RIGHT_JUMP);
    assert!(game.world.bodies[game.player[0]].velocity.y > before);
}

fn stacked_players(top: usize) -> Game {
    let mut game = Game::score_match_on_balanced(1, 7, false, 8);
    game.phase = Phase::Playing;
    game.countdown = 0;
    for side in 0..2 {
        let head = game.player[side];
        let position = Vec2::new(400.0, if side == top { 330.0 } else { 370.0 });
        let offset = position - game.world.bodies[head].position;
        for index in [head, game.foot[side]] {
            let next = game.world.bodies[index].position + offset;
            game.world
                .set_transform(index, next, game.world.bodies[index].angle);
            game.world.bodies[index].velocity =
                Vec2::new(0.0, if side == top { 10.0 } else { 0.0 });
        }
    }
    game.world
        .set_transform(game.ball, Vec2::new(100.0, 100.0), 0.0);
    game.world.bodies[game.ball].velocity = Vec2::default();
    game
}

#[test]
fn both_players_can_jump_from_the_opponents_head() {
    for side in 0..2 {
        let mut game = stacked_players(side);
        let before = game.world.bodies[game.player[side]].position.y;
        game.step(LEFT_JUMP << (side * 4));
        let head = &game.world.bodies[game.player[side]];
        assert_ne!(game.sounds & 2, 0, "side {side} must trigger a jump");
        assert!(head.velocity.y < -150.0, "side {side} must jump upwards");
        assert!(head.position.y < before);
    }
}

#[test]
fn head_jump_requires_a_command_and_an_opponent_under_the_falling_player() {
    for side in 0..2 {
        for condition in [
            "no jump",
            "too far horizontally",
            "too far vertically",
            "ascending",
            "bombed",
        ] {
            let mut game = stacked_players(side);
            let head = game.player[side];
            match condition {
                "too far horizontally" => {
                    game.world.set_transform(head, Vec2::new(440.0, 330.0), 0.0)
                }
                "too far vertically" => {
                    game.world.set_transform(head, Vec2::new(400.0, 300.0), 0.0)
                }
                "ascending" => game.world.bodies[head].velocity.y = -10.0,
                "bombed" => game.powerups.bombed[side] = true,
                _ => (),
            }
            game.step(if condition == "no jump" {
                0
            } else {
                LEFT_JUMP << (side * 4)
            });
            assert_eq!(
                game.sounds & 2,
                0,
                "side {side}: {condition} must not trigger an airborne jump"
            );
        }
    }
}

#[test]
fn goal_uses_original_display_bounds_and_correct_scorer() {
    let mut game = Game::new(1);
    let ball = game.ball;
    for (x, y, scorer) in [
        (74.0, 400.0, Some(1)),
        (75.0, 400.0, None),
        (725.1, 400.0, Some(0)),
        (724.9, 400.0, None),
        (40.0, 349.9, None),
        (40.0, 350.1, Some(1)),
    ] {
        game.world.bodies[ball].set_transform(Vec2::new(x, y), 0.0);
        assert_eq!(game.goal_scorer(), scorer, "ball at ({x},{y})");
    }
}

#[test]
fn rotating_ball_display_bounds_can_enter_goal_before_physical_circle() {
    let mut game = Game::new(1);
    let ball = &mut game.world.bodies[game.ball];
    ball.set_transform(Vec2::new(722.0, 400.0), 0.0);
    assert_eq!(game.goal_scorer(), None);
    game.world.bodies[game.ball].angle = std::f64::consts::PI / 4.0;
    assert_eq!(game.goal_scorer(), Some(0));
    game.world.bodies[game.ball].set_transform(Vec2::new(77.0, 400.0), 0.0);
    assert_eq!(game.goal_scorer(), None);
    game.world.bodies[game.ball].angle = std::f64::consts::PI / 4.0;
    assert_eq!(game.goal_scorer(), Some(1));
}

#[test]
fn flash_goal_edge_contact_is_inclusive_and_positions_use_twips() {
    let mut game = Game::new(1);
    for (x, angle, scorer) in [
        (724.999, 0.0, None),
        (725.0, 0.0, Some(0)),
        (725.049, 0.0, Some(0)),
        (722.0, 0.37, None),
        (722.1, 0.37, Some(0)),
        (720.85, std::f64::consts::PI / 4.0, None),
        (720.9, std::f64::consts::PI / 4.0, Some(0)),
    ] {
        game.world.bodies[game.ball].set_transform(Vec2::new(x, 400.0), angle);
        assert_eq!(game.goal_scorer(), scorer, "x={x}, angle={angle}");
    }
}

#[test]
fn goal_scores_once_then_resets_pitch_without_resetting_clock_or_score() {
    let mut game = Game::new(1);
    play(&mut game);
    game.world.bodies[game.ball].set_transform(Vec2::new(40.0, 400.0), 0.0);
    game.world.bodies[game.ball].velocity = Vec2::default();
    game.step(0);
    assert_eq!(game.score, [0, 1]);
    assert_eq!(game.phase, Phase::Goal);
    assert_eq!(game.last_scorer, Some(1));
    for _ in 0..GOAL_TICKS {
        game.step(0);
    }
    assert_eq!(game.score, [0, 1]);
    assert_eq!(game.phase, Phase::Countdown);
    assert_eq!(game.remaining_ticks, MATCH_TICKS - 1 - GOAL_TICKS);
    assert_eq!(game.world.bodies[game.ball].position.x, 400.0);
    assert_eq!(game.world.bodies[game.player[0]].position.x, 200.0);
    let remaining = game.remaining_ticks;
    play(&mut game);
    assert_eq!(game.remaining_ticks, remaining);
}

#[test]
fn time_expiry_finishes_even_a_tie_and_locks_match() {
    let mut game = Game::new(1);
    play(&mut game);
    game.remaining_ticks = 30;
    for _ in 0..29 {
        game.step(0);
    }
    assert_eq!(game.phase, Phase::Playing);
    game.step(0);
    assert_eq!(game.phase, Phase::Finished);
    assert_eq!(game.score, [0, 0]);
    let x = game.world.bodies[game.ball].position.x;
    for _ in 0..50 {
        game.step(LEFT_JUMP | RIGHT_RIGHT);
    }
    assert_eq!(game.remaining_ticks, 0);
    assert_eq!(game.world.bodies[game.ball].position.x, x);
    game.restart(123);
    assert_eq!(game.score, [0, 0]);
    assert_eq!(game.remaining_ticks, MATCH_TICKS);
    assert_eq!(game.phase, Phase::Countdown);
}

#[test]
fn same_seed_and_inputs_reproduce_every_frame() {
    let mut a = Game::new(12345);
    let mut b = Game::new(12345);
    for tick in 0..300 {
        let input = if tick % 70 < 35 {
            LEFT_RIGHT | RIGHT_LEFT | LEFT_KICK
        } else {
            LEFT_JUMP | RIGHT_KICK
        };
        a.step(input);
        b.step(input);
        assert_eq!(a.phase, b.phase);
        assert_eq!(a.score, b.score);
        for (one, two) in a.world.bodies.iter().zip(&b.world.bodies) {
            assert_eq!(one.position.x, two.position.x);
            assert_eq!(one.position.y, two.position.y);
            assert_eq!(one.angle, two.angle);
            assert!(one.position.x.is_finite() && one.position.y.is_finite());
        }
    }
}
