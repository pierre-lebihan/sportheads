import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AI_LEVELS, createOpponent } from '../web/opponent.js';
import { captureState, isValidState, createRemoteEngine } from '../web/net-state.js';
const bytes = await readFile(new URL('../probe/physics-core.wasm', import.meta.url));
async function wasm() { return (await WebAssembly.instantiate(bytes)).instance.exports; }

test('each level has a finite reaction delay; decisions cannot edit the actual match', async () => {
  const firstMoves = [];
  for (const { id } of AI_LEVELS) {
    const e = await wasm(); e.game_probe_start(420, 390, 0, 0);
    const ai = createOpponent({ difficulty: id, seed: 1 });
    let first = -1;
    for (let tick = 0; tick < 15; tick++) {
      const before = captureState(e, [1, 2]);
      const facade = createRemoteEngine(); assert.equal(facade.update(before), true);
      const mask = ai.step(facade.engine);
      assert.ok(Number.isInteger(mask) && mask >= 0 && mask <= 15);
      assert.notEqual(mask & 3, 3, 'left and right are never held together');
      assert.deepEqual(captureState(e, [1, 2]), before, 'deciding does not advance physics or change any state');
      if (first < 0 && mask) first = tick;
      e.game_tick(0);
    }
    assert.ok(first > 0, 'no level reacts instantaneously'); firstMoves.push(first);
  }
  assert.ok(firstMoves[0] > firstMoves[1] && firstMoves[1] > firstMoves[2], firstMoves.join(','));
});

test('countdowns, goals, frozen and bombed players release all held controls', async () => {
  const e = await wasm(), ai = createOpponent({ difficulty: 'hard' });
  e.game_start_match(1, 7, 1);
  for (let i = 0; i < 89; i++) { assert.equal(ai.step(e), 0); e.game_tick(0); }
  for (let i = 0; i < 12; i++) e.game_tick(ai.step(e) << 4);
  e.game_collect(6, 1); assert.equal(e.game_player_value(1, 2), 1); assert.equal(ai.step(e), 0);
  e.game_start_match(1, 7, 1);
  assert.equal(ai.step(e), 0, 'a reset discards the previous decision');
  e.game_probe_start(40, 400, 0, 0); e.game_tick(0);
  assert.equal(e.game_value(0), 2); assert.equal(ai.step(e), 0);
  for (let i = 0; i < 15; i++) { assert.equal(ai.step(e), 0); e.game_tick(0); }
  assert.equal(e.game_value(0), 0); assert.equal(ai.step(e), 0);
  const packet = captureState(e, [1, 2]); packet.values[0] = 1; packet.players[1][4] = 1;
  const facade = createRemoteEngine(); assert.ok(facade.update(packet)); assert.equal(ai.step(facade.engine), 0);
});

test('each AI plays full scoring matches through the real engine without a human opponent', async () => {
  for (const { id } of AI_LEVELS) {
    const e = await wasm(); e.game_start_on_pitch(1, 3, 0, 8);
    const ai = createOpponent({ difficulty: id, seed: 1 });
    let kicks = 0, jumps = 0;
    for (let ticks = 0; ticks < 6000 && e.game_value(0) !== 3; ticks++) {
      const mask = ai.step(e); kicks += !!(mask & 8); jumps += !!(mask & 4); e.game_tick(mask << 4);
    }
    assert.equal(e.game_value(0), 3, id + ' reaches the target score');
    assert.equal(e.game_value(3), 3, id + ' can score and win');
    assert.ok(kicks > 0 && jumps > 0, id + ' uses kicks and jumps');
    assert.equal(ai.step(e), 0, 'final whistle stops the AI');
  }
});

test('all levels survive every terrain and bonus, including replaced balls and heads', async () => {
  for (const { id } of AI_LEVELS) for (let pitch = 2; pitch <= 20; pitch++) {
    const e = await wasm(); e.game_start_on_pitch(pitch, 99, 1, pitch);
    const ai = createOpponent({ difficulty: id, seed: pitch });
    for (let tick = 0; tick < 1000; tick++) {
      if (tick >= 90 && tick % 50 === 0) e.game_collect((tick / 50 - 2) % 18 + 1, (tick / 50) % 2);
      const mask = ai.step(e); assert.ok(Number.isInteger(mask) && mask >= 0 && mask <= 15);
      e.game_tick((mask << 4) | (tick % 60 < 30 ? 2 : 1) | (tick % 90 < 8 ? 4 : 0));
    }
    assert.ok(isValidState(captureState(e, [1, 2])), `${id}, terrain ${pitch}`);
    assert.deepEqual([0, 1].map(side => e.game_player_value(side, 6)), [0, 0], 'difficulty grants no hidden assistance');
  }
});

test('a seeded opponent replays identically without using the game random generator', async () => {
  const run = async () => {
    const e = await wasm(); e.game_start_on_pitch(1234, 7, 1, 6);
    const ai = createOpponent({ difficulty: 'normal', seed: 7 }), inputs = [];
    for (let tick = 0; tick < 900; tick++) { const mask = ai.step(e); inputs.push(mask); e.game_tick(mask << 4); }
    return { inputs, state: captureState(e, [1, 2]) };
  };
  assert.deepEqual(await run(), await run());
  assert.throws(() => createOpponent({ difficulty: 'impossible' }), RangeError);
});
