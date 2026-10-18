import { createPlannerRuntime } from './planner-runtime.js';

let runtime;
// Serializing initialization and every command is essential: a plan must see
// the same tick as its request, even when commands arrive during WASM startup.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    if (data.type === 'init') { runtime = await createPlannerRuntime(data.module); self.postMessage({ type: 'ready' }); }
    else if (data.type === 'command') runtime.command(data.name, data.args);
    else if (data.type === 'plan') self.postMessage({ type: 'plan', id: data.id, epoch: data.epoch, ...runtime.plan(data) });
    else if (data.type === 'inspect') self.postMessage({ type: 'inspect', id: data.id, state: runtime.inspect() });
    else throw Error('Unknown planner message');
  }).catch(error => { self.postMessage({ type: 'failure', message: error.message }); });
};
