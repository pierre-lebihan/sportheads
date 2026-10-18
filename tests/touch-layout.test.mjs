import test from 'node:test';
import assert from 'node:assert/strict';
import { movementMask, readTouchLayout, saveTouchLayout } from '../web/touch-layout.js';
const rect = { left: 10, top: 20, width: 150, height: 100 };
const at = (layout, x, y, previous) => movementMask(layout, rect, rect.left + x * rect.width, rect.top + y * rect.height, previous);

test('one thumb can move, add jump, reverse, stop moving and release jump independently', () => {
  assert.equal(at('thumbs', .1, .8), 1);
  assert.equal(at('thumbs', .1, .2, 1), 5);
  assert.equal(at('thumbs', .9, .2, 5), 6);
  assert.equal(at('thumbs', .5, .2, 6), 4);
  assert.equal(at('thumbs', .5, .8, 4), 0);
  assert.equal(at('thumbs', .9, .8), 2);
});
test('jump activation has a deliberate threshold and does not flicker near its border', () => {
  assert.equal(at('thumbs', .1, .45, 1), 1);
  assert.equal(at('thumbs', .1, .35, 1), 5);
  assert.equal(at('thumbs', .1, .45, 5), 5);
  assert.equal(at('thumbs', .1, .57, 5), 5);
  assert.equal(at('thumbs', .1, .6, 5), 1);
});
test('three-finger movement never adds jump; leaving the pad releases movement', () => {
  for (const y of [.1, .5, .9]) {
    assert.equal(at('three-fingers', .1, y, 5), 1);
    assert.equal(at('three-fingers', .9, y, 6), 2);
  }
  assert.equal(at('three-fingers', .4, .5), 1, 'the full left button is usable');
  assert.equal(at('three-fingers', .6, .5), 2, 'the full right button is usable');
  assert.equal(at('three-fingers', .5, .5), 0, 'the gap between buttons is neutral');
  for (const [x, y] of [[-.01, .5], [1.01, .5], [.5, -.01], [.5, 1.01], [NaN, .2]]) assert.equal(at('thumbs', x, y, 5), 0);
  assert.equal(movementMask('thumbs', { ...rect, width: 0 }, 20, 30), 0);
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
