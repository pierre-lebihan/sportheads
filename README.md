# Sportheads — faisabilité de la reconstruction web

Le SWF original a été décompilé, exécuté dans un navigateur et instrumenté pour
servir de référence. Un premier noyau physique Rust/WASM est implémenté et
comparé à Flash ; le match complet n'est pas encore porté.

**Version en ligne : https://pierre-lebihan.github.io/sportheads/**

Le site public présente les replays du banc de comparaison physique. Ce n’est
pas encore un match jouable. Le déploiement GitHub Pages est automatique après
chaque push sur `main`, si les tests Rust et la compilation WASM passent.

Lire le [constat technique](docs/feasibility.md), avec les preuves et les limites.
Le [suivi du port physique](docs/physics-progress.md) décrit les 11 scénarios
validés et les prochaines étapes.

## Contenu

- `reference/` : copie du SWF original, copie instrumentée minimale et variante à
  hasard contrôlé. Le fichier situé dans `Documents/Jeux` reste intact.
- `evidence/` : code ActionScript décompilé, ressources exportées, journaux,
  captures et enregistrements des états.
- `probe/` : lecteur Ruffle local, destiné aux essais.
- `spikes/rust-parity/` : petit port Rust de la trajectoire libre du ballon,
  sans collisions. Ce n'est pas le moteur complet.
- `src/` : noyau Rust actuel, contacts discrets et pieds motorisés.
- `tests/` : références Flash et tests de régression Rust natifs.
- `scripts/` : préparation et vérification de la référence.
- `tools/` : JPEXS et chaîne Rust locale, sans modification du PATH système.

Le dépôt public contient le noyau Rust, les tests, les scripts et les résultats
numériques du banc. Les SWF, ressources extraites, code décompilé, outils et
journaux locaux sont exclus par `.gitignore` et ne sont pas publiés.

## Relancer les essais

Depuis ce dossier, avec Java 17+, Python 3, Node et Chrome :

```sh
python3 scripts/setup-reference.py
python3 -m http.server 8765 --bind 127.0.0.1
```

Dans un second terminal :

```sh
node scripts/replay-probe.cjs
node scripts/replay-probe.cjs seeded
node scripts/timeline-replay-probe.cjs
python3 scripts/build-rust-spike.py
node scripts/wasm-parity-probe.cjs
python3 scripts/build-core.py
node scripts/physics-parity.cjs
```

Les scripts navigateur nécessitent Playwright (`npm install --no-save playwright`)
et Google Chrome. `PLAYWRIGHT_MODULE` permet d’indiquer un module déjà installé.
La compilation utilise Rust stable, avec `rustfmt`, `clippy` et la cible
`wasm32-unknown-unknown` ; la chaîne locale `tools/rust/` est utilisée si présente.

Le script de préparation vérifie les SHA-256 du SWF et des archives des outils.
Il accepte aussi le chemin du SWF en argument.

## Ouvrir la référence

Une fois le serveur démarré :

- [Référence jouable, introduction passée](http://127.0.0.1:8765/probe/?file=instrumented&boot=play)
- [SWF original brut](http://127.0.0.1:8765/probe/?file=original)
- [Comparaison visuelle du noyau physique](http://127.0.0.1:8765/probe/physics.html)

La référence jouable reste le jeu Flash exécuté par Ruffle. Le contournement du
préchargeur est explicite ; il ne constitue pas une reconstruction HTML5/Rust.


## Publication GitHub Pages

```sh
python3 scripts/build-core.py
python3 scripts/build-pages.py
python3 -m http.server 8766 --directory _site --bind 127.0.0.1
```

Seul `_site/` est publié : la page et les enregistrements numériques de 11
scénarios validés. Les replays enregistrés ne sont pas recalculés par ce build.
Pour revenir à une version précédente, rétablir le commit souhaité sur `main`
et laisser le workflow Pages republier cette version.
