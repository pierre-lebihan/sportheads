export const TOUCH_LAYOUTS = ['thumbs', 'three-fingers'];
const KEY = 'sportheads-touch-layout-v1';
export function readTouchLayout() {
  try { const value = localStorage.getItem(KEY); if (TOUCH_LAYOUTS.includes(value)) return value; } catch { /* Storage can be disabled. */ }
  return 'thumbs';
}
export function saveTouchLayout(value) {
  if (!TOUCH_LAYOUTS.includes(value)) return;
  try { localStorage.setItem(KEY, value); } catch { /* The layout still works for this page. */ }
}

// A fixed-center stick keeps its angle outside the base; only releasing the
// finger ends the gesture. The visual handle is clamped to the circular base.
export function joystickVector(rect, clientX, clientY) {
  const radius = Math.min(rect.width, rect.height) / 2;
  if (!(radius > 0)) return { x: 0, y: 0, distance: 0 };
  const x = (clientX - rect.left - rect.width / 2) / radius;
  const y = (clientY - rect.top - rect.height / 2) / radius;
  if (![x, y].every(Number.isFinite)) return { x: 0, y: 0, distance: 0 };
  const distance = Math.hypot(x, y), divisor = Math.max(1, distance);
  return { x: x / divisor, y: y / divisor, distance };
}

export function movementMask(layout, rect, clientX, clientY, previous = 0) {
  if (!rect.width || !rect.height) return 0;
  if (layout === 'thumbs') {
    const { x, y, distance } = joystickVector(rect, clientX, clientY);
    if (distance < (previous ? .18 : .24)) return 0;
    const length = Math.hypot(x, y), horizontal = x / length, upwards = -y / length;
    // Broad horizontal sectors; the narrow top sector jumps on the spot.
    const direction = horizontal < -.3826834324 ? 1 : horizontal > .3826834324 ? 2 : 0;
    const jump = upwards >= ((previous & 4) ? .4 : .55);
    return direction | (jump ? 4 : 0);
  }
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  if (![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const gap = 1 / rect.width;
  const direction = x < .5 - gap ? 1 : x > .5 + gap ? 2 : 0;
  return direction;
}

// Leaving the jump sector sideways is not enough to rearm it. A new upward
// gesture must start from the neutral center or the bottom half of the stick.
export function joystickGesture(rect, clientX, clientY, previous = { armed: true, mask: 0 }) {
  const vector = joystickVector(rect, clientX, clientY);
  const mask = movementMask('thumbs', rect, clientX, clientY, previous.mask);
  const reset = vector.distance < .24 || vector.y >= 0;
  const jump = !reset && previous.armed && !!(mask & 4);
  return { vector, mask, jump, armed: reset || (previous.armed && !jump) };
}
