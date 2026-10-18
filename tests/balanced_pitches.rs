use sportheads_core::{
    game::{Game, Phase, COUNTDOWN_TICKS, GOAL_TICKS},
    math::Vec2,
};

#[test]
fn corrected_obstacles_survive_goals_and_the_original_layout_remains_available() {
    for pitch in [2, 4, 6, 9, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26] {
        let mut game = Game::score_match_on_balanced(7, 7, false, pitch);
        let obstacles = |game: &Game| {
            game.world.bodies[17..]
                .iter()
                .map(|body| (body.position.x, body.position.y, body.angle))
                .collect::<Vec<_>>()
        };
        let before = obstacles(&game);
        for _ in 0..COUNTDOWN_TICKS {
            game.step(0);
        }
        game.world
            .set_transform(game.ball, Vec2::new(760.0, 400.0), 0.0);
        game.world.bodies[game.ball].velocity = Vec2::default();
        game.step(0);
        assert_eq!(game.phase, Phase::Goal);
        for _ in 0..GOAL_TICKS {
            game.step(0);
        }
        assert_eq!(game.phase, Phase::Countdown);
        assert_eq!(game.score, [1, 0]);
        assert_eq!(before, obstacles(&game), "pitch {pitch}");
    }
    assert_eq!(
        Game::score_match_on(7, 7, false, 2).world.bodies[17]
            .position
            .x,
        410.0
    );
    assert_eq!(
        Game::score_match_on_balanced(7, 7, false, 2).world.bodies[17]
            .position
            .x,
        400.0
    );
}
