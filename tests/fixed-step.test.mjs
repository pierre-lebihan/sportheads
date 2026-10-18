import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedStepper } from '../web/fixed-step.js';
import { TICK_MS } from '../web/engine-contract.js';

test('a slow frame retains the same fixed ticks without a long catch-up burst or dropped debt', () => {
  const clock = createFixedStepper(), inputs = [];
  clock.advance(100, true, () => inputs.push(inputs.length));
  assert.equal(clock.advance(350, true, () => inputs.push(inputs.length)), 2);
  assert.ok(clock.debtMs > 180);
  for (let i = 0; i < 10; i++) assert.ok(clock.advance(350, true, () => inputs.push(inputs.length)) <= 2);
  assert.equal(inputs.length, Math.floor(250 / TICK_MS));
  assert.deepEqual(inputs, Array.from({ length: 7 }, (_, i) => i));
  assert.ok(clock.debtMs < TICK_MS);
});
test('pause and resume clear time debt and never simulate time spent outside the page', () => {
  const clock = createFixedStepper(); let ticks = 0;
  clock.advance(100, true, () => ticks++); clock.advance(350, true, () => ticks++);
  clock.reset(); clock.advance(10_000, false, () => ticks++);
  clock.reset(); clock.advance(20_000, true, () => ticks++);
  assert.equal(ticks, 2);
  clock.advance(20_034, true, () => ticks++); assert.equal(ticks, 3);
});
