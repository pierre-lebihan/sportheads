import test from 'node:test';
import assert from 'node:assert/strict';
import { movementMask, joystickVector, readTouchLayout, saveTouchLayout } from '../web/touch-layout.js';
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
test('layout preferences reject invalid values and tolerate unavailable storage', t => {
  let stored;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
  assert.equal(readTouchLayout(), 'thumbs');
  saveTouchLayout('three-fingers'); assert.equal(readTouchLayout(), 'three-fingers');
  saveTouchLayout('invalid'); assert.equal(readTouchLayout(), 'three-fingers');
  stored = 'invalid'; assert.equal(readTouchLayout(), 'thumbs');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  assert.equal(readTouchLayout(), 'thumbs'); assert.doesNotThrow(() => saveTouchLayout('thumbs'));
});
