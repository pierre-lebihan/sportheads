// Keep a 60 Hz deadline rather than rounding each gap to a display frame.
// Carry the remainder on 90/144 Hz and variable-refresh screens. After sustained
// slow rendering, lower both drawing frequency and backing-store resolution.
export function createFramePacer({ size = 90 } = {}) {
  const FULL = 1000 / 60, SAVER = 1000 / 30, SLOW = 1000 / 45;
  let last = null, next = null, saver = false;
  const gaps = [];
  return Object.freeze({
    due(time) { return next === null || time >= next - .5; },
    drawn(time, playing) {
      if (last !== null && playing) {
        gaps.push(time - last);
        if (gaps.length > size) gaps.shift();
        // The mean avoids mistaking the alternating 11/22 ms gaps on a 90 Hz
        // display for a slow device. A small tolerance avoids rounding at 45 Hz.
        if (!saver && gaps.length === size && gaps.reduce((sum, gap) => sum + gap, 0) / size > SLOW + .1) {
          saver = true; next = null;
        }
      } else if (!playing) gaps.length = 0;
      last = time;
      const interval = saver ? SAVER : FULL;
      next = next === null ? time + interval : next + (Math.floor(Math.max(0, time - next) / interval) + 1) * interval;
    },
    get saver() { return saver; },
  });
}
