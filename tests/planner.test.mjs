import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPlannerRuntime } from '../web/planner-runtime.js';
import { createPlannerService } from '../web/planner.js';
import { createPerformanceMonitor } from '../web/performance.js';
import { captureState } from '../web/net-state.js';
import { physicalState } from '../scripts/physics-reference.mjs';

const load = async () => WebAssembly.compile(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)));
test('the private replica replays the exact commands; planning cannot mutate authoritative physics', async () => {
  const module = await load(), authoritative = (await WebAssembly.instantiate(module)).exports, replica = await createPlannerRuntime(module);
  const command = (name, ...args) => { authoritative[name](...args); replica.command(name, args); };
  command('game_start_balanced_pitch', 3125, 7, 1, 6); command('game_set_bonus_mode', 2);
  command('game_set_buffs', 0, 10, 20, 30, 40, 50); command('game_set_buffs', 1, 50, 40, 30, 20, 10);
  for (let tick = 0; tick < 500; tick++) {
    if (tick >= 100 && tick < 100 + 23 * 12 && tick % 12 === 4) command('game_collect', Math.floor((tick - 100) / 12) + 1, tick % 2);
    command('game_tick', tick % 53 < 25 ? 2 | 16 | 8 : 4 | 64 | 128);
    if (tick % 25 === 0) {
      const before = physicalState(authoritative);
      assert.deepEqual(replica.inspect(), captureState(authoritative, [1, 2]));
      const planned = replica.plan({ side: 1, preferred: 1, opponentInput: 2, expert: 1 });
      assert.equal(planned.mask, authoritative.game_ai_plan(1, 1, 2, 1));
      assert.deepEqual(physicalState(authoritative), before, 'the query cannot change real collisions, velocity, RNG, bodies or scores');
      assert.deepEqual(replica.inspect(), captureState(authoritative, [1, 2]));
    }
  }
  assert.throws(() => replica.command('invented', []));
});
test('bonus layouts replay in the private AI replica without changing authoritative physics', async () => {
  const module = await load(), e = (await WebAssembly.instantiate(module)).exports, replica = await createPlannerRuntime(module);
  for (const pitch of [21,22,23,24,25,26]) {
    e.game_start_balanced_pitch(3125, 7, 1, pitch); replica.command('game_start_balanced_pitch', [3125,7,1,pitch]);
    for (let tick=0; tick<100; tick++) { e.game_tick(2|16); replica.command('game_tick',[2|16]); }
    assert.deepEqual(replica.inspect(), captureState(e,[1,2]));
    assert.equal(replica.plan({side:1,preferred:1,opponentInput:2,expert:1}).mask, e.game_ai_plan(1,1,2,1));
    assert.deepEqual(replica.inspect(), captureState(e,[1,2]));
  }
});
test('expired plans and replies from a terminated worker cannot change a later match', async () => {
  const module = await load(), raw = (await WebAssembly.instantiate(module)).exports, workers = [];
  const makeWorker = () => { const worker = { postMessage() {}, terminate() { this.terminated = true; } }; workers.push(worker); return worker; };
  const service = createPlannerService(raw, module, createPerformanceMonitor(), makeWorker);
  service.start(); service.engine.game_start_balanced_pitch(1, 7, 0, 8);
  service.request({ side: 1, preferred: 1, opponentInput: 2, expert: 1 });
  workers[0].onmessage({ data: { type: 'plan', id: 1, epoch: 2, tick: 10, mask: 8, ms: 1 } });
  assert.equal(service.take(20), null, 'old decisions expire');
  service.stop(); service.start();
  workers[0].onmessage({ data: { type: 'ready' } }); assert.equal(service.stats().status, 'starting');
  assert.equal(workers[0].terminated, true); service.stop();
});
test('a Worker failure preserves all real engine calls and leaves the heuristic controller usable', async () => {
  const module = await load(), raw = (await WebAssembly.instantiate(module)).exports;
  const service = createPlannerService(raw, module, createPerformanceMonitor(), () => { throw Error('Worker unavailable'); });
  service.start(); service.engine.game_start_balanced_pitch(1, 7, 0, 8);
  for (let tick = 0; tick < 100; tick++) service.engine.game_tick(2);
  assert.equal(service.stats().status, 'unavailable'); assert.equal(raw.game_value(6), 100);
  assert.equal(service.take(100), null);
});
