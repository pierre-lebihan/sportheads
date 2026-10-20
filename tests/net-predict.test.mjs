import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BODY, BODY_ROLE, MATCH, PHASE, PLAYER } from '../web/engine-contract.js';
import { createOwnPrediction, replay } from '../web/net-predict.js';

function fakeEngine(body = { x: 600, y: 430, vx: 0, vy: 0 }) {
  const values = { [BODY.x]: body.x, [BODY.y]: body.y, [BODY.vx]: body.vx, [BODY.vy]: body.vy, [BODY.role]: BODY_ROLE.red };
  return { game_body_count: () => 1, game_body_value: (_i, field) => values[field] ?? 0, game_player_value: () => 0 };
}

async function wasm() {
  return (await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)))).instance.exports;
}

test('the replay follows the real engine for the guest walking and jumping', async () => {
  const core = await wasm();
  core.game_start_match(4242, 9, 0);
  for (let i = 0; i < 400 && core.game_value(MATCH.phase) !== PHASE.playing; i++) core.game_tick(0);
  for (let i = 0; i < 30; i++) core.game_tick(0);
  const red = Array.from({ length: core.game_body_count() }, (_, i) => i).find(i => core.game_body_value(i, BODY.role) === BODY_ROLE.red);
  const read = () => ({ x: core.game_body_value(red, BODY.x), y: core.game_body_value(red, BODY.y), vx: core.game_body_value(red, BODY.vx), vy: core.game_body_value(red, BODY.vy) });
  // Default powerup levels are 1: the guest reads them from the creator's frame the same way.
  const speed = core.game_player_value(1, PLAYER.speed), jump = core.game_player_value(1, PLAYER.jump);
  const start = read(), params = { moving: true, canJump: true, walk: 50 + 30 * speed, jump: 150 + 50 * jump, rest: start.y };
  for (let i = 0; i < 8; i++) core.game_tick(1 << 4);
  const walked = read(), predicted = replay(start, 8, () => ({ held: 1, jump: false }), params);
  assert.ok(start.x - walked.x > 15, 'the engine walked left');
  assert.ok(Math.abs(predicted.x - walked.x) < 3, `walk ${predicted.x} vs ${walked.x}`);
  for (let i = 0; i < 20; i++) core.game_tick(0);
  const still = read();
  core.game_tick(4 << 4); for (let i = 0; i < 5; i++) core.game_tick(0);
  const jumped = read(), arc = replay(still, 6, tick => ({ held: 0, jump: tick === 0 }), { ...params, rest: still.y });
  assert.ok(still.y - jumped.y > 15, 'the engine jumped');
  assert.ok(Math.abs(arc.y - jumped.y) < 3, `jump ${arc.y} vs ${jumped.y}`);
});

test('the guest player leads by its unacknowledged inputs, then settles when the creator catches up', () => {
  let clock = 1000;
  const prediction = createOwnPrediction(() => clock), engine = fakeEngine();
  prediction.sent(1, 0, 0); prediction.frame(engine, 1, null, true);
  assert.deepEqual(prediction.offset(BODY_ROLE.red), { x: 0, y: 0 });
  prediction.sent(2, 2, 0);                       // right pressed, not yet applied
  clock += 150;
  const lead = prediction.offset(BODY_ROLE.red);
  assert.ok(lead.x > 3, `moves right at once (${lead.x})`); assert.equal(lead.y, 0);
  assert.deepEqual(prediction.offset(BODY_ROLE.redFoot), lead, 'the foot follows its player');
  assert.equal(prediction.offset(BODY_ROLE.blue), null, 'the other player is never shifted');
  prediction.frame(engine, 2, null, true);         // the creator applied it: nothing left to predict
  clock += 400;
  assert.ok(Math.abs(prediction.offset(BODY_ROLE.red).x) < .1);
});

test('a jump shows immediately once the resting height is known, and not while paused', () => {
  let clock = 0;
  const prediction = createOwnPrediction(() => clock), engine = fakeEngine();
  prediction.sent(1, 0, 0); prediction.frame(engine, 1, null, true);
  prediction.sent(2, 0, 1); clock += 120;
  assert.ok(prediction.offset(BODY_ROLE.red).y < -5);
  prediction.frame(engine, 1, null, false); clock += 400;
  assert.ok(Math.abs(prediction.offset(BODY_ROLE.red).y) < .1);
});
