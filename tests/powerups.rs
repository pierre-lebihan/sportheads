use sportheads_core::powerups::{Effect, Kind, Powerups};

fn advance(state: &mut Powerups, ticks: usize) -> Vec<Effect> {
    (0..ticks).flat_map(|_| state.step()).collect()
}

#[test]
fn original_eighteen_ids_are_stable_and_all_route_to_the_correct_player() {
    assert_eq!(Kind::from_id(0), None);
    assert_eq!(Kind::from_id(19), None);
    for (index, kind) in Kind::ALL.into_iter().enumerate() {
        assert_eq!(Kind::from_id(index as u32 + 1), Some(kind));
        for collector in 0..2 {
            let other = 1 - collector;
            let mut state = Powerups::new();
            let effects = state.apply(kind, collector);
            match kind {
                Kind::SpeedGood => assert_eq!(state.speed[collector], 2),
                Kind::SpeedBad => assert_eq!(state.speed[collector], 0),
                Kind::JumpGood => assert_eq!(state.jump[collector], 2),
                Kind::JumpBad => assert_eq!(state.jump[collector], 0),
                Kind::IceGood => assert!(state.freeze[other]),
                Kind::IceBad => assert!(state.freeze[collector]),
                Kind::GoalBig => assert_eq!(effects, [Effect::GoalSize(other, 140)]),
                Kind::GoalSmall => assert_eq!(effects, [Effect::GoalSize(other, 60)]),
                Kind::Bombs => assert!(state.fire),
                Kind::BigBall => assert_eq!(effects, [Effect::ResizeBall(2, 1)]),
                Kind::BouncyBall => assert_eq!(effects, [Effect::ResizeBall(1, 2)]),
                Kind::SmallBall => assert_eq!(effects, [Effect::ResizeBall(0, 1)]),
                Kind::DeadBall => assert_eq!(effects, [Effect::ResizeBall(1, 0)]),
                Kind::PlayerBig => assert_eq!(effects, [Effect::ResizePlayer(collector, 1.5)]),
                Kind::PlayerSmall => assert_eq!(effects, [Effect::ResizePlayer(collector, 0.5)]),
                Kind::BreakGood => assert!(state.broken[other]),
                Kind::BreakBad => assert!(state.broken[collector]),
                Kind::Streaker => assert_eq!(effects, [Effect::SpawnStreaker]),
            }
        }
    }
}

#[test]
fn speed_jump_ice_and_dead_ball_expire_on_their_exact_original_frame() {
    for side in 0..2 {
        for kind in [
            Kind::SpeedGood,
            Kind::SpeedBad,
            Kind::JumpGood,
            Kind::IceBad,
            Kind::DeadBall,
        ] {
            let mut state = Powerups::new();
            state.apply(kind, side);
            advance(&mut state, 199);
            match kind {
                Kind::SpeedGood => assert_eq!(state.speed[side], 2),
                Kind::SpeedBad => assert_eq!(state.speed[side], 0),
                Kind::JumpGood => assert_eq!(state.jump[side], 2),
                Kind::IceBad => assert!(state.freeze[side]),
                Kind::DeadBall => assert_eq!(state.bounce, 0),
                _ => unreachable!(),
            }
            state.step();
            assert_eq!(state.speed[side], 1);
            assert_eq!(state.jump[side], 1);
            assert!(!state.freeze[side]);
            assert_eq!(state.bounce, 1);
        }
    }
}

#[test]
fn right_low_jump_resets_wrong_timer_but_left_low_jump_recovers() {
    let mut state = Powerups::new();
    state.apply(Kind::JumpBad, 1);
    state.apply(Kind::JumpBad, 0);
    advance(&mut state, 200);
    assert_eq!(state.jump, [1, 0]);
    // If a previous super jump timer is already active, the typo cannot stop it.
    state.apply(Kind::JumpGood, 1);
    advance(&mut state, 150);
    state.apply(Kind::JumpBad, 1);
    advance(&mut state, 50);
    assert_eq!(state.jump[1], 1);
}

#[test]
fn right_good_ice_freezes_left_until_round_reset_due_to_wrong_timer() {
    let mut state = Powerups::new();
    state.apply(Kind::SpeedGood, 0);
    state.apply(Kind::IceGood, 1);
    advance(&mut state, 200);
    assert!(state.freeze[0]);
    assert_eq!(state.speed[0], 1);
    let mut left = Powerups::new();
    left.apply(Kind::IceGood, 0);
    advance(&mut left, 199);
    assert!(left.freeze[1]);
    left.step();
    assert!(!left.freeze[1]);
    state.reset_round();
    assert_eq!(state.freeze, [false; 2]);
}

#[test]
fn player_sizes_and_goal_sizes_last_six_hundred_frames() {
    for side in 0..2 {
        for kind in [Kind::PlayerBig, Kind::PlayerSmall] {
            let mut state = Powerups::new();
            state.apply(kind, side);
            advance(&mut state, 599);
            assert_ne!(state.scale[side], 1.0);
            assert_eq!(state.step(), [Effect::ResizePlayer(side, 1.0)]);
        }
        for kind in [Kind::GoalBig, Kind::GoalSmall] {
            let mut state = Powerups::new();
            state.apply(kind, side);
            advance(&mut state, 599);
            assert_ne!(state.goal_height[1 - side], 100);
            assert_eq!(
                state.step(),
                [Effect::GoalSize(0, 100), Effect::GoalSize(1, 100)]
            );
            assert_eq!(state.goal_height, [100; 2]);
            assert_eq!(state.goal_flags, [true; 2]);
        }
    }
}

#[test]
fn goal_expiry_resets_both_goals_even_if_other_pickup_is_newer() {
    let mut state = Powerups::new();
    state.apply(Kind::GoalBig, 1);
    advance(&mut state, 500);
    state.apply(Kind::GoalBig, 0);
    assert_eq!(state.goal_height, [140; 2]);
    advance(&mut state, 100);
    assert_eq!(state.goal_height, [100; 2]);
    assert_eq!(state.timers.goals[1], 100);
}

#[test]
fn broken_leg_duration_is_two_hundred_for_right_four_hundred_for_left() {
    let mut state = Powerups::new();
    state.apply(Kind::BreakBad, 0);
    state.apply(Kind::BreakBad, 1);
    advance(&mut state, 199);
    assert_eq!(state.broken, [true; 2]);
    state.step();
    assert_eq!(state.broken, [true, false]);
    advance(&mut state, 199);
    assert!(state.broken[0]);
    state.step();
    assert_eq!(state.broken, [false; 2]);
}

#[test]
fn bombs_spawn_on_frames_one_forty_eighty_and_clear_stuns_at_seven_hundred() {
    let mut state = Powerups::new();
    assert!(state.apply(Kind::Bombs, 0).is_empty());
    let mut spawn_frames = Vec::new();
    state.bombed = [true; 2];
    for frame in 1..=699 {
        if state.step().contains(&Effect::SpawnBomb) {
            spawn_frames.push(frame);
        }
    }
    assert_eq!(spawn_frames, [1, 40, 80]);
    assert!(state.fire);
    assert_eq!(state.bombed, [true; 2]);
    state.step();
    assert!(!state.fire);
    assert_eq!(state.bombed, [false; 2]);
}

#[test]
fn ball_size_and_bounce_preserve_original_crossed_timer_bugs() {
    let mut big = Powerups::new();
    big.apply(Kind::BigBall, 0);
    advance(&mut big, 399);
    assert_eq!(big.ball_size, 2);
    assert_eq!(big.step(), [Effect::ResizeBall(1, 1)]);
    let mut bouncy = Powerups::new();
    bouncy.apply(Kind::BouncyBall, 0);
    let effects = advance(&mut bouncy, 400);
    assert_eq!(bouncy.bounce, 2);
    assert_eq!(effects, [Effect::ResizeBall(1, 2)]);
    let mut small = Powerups::new();
    small.apply(Kind::SmallBall, 1);
    let effects = advance(&mut small, 400);
    assert_eq!(small.ball_size, 0);
    assert_eq!(effects, [Effect::ResizeBall(0, 1)]);
    // A pre-existing size timer still normalizes a later small ball.
    big.apply(Kind::BigBall, 0);
    advance(&mut big, 300);
    big.apply(Kind::SmallBall, 0);
    advance(&mut big, 100);
    assert_eq!(big.ball_size, 1);
}

#[test]
fn repeated_streaker_pickup_extends_lifetime_without_spawning_a_second_body() {
    let mut state = Powerups::new();
    assert_eq!(state.apply(Kind::Streaker, 1), [Effect::SpawnStreaker]);
    advance(&mut state, 900);
    assert!(state.apply(Kind::Streaker, 0).is_empty());
    advance(&mut state, 999);
    assert!(state.streaker_alive);
    assert_eq!(state.step(), [Effect::RemoveStreaker]);
    assert!(!state.streaker_alive);
}

#[test]
fn round_reset_clears_effects_but_preserves_timers_and_broken_legs() {
    let mut state = Powerups::new();
    for kind in Kind::ALL {
        state.apply(kind, 1);
    }
    advance(&mut state, 12);
    let timers = state.timers.clone();
    let broken = state.broken;
    state.reset_round();
    assert_eq!(state.timers, timers);
    assert_eq!(state.broken, broken);
    assert_eq!(state.speed, [1; 2]);
    assert_eq!(state.jump, [1; 2]);
    assert_eq!(state.scale, [1.0; 2]);
    assert_eq!(state.goal_height, [100; 2]);
    assert_eq!(state.ball_size, 1);
    assert_eq!(state.bounce, 1);
    assert!(!state.fire && !state.streaker_alive);
}

#[test]
fn replacing_a_pickup_restarts_its_timer_and_uint_timers_wrap() {
    let mut state = Powerups::new();
    state.apply(Kind::SpeedGood, 1);
    advance(&mut state, 190);
    state.apply(Kind::SpeedBad, 1);
    advance(&mut state, 199);
    assert_eq!(state.speed[1], 0);
    state.step();
    assert_eq!(state.speed[1], 1);
    state.timers.speed[1] = u32::MAX;
    state.step();
    assert_eq!(state.timers.speed[1], 0);
}

#[test]
fn captured_original_flash_bonus_states_and_timers() {
    use sportheads_core::{pu_probe_apply, pu_probe_reset, pu_probe_tick, pu_probe_value};
    for (line_number, line) in include_str!("fixtures/powerups/original.txt")
        .lines()
        .enumerate()
    {
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        let words: Vec<_> = line.split_whitespace().collect();
        match words[0] {
            "case" => {}
            "reset" => pu_probe_reset(),
            "apply" => pu_probe_apply(words[1].parse().unwrap(), words[2].parse().unwrap()),
            "step" => {
                for _ in 0..words[1].parse::<u32>().unwrap() {
                    pu_probe_tick();
                }
            }
            "expect" => {
                for (i, expected) in words[1..].iter().enumerate() {
                    assert_eq!(
                        pu_probe_value(i as u32),
                        expected.parse::<f64>().unwrap(),
                        "line {} field {}",
                        line_number + 1,
                        i
                    );
                }
            }
            x => panic!("Unknown fixture command {x}"),
        }
    }
}
