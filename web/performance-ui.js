export function setupPerformancePanel({ report, reset, resume }) {
  const $ = selector => document.querySelector(selector);
  let timer;
  const refresh = () => {
    const data = report();
    $('#performance-report').textContent = JSON.stringify(data, null, 2);
    $('#performance-report').hidden = false; $('#copy-performance').hidden = false;
    return data;
  };
  const measure = () => {
    clearTimeout(timer); resume(); reset();
    $('#performance-status').textContent = 'Mesure en cours pendant 10 secondes. Jouez normalement.';
    timer = setTimeout(() => { refresh(); $('#performance-status').textContent = 'Mesure terminée. Le diagnostic est disponible dans Fluidité du jeu.'; }, 10_000);
  };
  for (const id of ['measure-performance', 'measure-performance-paused']) {
    $('#' + id).addEventListener('click', measure);
  }
  $('#performance-diagnostic').addEventListener('toggle', () => { if ($('#performance-diagnostic').open) refresh(); });
  $('#copy-performance').addEventListener('click', async () => {
    refresh();
    try { await navigator.clipboard.writeText($('#performance-report').textContent); $('#performance-status').textContent = 'Diagnostic copié.'; }
    catch { $('#performance-status').textContent = 'Sélectionnez le diagnostic ci-dessous pour le copier.'; }
  });
}
