import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AI_LEVELS, createOpponent } from '../web/opponent.js';
import { captureState, isValidState, createRemoteEngine } from '../web/net-state.js';
const bytes = await readFile(new URL('../probe/physics-core.wasm', import.meta.url));
async function wasm() { return (await WebAssembly.instantiate(bytes)).instance.exports; }

test('Expert evaluates real physics through bounded plans without modifying the live state', async () => {
  assert.deepEqual(AI_LEVELS.map(level => level.id), ['easy', 'normal', 'hard', 'expert']);
  const e = await wasm(); e.game_probe_start(550, 430, 40, 0);
  let calls = 0;
  const observed = { ...e, game_ai_plan(...args) {
    const before = captureState(e, [1, 2]); calls++;
    const result = e.game_ai_plan(...args);
    assert.deepEqual(captureState(e, [1, 2]), before);
    return result;
  } };
  const ai = createOpponent({ difficulty: 'expert' });
  for (let tick = 0; tick < 90; tick++) e.game_tick(ai.step(observed) << 4);
  assert.ok(calls > 0 && calls <= 30, `bounded decision frequency: ${calls}`);
  assert.deepEqual([0, 1].map(side => e.game_player_value(side, 6)), [0, 0]);
});

async function decision(difficulty, { ball, human, self }, seed = 1) {
  const e = await wasm(); e.game_probe_start(400, 400, 0, 0);
  const packet = captureState(e, [1, 2]), view = createRemoteEngine();
  for (const [role, change] of [[1, human], [2, self], [3, ball]]) {
    const body = packet.bodies.find(body => body[9] === role);
    for (const [field, name] of ['x', 'y', 'vx', 'vy'].entries()) if (change[name] !== undefined) body[field] = change[name];
  }
  const ai = createOpponent({ difficulty, seed }); let mask = 0;
  for (let tick = 0; tick <= 12; tick++) { packet.values[6] = tick; assert.ok(view.update(packet)); mask = ai.step(view.engine); }
  return mask;
}

test('all levels cover a ball near the opposing goal instead of chasing it, or retreat when already too deep', async () => {
  for (const { id } of AI_LEVELS) for (const seed of [1, 2, 3, 4, 5]) {
    const situation = { ball: { x: 110, y: 440, vx: 0, vy: 0 }, human: { x: 130, y: 440 }, self: { x: 420, y: 440 } };
    assert.equal((await decision(id, situation, seed)) & 1, 0, `${id}: no rush underneath the opposing goal`);
    situation.self.x = 170;
    assert.equal((await decision(id, situation, seed)) & 3, 2, `${id}: recover instead of following the ball deeper`);
  }
});

test('all levels respect an opponent screening the ball but still contest a safe midfield chance', async () => {
  for (const { id } of AI_LEVELS) {
    assert.equal((await decision(id, { ball: { x: 350, y: 430, vx: 0, vy: 0 }, human: { x: 450, y: 440 }, self: { x: 500, y: 440 } })) & 1, 0, `${id}: stay on the goal side of the opponent`);
    assert.equal((await decision(id, { ball: { x: 400, y: 430, vx: 0, vy: 0 }, human: { x: 220, y: 440 }, self: { x: 470, y: 440 } })) & 3, 1, `${id}: keep attacking a safe loose ball`);
    assert.equal((await decision(id, { ball: { x: 650, y: 430, vx: 100, vy: 0 }, human: { x: 500, y: 440 }, self: { x: 570, y: 440 } })) & 3, 2, `${id}: recover when the ball passes behind`);
    assert.equal((await decision(id, { ball: { x: 160, y: 150, vx: -80, vy: 0 }, human: { x: 200, y: 440 }, self: { x: 360, y: 440 } })) & 3, 2, `${id}: do not run underneath a distant high ball`);
  }
});

test('actual matches keep all four levels out of the opposing goal area when the ball is trapped there', async () => {
  for (const { id } of AI_LEVELS) for (const seed of [1, 2, 3]) {
    const e = await wasm(); e.game_probe_start(120, 440, 0, 0);
    const ai = createOpponent({ difficulty: id, seed }); let minimum = 600;
    for (let tick = 0; tick < 240; tick++) {
      for (let i = 0; i < e.game_body_count(); i++) if (e.game_body_value(i, 9) === 2) minimum = Math.min(minimum, e.game_body_value(i, 0));
      e.game_tick((ai.step(e) << 4) | 4);
    }
    assert.ok(minimum > 330, `${id}: overcommitted to x=${minimum}`);
  }
});

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
  assert.ok(firstMoves.every((value, index) => index === 0 || firstMoves[index - 1] > value), firstMoves.join(','));
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
