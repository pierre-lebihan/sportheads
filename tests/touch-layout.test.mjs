import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOATING_RADIUS, movementMask, joystickVector, joystickGesture, floatingStick, readTouchLayout, saveTouchLayout } from '../web/touch-layout.js';
const rect = { left: 10, top: 20, width: 136, height: 136 };
const at = (layout, x, y, previous) => movementMask(layout, rect, rect.left + x * rect.width, rect.top + y * rect.height, previous);
const angle = (degrees, previous = 0, radius = .8) => {
  const radians = degrees * Math.PI / 180;
  return at('thumbs', .5 + Math.cos(radians) * radius / 2, .5 - Math.sin(radians) * radius / 2, previous);
};
test('angular joystick covers left, right, jump, diagonals and neutral', () => {
  for (const [degrees, mask] of [[0, 2], [25, 2], [45, 6], [90, 4], [135, 5], [155, 1], [180, 1], [225, 1], [270, 0], [315, 2]]) assert.equal(angle(degrees), mask, `${degrees} degrees`);
  assert.equal(at('thumbs', .5, .5), 0);
});
test('dead zone and separate jump thresholds prevent accidental jumps and flicker', () => {
  assert.equal(angle(0, 0, .2), 0);
  assert.equal(angle(0, 2, .2), 2);
  assert.equal(angle(0, 2, .1), 0);
  assert.equal(angle(30), 2);
  assert.equal(angle(40), 6);
  assert.equal(angle(30, 6), 6);
  assert.equal(angle(20, 6), 2);
  assert.equal(at('thumbs', .5, .5, 6), 0);
});
test('stick keeps the angle outside the base and clamps its visible handle', () => {
  assert.equal(at('thumbs', 2, .5), 2);
  assert.equal(at('thumbs', -1, -1), 5);
  const vector = joystickVector(rect, 1000, -1000);
  assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-10);
  assert.ok(vector.distance > 1);
  assert.equal(at('thumbs', NaN, .2), 0);
  assert.equal(movementMask('thumbs', { ...rect, width: 0 }, 20, 30), 0);
});
test('three-finger movement uses full-height buttons and never adds jump', () => {
  for (const y of [.1, .5, .9]) {
    assert.equal(at('three-fingers', .1, y, 5), 1);
    assert.equal(at('three-fingers', .9, y, 6), 2);
  }
  assert.equal(at('three-fingers', .4, .5), 1);
  assert.equal(at('three-fingers', .6, .5), 2);
  assert.equal(at('three-fingers', .5, .5), 0);
  for (const [x, y] of [[-.01, .5], [1.01, .5], [.5, -.01], [.5, 1.01]]) assert.equal(at('three-fingers', x, y, 5), 0);
});
test('joystick jumps once and only rearms at the center or in the lower half', () => {
  let state;
  const move = (x, y) => state = joystickGesture(rect, rect.left + x * rect.width, rect.top + y * rect.height, state);
  assert.equal(move(.85, .2).jump, true);
  for (const [x, y] of [[.85,.2],[.15,.2],[.5,.1],[.85,.45],[.85,.2]]) {
    assert.equal(move(x, y).jump, false, 'holding, switching upper diagonals or skimming the upper edge cannot rearm');
  }
  assert.equal(move(.85,.5).armed, true, 'the horizontal center line rearms while retaining movement');
  assert.equal(move(.85,.2).jump, true);
  assert.equal(move(.5,.5).armed, true);
  assert.equal(move(.5,.2).jump, true);
  assert.equal(move(.5,.42).jump, false, 'returning into the dead zone must not itself trigger a jump');
  assert.equal(state.armed, true);
  assert.equal(move(.5,.2).jump, true);
  assert.equal(move(.15,.8).armed, true);
  assert.equal(move(.15,.2).jump, true);
  assert.equal(move(.15,.2).jump, false);
});
test('layout preferences reject invalid values and tolerate unavailable storage', t => {
  const stored = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); } } });
  assert.equal(readTouchLayout(), 'zones');
  saveTouchLayout('three-fingers'); assert.equal(readTouchLayout(), 'three-fingers');
  saveTouchLayout('invalid'); assert.equal(readTouchLayout(), 'three-fingers');
  stored.set('sportheads-touch-layout-v2', 'invalid'); assert.equal(readTouchLayout(), 'zones');
  stored.clear(); stored.set('sportheads-touch-layout-v1', 'three-fingers'); assert.equal(readTouchLayout(), 'three-fingers', 'an explicit three-finger choice survives the new default');
  stored.set('sportheads-touch-layout-v1', 'thumbs'); assert.equal(readTouchLayout(), 'zones', 'the old default moves to invisible zones');
  saveTouchLayout('thumbs'); assert.equal(readTouchLayout(), 'thumbs');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  assert.equal(readTouchLayout(), 'zones'); assert.doesNotThrow(() => saveTouchLayout('thumbs'));
});

test('floating stick starts under the thumb and follows it past the radius', () => {
  const origin = { x: 100, y: 200 };
  const near = floatingStick(origin, 125, 200);
  assert.deepEqual(near.center, origin);
  assert.equal(movementMask('thumbs', near.rect, 125, 200), 2);
  assert.equal(movementMask('thumbs', near.rect, 105, 200), 0, 'a small slip stays in the dead zone');
  const far = floatingStick(origin, 400, 200);
  assert.deepEqual(far.center, { x: 400 - FLOATING_RADIUS / 2, y: 200 });
  const back = floatingStick(far.center, 355, 200);
  assert.equal(movementMask('thumbs', back.rect, 355, 200), 1, 'turning back takes a 45 px slide');
  assert.ok(joystickGesture(near.rect, 100, 140).jump, 'flicking up jumps');
});
