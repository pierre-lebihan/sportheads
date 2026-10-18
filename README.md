# Sportheads

**[Jouer à Sportheads](https://pierre-lebihan.github.io/sportheads/)**

Reconstruction web de Sports Heads Football European Edition. Le cœur du match
est écrit en Rust et compilé en WebAssembly. Le navigateur gère l'affichage et
les entrées ; la physique, les commandes, le score, les remises en jeu et
l’objectif de buts sont dans le cœur indépendant du navigateur.

Trois choix : **Contre l’IA**, **2 joueurs sur le même écran** ou **En ligne dans une salle privée**.
Le premier à atteindre l’objectif de buts gagne : **7 par défaut**, réglable
de 1 à 9 avec les boutons − et +, sans limite de temps. Choisissez parmi **16 terrains symétriques**, les **18 bonus**
et **23 personnages : 12 joueurs récents, Pierre, Vilma, Thibaud, Marie, Corentin, Pierre Nomad, Maël, Baptiste, Jerem, Arthur et Vilma Dreadlocks** avec aperçu. Les portraits des joueurs sont des caricatures originales ; les autres sprites, animations et sons viennent du
SWF, exportés en SVG/PNG/MP3 ; le jeu s'exécute sans lecteur Flash.

Un match simple contre l’IA ou entre deux humains. Un **curseur à onze
positions** équilibre le duel : Bleu +50 / +40 / +30 / +20 / +10 %, neutre, Rouge +10 / +20 /
+30 / +40 / +50 %. Un seul joueur est aidé à la fois, sur la vitesse, le saut et la frappe.
Le centre est le réglage par défaut. L'aide est choisie avant le match puis
verrouillée ; à distance, le créateur la règle pour la salle.
Les personnages ont tous les mêmes caractéristiques de base.
La sélection affiche les deux portraits face à face et une grille de personnages.
Choisissez les deux camps en local ou contre l’IA ; en ligne, chacun choisit le sien
et voit les changements de l’adversaire en direct avant la validation du créateur.

- Sur mobile : disposition **2 pouces** (joystick pour le déplacement et le saut)
  ou **3 doigts** (Saut séparé en haut). Choix personnel mémorisé dans
  **Commandes tactiles**, modifiable via les réglages pendant le match. Tir reste manuel.
- Gauche au clavier : A/Q, D, W/Z et espace.
- Droite au clavier : flèches et P.
- Échap : pause. Le match se met aussi en pause à la perte de focus.

Sur téléphone, le match ouvre une vue qui occupe l’écran. En paysage, les
commandes entourent le terrain ; en portrait, elles sont dessous. À distance,
chaque téléphone contrôle son joueur. En local, Bleu et Rouge ont chacun leur
manette tactile. Le décor inutile sous le sol est recadré ; seules les commandes
utilisées prennent de la place. Le score est discret, sans fond, en haut du terrain.
En paysage, réglages, son, pause et plein écran occupent les marges latérales.
La roue dentée ouvre le menu et met en pause. « Retour au match » ferme le menu.
Le bouton **Plein écran** existe aussi dans les réglages. Si le navigateur ne le permet
pas, le jeu indique comment l’ouvrir depuis l’écran d’accueil. Voir [commandes mobiles](docs/mobile.md).

La préparation se déroule dans le jeu : **mode → joueurs → terrain → paramètres**.
Les boutons **Aléatoire** choisissent immédiatement un autre joueur ou terrain et actualisent son aperçu. Recliquez autant que vous voulez avant de continuer ; en ligne, chacun garde les mêmes droits que pour le choix manuel.
En local, les deux personnages sont choisis sur le même écran.

Contre l’IA : **difficulté → joueurs → terrain → paramètres**. Vous jouez Bleu,
l’IA joue Rouge ; les deux personnages sont au choix. **Facile** réagit en environ
333 ms et manque des occasions, **Normal** réagit en 200 ms et anticipe les
trajectoires, **Difficile** réagit en 100 ms avec davantage d’anticipation et moins
d’erreurs. Normal est présélectionné. La difficulté reste verrouillée pendant le
match ; elle peut être revue après sa fin. Les bonus, terrains et aides restent
disponibles. Sur mobile, seule la manette du joueur humain s’affiche ; au clavier,
les flèches/P ou Q/A, D, Z/W et espace contrôlent Bleu.

Les trois niveaux partagent des règles de placement : couvrir quand le ballon
est près du but adverse, éviter de dépasser un adversaire qui protège le ballon,
se replier quand le ballon passe derrière et contester les occasions accessibles
au milieu du terrain. La précision et le temps de réaction restent propres à
chaque difficulté ; ces règles n’ajoutent aucune aide physique.

L’IA est un contrôleur local dans `web/opponent.js`, indépendant de celle du
Flash. Il lit l’état public du match et produit les quatre commandes humaines.
L’estimation de vol tient compte de la gravité et des rebonds sur les limites ;
elle est corrigée à chaque décision à partir de la physique réelle, notamment
après un obstacle ou un bonus. Aucun serveur ni modèle externe n’est utilisé,
et la difficulté ne modifie pas les caractéristiques physiques des personnages.

À distance : choisir **En ligne**, créer une salle et partager son code de
huit caractères ou son lien. L'autre joueur clique sur **Rejoindre**, puis
le créateur choisit son joueur, le terrain, puis les paramètres et lance le match. Le créateur joue Bleu, l'invité Rouge ; chacun peut
utiliser les flèches et P ou les touches Q/A, D, Z/W et espace.

L'invité ne choisit que son joueur rouge. Ses écrans Terrain et Paramètres
suivent ceux du créateur, en lecture seule, avec les choix mis à jour en direct.
Il garde son sélecteur de personnage accessible sur ces écrans.

La salle accueille deux joueurs. Les pauses sont partagées, et chaque joueur
doit reprendre sa propre pause. Le créateur peut lancer une revanche. Si l'un
part, l'autre garde la salle ouverte : revenir avec le même code permet de
prendre la place libre. Le créateur retrouve Bleu et les réglages transmis par
l'invité ; après fermeture de sa page, les joueurs reviennent au salon pour
un nouveau match. Si les deux pages sont fermées, il faut recréer une salle.

Les salles utilisent le service de mise en relation PeerServer et WebRTC.
La connexion directe a été vérifiée ; le test forcé des relais TURN publics
échoue dans l'environnement de validation. Certains réseaux restrictifs peuvent
donc empêcher la connexion et nécessiteront un relais dédié.

[État du match](docs/match-progress.md) · [État de la physique](docs/physics-progress.md) ·
[Multijoueur distant](docs/multiplayer.md) · [Joueurs et aides](docs/players.md) ·
[Banc de comparaison Flash/Rust](https://pierre-lebihan.github.io/sportheads/physics.html)

## Construire et lancer

Avec Python 3 et Rust stable, `rustfmt`, `clippy` et la cible `wasm32-unknown-unknown` :

```sh
rustup component add rustfmt clippy
rustup target add wasm32-unknown-unknown
python3 scripts/build-core.py
python3 scripts/build-pages.py
python3 scripts/serve.py
```

Ouvrir `http://127.0.0.1:8766/`. Le build vérifie le format, les tests natifs et
Clippy, puis compile le WASM. Une chaîne locale `tools/rust/` est utilisée si présente.
Aucune dépendance Rust externe. Le jeu local fonctionne sans service de jeu ;
les salles distantes utilisent PeerServer pour la mise en relation.

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
python3 scripts/serve.py --port 8765 --directory .
# Dans un autre terminal :
node scripts/physics-parity.cjs
node scripts/match-parity.cjs
node scripts/check-game.cjs http://127.0.0.1:8765/_site/
node scripts/check-ai.cjs http://127.0.0.1:8765/_site/
node --test tests/*.test.mjs
node scripts/check-online.cjs http://127.0.0.1:8765/_site/
node scripts/check-setup.cjs http://127.0.0.1:8765/_site/
node scripts/check-mobile.cjs http://127.0.0.1:8765/_site/
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
