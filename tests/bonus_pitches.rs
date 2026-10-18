use sportheads_core::{
    game::{Game, Phase, COUNTDOWN_TICKS},
    math::Vec2,
};

#[test]
fn low_ceiling_pickups_spawn_in_the_playable_area() {
    let mut game = Game::score_match_on_balanced(7, 9, true, 25);
    for _ in 0..COUNTDOWN_TICKS {
        game.step(0);
    }
    let mut seen = 0;
    for _ in 0..650 {
        // Keep the ball away from goals/pickups so random match outcomes do not
        // interrupt the three pickup spawns under test.
        game.world
            .set_transform(game.ball, Vec2::new(400.0, 440.0), 0.0);
        game.world.bodies[game.ball].velocity = Vec2::default();
        game.step(0);
        assert_eq!(game.phase, Phase::Playing);
        for pickup in &game.pickups {
            seen += 1;
            assert!((220.0..=420.0).contains(&pickup.position.y));
        }
    }
    assert!(seen > 0);
    assert_eq!(
        Game::score_match_on(7, 9, false, 26).pitch,
        20,
        "historical Flash entry points keep their original bounds"
    );
}
