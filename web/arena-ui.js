// Display only the playable 800 x 480 scene. Touch controls reserve space only
// where they are actually used; landscape tools share the controller gutters.
export function layoutArena(slot, surface, touch) {
  function fit() {
    const tactile = document.body.classList.contains('touch-device');
    const landscape = innerWidth > innerHeight;
    const local = touch.dataset.mode === 'local';
    const gutters = landscape ? tactile ? 152 + (local ? 152 : 112) : 120 : 0;
    const width = Math.max(80, slot.clientWidth - gutters);
    const indexHeight = tactile && !landscape && !touch.hidden && touch.dataset.layout === 'three-fingers' ? 64 : 0;
    slot.style.paddingTop = `${indexHeight}px`;
    const controllerHeight = tactile && !landscape && !touch.hidden ? touch.offsetHeight : 0;
    const height = slot.clientHeight - indexHeight;
    const scale = Math.max(.1, Math.min(width / 800, (height - controllerHeight) / 480));
    // Different left/right control widths shift the field while preserving both
    // gutters: a single-player kick button needs less room than a second pad.
    surface.style.marginLeft = landscape && tactile && !local ? '40px' : '0';
    surface.style.width = `${800 * scale}px`;
    surface.style.height = `${480 * scale}px`;
    surface.style.setProperty('--pitch-height', `${480 * scale}px`);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(slot); observer.observe(touch);
  new MutationObserver(fit).observe(touch, { attributes: true, attributeFilter: ['data-layout', 'data-mode', 'hidden'] });
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
  document.addEventListener('webkitfullscreenchange', fit);
  fit();
}

export function setupFullscreen(arena, button, settingsButton, status, onChange) {
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  const request = arena.requestFullscreen || arena.webkitRequestFullscreen;
  const enabled = arena.requestFullscreen ? document.fullscreenEnabled : document.webkitFullscreenEnabled;
  const supported = !!request && enabled !== false;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function update() {
    const active = current() === arena;
    button.hidden = !supported;
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? 'Quitter le plein écran' : 'Plein écran';
    button.setAttribute('aria-label', button.title);
    settingsButton.textContent = supported ? active ? 'Quitter le plein écran' : 'Plein écran'
      : standalone() ? 'Ouvert depuis l’écran d’accueil' : 'Jouer sans barre d’adresse';
    settingsButton.disabled = !supported && standalone();
    if (!supported) {
      status.hidden = standalone();
      status.textContent = 'Le plein écran du navigateur est indisponible ici, notamment sur iPhone. Dans Chrome ou Safari : Partager → Sur l’écran d’accueil (ou Ajouter à l’écran d’accueil), puis Ajouter. Gardez « Ouvrir comme app web » activé si proposé et lancez Sportheads depuis son icône pour jouer sans barre d’adresse.';
    }
  }
  async function toggle() {
    if (!supported) { update(); return; }
    try {
      if (current()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await request.call(arena, { navigationUI: 'hide' });
      status.hidden = true;
    } catch {
      status.hidden = false;
      status.textContent = 'Le navigateur a refusé le plein écran. Vous pouvez continuer à jouer dans cette vue.';
    }
  }
  button.addEventListener('click', toggle); settingsButton.addEventListener('click', toggle);
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, () => { update(); onChange(); });
  update();
}
