import { MATCH, ENGINE_COMMANDS } from './engine-contract.js';

export function createPlannerService(exports, module, monitor, makeWorker = () => new Worker(new URL('./planner-worker.js', import.meta.url), { type: 'module' })) {
  let worker, epoch = 0, sequence = 0, pending = null, pendingTick = 0, latest = null, tick = 0;
  let status = 'inactive', error = null, plans = 0, accepted = 0, expired = 0;
  const inspections = new Map();
  function stop(reason = null) {
    worker?.terminate(); worker = null; pending = null; latest = null; epoch++;
    status = reason ? 'unavailable' : 'inactive'; error = reason;
    if (!reason) plans = accepted = expired = 0;
    for (const { reject, timer } of inspections.values()) { clearTimeout(timer); reject(Error(reason || 'Planner stopped')); }
    inspections.clear();
  }
  function post(message) {
    if (!worker) return;
    try { worker.postMessage(message); } catch (failure) { stop(failure.message); }
  }
  const engine = Object.freeze({ ...exports, ...Object.fromEntries(ENGINE_COMMANDS.map(name => [name, (...args) => {
    const value = exports[name](...args);
    if (name !== 'game_tick' && name !== 'game_set_skin') { epoch++; latest = null; pending = null; }
    tick = exports.game_value(MATCH.tick);
    post({ type: 'command', name, args });
    return value;
  }])) });
  return Object.freeze({
    engine,
    start() {
      stop(); plans = accepted = expired = 0; error = null;
      try {
        worker = makeWorker(); status = 'starting';
        const candidate = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== candidate) return;
          if (data.type === 'ready') status = 'ready';
          else if (data.type === 'failure') stop(data.message);
          else if (data.type === 'plan') {
            monitor.record('aiWorker', data.ms); plans++;
            if (data.id === pending) pending = null;
            if (data.epoch === epoch && Number.isInteger(data.mask) && data.mask >= 0 && data.mask <= 15) latest = data;
          } else if (data.type === 'inspect' && inspections.has(data.id)) {
            const request = inspections.get(data.id); inspections.delete(data.id); clearTimeout(request.timer); request.resolve(data.state);
          }
        };
        worker.onerror = event => { event.preventDefault(); if (worker === candidate) stop(event.message || 'Planner worker failed'); };
        worker.onmessageerror = () => { if (worker === candidate) stop('Planner message could not be decoded'); };
        post({ type: 'init', module });
      } catch (failure) { stop(failure.message); }
    },
    stop,
    request(parameters) {
      if (pending !== null && tick - pendingTick > 60) stop('Planner is more than two seconds behind');
      if (!worker || pending !== null) return;
      pending = ++sequence; pendingTick = tick; post({ type: 'plan', ...parameters, id: pending, epoch });
    },
    take(currentTick) {
      if (!latest) return null;
      const result = latest; latest = null;
      if (result.epoch !== epoch || currentTick < result.tick || currentTick - result.tick > 4) { expired++; return null; }
      accepted++; return result.mask;
    },
    inspect() {
      if (!worker) return Promise.reject(Error('Planner is not active'));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { inspections.delete(id); reject(Error('Planner inspection timed out')); }, 5000);
        inspections.set(id, { resolve, reject, timer }); post({ type: 'inspect', id });
      });
    },
    stats() { return { status, error, plans, accepted, expired, pending: pending !== null, authoritativeTick: tick }; },
  });
}
