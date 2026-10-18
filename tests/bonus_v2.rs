use sportheads_core::{bonus_v2::BonusesV2, game::*, math::Vec2, powerups::Kind};
fn playing() -> Game {
    let mut g = Game::score_match(17, 7, false);
    g.set_bonus_mode(2);
    g.bonus_enabled = false;
    g.phase = Phase::Playing;
    g.countdown = 0;
    g
}
fn ball(g: &mut Game, x: f64, y: f64, vx: f64, vy: f64) {
    g.world.set_transform(g.ball, Vec2::new(x, y), 0.0);
    g.world.bodies[g.ball].velocity = Vec2::new(vx, vy);
}
#[test]
fn modes_keep_the_original_pool_and_v2_adds_exactly_five_pickups() {
    for mode in 0..=2 {
        let mut seen = std::collections::BTreeSet::new();
        for seed in 1..=64 {
            let mut g = Game::score_match(seed, 99, false);
            g.set_bonus_mode(mode);
            g.phase = Phase::Playing;
            g.countdown = 0;
            ball(&mut g, 400.0, 230.0, 0.0, 0.0);
            for _ in 0..201 {
                g.step(0);
            }
            for p in &g.pickups {
                seen.insert(p.kind);
            }
            if g.notice > 0 {
                seen.insert(g.notice);
            }
        }
        assert!(seen.iter().all(|id| *id <= if mode == 2 { 23 } else { 18 }));
        if mode == 0 {
            assert!(seen.is_empty());
        } else if mode == 2 {
            for kind in 19..=23 {
                assert!(seen.contains(&kind), "missing {kind}: {seen:?}");
            }
        }
    }
    for mode in [0, 1] {
        let mut g = playing();
        g.set_bonus_mode(mode);
        for kind in 19..=23 {
            g.collect_id(kind, 0);
        }
        assert_eq!(g.v2, BonusesV2::default());
    }
}
#[test]
fn power_shot_requires_manual_foot_contact_and_is_consumed_once() {
    for side in 0..2 {
        let mut g = playing();
        let x = if side == 0 { 230.0 } else { 570.0 };
        ball(&mut g, x, 440.0, 0.0, 0.0);
        g.collect_id(19, side);
        let mut idle = g.clone();
        for _ in 0..12 {
            idle.step(0);
        }
        assert!(idle.v2.charged[side] > 0, "no automatic shot");
        let mut plain = g.clone();
        plain.v2.charged[side] = 0;
        let mut max_g: f64 = 0.0;
        let mut max_plain: f64 = 0.0;
        for _ in 0..20 {
            g.step(8 << (side * 4));
            plain.step(8 << (side * 4));
            max_g = max_g.max(g.world.bodies[g.ball].velocity.length());
            max_plain = max_plain.max(plain.world.bodies[plain.ball].velocity.length());
        }
        assert_eq!(
            g.v2.charged[side], 0,
            "the actual foot must use the charge, side {side}"
        );
        assert!(max_g > max_plain + 80.0, "{max_g} vs {max_plain}");
        let mut broken = playing();
        ball(&mut broken, x, 440.0, 0.0, 0.0);
        broken.collect_id(19, side);
        broken.collect(Kind::BreakBad, side);
        for _ in 0..20 {
            broken.step(8 << (side * 4));
        }
        assert!(broken.v2.charged[side] > 0);
    }
}
#[test]
fn one_use_shield_stops_a_fast_incoming_goal_on_both_sides() {
    for side in 0..2 {
        let (x, vx) = if side == 0 {
            (130.0, -1800.0)
        } else {
            (670.0, 1800.0)
        };
        let mut g = playing();
        g.collect_id(20, side);
        ball(&mut g, x, 430.0, vx, 0.0);
        g.step(0);
        assert_eq!(g.score, [0, 0]);
        assert_eq!(g.v2.shield[side], 0);
        assert!(g.world.bodies[g.ball].velocity.x * if side == 0 { 1.0 } else { -1.0 } > 0.0);
        ball(&mut g, x, 430.0, vx, 0.0);
        g.step(0);
        assert_eq!(g.score[1 - side], 1);
    }
}
#[test]
fn heavy_ball_falls_faster_without_stacking_and_survives_original_resizing() {
    let mut g = playing();
    ball(&mut g, 400.0, 150.0, 60.0, -100.0);
    let mut normal = g.clone();
    let mass = g.world.bodies[g.ball].mass;
    g.collect_id(21, 0);
    g.collect_id(21, 1);
    assert_eq!(g.world.bodies[g.ball].mass, mass * 2.0);
    for _ in 0..20 {
        g.step(0);
        normal.step(0);
    }
    assert!(g.world.bodies[g.ball].position.y > normal.world.bodies[normal.ball].position.y + 20.0);
    g.collect(Kind::BigBall, 0);
    normal.collect(Kind::BigBall, 0);
    assert_eq!(
        g.world.bodies[g.ball].mass,
        normal.world.bodies[normal.ball].mass * 2.0
    );
    g.v2.heavy = 1;
    g.step(0);
    assert_eq!(g.v2.heavy, 0);
    assert_eq!(
        g.world.bodies[g.ball].mass,
        normal.world.bodies[normal.ball].mass
    );
}
#[test]
fn spring_head_increases_the_actual_contact_rebound_for_either_player() {
    for side in 0..2 {
        let mut g = playing();
        let p = g.world.bodies[g.player[side]].position;
        ball(&mut g, p.x, p.y - 29.0, 0.0, 80.0);
        let mut plain = g.clone();
        g.collect_id(22, side);
        g.step(0);
        plain.step(0);
        assert!(
            g.world.bodies[g.ball].velocity.y < plain.world.bodies[plain.ball].velocity.y - 100.0
        );
        assert!(g.v2.spring[side] > 0);
        assert!(g.v2.spring_flash[side] > 0);
    }
}
#[test]
fn central_trampoline_bounces_both_players_and_the_ball_without_a_jump_button() {
    for side in 0..2 {
        let mut g = playing();
        let delta = 400.0 - g.world.bodies[g.player[side]].position.x;
        for index in [g.player[side], g.foot[side]] {
            let b = &g.world.bodies[index];
            g.world
                .set_transform(index, b.position + Vec2::new(delta, 0.0), b.angle);
        }
        g.world.bodies[g.player[side]].velocity.y = 30.0;
        g.collect_id(23, 1 - side);
        g.step(0);
        assert!(g.world.bodies[g.player[side]].velocity.y < -280.0);
        assert!(
            g.world.bodies[g.player[1 - side]].velocity.y > -50.0,
            "outside the zone"
        );
    }
    let mut g = playing();
    ball(&mut g, 400.0, 449.0, 0.0, 150.0);
    g.collect_id(23, 0);
    g.step(0);
    assert!(g.world.bodies[g.ball].velocity.y < -330.0);
}
#[test]
fn timers_expire_and_all_v2_effects_reset_after_a_goal_and_on_mode_change() {
    let mut g = playing();
    for id in 19..=23 {
        g.collect_id(id, 0);
    }
    let before = g.v2.clone();
    g.phase = Phase::Countdown;
    g.countdown = 2;
    g.step(0);
    assert_eq!(g.v2, before);
    g.phase = Phase::Playing;
    g.v2.charged = [1, 1];
    g.v2.shield = [1, 1];
    g.v2.spring = [1, 1];
    g.v2.heavy = 1;
    g.v2.trampoline = 1;
    g.step(0);
    assert_eq!(g.v2, BonusesV2::default());
    for id in 19..=23 {
        g.collect_id(id, 0);
    }
    ball(&mut g, 40.0, 430.0, 0.0, 0.0);
    g.step(0);
    assert_eq!(g.phase, Phase::Goal);
    for _ in 0..GOAL_TICKS {
        g.step(0);
    }
    assert_eq!(g.v2, BonusesV2::default());
    assert_eq!(g.bonus_mode, 2);
    g.collect_id(21, 0);
    g.set_bonus_mode(1);
    assert_eq!(g.v2, BonusesV2::default());
    assert_eq!(g.bonus_mode, 1);
}
