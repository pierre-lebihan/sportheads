import { TOUCH_LAYOUTS, movementMask, readTouchLayout, saveTouchLayout } from './touch-layout.js';

// Native contact snapshots repair missed releases. Every finger owns its own
// action; sliding changes only the movement contact, never the kick/index.
export function createTouchControls(root, onChange) {
  const pointers = new Map(), touches = new Map(), buttons = [...root.querySelectorAll('[data-action]')];
  let mode = 'local', side = 0, enabled = false, touchEvents = 'ontouchstart' in window, layout = readTouchLayout();
  root.dataset.layout = layout;
  const contacts = () => [...touches.values(), ...pointers.values()];
  function masks() {
    const result = [0, 0];
    for (const contact of contacts()) result[contact.side] |= contact.action;
    return result;
  }
  function paint() {
    const held = contacts();
    for (const button of buttons) {
      const index = +button.closest('[data-side]').dataset.side, action = +button.dataset.action;
      const pressed = held.some(contact => contact.side === index && contact.action === action);
      button.classList.toggle('pressed', pressed); button.setAttribute('aria-pressed', String(pressed));
    }
    onChange();
  }
  function createContact(target, x, y) {
    if (!enabled) return;
    const pad = target.closest?.('[data-side]'), button = target.closest?.('[data-action]');
    if (!pad || !root.contains(pad) || pad.hidden || button?.disabled) return;
    const movement = target.closest('[data-movement]');
    // In the three-finger layout the same Jump button is placed above the pad.
    if (button && (!movement || (layout === 'three-fingers' && +button.dataset.action === 4))) {
      return { button, side: +pad.dataset.side, action: +button.dataset.action };
    }
    if (movement) return { button: movement, movement, side: +pad.dataset.side,
      action: movementMask(layout, movement.getBoundingClientRect(), x, y) };
  }
  function move(contact, x, y) {
    if (!contact.movement) return false;
    const action = movementMask(layout, contact.movement.getBoundingClientRect(), x, y, contact.action);
    if (action === contact.action) return false;
    contact.action = action; return true;
  }
  function removePointer(id) {
    const contact = pointers.get(id);
    if (!contact) return false;
    pointers.delete(id);
    try { if (contact.button.hasPointerCapture(id)) contact.button.releasePointerCapture(id); } catch { /* Browser already released it. */ }
    return true;
  }
  function release(event) { if (removePointer(event.pointerId)) paint(); }
  function reconcileTouches(event) {
    const active = new Map(Array.from(event.touches, touch => [touch.identifier, touch]));
    let changed = false;
    for (const [id, contact] of touches) {
      const touch = active.get(id);
      if (!touch) { touches.delete(id); changed = true; }
      else changed = move(contact, touch.clientX, touch.clientY) || changed;
    }
    if (changed) paint();
    if (event.type === 'touchmove' && touches.size && event.cancelable) event.preventDefault();
  }
  function clear() {
    if (!pointers.size && !touches.size) return;
    touches.clear(); for (const id of pointers.keys()) removePointer(id); paint();
  }
  root.addEventListener('touchstart', event => {
    touchEvents = true;
    let changed = false;
    for (const [id, contact] of pointers) if (contact.type === 'touch') changed = removePointer(id) || changed;
    for (const touch of event.changedTouches) {
      const contact = createContact(touch.target, touch.clientX, touch.clientY);
      if (!contact) continue;
      touches.set(touch.identifier, contact); changed = true;
    }
    if (changed) { event.preventDefault(); paint(); }
  }, { passive: false });
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    window.addEventListener(type, reconcileTouches, { capture: true, passive: type !== 'touchmove' });
  }
  root.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && touchEvents) return;
    if (event.button !== 0) return;
    const contact = createContact(event.target, event.clientX, event.clientY);
    if (!contact) return;
    event.preventDefault();
    try { contact.button.setPointerCapture(event.pointerId); } catch { /* Global release also clears the contact. */ }
    pointers.set(event.pointerId, { ...contact, type: event.pointerType }); paint();
  });
  window.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    let changed = false;
    for (const [id, contact] of pointers) if (contact.type === event.pointerType) changed = removePointer(id) || changed;
    if (changed) paint();
  }, true);
  window.addEventListener('pointermove', event => {
    if (event.buttons === 0) { release(event); return; }
    const contact = pointers.get(event.pointerId);
    if (contact && move(contact, event.clientX, event.clientY)) paint();
  }, true);
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release, true); window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', clear); window.addEventListener('pagehide', clear); window.addEventListener('orientationchange', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return {
    get layout() { return layout; },
    setLayout(value) {
      if (!TOUCH_LAYOUTS.includes(value) || value === layout) return;
      clear(); layout = value; root.dataset.layout = layout; saveTouchLayout(layout);
    },
    mask() { const [blue, red] = masks(); return mode === 'local' ? blue | (red << 4) : side === 0 ? blue : red; },
    clear,
    update(state) {
      if (mode !== state.mode || side !== state.side || !state.enabled) clear();
      mode = state.mode; side = state.side; enabled = state.enabled; root.dataset.mode = mode;
      for (const pad of root.querySelectorAll('[data-side]')) {
        const index = +pad.dataset.side; pad.hidden = mode !== 'local' && index !== side;
        pad.querySelector('.touch-name').textContent = state.names[index];
        for (const button of pad.querySelectorAll('button')) button.disabled = !enabled || pad.hidden;
      }
    },
  };
}
