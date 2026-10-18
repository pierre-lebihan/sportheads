import { TICK_MS } from './engine-contract.js';

// Scheduling only: the exact same game_tick(mask) is called at 30 Hz. Retain
// debt rather than dropping ticks or changing the solver's 3 x 1/96 s substeps.
// A stalled display no longer executes eight physics/AI ticks in a single frame.
export function createFixedStepper(maxSteps = 2) {
  let last = 0, debt = 0;
  return Object.freeze({
    reset() { last = 0; debt = 0; },
    advance(time, running, step) {
      const elapsed = last ? Math.min(Math.max(0, time - last), 250) : 0; last = time;
      if (!running) return 0;
      debt += elapsed;
      let steps = 0;
      while (debt >= TICK_MS && steps < maxSteps) { step(); debt -= TICK_MS; steps++; }
      return steps;
    },
    get debtMs() { return debt; },
  });
}
