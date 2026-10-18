import { BODY, readBody } from './engine-contract.js';
// Presentation only: authority, scores and collisions remain on the creator.
// Advance at display rate without adding a fixed interpolation delay.
const HORIZON = 80, CORRECTION = 50, MAX_TRAVEL = 40, TELEPORT = 60;
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const angleDelta = value => Math.atan2(Math.sin(value), Math.cos(value));

export function createRemoteView(authority, now = () => performance.now()) {
  let poses = [], displayed = [], receivedAt = 0, epoch, running = false;
  function advance(time = now()) {
    const age = Math.max(0, time - receivedAt), seconds = Math.min(age, HORIZON) / 1000;
    const residual = Math.max(0, 1 - age / CORRECTION);
    displayed = poses.map(pose => ({
      role: pose.role, radius: pose.radius,
      x: pose.x + (running ? clamp(pose.vx * seconds, MAX_TRAVEL) + pose.dx * residual : 0),
      y: pose.y + (running ? clamp(pose.vy * seconds, MAX_TRAVEL) + pose.dy * residual : 0),
      angle: pose.angle + (running ? clamp(pose.omega * seconds, 1.2) + pose.da * residual : 0),
    }));
  }
  const engine = Object.freeze({ ...authority,
    game_body_value(index, field) {
      const pose = displayed[index];
      if (pose && pose.role === authority.game_body_value(index, BODY.role)) {
        if (field === 0) return pose.x;
        if (field === 1) return pose.y;
        if (field === 4) return pose.angle;
      }
      return authority.game_body_value(index, field);
    },
  });
  return Object.freeze({ engine, advance,
    update({ active, key }, time = now()) {
      advance(time);
      const previous = new Map(displayed.map(pose => [pose.role, pose]));
      const continuous = running && active && epoch === key;
      running = active; epoch = key; receivedAt = time;
      poses = Array.from({ length: authority.game_body_count() }, (_, index) => {
        const pose = { ...readBody(authority, index), dx: 0, dy: 0, da: 0 };
        const before = previous.get(pose.role);
        if (continuous && before?.radius === pose.radius && Math.hypot(before.x - pose.x, before.y - pose.y) < TELEPORT) {
          pose.dx = before.x - pose.x; pose.dy = before.y - pose.y; pose.da = angleDelta(before.angle - pose.angle);
        }
        return pose;
      });
      advance(time);
    },
  });
}
