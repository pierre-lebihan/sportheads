import { MATCH, ENGINE_COMMANDS } from './engine-contract.js';
import { captureState } from './net-state.js';

// A private deterministic replica. It replays the real input/command stream;
// it never sends positions, velocities, collisions or scores back to the game.
export async function createPlannerRuntime(module) {
  const instance = await WebAssembly.instantiate(module), engine = instance.exports;
  return Object.freeze({
    command(name, args) {
      if (!ENGINE_COMMANDS.includes(name)) throw Error(`Invalid planner command: ${name}`);
      return engine[name](...args);
    },
    plan({ side, preferred, opponentInput, expert }) {
      const start = performance.now();
      const mask = engine.game_ai_plan(side, preferred, opponentInput, expert);
      return { mask, tick: engine.game_value(MATCH.tick), ms: performance.now() - start };
    },
    inspect() { return captureState(engine, [1, 2]); },
  });
}
