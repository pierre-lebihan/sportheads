// Reserve a touch-sized toolbar ABOVE the original scene, so the HUD never
// covers the ball. The original last 60 pixels remain the below-ground bar.
export function layoutArena(slot, surface, touch) {
  function fit() {
    const tactile = document.body.classList.contains('touch-device');
    const landscape = innerWidth > innerHeight;
    const width = Math.max(80, slot.clientWidth - (tactile && landscape ? 240 : 0));
    const controllerHeight = tactile && !landscape && !touch.hidden ? touch.offsetHeight : 0;
    const toolbarHeight = 44;
    const minimumBar = controllerHeight;
    const height = slot.clientHeight;
    const scale = Math.max(.1, Math.min(width / 800, (height - toolbarHeight) / 540, (height - toolbarHeight - minimumBar) / 480));
    const bar = Math.max(60 * scale, minimumBar);
    surface.style.width = `${800 * scale}px`;
    surface.style.height = `${toolbarHeight + 480 * scale + bar}px`;
    surface.style.setProperty('--toolbar-height', `${toolbarHeight}px`);
    surface.style.setProperty('--pitch-height', `${480 * scale}px`);
    surface.style.setProperty('--bar-height', `${bar}px`);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(slot); observer.observe(touch);
  window.addEventListener('resize', fit);
  fit();
}
