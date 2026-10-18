import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeFrame, encodeFrame, readMatch, readBody, MATCH, BODY, BONUS, ENGINE_COMMANDS } from '../web/engine-contract.js';
import { captureState, createRemoteEngine } from '../web/net-state.js';

test('named state round-trips every existing wire field without changing legacy packet bytes', async () => {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url))), e = instance.exports;
  for (const name of Object.keys(e).filter(name => name.startsWith('game_'))) {
    assert.ok(name.endsWith('_value') || name.endsWith('_count') || name === 'game_ai_plan' || ENGINE_COMMANDS.includes(name), `${name} must declare its boundary contract`);
  }
  e.game_start_balanced_pitch(4, 9, 1, 6); e.game_set_bonus_mode(2);
  for (let kind = 1; kind <= 23; kind++) {
    e.game_collect(kind, kind % 2); e.game_tick(0);
    const packet = captureState(e, [13, 23]), named = decodeFrame(packet), encoded = encodeFrame(named);
    assert.equal(JSON.stringify(encoded), JSON.stringify(packet));
    assert.equal(named.match.targetScore, e.game_value(MATCH.targetScore));
    assert.equal(named.bonus.heavy, e.game_bonus_value(BONUS.heavy));
    const remote = createRemoteEngine(); assert.equal(remote.update(encoded), true);
    assert.deepEqual(remote.readFrame(), decodeFrame(encoded));
    const copy = remote.readFrame(); copy.match.targetScore = 99;
    assert.equal(remote.readFrame().match.targetScore, 9, 'named access cannot mutate the accepted frame');
    assert.deepEqual(readMatch(remote.engine), readMatch(e));
    assert.deepEqual(readBody(remote.engine, 0).x, packet.bodies[0][BODY.x]);
    named.match.targetScore = 1; named.bodies[0].x = 500;
    assert.equal(packet.values[MATCH.targetScore], 9); assert.notEqual(packet.bodies[0][BODY.x], 500);
  }
});
