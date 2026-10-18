// Native touch snapshots remove stale fingers even when a pointer release is lost.
// Mouse/pen keep pointer capture; keyboard ownership stays in the game controller.
export function createTouchControls(root, onChange) {
  const pointers = new Map(), touches = new Map(), buttons = [...root.querySelectorAll('[data-action]')];
  let mode = 'local', side = 0, enabled = false, touchEvents = 'ontouchstart' in window;
  const heldButtons = () => [...touches.values(), ...[...pointers.values()].map(pointer => pointer.button)];
  function paint() {
    const held = new Set(heldButtons());
    for (const button of buttons) {
      const pressed = held.has(button);
      button.classList.toggle('pressed', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
    onChange();
  }
  function removePointer(id) {
    const pointer = pointers.get(id);
    if (!pointer) return false;
    pointers.delete(id);
    try { if (pointer.button.hasPointerCapture(id)) pointer.button.releasePointerCapture(id); } catch { /* The browser may already have discarded this pointer. */ }
    return true;
  }
  function release(event) { if (removePointer(event.pointerId)) paint(); }
  function reconcileTouches(event) {
    // Touch.identifier and PointerEvent.pointerId are separate identifiers.
    // touches is the complete set still on screen, not just changedTouches.
    const active = new Set(Array.from(event.touches, touch => touch.identifier));
    let changed = false;
    for (const id of touches.keys()) if (!active.has(id)) { touches.delete(id); changed = true; }
    if (changed) paint();
  }
  function clear() {
    if (!pointers.size && !touches.size) return;
    touches.clear();
    for (const id of pointers.keys()) removePointer(id);
    paint();
  }
  root.addEventListener('touchstart', event => {
    // Prefer the touch lifecycle wherever it is emitted, including hybrid devices.
    touchEvents = true;
    let changed = false;
    for (const [id, pointer] of pointers) if (pointer.type === 'touch') changed = removePointer(id) || changed;
    for (const touch of event.changedTouches) {
      const button = touch.target.closest?.('[data-action]');
      if (!enabled || !button || !root.contains(button) || button.disabled) continue;
      touches.set(touch.identifier, button); changed = true;
    }
    if (changed) { event.preventDefault(); paint(); }
  }, { passive: false });
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    window.addEventListener(type, reconcileTouches, { capture: true, passive: true });
  }
  root.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && touchEvents) return;
    const button = event.target.closest('[data-action]');
    if (!enabled || !button || !root.contains(button) || button.disabled || event.button !== 0) return;
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch { /* Global release listeners remain available. */ }
    pointers.set(event.pointerId, { button, type: event.pointerType }); paint();
  });
  window.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    let changed = false;
    for (const [id, pointer] of pointers) if (pointer.type === event.pointerType) changed = removePointer(id) || changed;
    if (changed) paint();
  }, true);
  window.addEventListener('pointermove', event => { if (event.buttons === 0) release(event); }, true);
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', clear);
  window.addEventListener('pagehide', clear);
  window.addEventListener('orientationchange', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return {
    mask() {
      let mask = 0;
      for (const button of heldButtons()) mask |= +button.dataset.action << (+button.closest('[data-side]').dataset.side * 4);
      return mode === 'local' ? mask : (mask >> (side * 4)) & 15;
    },
    clear,
    update(state) {
      if (mode !== state.mode || side !== state.side || !state.enabled) clear();
      mode = state.mode; side = state.side; enabled = state.enabled;
      root.dataset.mode = mode;
      for (const pad of root.querySelectorAll('[data-side]')) {
        const index = +pad.dataset.side;
        pad.hidden = mode !== 'local' && index !== side;
        pad.querySelector('.touch-name').textContent = state.names[index];
        for (const button of pad.querySelectorAll('button')) button.disabled = !enabled || pad.hidden;
      }
    },
  };
}
