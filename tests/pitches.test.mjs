import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureState, createRemoteEngine } from '../web/net-state.js';
import { PITCHES } from '../web/selection.js';
import { BALANCED_PITCHES, ORIGINAL_PITCHES } from '../web/pitch-geometry.js';
const reference = JSON.parse(await readFile(new URL('./fixtures/pitches/original.json', import.meta.url)));
const load = async () => (await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)))).instance.exports;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-7, `${actual} differs from Flash ${expected}`);
test('all public pitches have mirrored native collisions and shared rendering geometry', async () => {
  const close = (a, b) => Math.abs(a - b) <= 1e-7;
  const points = body => body.shapes[0].vertices.map(([x, y]) => [
    body.x + x * Math.cos(body.angle) - y * Math.sin(body.angle),
    body.y + x * Math.sin(body.angle) + y * Math.cos(body.angle)
  ]);
  function mirrors(left, right) {
    const a = left.shapes[0], b = right.shapes[0];
    if (a.type !== b.type) return false;
    if (a.type === 0) return close(left.x + right.x, 800) && close(left.y, right.y) && close(a.radius, b.radius);
    const vertices = points(right);
    return a.vertices.length === b.vertices.length && points(left).every(([x, y]) => vertices.some(([rx, ry]) => close(x + rx, 800) && close(y, ry)));
  }
  const symmetric = reference.pitches.filter(pitch => pitch.obstacles.every(body => pitch.obstacles.some(other => mirrors(body, other))));
  const expected = [...symmetric.map(pitch => pitch.frame), ...Object.keys(BALANCED_PITCHES).map(Number)].sort((a, b) => a - b);
  assert.deepEqual(PITCHES.map(pitch => pitch.id), expected);
  assert.equal(PITCHES.length, 16);
  assert.deepEqual(BALANCED_PITCHES, JSON.parse(await readFile(new URL('../data/balanced-pitches.json', import.meta.url))));
  for (const { id } of PITCHES) {
    const e = await load(); e.game_start_balanced_pitch(7, 7, 0, id);
    const obstacles = Array.from({ length: e.game_body_count() - 17 }, (_, offset) => {
      const i = offset + 17, vertices = Array.from({ length: e.game_vertex_count(i) }, (_, j) => [e.game_vertex_value(i, j, 0), e.game_vertex_value(i, j, 1)]);
      return { x: e.game_body_value(i, 0), y: e.game_body_value(i, 1), angle: e.game_body_value(i, 4),
        shapes: [vertices.length ? { type: 1, vertices } : { type: 0, radius: e.game_body_value(i, 8) }] };
    });
    assert.ok(obstacles.every(body => obstacles.some(other => mirrors(body, other))), `pitch ${id}: native colliders must be mirrored`);
    assert.equal(e.game_value(8), e.game_value(9), 'both goals have the same height');
    if (BALANCED_PITCHES[id]) {
      assert.equal(obstacles.length, BALANCED_PITCHES[id].length);
      BALANCED_PITCHES[id].forEach(([kind, x, y, size, height, angle], index) => {
        const body = obstacles[index], shape = body.shapes[0];
        const original = reference.pitches.find(pitch => pitch.frame === id).obstacles[index].shapes[0];
        near(body.x, x); near(body.y, y);
        if (kind === 'circle') { assert.equal(shape.type, 0); near(shape.radius, size); near(size, original.radius); }
        else { assert.equal(shape.type, 1); near(shape.vertices[2][0], size); near(shape.vertices[2][1], height); near(body.angle, angle); near(size, original.vertices[2][0]); near(height, original.vertices[2][1]); }
      });
    }
    for (let frame = 0; frame < 500; frame++) e.game_tick(frame % 50 < 10 ? 4 | 64 | 8 | 128 : 2 | 16);
    for (let i = 0; i < e.game_body_count(); i++) assert.ok(Number.isFinite(e.game_body_value(i, 0)) && Number.isFinite(e.game_body_value(i, 1)));
    const remote = createRemoteEngine(); assert.equal(remote.update(captureState(e, [1, 2])), true);
    assert.equal(remote.engine.game_value(15), id);
  }
  assert.ok(PITCHES.some(pitch => pitch.id === 8), 'the default open pitch remains available');
});
for (const pitch of reference.pitches) test(`pitch ${pitch.frame}: real WASM geometry matches captured original Flash`, async () => {
  const e = await load(); e.game_start_on_pitch(7, 99, 0, pitch.frame);
  assert.equal(e.game_value(15), pitch.frame);
  assert.equal(e.game_body_count(), 17 + pitch.obstacles.length);
  assert.equal(ORIGINAL_PITCHES[pitch.frame].length, pitch.obstacles.length);
  pitch.obstacles.forEach((body, offset) => {
    const i = 17 + offset, shape = body.shapes[0];
    [body.x, body.y, 0, 0, body.angle, 0, 0, 0].forEach((value, field) => near(e.game_body_value(i, field), value));
    assert.equal(e.game_body_value(i, 9), 0);
    if (shape.type === 0) { near(e.game_body_value(i, 8), shape.radius); assert.equal(e.game_vertex_count(i), 0); }
    else { assert.equal(e.game_vertex_count(i), 4); shape.vertices.forEach((v, j) => v.forEach((n, axis) => near(e.game_vertex_value(i, j, axis), n))); }
    assert.deepEqual(ORIGINAL_PITCHES[pitch.frame][offset], shape.type === 0
      ? ['circle', body.x, body.y, shape.radius]
      : ['box', body.x, body.y, ...shape.vertices[2], body.angle], 'Graphite rendering uses the captured collision geometry');
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
