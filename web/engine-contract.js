// JavaScript boundary of the existing WASM ABI. Indices live here; the Rust
// solver, its timestep and the version-7 wire layout remain unchanged.
const fields = names => Object.freeze(Object.fromEntries(names.map((name, index) => [name, index])));
export const MATCH_FIELDS = Object.freeze(['phase', 'remainingTicks', 'blueScore', 'redScore', 'countdown', 'lastScorer', 'tick', 'sounds', 'blueGoalHeight', 'redGoalHeight', 'notice', 'noticeTicks', 'mode', 'bounce', 'targetScore', 'pitch']);
export const BODY_FIELDS = Object.freeze(['x', 'y', 'vx', 'vy', 'angle', 'omega', 'mass', 'inertia', 'radius', 'role', 'active']);
export const PLAYER_FIELDS = Object.freeze(['speed', 'jump', 'freeze', 'broken', 'bombed', 'scale', 'assistance']);
export const PICKUP_FIELDS = Object.freeze(['kind', 'x', 'y', 'ttl']);
export const BOMB_FIELDS = Object.freeze(['x', 'y']);
export const EFFECT_FIELDS = Object.freeze(['kind', 'x', 'y', 'age', 'width', 'height']);
export const BONUS_FIELDS = Object.freeze(['mode', 'blueCharge', 'redCharge', 'blueShield', 'redShield', 'blueSpring', 'redSpring', 'heavy', 'trampoline', 'shotTrail', 'blueShieldFlash', 'redShieldFlash', 'trampolineFlash', 'blueSpringFlash', 'redSpringFlash']);
export const MATCH = fields(MATCH_FIELDS), BODY = fields(BODY_FIELDS), PLAYER = fields(PLAYER_FIELDS);
export const PICKUP = fields(PICKUP_FIELDS), EFFECT = fields(EFFECT_FIELDS), BONUS = fields(BONUS_FIELDS);
export const PHASE = Object.freeze({ countdown: 0, playing: 1, goal: 2, finished: 3 });
export const PLAYABLE_PITCH_IDS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 15, 16, 17, 18]);
export const BODY_ROLE = Object.freeze({ obstacle: 0, blue: 1, red: 2, ball: 3, blueFoot: 4, redFoot: 5, streaker: 6 });
export const BUFF = Object.freeze({ jump: 0, head: 1, goal: 2, speed: 3, kick: 4 });
export const INPUT = Object.freeze({ left: 1, right: 2, jump: 4, kick: 8 });
export const BONUS_LIMITS = Object.freeze({ mode: 2, blueCharge: 240, redCharge: 240, blueShield: 150, redShield: 150,
  blueSpring: 180, redSpring: 180, heavy: 180, trampoline: 180, shotTrail: 12,
  blueShieldFlash: 12, redShieldFlash: 12, trampolineFlash: 10, blueSpringFlash: 10, redSpringFlash: 10 });
export const TICK_MS = 1000 / 30;
export const ENGINE_COMMANDS = Object.freeze(['game_reset', 'game_tick', 'game_start', 'game_start_match', 'game_start_on_pitch',
  'game_start_balanced_pitch', 'game_probe_start', 'game_probe_pitch_start', 'game_set_assistance', 'game_set_buffs',
  'game_set_skin', 'game_collect', 'game_set_bonus_mode']);
export const decodeFields = (names, values) => Object.fromEntries(names.map((name, index) => [name, values[index]]));
export const encodeFields = (names, value) => names.map(name => value[name]);
const read = (names, getter) => Object.fromEntries(names.map((name, index) => [name, getter(index)]));
export const readMatch = engine => read(MATCH_FIELDS, field => engine.game_value(field));
export const readBody = (engine, index) => ({ index, ...read(BODY_FIELDS, field => engine.game_body_value(index, field)) });
export const readPlayer = (engine, side) => read(PLAYER_FIELDS, field => engine.game_player_value(side, field));
export const readBonus = engine => read(BONUS_FIELDS, field => engine.game_bonus_value?.(field) || 0);
export const readCollection = (engine, name, names) => Array.from({ length: engine[`game_${name}_count`]() }, (_, index) =>
  read(names, field => engine[`game_${name}_value`](index, field)));

// Named domain state is convenient to change; arrays are confined to the legacy
// transport adapter so an already-open opponent can still join after deploy.
export function decodeFrame(packet) {
  return {
    match: decodeFields(MATCH_FIELDS, packet.values), skins: packet.skins.slice(),
    bodies: packet.bodies.map(row => decodeFields(BODY_FIELDS, row)),
    players: packet.players.map(row => decodeFields(PLAYER_FIELDS, row)),
    pickups: packet.pickups.map(row => decodeFields(PICKUP_FIELDS, row)),
    bombs: packet.bombs.map(row => decodeFields(BOMB_FIELDS, row)),
    effects: packet.effects.map(row => decodeFields(EFFECT_FIELDS, row)),
    ...(packet.buffs ? { buffs: packet.buffs.map(row => row.slice()) } : {}),
    ...(packet.bonus ? { bonus: decodeFields(BONUS_FIELDS, packet.bonus) } : {}),
  };
}
export function encodeFrame(frame) {
  return {
    values: encodeFields(MATCH_FIELDS, frame.match), skins: frame.skins.slice(),
    bodies: frame.bodies.map(body => encodeFields(BODY_FIELDS, body)),
    players: frame.players.map(player => encodeFields(PLAYER_FIELDS, player)),
    ...(frame.buffs ? { buffs: frame.buffs.map(row => row.slice()) } : {}),
    ...(frame.bonus ? { bonus: encodeFields(BONUS_FIELDS, frame.bonus) } : {}),
    pickups: frame.pickups.map(pickup => encodeFields(PICKUP_FIELDS, pickup)),
    bombs: frame.bombs.map(bomb => encodeFields(BOMB_FIELDS, bomb)),
    effects: frame.effects.map(effect => encodeFields(EFFECT_FIELDS, effect)),
  };
}
