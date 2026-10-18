import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureState, createRemoteEngine } from '../web/net-state.js';
import { createRemoteView } from '../web/net-render.js';

async function setup() {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)));
  instance.exports.game_reset(1);
  const packet = captureState(instance.exports, [1, 2]);
  const head = packet.bodies.find(body => body[9] === 1);
  head[0] = 100; head[1] = 200; head[2] = 120; head[3] = 0;
  const remote = createRemoteEngine(); remote.update(packet);
  const view = createRemoteView(remote.engine);
  const index = packet.bodies.findIndex(body => body[9] === 1);
  view.update({ active: true, key: 'match-1' }, 0);
  return { packet, head, remote, view, index, x: () => view.engine.game_body_value(index, 0) };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('display frames advance between network updates without changing authority', async () => {
  const { view, remote, index, x } = await setup();
  view.advance(16); near(x(), 101.92);
  view.advance(32); near(x(), 103.84);
  assert.equal(remote.engine.game_body_value(index, 0), 100);
  assert.equal(view.engine.game_value(2), remote.engine.game_value(2));
  assert.equal(view.engine.game_tick, undefined);
  view.advance(1000); near(x(), 109.6);
  view.advance(5000); near(x(), 109.6, 'a stalled connection cannot keep drifting');
});

test('an irregular arrival blends the visual correction and converges to the new route', async () => {
  const { view, remote, packet, head, x } = await setup();
  view.advance(45); const before = x();
  head[0] = 108; remote.update(packet); view.update({ active: true, key: 'match-1' }, 45);
  near(x(), before);
  view.advance(95); near(x(), 114);
});

test('pause, new matches, teleports and body replacement display exact authority immediately', async () => {
  const { view, remote, packet, head, x } = await setup();
  head[0] = 105; remote.update(packet); view.update({ active: false, key: 'match-1' }, 40);
  view.advance(500); near(x(), 105);
  head[0] = 120; remote.update(packet); view.update({ active: true, key: 'match-2' }, 600); near(x(), 120);
  head[0] = 500; remote.update(packet); view.update({ active: true, key: 'match-2' }, 620); near(x(), 500);
  head[0] = 510; head[8] = 30; packet.players[0][5] = 1.5;
  assert.equal(remote.update(packet), true); view.update({ active: true, key: 'match-2' }, 640); near(x(), 510);
});

test('finite but extreme velocities have bounded visual displacement', async () => {
  const { view, remote, packet, head, x } = await setup();
  head[2] = 1e10; remote.update(packet); view.update({ active: true, key: 'new' }, 0);
  view.advance(80); near(x(), 140);
});
