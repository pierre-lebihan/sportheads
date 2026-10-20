// Battery and heat: 90-144 Hz screens draw about 60 frames per second, which
// the 30 Hz simulation and tick blending already fill. A device that cannot
// hold 45 fps during play switches to a steady 30 for the rest of the session:
// even frames look smoother than an irregular 35-40 and cost half the drawing.
export function createFramePacer({ size = 90 } = {}) {
  const FULL = 1000 / 60, SAVER = 1000 / 30, SLOW = 1000 / 45;
  let last = null, saver = false;
  const gaps = [];
  return Object.freeze({
    // A quarter of slack keeps 60 Hz screens on every frame and 120 Hz on every other one.
    due(time) { return last === null || time - last >= (saver ? SAVER : FULL) * .75; },
    drawn(time, playing) {
      if (last !== null && playing) {
        gaps.push(time - last);
        if (gaps.length > size) gaps.shift();
        if (!saver && gaps.length === size && gaps.slice().sort((a, b) => a - b)[size >> 1] > SLOW) saver = true;
      } else if (!playing) gaps.length = 0;
      last = time;
    },
    get saver() { return saver; },
  });
}
