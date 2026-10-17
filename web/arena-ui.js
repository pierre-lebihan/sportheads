// Keep HTML controls aligned with the original 800x540 scene. The last 60
// scene pixels are the below-ground bar; only that bar grows on small screens.
export function layoutArena(slot, surface, touch) {
  function fit() {
    const tactile = document.body.classList.contains('touch-device');
    const landscape = innerWidth > innerHeight;
    const width = Math.max(80, slot.clientWidth - (tactile && landscape ? 240 : 0));
    const controllerHeight = tactile && !landscape && !touch.hidden ? touch.offsetHeight : 0;
    const minimumBar = 44 + controllerHeight;
    const height = slot.clientHeight;
    const scale = Math.max(.1, Math.min(width / 800, height / 540, (height - minimumBar) / 480));
    const bar = Math.max(60 * scale, minimumBar);
    surface.style.width = `${800 * scale}px`;
    surface.style.height = `${480 * scale + bar}px`;
    surface.style.setProperty('--pitch-height', `${480 * scale}px`);
    surface.style.setProperty('--bar-height', `${bar}px`);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(slot); observer.observe(touch);
  window.addEventListener('resize', fit);
  fit();
}
