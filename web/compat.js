// Classic script, run before the modules. It fills the two built-ins that
// Safari 15.0-15.3 lacks, and explains instead of leaving a frozen page when
// the browser cannot run the game at all (no module syntax, WASM or Worker).
(function () {
  function define(target, name, value) {
    if (!(name in target)) Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
  }
  define(Object, 'hasOwn', function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); });
  define(Array.prototype, 'at', function (index) {
    index = Math.trunc(index) || 0;
    return this[index < 0 ? index + this.length : index];
  });

  var explained = false;
  function explain() {
    if (explained || window.ready) return;
    explained = true;
    function show() {
      var box = document.createElement('div');
      box.className = 'unsupported-browser';
      box.setAttribute('role', 'alert');
      box.innerHTML = '<strong>Ce navigateur est trop ancien pour Sportheads.</strong>'
        + '<span>Mettez à jour votre appareil (iOS 15 ou plus récent) ou ouvrez le jeu dans une version récente de Chrome, Firefox, Edge ou Safari.</span>';
      document.body.appendChild(box);
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
  // Top-level await and module workers arrived with Error causes (Safari 15, Chrome 93, Firefox 91).
  var cause = false;
  try { cause = new Error('', { cause: 1 }).cause === 1; } catch (error) { /* Very old engine. */ }
  if (typeof WebAssembly !== 'object' || typeof Worker !== 'function' || !('noModule' in HTMLScriptElement.prototype) || !cause) explain();
  // A module that does not parse never reports a load error of its own.
  window.addEventListener('error', function (event) {
    if (event.error instanceof SyntaxError || /SyntaxError/.test(event.message || '')) explain();
  });
}());
