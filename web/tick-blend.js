import { BODY, MATCH } from './engine-contract.js';
// Presentation only: the engine still advances in exact 30 Hz ticks. A 60 Hz
// display drew 0 or 2 of them per frame whenever its timing jittered; each
// frame now blends the last two ticks by the scheduler's remaining debt.
const TELEPORT = 60;
const angleDelta = value => Math.atan2(Math.sin(value), Math.cos(value));

export function createTickBlend(source) {
  let previous = [], current = [], previousTick = -1, currentTick = -1, fraction = 1;
  const read = () => Array.from({ length: source.game_body_count() }, (_, index) => ({
    active: source.game_body_value(index, BODY.active), role: source.game_body_value(index, BODY.role), radius: source.game_body_value(index, BODY.radius),
    x: source.game_body_value(index, BODY.x), y: source.game_body_value(index, BODY.y), angle: source.game_body_value(index, BODY.angle),
  }));
  const engine = Object.freeze({ ...source,
    game_body_value(index, field) {
      if (field === BODY.x || field === BODY.y || field === BODY.angle) {
        const before = previous[index], after = current[index];
        if (before && after && before.active && after.active && before.role === after.role && before.radius === after.radius
          && Math.hypot(after.x - before.x, after.y - before.y) < TELEPORT) {
          if (field === BODY.x) return before.x + (after.x - before.x) * fraction;
          if (field === BODY.y) return before.y + (after.y - before.y) * fraction;
          return before.angle + angleDelta(after.angle - before.angle) * fraction;
        }
      }
      return source.game_body_value(index, field);
    },
  });
  return Object.freeze({
    // Call after each game_tick.
    capture() { previous = current; previousTick = currentTick; current = read(); currentTick = source.game_value(MATCH.tick); },
    // Restarts, goals and commands between ticks fall back to the exact state.
    view(progress) {
      const tick = source.game_value(MATCH.tick);
      if (tick !== currentTick || previousTick !== tick - 1) return source;
      fraction = Math.min(1, Math.max(0, progress));
      return engine;
    },
  });
}
