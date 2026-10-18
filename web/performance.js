// Bounded samples, measured in the actual browser (also usable on a phone).
export function createPerformanceMonitor(now = () => performance.now()) {
  const buckets = new Map();
  let previousFrame = null;
  function record(name, ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    if (!buckets.has(name)) buckets.set(name, []);
    const samples = buckets.get(name); samples.push(ms);
    if (samples.length > 600) samples.shift();
  }
  return Object.freeze({
    record,
    frame(time) { if (previousFrame !== null) record('frameGap', time - previousFrame); previousFrame = time; },
    measure(name, action) { const start = now(); try { return action(); } finally { record(name, now() - start); } },
    reset() { buckets.clear(); previousFrame = null; },
    report() {
      return Object.fromEntries([...buckets].map(([name, samples]) => {
        const sorted = samples.slice().sort((a, b) => a - b), sum = samples.reduce((a, b) => a + b, 0);
        return [name, { samples: sorted.length, meanMs: sum / sorted.length,
          p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1) }];
      }));
    },
  });
}
