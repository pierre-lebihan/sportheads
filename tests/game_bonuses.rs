use sportheads_core::{
    game::{Game, Phase},
    math::Vec2,
    powerups::Kind,
};
fn playing() -> Game {
    let mut g = Game::configured(17, 0, 0, true);
    g.phase = Phase::Playing;
    g.countdown = 0;
    g
}
#[test]
fn every_bonus_updates_real_world_without_stale_active_joints() {
    for side in 0..2 {
        for kind in Kind::ALL {
            let mut g = playing();
            g.collect(kind, side);
            for _ in 0..45 {
                g.step(0);
            }
            for b in &g.world.bodies {
                assert!(
                    b.position.x.is_finite() && b.position.y.is_finite(),
                    "{kind:?}"
                );
            }
            for j in g.world.joints.iter().filter(|j| j.active) {
                assert!(g.world.bodies[j.a].active && g.world.bodies[j.b].active);
            }
        }
    }
}
#[test]
fn ball_replacement_preserves_momentum_but_rebuilds_original_mass_and_angle() {
    let mut g = playing();
    g.world.bodies[g.ball].velocity = Vec2::new(77.0, -54.0);
    g.world.bodies[g.ball].omega = 3.0;
    let old = g.ball;
    g.collect(Kind::BigBall, 0);
    assert!(!g.world.bodies[old].active);
    let b = &g.world.bodies[g.ball];
    assert_eq!(b.velocity, Vec2::new(77.0, -54.0));
    assert_eq!(b.omega, 3.0);
    assert_eq!(b.angle, 0.0);
    assert!((b.mass - 0.6 * std::f64::consts::PI * 225.0).abs() < 1e-8);
}
#[test]
fn player_resize_rebuilds_body_and_joint_and_expiry_restores_normal() {
    let mut g = playing();
    let old = g.player[0];
    g.collect(Kind::PlayerBig, 0);
    assert!(!g.world.bodies[old].active);
    assert_eq!(g.powerups.scale[0], 1.5);
    assert_eq!(g.world.joints.iter().filter(|j| j.active).count(), 2);
    for _ in 0..600 {
        g.step(0);
    }
    assert_eq!(g.powerups.scale[0], 1.0);
}
#[test]
fn original_three_modes_finish_on_time_seven_or_first_goal() {
    for (mode, target) in [(1, 7), (2, 1)] {
        let mut g = Game::configured(1, mode, 0, false);
        g.phase = Phase::Playing;
        g.countdown = 0;
        g.score[0] = target - 1;
        g.world.bodies[g.ball].set_transform(Vec2::new(760.0, 400.0), 0.0);
        g.world.bodies[g.ball].velocity = Vec2::default();
        g.step(0);
        assert_eq!(g.phase, Phase::Finished);
        assert_eq!(g.score[0], target);
        assert_eq!(g.remaining_ticks, 1800);
    }
}
#[test]
fn fixed_goal_styles_and_spawn_schedule_are_available() {
    for (style, height) in [(0, 100), (1, 140), (2, 60)] {
        let mut g = Game::configured(23, 0, style, true);
        g.phase = Phase::Playing;
        g.countdown = 0;
        assert_eq!(g.powerups.goal_height, [height, height]);
        assert_eq!(g.world.bodies[9].position.y, 460.0 - height as f64 - 15.0);
        for _ in 0..200 {
            g.step(0);
        }
        assert!(g.pickups.is_empty());
        g.step(0);
        assert_eq!(g.pickups.len(), 1);
    }
}

#[test]
fn ball_on_goal_roof_is_automatically_pushed_toward_play() {
    for (x, direction) in [(40.0, 1.0), (760.0, -1.0)] {
        let mut g = playing();
        g.world.set_transform(g.ball, Vec2::new(x, 330.0), 0.0);
        g.world.bodies[g.ball].velocity = Vec2::default();
        for _ in 0..100 {
            g.step(0);
        }
        assert!((g.world.bodies[g.ball].position.x - x) * direction > 20.0);
    }
}
