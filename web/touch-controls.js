// Each finger owns its action until release/cancel, independently of the keyboard.
export function createTouchControls(root, onChange) {
  const pointers = new Map(), buttons = [...root.querySelectorAll('[data-action]')];
  let mode = 'local', side = 0, enabled = false;
  function paint() {
    for (const button of buttons) {
      const pressed = [...pointers.values()].includes(button);
      button.classList.toggle('pressed', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
    onChange();
  }
  function release(event) {
    if (!pointers.delete(event.pointerId)) return;
    paint();
  }
  root.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button) || button.disabled || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button); paint();
  });
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  return {
    mask() {
      let mask = 0;
      for (const button of pointers.values()) mask |= +button.dataset.action << (+button.closest('[data-side]').dataset.side * 4);
      return mode === 'local' ? mask : (mask >> (side * 4)) & 15;
    },
    clear() { if (pointers.size) { pointers.clear(); paint(); } },
    update(state) {
      if (mode !== state.mode || side !== state.side || !state.enabled) this.clear();
      mode = state.mode; side = state.side; enabled = state.enabled;
      root.dataset.mode = mode;
      for (const pad of root.querySelectorAll('[data-side]')) {
        const index = +pad.dataset.side;
        pad.hidden = mode === 'online' && index !== side;
        pad.querySelector('.touch-name').textContent = state.names[index];
        for (const button of pad.querySelectorAll('button')) button.disabled = !enabled || pad.hidden;
      }
    },
  };
}
