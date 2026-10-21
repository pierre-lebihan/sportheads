import { TOUCH_LAYOUTS, FLOATING_RADIUS, movementMask, joystickVector, joystickGesture, floatingStick, readTouchLayout, saveTouchLayout } from './touch-layout.js';

// Native contact snapshots repair missed releases. Every finger owns its own
// action; sliding changes only the movement contact, never the kick/index.
export function createTouchControls(root, onChange, measure = (_name, action) => action()) {
  const listen = (target, name, handler, options) => target.addEventListener(name,
    event => measure('touchInput', () => handler(event)), options);
  const pointers = new Map(), touches = new Map(), buttons = [...root.querySelectorAll('[data-action]')];
  let mode = 'local', side = 0, enabled = false, touchEvents = 'ontouchstart' in window, layout = readTouchLayout();
  let pendingJumps = 0, jumpSequence = 0, hintTimer = 0;
  // The zone hints sit above the field but never catch a touch, so the match
  // tools stay usable while they show.
  const hints = root.parentElement.querySelector('.zone-hints');
  // Transparent controls are drawn in a layer above the field that ignores
  // touches; the zones underneath receive them.
  const ghosts = root.parentElement.querySelector('.zone-ghosts');
  const showHints = shown => { root.classList.toggle('zones-hint', shown); hints?.classList.toggle('shown', shown); };
  root.dataset.layout = layout;
  const contacts = () => [...touches.values(), ...pointers.values()];
  function masks(kind) {
    const result = [0, 0];
    for (const contact of contacts()) result[contact.side] |= kind === 'legacy' ? (contact.gesture?.mask ?? (contact.pulse ? 4 : contact.action)) : contact.action;
    if (kind === 'pulse') { result[0] |= pendingJumps & 4; result[1] |= (pendingJumps >> 4) & 4; }
    return result;
  }
  function paint(notify = true) {
    const held = contacts(), sticks = [...root.querySelectorAll('[data-joystick]')];
    // Read the layout before writing classes and styles, once per paint.
    const travels = sticks.map(stick => Math.max(0, stick.clientWidth / 2 - 29));
    const zones = [...root.querySelectorAll('[data-zone-move]')], zoneRects = zones.map(zone => zone.getBoundingClientRect());
    for (const button of buttons) {
      const index = +button.closest('[data-side]').dataset.side, action = +button.dataset.action;
      const pressed = (layout === 'three-fingers' || !button.closest('[data-movement]'))
        && held.some(contact => contact.side === index && (button.hasAttribute('data-jump-pulse') ? contact.button === button : contact.action === action));
      button.classList.toggle('pressed', pressed); button.setAttribute('aria-pressed', String(pressed));
    }
    for (const [position, stick] of sticks.entries()) {
      const index = +stick.closest('[data-side]').dataset.side;
      const contact = held.find(contact => contact.side === index && contact.movement);
      const travel = travels[position];
      stick.style.setProperty('--stick-x', `${(contact?.vector?.x || 0) * travel}px`);
      stick.style.setProperty('--stick-y', `${(contact?.vector?.y || 0) * travel}px`);
      stick.dataset.mask = String((contact?.action || 0) | (contact ? (pendingJumps >> (index * 4)) & 4 : 0));
      stick.classList.toggle('pressed', layout === 'thumbs' && !!contact);
      stick.setAttribute('aria-pressed', String(layout === 'thumbs' && !!contact));
    }
    // The transparent stick moves under the thumb while it is held, then
    // returns to its resting place.
    for (const zone of zones) {
      const index = +zone.closest('[data-side]').dataset.side, pad = zone.parentElement;
      const contact = held.find(contact => contact.side === index && contact.movement === zone);
      const kick = pad.querySelector('[data-zone-kick]'), jump = pad.querySelector('[data-zone-jump]');
      const kicking = held.some(contact => contact.side === index && contact.button === kick);
      const jumping = held.some(contact => contact.side === index && contact.button === jump);
      zone.classList.toggle('pressed', !!contact); kick.classList.toggle('pressed', kicking);
      if (!ghosts) continue;
      ghosts.querySelector(`[data-ghost-kick="${index}"]`).classList.toggle('pressed', kicking);
      ghosts.querySelector(`[data-ghost-jump="${index}"]`).classList.toggle('pressed', jumping);
      const stick = ghosts.querySelector(`[data-ghost-stick="${index}"]`);
      stick.classList.toggle('pressed', !!contact);
      stick.style.left = contact ? `${contact.center.x}px` : '';
      stick.style.top = contact ? `${contact.center.y}px` : '';
      stick.style.setProperty('--stick-x', `${(contact?.vector.x || 0) * FLOATING_RADIUS}px`);
      stick.style.setProperty('--stick-y', `${(contact?.vector.y || 0) * FLOATING_RADIUS}px`);
    }
    if (notify) onChange();
  }
  function updateMovement(contact, x, y) {
    let rect;
    if (contact.center) { const stick = floatingStick(contact.center, x, y); contact.center = stick.center; rect = stick.rect; }
    else rect = contact.movement.getBoundingClientRect();
    if (layout === 'thumbs' || contact.center) {
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
    const zone = target.closest?.('[data-zone-move]'), zoneJump = target.closest?.('[data-zone-jump]');
    if (zone || zoneJump || target.closest?.('[data-zone-kick]')) showHints(false);
    if (zone) {
      const contact = { button: zone, movement: zone, side: +pad.dataset.side, action: 0, center: { x, y } };
      updateMovement(contact, x, y); return contact;
    }
    const kick = target.closest?.('[data-zone-kick]');
    if (kick) return { button: kick, side: +pad.dataset.side, action: 8 };
    if (button?.hasAttribute('data-jump-pulse') || zoneJump) {
      if (mode === 'local') return;
      const index = +pad.dataset.side;
      pendingJumps |= 4 << (index * 4); jumpSequence++;
      return { button: zoneJump || button, side: index, action: 0, pulse: true };
    }
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
    return action !== contact.action || sequence !== jumpSequence || ((layout === 'thumbs' || contact.center) && (vector.x !== contact.vector.x || vector.y !== contact.vector.y));
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
  // iOS resizes the viewport whenever its toolbar slides in or out. Only a new
  // width (rotation, split view) moves the pads under the fingers.
  let viewportWidth = innerWidth;
  listen(window, 'resize', () => { if (innerWidth !== viewportWidth) { viewportWidth = innerWidth; clear(); } });
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
      // The zones show their hints for a few seconds after each start.
      if (state.enabled && !enabled && layout === 'zones') {
        showHints(true); clearTimeout(hintTimer);
        hintTimer = setTimeout(() => showHints(false), 3500);
      } else if (!state.enabled) { clearTimeout(hintTimer); showHints(false); }
      mode = state.mode; side = state.side; enabled = state.enabled; root.dataset.mode = mode;
      if (ghosts) {
        ghosts.dataset.mode = mode;
        for (const ghost of ghosts.children) ghost.hidden = mode !== 'local' && +ghost.dataset.ghostSide !== side;
      }
      if (hints) { hints.dataset.mode = mode; for (const hint of hints.children) hint.hidden = mode !== 'local' && +hint.dataset.hintSide !== side; }
      for (const pad of root.querySelectorAll('[data-side]')) {
        const index = +pad.dataset.side; pad.hidden = mode !== 'local' && index !== side;
        pad.querySelector('.touch-name').textContent = state.names[index];
        for (const button of pad.querySelectorAll('button')) button.disabled = !enabled || pad.hidden;
      }
    },
  };
}
