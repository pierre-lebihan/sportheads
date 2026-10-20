import test from 'node:test';
import assert from 'node:assert/strict';
import { createFramePacer } from '../web/frame-pacing.js';

function run(pacer, hz, frames, playing = true, start = 0) {
  let drawn = 0, time = start;
  for (let i = 0; i < frames; i++) {
    time += 1000 / hz;
    if (pacer.due(time)) { pacer.drawn(time, playing); drawn++; }
  }
  return { drawn, time };
}

test('60 Hz screens draw every frame and 120 Hz screens every other one', () => {
  assert.equal(run(createFramePacer(), 60, 120).drawn, 120);
  assert.equal(run(createFramePacer(), 120, 240).drawn, 120);
  assert.equal(run(createFramePacer(), 144, 288).drawn, 144);
});

test('a device below 45 fps during play switches to a steady 30 fps', () => {
  const pacer = createFramePacer();
  const { time } = run(pacer, 38, 120);
  assert.equal(pacer.saver, true);
  assert.equal(run(pacer, 60, 120, true, time).drawn, 60);
});

test('slow frames in menus or a short hitch do not enable the saver', () => {
  const pacer = createFramePacer();
  let { time } = run(pacer, 20, 200, false);
  ({ time } = run(pacer, 60, 60, true, time));
  ({ time } = run(pacer, 20, 10, true, time));
  run(pacer, 60, 60, true, time);
  assert.equal(pacer.saver, false);
});
