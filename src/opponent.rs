//! Bounded local lookahead. All candidate matches are independent clones.
use crate::{
    body::Shape,
    game::{Game, Phase},
};

fn radius(game: &Game, index: usize) -> f64 {
    match game.world.bodies[index].shape {
        Shape::Circle { radius } => radius,
        _ => 0.0,
    }
}
fn evaluate(game: &Game, side: usize) -> f64 {
    let enemy = 1 - side;
    let sign = if side == 1 { 1.0 } else { -1.0 };
    let orient = |x: f64| if side == 1 { x } else { 800.0 - x };
    let ball = &game.world.bodies[game.ball];
    let player = &game.world.bodies[game.player[side]];
    let other = &game.world.bodies[game.player[enemy]];
    let bx = orient(ball.position.x);
    let px = orient(player.position.x);
    let ox = orient(other.position.x);
    let bvx = ball.velocity.x * sign;
    let pr = radius(game, game.player[side]);
    let br = radius(game, game.ball);
    let threatening = bx > 550.0 && bvx > -50.0;
    let spacing = pr + br + 6.0;
    let covering =
        bx < 270.0 || (ball.position.y < 300.0 && bx < 500.0) || (bvx < -100.0 && bx < 520.0);
    let mut target = bx + spacing;
    if covering {
        target = target.max(450.0).max(ox + 65.0);
    } else if other.position.y > 300.0 && ox > bx + br {
        target = target.max(ox + 60.0);
    }
    target = target.clamp(if covering { 420.0 } else { 280.0 }, 715.0);
    // Field progress and a ball moving toward the opponent are valuable, but
    // surrendering our goal side costs more than an adventurous short-range shot.
    let mut score = (400.0 - bx) * 0.1 - bvx * 0.22;
    score -= (target - px).abs() * 0.7;
    if bx > px + pr * 0.5 {
        score -= (bx - px).min(200.0) * if threatening { 2.0 } else { 0.4 };
    }
    if px < 280.0 {
        score -= (280.0 - px) * 3.0;
    }
    if threatening && ball.position.y > 460.0 - game.goal_height(side) as f64 - br {
        score -= (bx - 560.0).max(0.0) * 0.8;
    }
    // Do not leave the ground for balls we cannot affect.
    if (bx - px).abs() > 120.0 {
        score -= (430.0 - player.position.y).max(0.0) * 0.4;
    }
    score
}

fn follow_up(game: &Game, side: usize) -> u32 {
    let ball = &game.world.bodies[game.ball];
    let player = &game.world.bodies[game.player[side]];
    let other = &game.world.bodies[game.player[1 - side]];
    let orient = |x: f64| if side == 1 { x } else { 800.0 - x };
    let sign = if side == 1 { 1.0 } else { -1.0 };
    let bx = orient(ball.position.x);
    let px = orient(player.position.x);
    let ox = orient(other.position.x);
    let pr = radius(game, game.player[side]);
    let br = radius(game, game.ball);
    let covering = bx < 270.0
        || (ball.position.y < 300.0 && bx < 500.0)
        || (ball.velocity.x * sign < -100.0 && bx < 520.0);
    let mut target = bx + pr + br + 6.0;
    if covering {
        target = target.max(450.0).max(ox + 65.0);
    } else if other.position.y > 300.0 && ox > bx + br {
        target = target.max(ox + 60.0);
    }
    let dx = target.clamp(if covering { 420.0 } else { 280.0 }, 715.0)
        - (px + player.velocity.x * sign * 0.06);
    let direction = if dx < -7.0 {
        1
    } else if dx > 7.0 {
        2
    } else {
        0
    };
    let mut command = if side == 1 {
        direction
    } else {
        (direction & 1) << 1 | (direction & 2) >> 1
    };
    if (bx - px).abs() < 75.0
        && ball.position.y < player.position.y - 10.0
        && ball.position.y > player.position.y - 90.0
        && player.velocity.y > -30.0
        && ball.velocity.y > -120.0
        && (!covering || bx > 500.0)
    {
        command |= 4;
    }
    if bx > px - pr - br - 45.0
        && bx < px - pr * 0.2
        && ball.position.y > player.position.y - 25.0
        && ball.position.y < player.position.y + 65.0
        && !game.powerups.broken[side]
    {
        command |= 8;
    }
    command
}

fn rollout(
    game: &Game,
    side: usize,
    action: u32,
    opponent_input: u32,
    expert: bool,
    respond: bool,
) -> f64 {
    let mut trial = game.clone();
    // Existing pickups and bonuses evolve; newly random pickups are not consulted.
    trial.bonus_enabled = false;
    let before = trial.score;
    let mut score = 0.0;
    let horizon = if expert { 18 } else { 10 };
    for tick in 0..horizon {
        let ours = if expert && tick >= 4 {
            follow_up(&trial, side)
        } else {
            action
        };
        let theirs = if expert && respond && tick >= 4 {
            follow_up(&trial, 1 - side)
        } else {
            opponent_input & 15
        };
        trial.step((ours << (side * 4)) | (theirs << ((1 - side) * 4)));
        if trial.score != before {
            score += if trial.score[side] > before[side] {
                100_000.0
            } else {
                -200_000.0
            };
            break;
        }
        score += evaluate(&trial, side) * if tick + 1 == horizon { 1.0 } else { 0.04 };
    }
    score
}

pub fn plan(game: &Game, side: usize, preferred: u32, opponent_input: u32, expert: bool) -> u32 {
    if side > 1
        || game.phase != Phase::Playing
        || game.powerups.freeze[side]
        || game.powerups.bombed[side]
    {
        return 0;
    }
    let preferred = preferred & 15;
    let bias = |action| {
        (if action == preferred { 1.5 } else { 0.0 })
            - (if action & 8 != 0 && preferred & 8 == 0 {
                1.0
            } else {
                0.0
            })
    };
    let mut seen = [false; 16];
    let mut candidates = Vec::with_capacity(12);
    for action in [preferred, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14] {
        if action & 3 == 3
            || seen[action as usize]
            || (action & 8 != 0 && game.powerups.broken[side])
        {
            continue;
        }
        seen[action as usize] = true;
        candidates.push((
            action,
            rollout(game, side, action, opponent_input, expert, true) + bias(action),
        ));
    }
    candidates.sort_by(|a, b| b.1.total_cmp(&a.1));
    if !expert {
        return candidates[0].0;
    }
    // Refine only the three finalists. Prefer actions that survive both a
    // responding opponent and one that continues the currently observed move.
    let mut best = candidates[0].0;
    let mut best_score = f64::NEG_INFINITY;
    for &(action, first) in candidates.iter().take(3) {
        let second = rollout(game, side, action, opponent_input, true, false) + bias(action);
        let score = first.min(second) * 0.85 + first.max(second) * 0.15;
        if score > best_score {
            best_score = score;
            best = action;
        }
    }
    best
}

/// One simulated line: `first` is held for `hold` ticks, then the expert
/// follow-up policy plays on. The rival either reacts with the same policy or
/// keeps the command it is visibly holding now.
fn line(
    game: &Game,
    side: usize,
    first: u32,
    hold: u32,
    horizon: u32,
    seen: u32,
    stubborn: bool,
) -> f64 {
    let mut trial = game.clone();
    trial.bonus_enabled = false;
    let before = trial.score;
    let mut score = 0.0;
    for tick in 0..horizon {
        let ours = if tick < hold {
            first
        } else {
            follow_up(&trial, side)
        };
        let theirs = if stubborn {
            seen & 15
        } else if tick < 2 {
            0
        } else {
            follow_up(&trial, 1 - side)
        };
        trial.step((ours << (side * 4)) | (theirs << ((1 - side) * 4)));
        if trial.score != before {
            // Sooner goals are surer; a late concession is still a concession.
            let urgency = 1.0 + (horizon - tick) as f64 / horizon as f64;
            return score
                + if trial.score[side] > before[side] {
                    60_000.0 * urgency
                } else {
                    -200_000.0 * urgency
                };
        }
        score += evaluate(&trial, side) * if tick + 1 == horizon { 1.0 } else { 0.05 };
    }
    score + projection(&trial, side)
}

/// Where the ball is heading after the horizon: a free flight or roll towards a
/// goal mouth is valued before the physics search can see it cross the line.
/// It counts for less when a player already stands between the ball and goal.
fn projection(game: &Game, side: usize) -> f64 {
    let ball = &game.world.bodies[game.ball];
    let br = radius(game, game.ball);
    let (mut x, mut y, mut vx, mut vy) = (
        ball.position.x,
        ball.position.y,
        ball.velocity.x,
        ball.velocity.y,
    );
    let start = x;
    // Whether a player stands between the ball and the goal at `toward_right`.
    let between = |player: usize, toward_right: bool| {
        let body = &game.world.bodies[game.player[player]];
        body.position.y > 330.0 && (body.position.x > start) == toward_right
    };
    let gravity = game.world.gravity.y;
    const TICKS: u32 = 90;
    for tick in 0..TICKS {
        let dt = 1.0 / 30.0;
        vy += gravity * dt;
        x += vx * dt;
        y += vy * dt;
        if y > 460.0 - br {
            // A bounce loses speed; a rolling ball keeps most of it.
            y = 460.0 - br;
            if vy > 60.0 {
                vy = -vy * 0.5;
                vx *= 0.9;
            } else {
                vy = 0.0;
                vx *= 0.99;
            }
        }
        if y < 5.0 + br {
            vy = vy.abs();
        }
        let (left, right) = (x < 62.0, x > 738.0);
        if left || right {
            // Side 0 defends the left goal, side 1 the right one.
            let defender = if left { 0 } else { 1 };
            if y <= 460.0 - game.goal_height(defender) as f64 {
                return 0.0;
            }
            let urgency = 1.0 - tick as f64 / TICKS as f64;
            let cover = if between(defender, right) { 0.25 } else { 1.0 };
            return urgency * cover * if defender == side { -4_000.0 } else { 1_500.0 };
        }
        if x < 5.0 + br || x > 795.0 - br || vx.abs() < 5.0 {
            return 0.0;
        }
    }
    0.0
}

/// Insane level: a two-stage search over held commands with longer physics
/// lookahead and a pessimistic rival. It only chooses the four player inputs.
pub fn plan_insane(game: &Game, side: usize, preferred: u32, opponent_input: u32) -> u32 {
    if side > 1
        || game.phase != Phase::Playing
        || game.powerups.freeze[side]
        || game.powerups.bombed[side]
    {
        return 0;
    }
    let preferred = preferred & 15;
    let mut seen = [false; 16];
    let mut candidates = Vec::with_capacity(12);
    for action in [preferred, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14] {
        if action & 3 == 3
            || seen[action as usize]
            || (action & 8 != 0 && game.powerups.broken[side])
        {
            continue;
        }
        seen[action as usize] = true;
        let bias = if action == preferred { 1.5 } else { 0.0 };
        candidates.push((
            action,
            line(game, side, action, 4, 16, opponent_input, false) + bias,
        ));
    }
    candidates.sort_by(|a, b| b.1.total_cmp(&a.1));
    let mut best = candidates[0].0;
    let mut best_score = f64::NEG_INFINITY;
    for &(action, reacting) in candidates.iter().take(5) {
        let committed = line(game, side, action, 9, 20, opponent_input, false);
        let stubborn = line(game, side, action, 4, 16, opponent_input, true);
        // We may continue either way against a reacting rival; the observed
        // rival command is a second, independent test of the same choice.
        let ours = reacting.max(committed);
        let score = ours.min(stubborn) * 0.8 + ours.max(stubborn) * 0.2;
        if score > best_score {
            best_score = score;
            best = action;
        }
    }
    best
}
