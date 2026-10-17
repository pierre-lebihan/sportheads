import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureState, isValidState, createRemoteEngine } from '../web/net-state.js';

async function wasm() {
  return (await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)))).instance.exports;
}

function compareFacade(remote, packet) {
  packet.values.forEach((value, field) => assert.equal(remote.game_value(field), value));
  for (const [collection, count, getter] of [
    ['bodies', 'game_body_count', 'game_body_value'],
    ['pickups', 'game_pickup_count', 'game_pickup_value'],
    ['bombs', 'game_bomb_count', 'game_bomb_value'],
    ['effects', 'game_effect_count', 'game_effect_value'],
  ]) {
    assert.equal(remote[count](), packet[collection].length);
    packet[collection].forEach((row, index) => row.forEach((value, field) => assert.equal(remote[getter](index, field), value)));
  }
  packet.players.forEach((row, side) => row.forEach((value, field) => assert.equal(remote.game_player_value(side, field), value)));
  assert.equal(remote.game_vertex_count(0), 0);
  assert.equal(remote.game_vertex_value(0, 0, 0), 0);
}

test('actual WASM survives snapshot round trips through every bonus and body replacement', async () => {
  const host = await wasm();
  host.game_start(12345, 0, 0, 1);
  const guest = createRemoteEngine();
  for (let kind = 0; kind <= 18; kind++) {
    if (kind) host.game_collect(kind, kind % 2);
    for (let tick = 0; tick < 3; tick++) host.game_tick(0);
    const original = captureState(host, [3, 26]);
    assert.ok(isValidState(original), `bonus ${kind}`);
    assert.ok(original.bodies.length >= 5 && original.bodies.length <= 6);
    assert.equal(new Set(original.bodies.map(body => body[9])).size, original.bodies.length);
    assert.ok(original.bodies.every(body => body[10] === 1 && body[9] !== 0));
    const packet = JSON.parse(JSON.stringify(original));
    assert.equal(guest.update(packet), true);
    compareFacade(guest.engine, original);
  }
  assert.ok(host.game_body_count() > 17, 'body replacement must leave discarded local bodies');
  assert.equal(guest.engine.game_tick, undefined);
  assert.equal(guest.engine.game_reset, undefined);
  assert.ok(Object.isFrozen(guest.engine));
});

test('active play captures moving bodies, spawned pickups, bombs and animation effects', async () => {
  const host = await wasm();
  host.game_start(777, 0, 0, 1);
  for (let tick = 0; tick < 89 + 205; tick++) host.game_tick(tick % 30 < 10 ? 4 | 64 : 0);
  host.game_collect(9, 0);
  host.game_tick(0);
  const packet = captureState(host, [1, 2]);
  assert.ok(packet.values[6] > 200);
  assert.ok(packet.pickups.length > 0);
  assert.ok(packet.bombs.length > 0);
  assert.ok(packet.effects.length > 0);
  const guest = createRemoteEngine();
  assert.equal(guest.update(packet), true);
  compareFacade(guest.engine, packet);
  assert.equal(Buffer.byteLength(JSON.stringify(packet)) < 100_000, true);
});

test('malformed and oversized packets cannot mutate the last accepted state', async () => {
  const host = await wasm();
  host.game_reset(1);
  const valid = captureState(host, [1, 2]);
  const guest = createRemoteEngine();
  assert.equal(guest.update(valid), true);
  const changes = [
    packet => { packet.values[0] = 4; },
    packet => { packet.values[1] = -1; },
    packet => { packet.values[2] = 0.5; },
    packet => { packet.values[6] = Infinity; },
    packet => { packet.values[12] = 1; },
    packet => { packet.values[13] = 3; },
    packet => { packet.values.push(1); },
    packet => { delete packet.values[0]; },
    packet => { packet.skins[0] = 0; },
    packet => { packet.skins[1] = 27; },
    packet => { packet.bodies[0][0] = NaN; },
    packet => { packet.bodies[0][1] = 1e12 + 1; },
    packet => { packet.bodies[0][8] = 31; },
    packet => { packet.bodies[0][9] = 1.5; },
    packet => { packet.bodies[0][10] = 0; },
    packet => { packet.bodies[1][9] = packet.bodies[0][9]; },
    packet => { packet.bodies.pop(); },
    packet => { packet.bodies.push(...packet.bodies); },
    packet => { packet.bodies[0].pop(); },
    packet => { packet.players[0][2] = 2; },
    packet => { packet.players[1][5] = 1e12; },
    packet => { packet.players.push(packet.players[0]); },
    packet => { packet.pickups = [[19, 400, 200, 600]]; },
    packet => { packet.pickups = [[1, 400, 200, -1]]; },
    packet => { packet.pickups = Array.from({ length: 17 }, () => [1, 400, 200, 600]); },
    packet => { packet.bombs = Array.from({ length: 17 }, () => [400, 200]); },
    packet => { packet.bombs = [[400]]; },
    packet => { packet.effects = Array.from({ length: 257 }, () => [0, 400, 200, 0, 40, 40]); },
    packet => { packet.effects = [[6, 400, 200, 0, 40, 40]]; },
    packet => { packet.effects = [[0, 400, 200, 0, -1, 40]]; },
    packet => { packet.extra = 1; },
    packet => { delete packet.players; },
  ];
  for (const change of changes) {
    const packet = structuredClone(valid);
    change(packet);
    assert.equal(isValidState(packet), false, change.toString());
    assert.equal(guest.update(packet), false, change.toString());
    compareFacade(guest.engine, valid);
  }
  for (const packet of [null, undefined, [], 1, 'state', { ...valid, bodies: new Array(5) }]) {
    assert.equal(guest.update(packet), false);
    compareFacade(guest.engine, valid);
  }
});

test('accepted packet arrays are copied and the facade cannot be edited', async () => {
  const host = await wasm();
  host.game_reset(1);
  const packet = captureState(host, [1, 2]);
  const expected = structuredClone(packet);
  const guest = createRemoteEngine();
  assert.equal(guest.update(packet), true);
  packet.values[2] = 999;
  packet.bodies[0][0] = 999;
  packet.players[0][0] = 0;
  packet.bodies.length = 0;
  compareFacade(guest.engine, expected);
  assert.throws(() => { guest.engine.game_value = () => 999; }, TypeError);
  const invalid = { ...expected, get values() { throw new Error('untrusted getter'); } };
  assert.equal(isValidState(invalid), false);
  assert.equal(guest.update(invalid), false);
  compareFacade(guest.engine, expected);
  assert.ok(Number.isNaN(guest.engine.game_body_value(999, 0)));
});
