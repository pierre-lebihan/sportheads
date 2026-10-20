import { BODY, BODY_ROLE, PLAYER, BUFF } from './engine-contract.js';

// Presentation only: the guest sees its own player react to its controls at
// once instead of a round trip later. The creator stays the authority for
// positions, collisions and goals. Each frame says which guest input it has
// applied; the guest replays its newer inputs twice from that state, once as
// pressed and once as the creator still assumes, and shifts its own player
// (and foot) by the difference. Contacts cancel out of that difference, and it
// fades as the creator catches up.
const TICK_MS = 1000 / 30, MAX_TICKS = 10, SMOOTHING_MS = 60, MAX_LEAD = 90;
const ASSIST = [1, 1.1, 1.2, 1.3, 1.4, 1.5];
const OWN = [BODY_ROLE.red, BODY_ROLE.redFoot];

// The creator's apply_controls and three 1/96 s world substeps, without contacts.
export function replay(start, ticks, controls, params) {
  let { x, y, vx: xspeed, vy } = start;
  for (let tick = 0; tick < ticks; tick++) {
    const { held, jump } = controls(tick);
    if (params.moving && held & 1) xspeed -= params.walk;
    if (params.moving && held & 2 && x < 720) xspeed += params.walk;
    if (params.canJump && (jump || held & 4) && y >= params.rest - 1) vy = -params.jump;
    xspeed *= .7; vy += 5;
    for (let step = 0; step < 3; step++) {
      vy += 300 / 96; y += vy / 96; x += xspeed / 96;
      if (y > params.rest) { y = params.rest; vy = 0; }
    }
    x = Math.max(20, Math.min(780, x));
  }
  return { x, y };
}

export function createOwnPrediction(now = () => performance.now()) {
  let sent = [], target = { x: 0, y: 0 }, shown = { x: 0, y: 0 }, shownAt = 0;
  let authority = null, rest = Infinity, active = false;
  function settle(time) {
    const blend = 1 - Math.exp(-Math.max(0, time - shownAt) / SMOOTHING_MS);
    shown = { x: shown.x + (target.x - shown.x) * blend, y: shown.y + (target.y - shown.y) * blend };
    shownAt = time;
  }
  function recompute(time) {
    if (!active || !authority) { target = { x: 0, y: 0 }; return; }
    const acked = sent.find(entry => entry.sequence === authority.ack);
    const pending = sent.filter(entry => entry.sequence > authority.ack);
    if (!acked || !pending.length) { target = { x: 0, y: 0 }; return; }
    const from = pending[0].time, ticks = Math.min(MAX_TICKS, Math.ceil((time - from) / TICK_MS));
    if (ticks <= 0) { target = { x: 0, y: 0 }; return; }
    const at = tick => {
      const moment = from + tick * TICK_MS;
      let current = acked;
      for (const entry of pending) if (entry.time <= moment + TICK_MS / 2) current = entry;
      return current;
    };
    const pressed = tick => {
      const entry = at(tick), before = tick ? at(tick - 1) : acked;
      return { held: entry.held, jump: entry.jump > before.jump };
    };
    const assumed = () => ({ held: acked.held, jump: false });
    const params = { ...authority.params, rest };
    const predicted = replay(authority.body, ticks, pressed, params), baseline = replay(authority.body, ticks, assumed, params);
    const clamp = value => Math.max(-MAX_LEAD, Math.min(MAX_LEAD, value));
    target = { x: clamp(predicted.x - baseline.x), y: clamp(predicted.y - baseline.y) };
  }
  return Object.freeze({
    sent(sequence, held, jump, time = now()) {
      sent.push({ sequence, held, jump, time });
      if (sent.length > 40) sent.shift();
    },
    /** engine: the guest's read-only copy of the creator's last frame. */
    frame(engine, ack, buffs, playing, time = now()) {
      settle(time);
      active = playing && Number.isSafeInteger(ack);
      const index = Array.from({ length: engine.game_body_count() }, (_, i) => i).find(i => engine.game_body_value(i, BODY.role) === BODY_ROLE.red);
      if (!active || index === undefined) { authority = null; recompute(time); return; }
      const body = { x: engine.game_body_value(index, BODY.x), y: engine.game_body_value(index, BODY.y),
        vx: engine.game_body_value(index, BODY.vx), vy: engine.game_body_value(index, BODY.vy) };
      // The resting height depends on the head size; learn it from the creator.
      if (Math.abs(body.vy) < 12 && body.y > 300) rest = body.y;
      const assist = ASSIST[engine.game_player_value(1, PLAYER.assistance)] || 1;
      const frozen = !!engine.game_player_value(1, PLAYER.freeze), bombed = !!engine.game_player_value(1, PLAYER.bombed);
      const buff = field => 1 + (buffs?.[1]?.[field] || 0) / 100;
      authority = { ack, body, params: {
        moving: !frozen && !bombed, canJump: !bombed,
        walk: (50 + 30 * (engine.game_player_value(1, PLAYER.speed) || 0)) * assist * buff(BUFF.speed),
        jump: (150 + 50 * (engine.game_player_value(1, PLAYER.jump) || 0)) * assist * buff(BUFF.jump),
      } };
      sent = sent.filter(entry => entry.sequence >= ack);
      recompute(time);
    },
    /** Offset for a body role at this display time; zero for every other body. */
    offset(role, time = now()) {
      if (!OWN.includes(role)) return null;
      recompute(time); settle(time);
      return shown;
    },
    reset() { sent = []; authority = null; active = false; rest = Infinity; target = shown = { x: 0, y: 0 }; },
  });
}
