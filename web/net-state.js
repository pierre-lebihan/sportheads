import { isKnownPitch, MATCH, BODY_ROLE, BODY, PLAYER, BONUS, BUFF, MATCH_FIELDS, BODY_FIELDS, PLAYER_FIELDS, PICKUP_FIELDS, BOMB_FIELDS, EFFECT_FIELDS, encodeFields, decodeFrame } from './engine-contract.js';
import { PLAYER_COUNT } from './players.js';
import { validBuffs, BUFF_STATS } from './balance.js';
import { validBonusState, BONUS_FIELD_COUNT, BONUS_PICKUP_COUNT } from './bonuses.js';
// Host-authoritative render snapshots. No simulation, assets or executable code
// cross this boundary; the guest only reads the last validated numeric state.
const KEYS = ['values', 'skins', 'bodies', 'players', 'pickups', 'bombs', 'effects'];
const MAX_NUMBER = 1e12;
const DEFAULT_VALUES = encodeFields(MATCH_FIELDS, { phase: 0, remainingTicks: 1800, blueScore: 0, redScore: 0, countdown: 89, lastScorer: -1, tick: 0, sounds: 0, blueGoalHeight: 100, redGoalHeight: 100, notice: 0, noticeTicks: 0, mode: 0, bounce: 1, targetScore: 7, pitch: 8 });
const NEUTRAL_PLAYER = encodeFields(PLAYER_FIELDS, { speed: 1, jump: 1, freeze: 0, broken: 0, bombed: 0, scale: 1, assistance: 0 });
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
    const hasBuffs = Object.hasOwn(packet, 'buffs');
    const hasBonus = Object.hasOwn(packet, 'bonus');
    if (keys.length !== KEYS.length + Number(hasBuffs) + Number(hasBonus) || !KEYS.every(key => Object.hasOwn(packet, key))
      || (hasBuffs && !validBuffs(packet.buffs)) || (hasBonus && !validBonusState(packet.bonus))) return false;
    const bonusCount = hasBonus && packet.bonus[BONUS.mode] === 2 ? BONUS_PICKUP_COUNT : 18;
    const { values: v, skins, bodies, players, pickups, bombs, effects } = packet;
    if (!row(v, MATCH_FIELDS.length) || !row(skins, 2) || !skins.every(skin => integer(skin, 1, PLAYER_COUNT))) return false;
    if (!integer(v[MATCH.phase], 0, 3) || !integer(v[MATCH.remainingTicks], 0) || !integer(v[MATCH.blueScore], 0) || !integer(v[MATCH.redScore], 0)
      || !integer(v[MATCH.countdown], 0) || !integer(v[MATCH.lastScorer], -1, 1) || !integer(v[MATCH.tick], 0)
      || !integer(v[MATCH.sounds], 0, 127) || ![v[MATCH.blueGoalHeight], v[MATCH.redGoalHeight]].every(height => hasBuffs ? integer(height, 30, 140) : oneOf(height, [60, 100, 140]))
      || !integer(v[MATCH.notice], 0, bonusCount) || !integer(v[MATCH.noticeTicks], 0, 70) || !oneOf(v[MATCH.mode], [0, 1]) || !integer(v[MATCH.bounce], 0, 2)
      || !integer(v[MATCH.targetScore], 1, 99) || !isKnownPitch(v[MATCH.pitch])) return false;
    const roles = new Set();
    if (!rows(bodies, 6, BODY_FIELDS.length, body => {
      const role = body[BODY.role], radius = body[BODY.radius];
      if (!integer(role, BODY_ROLE.blue, BODY_ROLE.streaker) || roles.has(role) || body[BODY.active] !== 1
        || body[BODY.mass] <= 0 || body[BODY.inertia] < 0 || radius < 0 || radius > (hasBuffs && oneOf(role, [BODY_ROLE.blue, BODY_ROLE.red]) ? 45 : 30)) return false;
      if (oneOf(role, [BODY_ROLE.blueFoot, BODY_ROLE.redFoot]) ? radius !== 0 : radius <= 0) return false;
      roles.add(role);
      return true;
    }) || ![BODY_ROLE.blue, BODY_ROLE.red, BODY_ROLE.ball, BODY_ROLE.blueFoot, BODY_ROLE.redFoot].every(role => roles.has(role))) return false;
    if (!Array.isArray(players) || players.length !== 2 || !rows(players, 2, PLAYER_FIELDS.length, player =>
      integer(player[PLAYER.speed], 0, 2) && integer(player[PLAYER.jump], 0, 2)
      && integer(player[PLAYER.freeze], 0, 1) && integer(player[PLAYER.broken], 0, 1) && integer(player[PLAYER.bombed], 0, 1)
      && oneOf(player[PLAYER.scale], [0.5, 1, 1.5]) && integer(player[PLAYER.assistance], 0, 5))) return false;
    if (players[0][PLAYER.assistance] > 0 && players[1][PLAYER.assistance] > 0) return false;
    if (hasBuffs) {
      for (const side of [0, 1]) {
        const head = bodies.find(body => body[BODY.role] === BODY_ROLE.blue + side);
        if (Math.abs(head[BODY.radius] - 20 * players[side][PLAYER.scale] * (1 + packet.buffs[side][BUFF.head] / 100)) > 1e-9
          || ![60, 100, 140].some(base => Math.round(base * (100 - packet.buffs[side][BUFF.goal]) / 100) === v[side ? MATCH.redGoalHeight : MATCH.blueGoalHeight])) return false;
      }
    }
    if (!rows(pickups, 16, 4, pickup => integer(pickup[0], 1, bonusCount) && integer(pickup[3], 0, 600))) return false;
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
    const role = engine.game_body_value(index, BODY.role);
    if (role === BODY_ROLE.obstacle || engine.game_body_value(index, BODY.active) !== 1) continue;
    bodies.push(Array.from({ length: BODY_FIELDS.length }, (_, field) => engine.game_body_value(index, field)));
    if (bodies.length > 6) throw new RangeError('Too many active game bodies');
  }
  const packet = {
    values: Array.from({ length: MATCH_FIELDS.length }, (_, field) => engine.game_value(field)),
    skins: Array.isArray(skins) ? skins.slice() : skins,
    bodies,
    players: Array.from({ length: 2 }, (_, side) => Array.from({ length: PLAYER_FIELDS.length }, (_, field) => engine.game_player_value(side, field))),
    buffs: Array.from({ length: 2 }, (_, side) => Array.from({ length: BUFF_STATS.length }, (_, stat) => engine.game_buff_value?.(side, stat) ?? 0)),
    bonus: Array.from({ length: BONUS_FIELD_COUNT }, (_, field) => engine.game_bonus_value?.(field) ?? 0),
    pickups: captureRows(engine, 'game_pickup_count', 'game_pickup_value', PICKUP_FIELDS.length, 16),
    bombs: captureRows(engine, 'game_bomb_count', 'game_bomb_value', BOMB_FIELDS.length, 16),
    effects: captureRows(engine, 'game_effect_count', 'game_effect_value', EFFECT_FIELDS.length, 256),
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
    game_buff_value: (side, stat) => Number.isInteger(side) && Number.isInteger(stat) ? current.buffs?.[side]?.[stat] ?? (side >= 0 && side < 2 && stat >= 0 && stat < BUFF_STATS.length ? 0 : NaN) : NaN,
    game_bonus_value: field => Number.isInteger(field) && field >= 0 && field < BONUS_FIELD_COUNT ? current.bonus?.[field] ?? 0 : NaN,
    game_pickup_count: () => current.pickups.length,
    game_pickup_value: (index, field) => value('pickups', index, field),
    game_bomb_count: () => current.bombs.length,
    game_bomb_value: (index, field) => value('bombs', index, field),
    game_effect_count: () => current.effects.length,
    game_effect_value: (index, field) => value('effects', index, field),
  });
  return Object.freeze({
    engine,
    readFrame() { return decodeFrame(current); },
    update(packet) {
      if (!isValidState(packet)) return false;
      try {
        const next = Object.fromEntries(KEYS.map(key => [key,
          key === 'values' || key === 'skins' ? packet[key].slice() : packet[key].map(entry => entry.slice()),
        ]));
        if (Object.hasOwn(packet, 'buffs')) next.buffs = packet.buffs.map(stats => stats.slice());
        if (Object.hasOwn(packet, 'bonus')) next.bonus = packet.bonus.slice();
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
