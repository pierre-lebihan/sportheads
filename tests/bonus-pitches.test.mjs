import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAppStore } from '../web/app-state.js';
import { BONUS_PITCH_IDS, MATCH, isKnownPitch } from '../web/engine-contract.js';
import { availablePitches, PITCHES } from '../web/selection.js';
import { BONUS_PITCHES, BONUS_PITCH_INFO } from '../web/pitch-geometry.js';
import { captureState, createRemoteEngine } from '../web/net-state.js';
const load = async () => (await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)))).instance.exports;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function distance(shape, x, y) {
  const [kind, cx, cy, size, hy, angle] = shape, dx = x - cx, dy = y - cy;
  if (kind === 'circle') return Math.hypot(dx, dy) - size;
  const px = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) - size;
  const py = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) - hy;
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0);
}
test('bonus pitches opt in atomically and cannot survive switching the option off', () => {
  const app = createAppStore(), change = patch => app.dispatch({ type: 'configuration.changed', patch });
  assert.equal(app.value.config.bonusPitches, false);
  assert.deepEqual(availablePitches(), PITCHES); assert.equal(PITCHES.length, 14);
  assert.deepEqual(availablePitches(true).slice(14), BONUS_PITCH_INFO);
  for (const id of BONUS_PITCH_IDS) assert.throws(() => change({ pitch: id }), /disabled/);
  assert.throws(() => change({ bonusPitches: 1 }), /Invalid/);
  change({ bonusPitches: true, pitch: 26 });
  app.dispatch({ type: 'match.started' }); app.dispatch({ type: 'match.quit' });
  assert.equal(app.value.config.pitch, 26); assert.equal(app.value.config.bonusPitches, true);
  change({ bonusPitches: false }); assert.equal(app.value.config.pitch, 8);
  change({ pitch: 11 }); change({ bonusPitches: true }); change({ bonusPitches: false });
  assert.equal(app.value.config.pitch, 11, 'a base pitch is retained');
  for (const id of [10,12,13,19,20,27,100,21.5]) assert.throws(() => change({ pitch: id }), /Invalid|disabled/);
});
test('remote bonus pitches require the explicit option and survive a disconnect', () => {
  const app = createAppStore(); app.dispatch({ type: 'mode.selected', mode: 'online' });
  app.dispatch({ type: 'room.connecting', create: false }); app.dispatch({ type: 'connection.changed', connected: true });
  const frame = { type: 'remote.frame', matchId: 1, started: false, pauseFlags: [false,false], setupStep: 'pitch', balancedPitches: true };
  assert.throws(() => app.dispatch({ ...frame, config: { pitch: 25 } }), /disabled/);
  app.dispatch({ ...frame, config: { bonusPitches: true, pitch: 25 } });
  app.dispatch({ type: 'room.disconnected' }); assert.equal(app.value.config.pitch, 25);
  app.dispatch({ ...frame, config: { bonusPitches: false, pitch: 8 } });
  assert.equal(app.value.config.bonusPitches, false); assert.equal(app.value.config.pitch, 8);
});
test('all six layouts share exact native/render geometry, mirrored collisions and clear spawn points', async () => {
  const source = JSON.parse(await readFile(new URL('../data/bonus-pitches.json', import.meta.url)));
  assert.deepEqual(source.map(p => p.id), BONUS_PITCH_IDS);
  assert.deepEqual(BONUS_PITCHES, Object.fromEntries(source.map(p => [p.id, p.obstacles])));
  assert.deepEqual(BONUS_PITCH_INFO, source.map(({ obstacles, ...info }) => info));
  const e = await load(), guest = createRemoteEngine();
  for (const {id, obstacles} of source) {
    e.game_start_balanced_pitch(12, 9, 1, id); e.game_set_bonus_mode(2);
    assert.equal(e.game_value(MATCH.pitch), id); assert.equal(e.game_body_count(), 17 + obstacles.length);
    obstacles.forEach(([kind, x, y, size, height, angle], n) => {
      const i = 17 + n;
      near(e.game_body_value(i, 0), x); near(e.game_body_value(i, 1), y);
      assert.equal(e.game_body_value(i, 9), 0);
      if (kind === 'circle') { near(e.game_body_value(i, 8), size); assert.equal(e.game_vertex_count(i), 0); }
      else { near(e.game_body_value(i, 4), angle); near(e.game_vertex_value(i, 2, 0), size); near(e.game_vertex_value(i, 2, 1), height); }
    });
    for (const shape of obstacles) {
      for (let y = 30; y <= 455; y += 13) for (let x = 10; x <= 790; x += 13) {
        if (distance(shape, x, y) < -1) assert.ok(obstacles.some(other => distance(other, 800-x, y) < 0), `pitch ${id} lacks mirrored geometry`);
      }
      for (const [x,y,r] of [[200,440,45],[600,440,45],[400,230,10]]) assert.ok(distance(shape,x,y) >= r, `pitch ${id}: obstacle overlaps a spawn`);
    }
    for (let tick=0; tick<600; tick++) e.game_tick(tick%50<10 ? 4|64|8|128 : 2|16);
    assert.equal(guest.update(captureState(e,[1,2])), true); assert.equal(guest.engine.game_value(MATCH.pitch), id);
    assert.ok(captureState(e,[1,2]).bodies.every(row => row.every(Number.isFinite)));
  }
  const packet = captureState(e,[1,2]); packet.values[MATCH.pitch] = 27;
  assert.equal(guest.update(packet), false); assert.equal(isKnownPitch(21.5),false);
});
