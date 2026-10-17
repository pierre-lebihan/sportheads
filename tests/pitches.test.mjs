import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureState, createRemoteEngine } from '../web/net-state.js';
const reference = JSON.parse(await readFile(new URL('./fixtures/pitches/original.json', import.meta.url)));
const load = async () => (await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)))).instance.exports;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-7, `${actual} differs from Flash ${expected}`);
for (const pitch of reference.pitches) test(`pitch ${pitch.frame}: real WASM geometry matches captured original Flash`, async () => {
  const e = await load(); e.game_start_on_pitch(7, 99, 0, pitch.frame);
  assert.equal(e.game_value(15), pitch.frame);
  assert.equal(e.game_body_count(), 17 + pitch.obstacles.length);
  pitch.obstacles.forEach((body, offset) => {
    const i = 17 + offset, shape = body.shapes[0];
    [body.x, body.y, 0, 0, body.angle, 0, 0, 0].forEach((value, field) => near(e.game_body_value(i, field), value));
    assert.equal(e.game_body_value(i, 9), 0);
    if (shape.type === 0) { near(e.game_body_value(i, 8), shape.radius); assert.equal(e.game_vertex_count(i), 0); }
    else { assert.equal(e.game_vertex_count(i), 4); shape.vertices.forEach((v, j) => v.forEach((n, axis) => near(e.game_vertex_value(i, j, axis), n))); }
  });
  for (let frame = 0; frame < 500; frame++) e.game_tick(frame % 50 < 10 ? 4 | 64 | 8 | 128 : 2 | 16);
  for (let i = 0; i < e.game_body_count(); i++) assert.ok(Number.isFinite(e.game_body_value(i, 0)) && Number.isFinite(e.game_body_value(i, 1)));
  const remote = createRemoteEngine();
  assert.equal(remote.update(JSON.parse(JSON.stringify(captureState(e, [1, 2])))), true);
  assert.equal(remote.engine.game_value(15), pitch.frame);
});
test('pitch is bounded to playable blueprints and normal matches default to the open pitch', async () => {
  const e = await load(); e.game_start_on_pitch(7, 7, 0, 0); assert.equal(e.game_value(15), 2);
  e.game_start_on_pitch(7, 7, 0, 100); assert.equal(e.game_value(15), 20);
  e.game_start_match(7, 7, 0); assert.equal(e.game_value(15), 8); assert.equal(e.game_body_count(), 17);
});
