export const PREPARATION_STEPS = ['players', 'pitch', 'rules'];
export const validSetupStep = step => PREPARATION_STEPS.includes(step);

// The game owns the screen; a guest receives it exclusively from the host.
export function renderSetup({ screen, mode, matchmaking = false, role, started, ready, busy, connected }) {
  const $ = selector => document.querySelector(selector);
  // During a match this dialog is a compact settings view, never a wizard.
  const visibleScreen = started ? 'rules' : screen;
  $('#reload-page').hidden = visibleScreen !== 'home';
  const steps = mode === 'ai' ? ['difficulty', ...PREPARATION_STEPS] : PREPARATION_STEPS;
  $('#online-panel').hidden = started || mode !== 'online' || screen === 'home';
  const guest = mode === 'online' && role === 'guest' && connected;
  const searching = screen === 'matchmaking' && busy;
  $('#online-panel').setAttribute('aria-label', matchmaking ? 'Matchmaking' : 'Salle privée');
  $('.room-help').hidden = matchmaking;
  $('.matchmaking-help').hidden = !searching;
  $('.matchmaking-search').hidden = !searching;
  $('#matchmaking-retry').hidden = screen !== 'matchmaking' || busy;
  // A lost pairing can be replaced at once instead of waiting for the same player.
  $('#matchmaking-again').hidden = !matchmaking || screen === 'matchmaking' || connected || role === null;
  for (const panel of document.querySelectorAll('[data-setup-screen]')) panel.hidden = panel.dataset.setupScreen !== visibleScreen;
  const index = steps.indexOf(visibleScreen);
  $('#setup-panel').dataset.screen = visibleScreen;
  $('#setup-panel').setAttribute('aria-label', started ? 'Réglages du match' : 'Préparation du match');
  $('.rules-screen .launch').hidden = started;
  $('#setup-steps').hidden = started || index < 0;
  $('#difficulty-step').hidden = mode !== 'ai';
  for (const [stepIndex, item] of [...$('#setup-steps').children].filter(item => !item.hidden).entries()) {
    item.classList.toggle('current', stepIndex === index);
    item.classList.toggle('complete', stepIndex < index);
    if (stepIndex === index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  }
  $('#players-title').textContent = mode === 'online' ? 'Choisissez votre joueur' : 'Choisissez vos joueurs';
  $('#players-detail').textContent = mode === 'online' ? 'Vos deux choix s’affichent en direct.' : 'Touchez un camp, puis le portrait de votre choix.';
  $('#pitch-title').textContent = guest ? 'Le terrain du créateur' : 'Choisissez le terrain';
  $('#rules-title').textContent = started ? 'Réglages du match' : guest ? 'Les paramètres du match' : 'Réglez le match';
  $('#player-choice').hidden = started || screen !== 'players' && !(guest && index >= 0);
  $('#player-choice').classList.toggle('guest-profile', guest && screen !== 'players');
  $('#setup-readonly').hidden = started || !guest || index < 0;
  $('#setup-readonly').textContent = screen === 'players' ? 'Choisissez votre joueur rouge. Le créateur prépare le match.'
    : screen === 'pitch' ? 'Vous suivez le créateur : choix du terrain en lecture seule.'
      : 'Vous suivez le créateur : paramètres en lecture seule.';
  $('#setup-back').hidden = started || screen === 'home' || guest;
  $('#setup-back').disabled = busy && screen !== 'matchmaking';
  $('#setup-back').textContent = screen === 'matchmaking' ? busy ? 'Annuler la recherche' : 'Choix du mode' : screen === 'players' && matchmaking ? 'Quitter la partie' : screen === 'room' || screen === 'difficulty' ? 'Choix du mode' : screen === 'players' ? mode === 'online' ? 'Quitter la salle' : mode === 'ai' ? 'Difficulté' : 'Choix du mode' : 'Précédent';
  $('#setup-next').hidden = started || guest || !['difficulty', 'players', 'pitch'].includes(screen);
  $('#setup-next').disabled = !ready || busy;
  $('#setup-next').textContent = screen === 'difficulty' ? 'Choisir les joueurs' : screen === 'players' ? 'Valider le duel' : 'Régler le match';
  $('#setup-navigation').hidden = started || screen === 'home';
  $('#start').hidden = screen !== 'rules' || started || guest;
  $('#guest-wait').hidden = started || !guest || screen !== 'rules';
}
