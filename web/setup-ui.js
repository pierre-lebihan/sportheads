export const PREPARATION_STEPS = ['players', 'pitch', 'rules'];
export const validSetupStep = step => PREPARATION_STEPS.includes(step);

// The game owns the screen; a guest receives it exclusively from the host.
export function renderSetup({ screen, mode, role, started, ready, busy, connected }) {
  const $ = selector => document.querySelector(selector);
  const steps = mode === 'ai' ? ['difficulty', ...PREPARATION_STEPS] : PREPARATION_STEPS;
  $('#online-panel').hidden = mode !== 'online' || screen === 'home';
  const guest = mode === 'online' && role === 'guest' && connected;
  for (const panel of document.querySelectorAll('[data-setup-screen]')) panel.hidden = panel.dataset.setupScreen !== screen;
  const index = steps.indexOf(screen);
  $('#setup-panel').dataset.screen = screen;
  $('#setup-steps').hidden = index < 0;
  $('#difficulty-step').hidden = mode !== 'ai';
  for (const [stepIndex, item] of [...$('#setup-steps').children].filter(item => !item.hidden).entries()) {
    item.classList.toggle('current', stepIndex === index);
    item.classList.toggle('complete', stepIndex < index);
    if (stepIndex === index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  }
  $('#players-title').textContent = mode === 'online' ? 'Choisissez votre joueur' : 'Choisissez vos joueurs';
  $('#players-detail').textContent = mode === 'ai' ? 'Votre personnage bleu et celui de l’IA rouge : à vous de choisir.' : mode === 'local' ? 'Chacun sa tête, chacun son camp.' : role === 'guest' ? 'Vous jouez Rouge. Le créateur joue Bleu.' : 'Vous jouez Bleu. Votre adversaire choisit Rouge.';
  $('#pitch-title').textContent = guest ? 'Le terrain du créateur' : 'Choisissez le terrain';
  $('#rules-title').textContent = guest ? 'Les paramètres du match' : 'Réglez le match';
  $('#player-choice').hidden = screen !== 'players' && !(guest && index >= 0);
  $('#player-choice').classList.toggle('guest-profile', guest && screen !== 'players');
  $('#setup-readonly').hidden = !guest || index < 0;
  $('#setup-readonly').textContent = screen === 'players' ? 'Choisissez votre joueur rouge. Le créateur prépare le match.'
    : screen === 'pitch' ? 'Vous suivez le créateur : choix du terrain en lecture seule.'
      : 'Vous suivez le créateur : paramètres en lecture seule.';
  $('#setup-back').hidden = screen === 'home' || guest;
  $('#setup-back').disabled = busy;
  $('#setup-back').textContent = screen === 'room' || screen === 'difficulty' ? 'Choix du mode' : screen === 'players' ? mode === 'online' ? 'Quitter la salle' : mode === 'ai' ? 'Difficulté' : 'Choix du mode' : 'Précédent';
  $('#setup-next').hidden = guest || !['difficulty', 'players', 'pitch'].includes(screen);
  $('#setup-next').disabled = !ready || busy;
  $('#setup-next').textContent = screen === 'difficulty' ? 'Choisir les joueurs' : screen === 'players' ? 'Choisir le terrain' : 'Régler le match';
  $('#setup-navigation').hidden = screen === 'home';
  $('#start').hidden = screen !== 'rules' || started || guest;
  $('#guest-wait').hidden = !guest || screen !== 'rules';
}
