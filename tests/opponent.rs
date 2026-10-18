use sportheads_core::{
    game::{Game, Phase},
    math::Vec2,
    opponent::plan,
};

fn ready(pitch: u32) -> Game {
    let mut g = Game::score_match_on_balanced(123, 7, true, pitch);
    g.phase = Phase::Playing;
    g.countdown = 0;
    g
}

#[test]
fn planning_cannot_change_live_physics_rng_pickups_or_scores() {
    for pitch in [2, 6, 8, 18] {
        let mut live = ready(pitch);
        for tick in 0..120 {
            live.step(if tick % 30 < 15 { 2 | 16 } else { 4 | 64 });
        }
        let mut untouched = live.clone();
        for preferred in [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14] {
            let command = plan(&live, 1, preferred, 10, true);
            assert!(command <= 15 && command & 3 != 3);
        }
        // Future spawns also match: simulations must not consume the live RNG.
        for tick in 0..350 {
            let mask = if tick % 40 < 20 {
                2 | 16 | 8
            } else {
                4 | 64 | 128
            };
            live.step(mask);
            untouched.step(mask);
        }
        assert_eq!(live.score, untouched.score);
        assert_eq!(live.phase, untouched.phase);
        assert_eq!(live.tick_number, untouched.tick_number);
        assert_eq!(live.assistance, [0, 0]);
        assert_eq!(live.powerups.timers, untouched.powerups.timers);
        assert_eq!(
            format!("{:?}", live.pickups),
            format!("{:?}", untouched.pickups)
        );
        assert_eq!(
            format!("{:?}", live.world.bodies),
            format!("{:?}", untouched.world.bodies)
        );
    }
}

#[test]
fn close_shot_uses_the_foot_instead_of_only_running_into_the_ball() {
    let mut g = ready(8);
    g.bonus_enabled = false;
    g.world.set_transform(g.ball, Vec2::new(550.0, 440.0), 0.0);
    g.world.bodies[g.ball].velocity = Vec2::default();
    let action = plan(&g, 1, 1, 0, false);
    assert_ne!(action & 8, 0);
    let mut bare_run = g.clone();
    for _ in 0..10 {
        g.step(action << 4);
        bare_run.step(1 << 4);
    }
    assert!(
        g.world.bodies[g.ball].velocity.x < bare_run.world.bodies[bare_run.ball].velocity.x - 15.0
    );
}

#[test]
fn planner_releases_disabled_players_and_rejects_invalid_side() {
    let mut g = ready(8);
    assert_eq!(plan(&g, 2, 15, 15, false), 0);
    g.phase = Phase::Countdown;
    assert_eq!(plan(&g, 1, 9, 2, false), 0);
    g.phase = Phase::Playing;
    g.powerups.freeze[1] = true;
    assert_eq!(plan(&g, 1, 9, 2, false), 0);
    g.powerups.freeze[1] = false;
    g.powerups.broken[1] = true;
    assert_eq!(plan(&g, 1, 9, 2, true) & 8, 0);
    g.powerups.bombed[1] = true;
    assert_eq!(plan(&g, 1, 9, 2, false), 0);
}
