# Sportheads

**[Jouer à Sportheads](https://pierre-lebihan.github.io/sportheads/)**

Reconstruction web de Sports Heads Football European Edition. Le cœur du match
est écrit en Rust et compilé en WebAssembly. Le navigateur gère l'affichage et
les entrées ; la physique, les commandes, le score, les remises en jeu et le
objectif de buts sont dans le cœur indépendant du navigateur.

Deux choix : **sur le même clavier** ou **à distance dans une salle privée**.
Le premier à atteindre l’objectif de buts gagne : **7 par défaut**, réglable
de 1 à 99, sans limite de temps. Sur terrain libre, avec les **18 bonus** et
26 personnages. Le rendu utilise les sprites, animations et sons du
SWF, exportés en SVG/PNG/MP3 ; le jeu s'exécute sans lecteur Flash.

L'IA est volontairement exclue. Tournoi, sauvegarde et sélection de tous les terrains
restent hors de cette version. Seule la victoire au nombre de buts est proposée.

- Gauche : A/Q, D, W/Z et espace.
- Droite : flèches et P.
- Échap : pause. Le match se met aussi en pause à la perte de focus.

À distance : choisir **À distance**, créer une salle et partager son code de
huit caractères ou son lien. L'autre joueur clique sur **Rejoindre**, puis
le créateur choisit l’objectif et lance le match. Le créateur joue Bleu, l'invité Rouge ; chacun peut
utiliser les flèches et P ou les touches Q/A, D, Z/W et espace.

La salle accueille deux joueurs. Les pauses sont partagées, et chaque joueur
doit reprendre sa propre pause. Le créateur peut lancer une revanche. Fermer
son onglet ferme la salle ; une déconnexion arrête le match, sans reprise
automatique d'une partie abandonnée.

Les salles utilisent le service de mise en relation PeerServer et WebRTC.
La connexion directe a été vérifiée ; le test forcé des relais TURN publics
échoue dans l'environnement de validation. Certains réseaux restrictifs peuvent
donc empêcher la connexion et nécessiteront un relais dédié.

[État du match](docs/match-progress.md) · [État de la physique](docs/physics-progress.md) ·
[Multijoueur distant](docs/multiplayer.md) ·
[Banc de comparaison Flash/Rust](https://pierre-lebihan.github.io/sportheads/physics.html)

## Construire et lancer

Avec Python 3 et Rust stable, `rustfmt`, `clippy` et la cible `wasm32-unknown-unknown` :

```sh
rustup component add rustfmt clippy
rustup target add wasm32-unknown-unknown
python3 scripts/build-core.py
python3 scripts/build-pages.py
python3 -m http.server 8766 --directory _site --bind 127.0.0.1
```

Ouvrir `http://127.0.0.1:8766/`. Le build vérifie le format, les tests natifs et
Clippy, puis compile le WASM. Une chaîne locale `tools/rust/` est utilisée si présente.
Aucune dépendance Rust externe ni requête vers un service de jeu n'est nécessaire.

## Tests contre Flash

25 scènes physiques sont comparées aux états du moteur original : contacts,
articulations, détection continue, sommeil/réveil et polygones convexes. Les états
attendus des régressions natives proviennent exclusivement de Flash et ne sont
jamais régénérés par la compilation. Le banc web montre les enregistrements.

Le match possède également des scénarios comparatifs dédiés et des tests de règles.
Pour relancer les essais navigateur, installer Playwright et Google Chrome :

```sh
npm install --no-save playwright
python3 scripts/setup-reference.py /chemin/vers/Sports_Heads_Football_European_Edition.swf
python3 -m http.server 8765 --bind 127.0.0.1
# Dans un autre terminal :
node scripts/physics-parity.cjs
node scripts/match-parity.cjs
node scripts/check-game.cjs http://127.0.0.1:8765/_site/
node --test tests/net-state.test.mjs tests/rooms.test.mjs
node scripts/check-online.cjs http://127.0.0.1:8765/_site/
node scripts/check-pages.cjs http://127.0.0.1:8765/_site/physics.html
```

`PLAYWRIGHT_MODULE` permet d'utiliser un module déjà installé. Les anciens scripts
`replay-probe.cjs` et `timeline-replay-probe.cjs` documentent l'investigation du
Flash ; le [constat initial](docs/feasibility.md) conserve les premières preuves.
Les fichiers non versionnés qu'il référence restent locaux.
Les tests de salles du navigateur utilisent le vrai PeerServer public et des
connexions WebRTC entre contextes indépendants. Ils demandent un accès Internet.

## Publication

GitHub Actions teste le cœur, compile le WASM et publie `_site/` après chaque push
sur `main`. Le site contient le match, son moteur WASM et les replays numériques.
Pour revenir à une version précédente, rétablir le commit souhaité sur `main` et
laisser le workflow Pages republier cette version.

Le SWF, le code décompilé, les outils et les journaux locaux sont exclus de Git
et du site. Les ressources nécessaires au rendu et au son sont dans `web/assets/` ;
le manifeste conserve l'empreinte du SWF source et les identifiants des sprites.
Le fichier original reste intact.

## Bonus, graphismes et sons

`src/powerups.rs` conserve les 18 règles et leurs durées, y compris les asymétries
et erreurs de temporisation du jeu d'origine. `scripts/powerups-parity.cjs`
compare 43 scénarios à Flash : 657 états et 36 valeurs par état, identiques dans
la version validée. Les références natives sont capturées uniquement dans Flash.

`python3 scripts/export-web-assets.py` régénère les 47 sprites (289 frames) et
10 sons depuis le SWF local. Cette extraction n'est pas nécessaire pour compiler
le dépôt cloné : les fichiers publiés sont versionnés. Le rendu anime les frames
à 30 Hz et conserve les points d'inscription Flash. Les sons démarrent après le
clic sur Commencer et peuvent être coupés avec le bouton Son.

Les scénarios de match couvrent les commandes, les collisions au centre, le toit
des buts et le bonus grande tête. Ils se relancent avec :

```sh
node scripts/match-parity.cjs
node scripts/match-parity.cjs --center
node scripts/match-parity.cjs --roof
node scripts/match-parity.cjs --big-player
node scripts/powerups-parity.cjs
```
