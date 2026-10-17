import { PLAYER_COUNT } from './players.js';
// Host-authoritative render snapshots. No simulation, assets or executable code
// cross this boundary; the guest only reads the last validated numeric state.
const KEYS = ['values', 'skins', 'bodies', 'players', 'pickups', 'bombs', 'effects'];
const MAX_NUMBER = 1e12;
const DEFAULT_VALUES = [0, 1800, 0, 0, 89, -1, 0, 0, 100, 100, 0, 0, 0, 1, 7, 8];
const NEUTRAL_PLAYER = [1, 1, 0, 0, 0, 1, 0];
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_NUMBER;
const integer = (value, min, max = MAX_NUMBER) => finite(value) && Number.isInteger(value) && value >= min && value <= max;
const oneOf = (value, choices) => choices.includes(value);

function row(value, length) {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let field = 0; field < length; field++) if (!finite(value[field])) return false;
  return true;
}
function rows(value, max, width, validate = () => true) {
  if (!Array.isArray(value) || value.length > max) return false;
  for (const entry of value) if (!row(entry, width) || !validate(entry)) return false;
  return true;
}

/** Validate a complete packet before replacing any guest-visible state. */
export function isValidState(packet) {
  try {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return false;
    const prototype = Object.getPrototypeOf(packet);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Object.keys(packet);
    if (keys.length !== KEYS.length || !KEYS.every(key => Object.hasOwn(packet, key))) return false;
    const { values: v, skins, bodies, players, pickups, bombs, effects } = packet;
    if (!row(v, 16) || !row(skins, 2) || !skins.every(skin => integer(skin, 1, PLAYER_COUNT))) return false;
    if (!integer(v[0], 0, 3) || !integer(v[1], 0) || !integer(v[2], 0) || !integer(v[3], 0)
      || !integer(v[4], 0) || !integer(v[5], -1, 1) || !integer(v[6], 0)
      || !integer(v[7], 0, 127) || !oneOf(v[8], [60, 100, 140]) || !oneOf(v[9], [60, 100, 140])
      || !integer(v[10], 0, 18) || !integer(v[11], 0, 70) || !oneOf(v[12], [0, 1]) || !integer(v[13], 0, 2)
      || !integer(v[14], 1, 99) || !integer(v[15], 2, 20)) return false;
    const roles = new Set();
    if (!rows(bodies, 6, 11, body => {
      const role = body[9], radius = body[8];
      if (!integer(role, 1, 6) || roles.has(role) || body[10] !== 1
        || body[6] <= 0 || body[7] < 0 || radius < 0 || radius > 30) return false;
      if (oneOf(role, [4, 5]) ? radius !== 0 : radius <= 0) return false;
      roles.add(role);
      return true;
    }) || ![1, 2, 3, 4, 5].every(role => roles.has(role))) return false;
    if (!Array.isArray(players) || players.length !== 2 || !rows(players, 2, 7, player =>
      integer(player[0], 0, 2) && integer(player[1], 0, 2)
      && integer(player[2], 0, 1) && integer(player[3], 0, 1) && integer(player[4], 0, 1)
      && oneOf(player[5], [0.5, 1, 1.5]) && integer(player[6], 0, 3))) return false;
    if (!rows(pickups, 16, 4, pickup => integer(pickup[0], 1, 18) && integer(pickup[3], 0, 600))) return false;
    if (!rows(bombs, 16, 2)) return false;
    if (!rows(effects, 256, 6, effect => integer(effect[0], 0, 5) && integer(effect[3], 0, 1000)
      && effect[4] >= 0 && effect[4] <= 4096 && effect[5] >= 0 && effect[5] <= 4096)) return false;
    return true;
  } catch {
    return false;
  }
}

function count(engine, method, max) {
  const value = engine[method]();
  if (!integer(value, 0, max)) throw new RangeError('Invalid engine collection count');
  return value;
}
function captureRows(engine, countMethod, valueMethod, width, max) {
  return Array.from({ length: count(engine, countMethod, max) }, (_, index) =>
    Array.from({ length: width }, (_, field) => engine[valueMethod](index, field)));
}

/** The host's WASM ABI is the only source of authoritative match state. */
export function captureState(engine, skins) {
  const bodies = [];
  // Body replacement leaves inactive entries in the local world. They carry no
  // render state and must not grow the wire packet with every pickup.
  const total = count(engine, 'game_body_count', 100_000);
  for (let index = 0; index < total; index++) {
    const role = engine.game_body_value(index, 9);
    if (role === 0 || engine.game_body_value(index, 10) !== 1) continue;
    bodies.push(Array.from({ length: 11 }, (_, field) => engine.game_body_value(index, field)));
    if (bodies.length > 6) throw new RangeError('Too many active game bodies');
  }
  const packet = {
    values: Array.from({ length: 16 }, (_, field) => engine.game_value(field)),
    skins: Array.isArray(skins) ? skins.slice() : skins,
    bodies,
    players: Array.from({ length: 2 }, (_, side) => Array.from({ length: 7 }, (_, field) => engine.game_player_value(side, field))),
    pickups: captureRows(engine, 'game_pickup_count', 'game_pickup_value', 4, 16),
    bombs: captureRows(engine, 'game_bomb_count', 'game_bomb_value', 2, 16),
    effects: captureRows(engine, 'game_effect_count', 'game_effect_value', 6, 256),
  };
  if (!isValidState(packet)) throw new RangeError('Invalid authoritative game state');
  return packet;
}

/** A read-only facade for the existing renderer; update is intentionally separate. */
export function createRemoteEngine() {
  let current = {
    values: DEFAULT_VALUES.slice(), skins: [1, 2], bodies: [],
    players: [NEUTRAL_PLAYER.slice(), NEUTRAL_PLAYER.slice()], pickups: [], bombs: [], effects: [],
  };
  const value = (collection, index, field) => Number.isInteger(index) && Number.isInteger(field)
    ? current[collection][index]?.[field] ?? NaN : NaN;
  const engine = Object.freeze({
    game_value: field => Number.isInteger(field) ? current.values[field] ?? NaN : NaN,
    game_body_count: () => current.bodies.length,
    game_body_value: (index, field) => value('bodies', index, field),
    game_vertex_count: () => 0,
    game_vertex_value: () => 0,
    game_player_value: (side, field) => value('players', side, field),
    game_pickup_count: () => current.pickups.length,
    game_pickup_value: (index, field) => value('pickups', index, field),
    game_bomb_count: () => current.bombs.length,
    game_bomb_value: (index, field) => value('bombs', index, field),
    game_effect_count: () => current.effects.length,
    game_effect_value: (index, field) => value('effects', index, field),
  });
  return Object.freeze({
    engine,
    update(packet) {
      if (!isValidState(packet)) return false;
      try {
        const next = Object.fromEntries(KEYS.map(key => [key,
          key === 'values' || key === 'skins' ? packet[key].slice() : packet[key].map(entry => entry.slice()),
        ]));
        // Also reject an accessor that changes its answer between validation and copy.
        if (!isValidState(next)) return false;
        current = next;
        return true;
      } catch {
        return false;
      }
    },
  });
}
