# Sportheads

**[Jouer à Sportheads](https://pierre-lebihan.github.io/sportheads/)**

Reconstruction web de Sports Heads Football European Edition. Le cœur du match
est écrit en Rust et compilé en WebAssembly. Le navigateur gère l'affichage et
les entrées ; la physique, les commandes, le score, les remises en jeu et
l’objectif de buts sont dans le cœur indépendant du navigateur.

Trois choix : **Contre l’IA**, **2 joueurs sur le même écran** ou **En ligne dans une salle privée**.
Le premier à atteindre l’objectif de buts gagne : **7 par défaut**, réglable
de 1 à 9 avec les boutons − et +, sans limite de temps. Choisissez parmi **14 terrains symétriques**, les **bonus au choix**
et **23 personnages : 12 joueurs récents, Pierre, Vilma, Thibaud, Marie, Corentin, Pierre Nomad, Maël, Baptiste, Jerem, Arthur et Vilma Dreadlocks** avec aperçu. Les portraits des joueurs sont des caricatures originales ; les autres sprites, animations et sons viennent du
SWF, exportés en SVG/PNG/MP3 ; le jeu s'exécute sans lecteur Flash.

Un match simple contre l’IA ou entre deux humains. L’**équilibrage** propose
**Normal**, **Superman** (+30 % pour les deux joueurs), **Aides bleues** ou
**Aides rouges**, avec trois intensités : un peu +10 %, normal +30 %, beaucoup +50 %.
En **Manuel**, touchez le portrait d’un camp et réglez séparément, de 0 à +50 %
par pas de 1 %, la puissance de saut, la taille de tête, la protection de son but,
la vitesse et la frappe.
La protection réduit la hauteur du but : +50 % donne un but deux fois plus petit.
La vitesse renforce l’accélération et la course ; la frappe accélère le mouvement
du pied. Le bonus de tête conserve la taille du pied. Les réglages sont verrouillés pendant le match.
À distance, le créateur les règle pour les deux camps et l’invité les voit en lecture seule.
Les bonus à ramasser ont trois réglages : **Aucun bonus**, **Bonus historiques**
(les 18 d’origine, par défaut), ou **Bonus V2** (les 18 historiques et 5 ajouts).
V2 ajoute une **frappe puissante** manuelle à usage unique (8 s pour l’utiliser),
un **bouclier de but** pour un seul ballon (5 s), un **ballon lourd**, une
**tête ressort** et une **zone trampoline** partagée au centre (6 s chacun).
Les icônes et les effets sont visibles sur le terrain ; le guide des cinq ajouts
se déplie dans les paramètres. Le choix est verrouillé pendant le match et
partagé avec l’invité en ligne. Voir [les règles et vérifications](docs/bonuses.md).

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
« Quitter le match » revient au choix du mode depuis la pause, les réglages ou
la fin du match. En ligne, il quitte aussi la salle ; l’adversaire est mis en pause.
Le bouton **Plein écran** existe aussi dans les réglages. Si le navigateur ne le permet
pas, le jeu indique comment l’ouvrir depuis l’écran d’accueil. Voir [commandes mobiles](docs/mobile.md).

La préparation se déroule dans le jeu : **mode → joueurs → terrain → paramètres**.
Les boutons **Aléatoire** choisissent immédiatement un autre joueur ou terrain et actualisent son aperçu. Recliquez autant que vous voulez avant de continuer ; en ligne, chacun garde les mêmes droits que pour le choix manuel.
En local, les deux personnages sont choisis sur le même écran.

Contre l’IA : **difficulté → joueurs → terrain → paramètres**. Vous jouez Bleu,
l’IA joue Rouge ; les deux personnages sont au choix. Quatre niveaux : **Facile**
(300 ms de réaction), **Normal** (environ 167 ms), **Difficile** (environ 67 ms)
et **Expert** (environ 33 ms). Normal est présélectionné. La difficulté reste
verrouillée pendant le match ; elle peut être revue après sa fin. Les bonus,
terrains et aides restent disponibles. Sur mobile, seule la manette du joueur
humain s’affiche ; au clavier, les flèches/P ou Q/A, D, Z/W et espace contrôlent Bleu.

Tous les niveaux protègent leur but, évitent de s’enfermer sous le but adverse,
freinent avant une interception et préparent leurs frappes. Les niveaux Normal
et Difficile utilisent une simulation des actions dans les situations proches ;
Expert l’utilise plus tôt, sans erreur volontaire, avec une anticipation plus
longue et deux réponses adverses estimées. Il compare jusqu’à douze combinaisons
de déplacement, saut et frappe sur dix-huit ticks de la physique réelle, avec
les obstacles, les contacts et les bonus déjà visibles.
Le calcul est borné et réutilisé entre les décisions pour préserver la fluidité.
Voir [le fonctionnement et les commandes de validation](docs/opponent.md).

Le contrôleur local `web/opponent.js` utilise le planificateur `src/opponent.rs`.
Les simulations se font sur des copies indépendantes du match : elles ne changent
ni le match réel, ni son aléatoire, ni les caractéristiques physiques des joueurs.
Le mode fonctionne entièrement sur l’appareil, sans serveur ni modèle externe.

À distance : choisir **En ligne**, créer une salle et partager son code
d'un caractère ou son lien. L'autre joueur clique sur **Rejoindre**, puis
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

L'état central, le contrat moteur, le chargement par usage et l'anticipation IA
dans un Worker sont décrits dans [l'organisation du navigateur](docs/runtime.md).
La physique est protégée par une référence numérique de 48 scénarios ; cette
refonte ne change aucun fichier Rust.

GitHub Actions vérifie les pull requests et les pushes sur `main` : tests Rust,
Clippy, formatage, tests JavaScript, puis scénarios navigateur sur le vrai `_site/`
compilé. Chromium et WebKit couvrent les parties locales et IA, la préparation,
l'équilibrage, les deux dispositions tactiles, le saut par geste, les touches
bloquées, les formats mobiles, le plein écran et les obstacles des terrains.
Une dixième suite vérifie les ressources, la parité du Worker et l'état central.
La publication Pages n'a lieu que sur `main`, après réussite de toutes ces étapes.
Les journaux, états et captures sont disponibles dans l'artefact `browser-report`
du workflow pendant sept jours, y compris lorsqu'un scénario échoue.

Pour relancer les mêmes contrôles navigateur après compilation :

```sh
npm ci
npx playwright install --with-deps chromium webkit
python3 scripts/build-pages.py
npm run test:browser
```

Le lanceur démarre et arrête son serveur local, utilise le Chromium fourni par
la version verrouillée de Playwright et arrête la validation au premier échec.
Chaque scénario dispose de quatre minutes maximum. Aucun serveur de salles
externe n'est requis. Les tests WebRTC avec le PeerServer public restent
des contrôles séparés ; ces navigateurs ne remplacent pas un essai sur iPhone
physique ni une mesure de performances sur téléphone.

Le site contient le match, son moteur WASM et les replays numériques.
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
