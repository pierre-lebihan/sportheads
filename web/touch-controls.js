import { TOUCH_LAYOUTS, movementMask, joystickVector, joystickGesture, readTouchLayout, saveTouchLayout } from './touch-layout.js';

// Native contact snapshots repair missed releases. Every finger owns its own
// action; sliding changes only the movement contact, never the kick/index.
export function createTouchControls(root, onChange, measure = (_name, action) => action()) {
  const listen = (target, name, handler, options) => target.addEventListener(name,
    event => measure('touchInput', () => handler(event)), options);
  const pointers = new Map(), touches = new Map(), buttons = [...root.querySelectorAll('[data-action]')];
  let mode = 'local', side = 0, enabled = false, touchEvents = 'ontouchstart' in window, layout = readTouchLayout();
  let pendingJumps = 0, jumpSequence = 0;
  root.dataset.layout = layout;
  const contacts = () => [...touches.values(), ...pointers.values()];
  function masks(kind) {
    const result = [0, 0];
    for (const contact of contacts()) result[contact.side] |= kind === 'legacy' && contact.gesture ? contact.gesture.mask : contact.action;
    if (kind === 'pulse') { result[0] |= pendingJumps & 4; result[1] |= (pendingJumps >> 4) & 4; }
    return result;
  }
  function paint(notify = true) {
    const held = contacts();
    for (const button of buttons) {
      const index = +button.closest('[data-side]').dataset.side, action = +button.dataset.action;
      const pressed = (layout === 'three-fingers' || !button.closest('[data-movement]'))
        && held.some(contact => contact.side === index && contact.action === action);
      button.classList.toggle('pressed', pressed); button.setAttribute('aria-pressed', String(pressed));
    }
    for (const stick of root.querySelectorAll('[data-joystick]')) {
      const index = +stick.closest('[data-side]').dataset.side;
      const contact = held.find(contact => contact.side === index && contact.movement);
      const travel = Math.max(0, stick.clientWidth / 2 - 29);
      stick.style.setProperty('--stick-x', `${(contact?.vector?.x || 0) * travel}px`);
      stick.style.setProperty('--stick-y', `${(contact?.vector?.y || 0) * travel}px`);
      stick.dataset.mask = String((contact?.action || 0) | (contact ? (pendingJumps >> (index * 4)) & 4 : 0));
      stick.classList.toggle('pressed', layout === 'thumbs' && !!contact);
      stick.setAttribute('aria-pressed', String(layout === 'thumbs' && !!contact));
    }
    if (notify) onChange();
  }
  function updateMovement(contact, x, y) {
    const rect = contact.movement.getBoundingClientRect();
    if (layout === 'thumbs') {
      contact.gesture = joystickGesture(rect, x, y, contact.gesture);
      contact.vector = contact.gesture.vector; contact.action = contact.gesture.mask & ~4;
      if (contact.gesture.jump) { pendingJumps |= 4 << (contact.side * 4); jumpSequence++; }
    } else {
      contact.action = movementMask(layout, rect, x, y, contact.action);
      contact.vector = joystickVector(rect, x, y);
    }
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
    if (movement) {
      const contact = { button: movement, movement, side: +pad.dataset.side, action: 0 };
      updateMovement(contact, x, y); return contact;
    }
  }
  function move(contact, x, y) {
    if (!contact.movement) return false;
    const action = contact.action, vector = contact.vector, sequence = jumpSequence;
    updateMovement(contact, x, y);
    return action !== contact.action || sequence !== jumpSequence || (layout === 'thumbs' && (vector.x !== contact.vector.x || vector.y !== contact.vector.y));
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
    if (!pointers.size && !touches.size && !pendingJumps) return;
    pendingJumps = 0;
    touches.clear(); for (const id of pointers.keys()) removePointer(id); paint();
  }
  listen(root, 'touchstart', event => {
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
    listen(window, type, reconcileTouches, { capture: true, passive: type !== 'touchmove' });
  }
  listen(root, 'pointerdown', event => {
    if (event.pointerType === 'touch' && touchEvents) return;
    if (event.button !== 0) return;
    const contact = createContact(event.target, event.clientX, event.clientY);
    if (!contact) return;
    event.preventDefault();
    try { contact.button.setPointerCapture(event.pointerId); } catch { /* Global release also clears the contact. */ }
    pointers.set(event.pointerId, { ...contact, type: event.pointerType }); paint();
  });
  listen(window, 'pointerdown', event => {
    if (!event.isPrimary) return;
    let changed = false;
    for (const [id, contact] of pointers) if (contact.type === event.pointerType) changed = removePointer(id) || changed;
    if (changed) paint();
  }, true);
  listen(window, 'pointermove', event => {
    if (event.buttons === 0) { release(event); return; }
    const contact = pointers.get(event.pointerId);
    if (contact && move(contact, event.clientX, event.clientY)) paint();
  }, true);
  listen(root, 'contextmenu', event => event.preventDefault());
  listen(root, 'lostpointercapture', release);
  listen(window, 'pointerup', release, true); listen(window, 'pointercancel', release, true);
  listen(window, 'blur', clear); listen(window, 'pagehide', clear); listen(window, 'orientationchange', clear);
  listen(window, 'resize', clear);
  listen(document, 'visibilitychange', () => { if (document.hidden) clear(); });
  return {
    get layout() { return layout; },
    setLayout(value) {
      if (!TOUCH_LAYOUTS.includes(value) || value === layout) return;
      clear(); layout = value; root.dataset.layout = layout; saveTouchLayout(layout);
    },
    mask(kind = 'pulse') { const [blue, red] = masks(kind); return mode === 'local' ? blue | (red << 4) : side === 0 ? blue : red; },
    get jumpSequence() { return jumpSequence; },
    consumeJumps() { if (pendingJumps) { pendingJumps = 0; paint(false); } },
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
