// Bounded, numeric summaries of foreground online play. No replay, input log,
// room code, address or raw browser error leaves this module. One event per
// 15 seconds of play, plus a final partial window on pause/exit/disconnection.
const LIMIT = 1024;
const METRICS = new Set(['render', 'ui', 'physics', 'networkReceive', 'stateGap', 'stateJitter', 'stateAge', 'correction', 'inputAck', 'rtt', 'longTask', 'simulationDebt']);
const COUNTERS = new Set(['stateSkips', 'sendDrops']);
const snake = name => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const rounded = value => Math.round(value * 100) / 100;

export function createMatchQuality({ track, context = () => ({}), now = () => performance.now(), visible = () => true,
  makeId = () => crypto.randomUUID(), intervalMs = 15000 } = {}) {
  let current = null, active = false, since = 0, previousFrame = null, previousState = null, lastReport = null;
  let metrics = new Map(), counters = {}, slowFrames = 0;
  function sample(name, value) {
    if (!Number.isFinite(value) || value < 0) return;
    let bucket = metrics.get(name);
    if (!bucket) { bucket = { values: [], count: 0, sum: 0, max: 0 }; metrics.set(name, bucket); }
    bucket.values[bucket.count % LIMIT] = value; bucket.count++; bucket.sum += value; bucket.max = Math.max(bucket.max, value);
  }
  function flush(reason = 'interval') {
    const frames = metrics.get('frameGap');
    if (!current || !frames?.count || frames.sum <= 0) return;
    const properties = { quality_version: 1, ...current.details, ...context(), match_token: current.token,
      reason, window_s: rounded((now() - since) / 1000), frames: frames.count,
      fps: rounded(1000 / (frames.sum / frames.count)), slow_frame_pct: rounded(slowFrames * 100 / frames.count) };
    for (const [name, bucket] of metrics) {
      const values = bucket.values.slice().sort((a, b) => a - b), key = snake(name), unit = name === 'correction' ? 'px' : 'ms';
      properties[key + '_samples'] = bucket.count;
      properties[key + '_mean_' + unit] = rounded(bucket.sum / bucket.count);
      properties[key + '_p95_' + unit] = rounded(values[Math.min(values.length - 1, Math.floor(values.length * .95))]);
      properties[key + '_max_' + unit] = rounded(bucket.max);
    }
    for (const name of COUNTERS) properties[snake(name)] = counters[name] || 0;
    lastReport = properties;
    // Collection must never interrupt the match, including when blocked/offline.
    try { track?.('online_quality', properties); } catch { /* Best effort only. */ }
    metrics = new Map(); counters = {}; slowFrames = 0; since = now();
  }
  function stop(reason) {
    flush(reason); active = false; previousFrame = previousState = null;
    metrics = new Map(); counters = {}; slowFrames = 0;
  }
  return Object.freeze({
    observe(state) {
      const id = state.mode === 'online' && state.started ? `${state.role}:${state.matchId}` : null;
      if (current && current.id !== id) { stop('left'); current = null; }
      if (id && !current) current = { id, token: context().match_token || makeId(), details: { role: state.role, pitch: state.pitch, bonus_mode: state.bonusMode } };
      const playing = !!current && state.phase === 1 && !state.paused && state.connected && visible();
      if (active && !playing) stop(!state.connected ? 'disconnected' : state.phase === 3 ? 'finished' : 'paused');
      if (!active && playing) { since = now(); previousFrame = previousState = null; }
      active = playing;
    },
    frame(time = now()) {
      if (!active || !visible()) return;
      if (previousFrame !== null) { const gap = time - previousFrame; sample('frameGap', gap); if (gap > 50) slowFrames++; }
      previousFrame = time;
      if (now() - since >= intervalMs) flush();
    },
    record(name, value) { if (active && visible() && METRICS.has(name)) sample(name, value); },
    count(name, value = 1) { if (active && visible() && COUNTERS.has(name) && Number.isFinite(value) && value >= 0) counters[name] = (counters[name] || 0) + value; },
    state(sequence, tick, time = now()) {
      if (!active || !visible()) return;
      if (previousState && sequence > previousState.sequence && tick > previousState.tick) {
        const gap = time - previousState.time;
        sample('stateGap', gap); sample('stateJitter', Math.abs(gap - (tick - previousState.tick) * 1000 / 30));
        counters.stateSkips = (counters.stateSkips || 0) + sequence - previousState.sequence - 1;
      }
      previousState = { sequence, tick, time };
    },
    suspend: (reason = 'hidden') => stop(reason), flush,
    report: () => lastReport,
  });
}
