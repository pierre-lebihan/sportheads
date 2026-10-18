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
  host.game_start_match(12345, 7, 1);
  const guest = createRemoteEngine();
  for (let kind = 0; kind <= 18; kind++) {
    if (kind) host.game_collect(kind, kind % 2);
    for (let tick = 0; tick < 3; tick++) host.game_tick(0);
    const original = captureState(host, [[13, 14], [15, 16], [17, 17], [13, 18], [19, 19], [20, 21], [22, 22], [14, 23]][kind % 8]);
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
  host.game_start_match(777, 3, 1);
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
    packet => { packet.values[12] = 2; },
    packet => { packet.values[13] = 3; },
    packet => { packet.values[14] = 0; },
    packet => { packet.values[14] = 100; },
    packet => { packet.values[14] = 1.5; },
    packet => { packet.values[15] = 1; },
    packet => { packet.values[15] = 27; },
    packet => { packet.values.push(1); },
    packet => { delete packet.values[0]; },
    packet => { packet.skins[0] = 0; },
    packet => { packet.skins[1] = 24; },
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
    packet => { packet.players[0][6] = 6; },
    packet => { packet.players[1][6] = -1; },
    packet => { packet.players[0][6] = 1; packet.players[1][6] = 1; },
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


test('all eleven exclusive handicap positions survive the WASM snapshot boundary', async () => {
  const host = await wasm(); host.game_start_match(7, 3, 0);
  const guest = createRemoteEngine();
  for (let position = -5; position <= 5; position++) {
    const levels = [Math.max(0, -position), Math.max(0, position)];
    host.game_set_assistance(0, levels[0]); host.game_set_assistance(1, levels[1]);
    const packet = captureState(host, [1, 12]);
    assert.equal(guest.update(packet), true);
    assert.equal(guest.engine.game_player_value(0, 6), levels[0]);
    assert.equal(guest.engine.game_player_value(1, 6), levels[1]);
  }
});

test('independent buffs and their actual collisions survive snapshots, including pickup multipliers', async () => {
  const host = await wasm(); host.game_start_match(7,3,0);
  host.game_set_buffs(0,13,50,50,15,37); host.game_set_buffs(1,50,23,17,48,9);
  host.game_collect(14,0); host.game_collect(8,1);
  const packet = captureState(host,[13,23]), guest = createRemoteEngine();
  assert.deepEqual(packet.buffs,[[13,50,50,15,37],[50,23,17,48,9]]);
  assert.equal(packet.values[8],30);
  assert.equal(packet.values[9],83);
  assert.equal(packet.bodies.find(body => body[9]===1)[8],45);
  assert.equal(guest.update(packet),true);
  for (const side of [0,1]) for (const stat of [0,1,2,3,4]) assert.equal(guest.engine.game_buff_value(side,stat),packet.buffs[side][stat]);
  const expected = structuredClone(packet);
  packet.buffs[0][0]=50;
  assert.equal(guest.engine.game_buff_value(0,0),13,'guest owns a copy');
  for (const change of [p=>p.buffs[0][0]=51,p=>p.buffs[0][0]=-1,p=>p.buffs[1][0]=1.5,p=>p.buffs[1].push(1),p=>p.buffs.pop(),p=>p.buffs[0][1]=0,p=>p.values[8]=100]) {
    const bad=structuredClone(expected); change(bad);
    assert.equal(guest.update(bad),false,change.toString());
    assert.equal(guest.engine.game_buff_value(0,0),13);
  }
});

test('legacy neutral snapshots remain readable without fabricating buffs', async () => {
  const host=await wasm();host.game_reset(1);
  const packet=captureState(host,[1,2]);delete packet.buffs;delete packet.bonus;
  const guest=createRemoteEngine();assert.equal(guest.update(packet),true);
  assert.equal(guest.engine.game_buff_value(0,0),0);
});

test('V2 effects, timer expiration and pickup IDs cross the actual WASM boundary',async()=>{
  const host=await wasm();host.game_start_match(7,7,1);host.game_set_bonus_mode(2);
  const guest=createRemoteEngine();
  for(let id=19;id<=23;id++){
    host.game_collect(id,0);const packet=captureState(host,[13,23]);
    assert.equal(packet.values[10],id);assert.equal(packet.bonus[0],2);assert.equal(guest.update(packet),true);
    for(let field=0;field<15;field++)assert.equal(guest.engine.game_bonus_value(field),host.game_bonus_value(field));
  }
  const packet=captureState(host,[13,23]), expected=structuredClone(packet);
  packet.bonus[1]=0;assert.equal(guest.engine.game_bonus_value(1),240,'accepted arrays are copied');
  for(const edit of [p=>p.bonus[1]=241,p=>p.bonus[0]=1,p=>p.bonus[8]=.5,p=>p.pickups=[[24,400,200,600]]]){
    const bad=structuredClone(expected);edit(bad);assert.equal(guest.update(bad),false);assert.equal(guest.engine.game_bonus_value(1),240);
  }
  const withPickup=structuredClone(expected);withPickup.pickups=[[23,400,200,600]];assert.equal(guest.update(withPickup),true);
  const historical=structuredClone(withPickup);historical.bonus=[1,...Array(14).fill(0)];historical.values[10]=0;assert.equal(guest.update(historical),false,'historical pool excludes new pickups');
  host.game_set_bonus_mode(1);const old=captureState(host,[1,2]);delete old.bonus;assert.equal(guest.update(old),true);assert.equal(guest.engine.game_bonus_value(1),0,'legacy host clears earlier V2 presentation');
});

test('V2 and every historical pickup compose with maximum buffs on both camps',async()=>{
  const host=await wasm();host.game_start_balanced_pitch(17,99,1,18);host.game_set_bonus_mode(2);
  for(const side of [0,1])host.game_set_buffs(side,50,50,50,50,50);
  for(let tick=0;tick<1000;tick++){
    if(tick%30===0)host.game_collect(Math.floor(tick/30)%23+1,Math.floor(tick/30)%2);
    host.game_tick(tick%60<30?2|16|8|128:4|64);
    if(tick%10===0)assert.ok(isValidState(captureState(host,[13,23])),`tick ${tick}`);
  }
});
