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

// Sliding upwards adds jump without changing horizontal direction. Separate
// activation/release thresholds prevent flicker around the jump-zone border.
export function movementMask(layout, rect, clientX, clientY, previous = 0) {
  if (!rect.width || !rect.height) return 0;
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  if (![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const gap = layout === 'three-fingers' ? 1 / rect.width : .16;
  const direction = x < .5 - gap ? 1 : x > .5 + gap ? 2 : 0;
  const jump = layout === 'thumbs' && (y < .4 || ((previous & 4) !== 0 && y < .58));
  return direction | (jump ? 4 : 0);
}
