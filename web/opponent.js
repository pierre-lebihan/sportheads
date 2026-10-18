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
    if (role !== 1 && role !== 2 && role !== 3) continue;
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
        const { 1: opponent, 2: self, 3: ball } = bodies(engine);
        if (!self || !ball || !opponent) { held = 0; return 0; }
        const bounce = .3 + engine.game_value(13) * .3;
        // Close encounters need the ball's current position; long-range
        // anticipation must not make the keeper step away from an easy shot.
        const horizon = Math.min(level.horizon, Math.max(0, (Math.abs(ball.x - self.x) - 35) / 140));
        const ahead = forecast(ball, horizon, bounce);
        const spacing = self.radius + ball.radius + 8;
        let target = ahead.x + spacing, minimum = 280, covering = false;
        const distantAttack = ball.x < 270;
        const unreachableHighBall = ball.y < 300 && ball.x < 500;
        const shotAlreadyAway = ball.vx < -100 && ball.x < 520;
        if (distantAttack || unreachableHighBall || shotAlreadyAway) {
          // Do not follow the ball into Blue's goal mouth. Hold a covering
          // position and let the opponent bring it back into a contestable area.
          minimum = 420;
          target = Math.max(440, ahead.x + 120, opponent.x + opponent.radius + self.radius + 24);
          covering = true;
        } else if (opponent.y > 300 && opponent.x > ball.x + ball.radius) {
          // A player screening the ball can counter immediately if we rush past.
          minimum = Math.max(minimum, opponent.x + opponent.radius + self.radius + 20);
          target = Math.max(target, minimum); covering = true;
        }
        if (ball.x > self.x + self.radius * .5 && ball.vx > -20) {
          // Recover the goal side of the actual ball before considering a shot.
          target = Math.max(target, ball.x + spacing);
        }
        // Inaccuracy may miss a chance, but must not discard the safety margin.
        target = clamp(target + (random() * 2 - 1) * level.error, Math.min(minimum, 715), 715);
        const dx = target - self.x;
        held = Math.abs(dx) > 7 ? dx < 0 ? 1 : 2 : 0;
        const near = forecast(ball, difficulty === 'easy' ? 0 : .1, bounce);
        const reachable = Math.abs(near.x - self.x) < self.radius + ball.radius + 38;
        const above = near.y < self.y - self.radius * .4 && near.y > self.y - 105;
        if (reachable && above && (!covering || ball.x > 500) && self.vy > -30 && near.vy > -120 && random() >= level.miss) held |= 4;
        const inFront = ball.x > self.x - self.radius - ball.radius - 45 && ball.x < self.x - self.radius * .25;
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
