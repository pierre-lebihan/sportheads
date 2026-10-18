// Local controller: reads the public match state and returns only the four
// human input bits. It cannot change physics, bonuses, positions or scores.
export const AI_LEVELS = Object.freeze([
  { id: 'easy', label: 'Facile', description: 'Réagit tranquillement et laisse des occasions.', reaction: 10, horizon: 0, error: 60, miss: .28 },
  { id: 'normal', label: 'Normal', description: 'Anticipe les trajectoires et revient défendre.', reaction: 6, horizon: .4, error: 20, miss: .1 },
  { id: 'hard', label: 'Difficile', description: 'Intercepte, prévoit les rebonds et protège son but.', reaction: 3, horizon: .8, error: 5, miss: .02 },
].map(Object.freeze));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A short flight estimate, corrected from the real ball at each decision.
// World uses three 1/96 s substeps per game tick, rather than 1/30 s.
function forecast(ball, seconds, bounce) {
  let { x, y, vx, vy, radius } = ball;
  for (let remaining = seconds; remaining > 0; remaining -= 1 / 96) {
    const dt = Math.min(remaining, 1 / 96);
    vy += 300 * dt; x += vx * dt; y += vy * dt;
    if (x < 5 + radius) { x = 5 + radius; vx = Math.abs(vx) * bounce; }
    if (x > 795 - radius) { x = 795 - radius; vx = -Math.abs(vx) * bounce; }
    if (y > 460 - radius) { y = 460 - radius; vy = -Math.abs(vy) * bounce; }
    if (y < 5 + radius) { y = 5 + radius; vy = Math.abs(vy) * bounce; }
  }
  return { x, y, vx, vy };
}
function bodies(engine) {
  const found = {};
  for (let index = 0; index < engine.game_body_count(); index++) {
    const role = engine.game_body_value(index, 9);
    if (role !== 2 && role !== 3) continue;
    const [x, y, vx, vy, radius] = [0, 1, 2, 3, 8].map(field => engine.game_body_value(index, field));
    if (![x, y, vx, vy, radius].every(Number.isFinite)) return {};
    found[role] = { x, y, vx, vy, radius };
  }
  return found;
}
export function createOpponent({ difficulty = 'normal', seed = 1 } = {}) {
  const level = AI_LEVELS.find(item => item.id === difficulty);
  if (!level) throw new RangeError('Unknown AI difficulty');
  let rng = seed >>> 0, nextDecision = null, previousTick = -1, held = 0, kickUntil = 0, kickReady = 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  return Object.freeze({
    step(engine) {
      const tick = engine.game_value(6);
      if (engine.game_value(0) !== 1 || tick < previousTick) {
        nextDecision = null; held = 0; kickUntil = 0; kickReady = 0;
      }
      previousTick = tick;
      if (engine.game_value(0) !== 1) return 0;
      if (engine.game_player_value(1, 2) || engine.game_player_value(1, 4)) {
        held = 0; nextDecision = tick + level.reaction; return 0;
      }
      if (nextDecision === null) nextDecision = tick + level.reaction;
      if (tick >= nextDecision) {
        nextDecision = tick + level.reaction;
        const { 2: self, 3: ball } = bodies(engine);
        if (!self || !ball) { held = 0; return 0; }
        const bounce = .3 + engine.game_value(13) * .3;
        // Close encounters need the ball's current position; long-range
        // anticipation must not make the keeper step away from an easy shot.
        const horizon = Math.min(level.horizon, Math.max(0, (Math.abs(ball.x - self.x) - 35) / 140));
        const ahead = forecast(ball, horizon, bounce);
        // Stay on the goal side of the ball so contact sends it towards Blue.
        let target = ahead.x + self.radius + ball.radius + 5;
        if (difficulty !== 'easy' && ball.vx > 60 && ball.x > 430) {
          // Intercept incoming shots instead of following them into our net.
          target = Math.min(target, 690);
        }
        target = clamp(target + (random() * 2 - 1) * level.error, 90, 700);
        const dx = target - self.x;
        held = Math.abs(dx) > 7 ? dx < 0 ? 1 : 2 : 0;
        const near = forecast(ball, difficulty === 'easy' ? 0 : .1, bounce);
        const reachable = Math.abs(near.x - self.x) < self.radius + ball.radius + 38;
        const above = near.y < self.y - self.radius * .4 && near.y > self.y - 105;
        if (reachable && above && self.vy > -30 && near.vy > -120 && random() >= level.miss) held |= 4;
        const inFront = ball.x > self.x - self.radius - ball.radius - 45 && ball.x < self.x + ball.radius;
        const atFoot = ball.y > self.y - 25 && ball.y < self.y + 65;
        if (inFront && atFoot && tick >= kickReady && !engine.game_player_value(1, 3) && random() >= level.miss) {
          held |= 8; kickUntil = tick + 3; kickReady = tick + 12;
        }
      }
      if (tick >= kickUntil || engine.game_player_value(1, 3)) held &= ~8;
      return held;
    },
  });
}
