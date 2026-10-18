import { PHASE, MATCH, BODY_ROLE, BODY, PLAYER, BONUS, BUFF, readBody } from './engine-contract.js';
// Local controller: reads the public match state and returns only the four
// human input bits. It cannot change physics, bonuses, positions or scores.
export const AI_LEVELS = Object.freeze([
  { id: 'easy', label: 'Facile', description: 'Protège son but mais laisse des occasions.', reaction: 9, horizon: .15, error: 40, miss: .24 },
  { id: 'normal', label: 'Normal', description: 'Anticipe les interceptions et prépare ses frappes.', reaction: 5, horizon: .65, error: 12, miss: .07 },
  { id: 'hard', label: 'Difficile', description: 'Défend les contres et enchaîne les frappes précises.', reaction: 2, horizon: 1, error: 2, miss: .01 },
  { id: 'expert', label: 'Expert', description: 'Anticipation maximale, défense serrée et frappes calculées.', reaction: 1, horizon: 1.2, error: 0, miss: 0 },
].map(Object.freeze));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A short flight estimate, corrected from the real ball at each decision.
// World uses three 1/96 s substeps per game tick, rather than 1/30 s.
function forecast(ball, seconds, bounce, gravity = 300) {
  let { x, y, vx, vy, radius } = ball;
  for (let remaining = seconds; remaining > 0; remaining -= 1 / 96) {
    const dt = Math.min(remaining, 1 / 96);
    vy += gravity * dt; x += vx * dt; y += vy * dt;
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
    const role = engine.game_body_value(index, BODY.role);
    if (role !== BODY_ROLE.blue && role !== BODY_ROLE.red && role !== BODY_ROLE.ball) continue;
    const { x, y, vx, vy, radius } = readBody(engine, index);
    if (![x, y, vx, vy, radius].every(Number.isFinite)) return {};
    found[role] = { x, y, vx, vy, radius };
  }
  return found;
}
export function createOpponent({ difficulty = 'normal', seed = 1, planner = null } = {}) {
  const level = AI_LEVELS.find(item => item.id === difficulty);
  if (!level) throw new RangeError('Unknown AI difficulty');
  let rng = seed >>> 0, nextDecision = null, previousTick = -1, held = 0, kickUntil = 0, kickReady = 0;
  let planned = 0, planUntil = 0, planningActive = false;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  return Object.freeze({
    step(engine) {
      const tick = engine.game_value(MATCH.tick);
      if (engine.game_value(MATCH.phase) !== PHASE.playing || tick < previousTick) {
        nextDecision = null; held = 0; kickUntil = 0; kickReady = 0; planUntil = 0; planningActive = false;
      }
      previousTick = tick;
      if (engine.game_value(MATCH.phase) !== PHASE.playing) return 0;
      if (engine.game_player_value(1, PLAYER.freeze) || engine.game_player_value(1, PLAYER.bombed)) {
        held = 0; planUntil = 0; planningActive = false; nextDecision = tick + level.reaction; return 0;
      }
      if (nextDecision === null) nextDecision = tick + level.reaction;
      if (tick >= nextDecision) {
        nextDecision = tick + level.reaction;
        const scene = bodies(engine), opponent = scene[BODY_ROLE.blue], self = scene[BODY_ROLE.red], ball = scene[BODY_ROLE.ball];
        if (!self || !ball || !opponent) { held = 0; return 0; }
        const bounce = .3 + engine.game_value(MATCH.bounce) * .3;
        const gravity = engine.game_bonus_value?.(BONUS.heavy) > 0 ? 600 : 300;
        // Close encounters need the ball's current position; long-range
        // anticipation must not make the keeper step away from an easy shot.
        const horizon = Math.min(level.horizon, Math.max(0, (Math.abs(ball.x - self.x) - 35) / 140));
        const ahead = forecast(ball, horizon, bounce, gravity);
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
        // Brake before overshooting, rather than alternately steering both ways.
        const dx = target - (self.x + self.vx * .06);
        held = Math.abs(dx) > 7 ? dx < 0 ? 1 : 2 : 0;
        const arrival = ball.vx > 30 ? clamp((self.x - ball.x) / ball.vx, .08, .3) : .12;
        const near = forecast(ball, difficulty === 'easy' ? .05 : arrival, bounce, gravity);
        const reachable = Math.abs(near.x - (self.x + self.vx * .08)) < self.radius + ball.radius + 30;
        const jumpSpeed = (150 + 50 * engine.game_player_value(1, PLAYER.jump)) * (1 + (engine.game_buff_value?.(1, BUFF.jump) || 0) / 100);
        const jumpReach = jumpSpeed * jumpSpeed / (2 * 460) + self.radius + ball.radius + 4;
        const above = near.y < self.y - self.radius * .4 && near.y > self.y - jumpReach;
        if (reachable && above && (!covering || ball.x > 500) && self.vy > -30 && near.vy > -160 && random() >= level.miss) held |= 4;
        const shot = forecast(ball, .1, bounce, gravity);
        const inFront = shot.x > self.x - self.radius - ball.radius - 45 && shot.x < self.x - self.radius * .2;
        const atFoot = shot.y > self.y - 25 && shot.y < self.y + 65;
        if (inFront && atFoot && tick >= kickReady && !engine.game_player_value(1, PLAYER.broken) && random() >= level.miss) {
          held |= 8; kickUntil = tick + 5; kickReady = tick + (difficulty === 'easy' ? 12 : 10);
        }
        planningActive = false;
        if (difficulty !== 'easy' && typeof engine.game_ai_plan === 'function') {
          const distance = Math.abs(ball.x - self.x);
          const relevant = difficulty === 'expert' ? distance < 230 || ball.x > 550 || opponent.x > 550
            : difficulty === 'hard' ? distance < 160 || ball.x > 650 : distance < 90 && ball.y > self.y - 100;
          if (relevant && tick >= planUntil) {
            let enemyInput = opponent.vx > 25 ? 2 : opponent.vx < -25 ? 1 : 0;
            if (opponent.vy < -30) enemyInput |= 4;
            if (ball.x > opponent.x && ball.x - opponent.x < 85 && Math.abs(ball.y - opponent.y) < 65) enemyInput |= 8;
            if (planner) {
              planner.request({ side: 1, preferred: held, opponentInput: enemyInput, expert: Number(difficulty === 'expert') });
              planned = held;
            } else planned = engine.game_ai_plan(1, held, enemyInput, difficulty === 'expert' ? 1 : 0);
            planUntil = tick + (difficulty === 'expert' ? 4 : difficulty === 'hard' ? 4 : 5);
          }
          if (relevant && tick < planUntil) { held = planned; planningActive = true; }
        }
      }
      if (planningActive && planner) {
        const completed = planner.take(tick);
        if (completed !== null) planned = completed;
        held = planned;
      }
      if (!planningActive) held = tick < kickUntil ? held | 8 : held & ~8;
      if (engine.game_player_value(1, PLAYER.broken)) held &= ~8;
      return held;
    },
  });
}
