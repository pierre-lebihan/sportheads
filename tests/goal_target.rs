use sportheads_core::{
    game::{Game, Phase, COUNTDOWN_TICKS, GOAL_TICKS},
    math::Vec2,
};

#[test]
fn first_to_target_finishes_once_and_preserves_target_across_kickoffs() {
    for target in [1, 3, 7] {
        let mut game = Game::score_match(7, target, false);
        for _ in 0..COUNTDOWN_TICKS {
            game.step(0);
        }
        for point in 1..=target {
            assert_eq!(game.phase, Phase::Playing);
            game.world
                .set_transform(game.ball, Vec2::new(760.0, 400.0), 0.0);
            game.world.bodies[game.ball].velocity = Vec2::default();
            game.step(0);
            assert_eq!(game.score, [point, 0]);
            assert_eq!(game.target_score, target);
            if point < target {
                assert_eq!(game.phase, Phase::Goal);
                for _ in 0..GOAL_TICKS + COUNTDOWN_TICKS {
                    game.step(0);
                }
            }
        }
        assert_eq!(game.phase, Phase::Finished);
        let tick = game.tick_number;
        for _ in 0..30 {
            game.step(255);
        }
        assert_eq!(game.score, [target, 0]);
        assert_eq!(game.tick_number, tick);
    }
}

#[test]
fn score_matches_have_no_time_limit_and_target_is_bounded() {
    assert_eq!(Game::new(7).target_score, 7);
    assert_eq!(Game::score_match(7, 0, false).target_score, 1);
    assert_eq!(Game::score_match(7, 1000, false).target_score, 99);
    let mut game = Game::score_match(7, 99, false);
    game.remaining_ticks = 1;
    for _ in 0..2200 {
        game.step(0);
    }
    assert_ne!(game.phase, Phase::Finished);
    assert_eq!(game.remaining_ticks, 1);
}

#[test]
fn public_matches_limit_the_goal_target_to_one_through_nine() {
    for (requested, expected) in [(0, 1), (1, 1), (7, 7), (9, 9), (10, 9), (99, 9)] {
        assert_eq!(
            Game::score_match_on_balanced(7, requested, false, 8).target_score,
            expected
        );
    }
}
