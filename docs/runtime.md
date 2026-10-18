# État, ressources et calculs du navigateur

## Contrainte de physique

Cette refonte ne modifie aucun fichier Rust ni le WASM publié avant la refonte.
La référence locale du binaire est
`9497cd53fc23678abbd4b9a3966d8bf83c4a75b34e804a9c94916311321d1183` (SHA-256).
Les mêmes commandes produisent les mêmes trajectoires, collisions, scores,
bonus et nombres de ticks.

`tests/fixtures/physics-preservation.json` a été enregistré avec ce binaire avant
les modifications d'application. Le test compare les empreintes des sources
Rust et les résultats numériques exacts de 48 scénarios : 16 terrains × 3 modes
de bonus, 28 800 ticks au total. Les états incluent les corps, sommets, contacts,
vitesses, règles de match, joueurs, aides, bonus et effets. Les références Flash
et les tests Rust existants sont également conservés.

Le compilateur Rust est lui aussi fixé à la version 1.99.1 dans
`rust-toolchain.toml` pour que les publications restent reproductibles.

Le test ne réécrit jamais cette référence. Une future modification volontaire
du moteur exige une revue explicite et une nouvelle référence, avec
`node scripts/physics-reference.mjs --write`. Ne pas régénérer cette référence
pour simplement faire disparaître un échec de CI.

## Propriétaires de l'état

- `web/app-state.js` possède les choix de mode, la préparation, les paramètres,
  les préférences, la pause, l'ouverture des réglages et l'état de connexion.
  Les transitions sont pures et atomiques ; l'objet exposé est immuable.
- `web/game-ui.js` projette cet état dans le HTML. Les contrôles émettent des
  événements : leurs valeurs ne sont plus relues pour démarrer, rejouer,
  reprendre ou transmettre la configuration.
- `web/room-session.js` possède le transport, les séquences de messages,
  les commandes distantes et la reprise de salle. Un callback d'une ancienne
  connexion ne peut pas modifier la nouvelle. La connexion devient inactive
  avant sa fermeture, y compris lors d'une fermeture de page.
- `web/engine-view.js` lit les données de rendu via le contrat moteur.
- `web/game.js` assemble ces services, transmet les événements et fait avancer
  le moteur. Le WASM reste l'unique propriétaire de la physique et du score.

Les transitions importantes sont nommées : `mode.selected`, `match.started`,
`match.pause`, `settings.opened`, `settings.closed`, `match.quit`, `room.left`,
`room.connecting`, `room.disconnected`, `remote.frame` et
`configuration.changed`. Quitter efface les commandes, les pauses, la simulation
et le Worker, tout en conservant les choix de préparation et les préférences.
Une déconnexion conserve les paramètres pour retrouver la salle.

Les tableaux numériques nécessaires au WASM et au protocole historique sont
décrits dans `web/engine-contract.js`. Les lecteurs et adaptateurs offrent des
champs nommés, et centralisent les champs de match, corps, joueurs et bonus.
Le format réseau `sportheads-rooms-7` et les anciens getters restent compatibles.

## Ressources

Les originaux sont conservés dans le dépôt pour les comparaisons et les futures
retouches. Le build ne publie que les fichiers décrits dans
`web/assets/runtime.json`, et les sons utilisés.

Les 23 portraits partagent `portraits.webp`, un atlas transparent WebP sans
perte de 960 × 960 pixels : 192 × 192 par personnage, avec les mêmes cadrages
et orientations. Sa régénération demande Pillow avec WebP et Node :
`python3 scripts/optimize-portraits.py`. Cette dépendance est uniquement un
outil de génération : ni le jeu ni le build courant ne nécessitent Pillow.

Au démarrage, seules les ressources essentielles et le décor visible sont
décodés : 21 images, environ 1,49 Mo transféré et 7,05 Mo de pixels décodés,
contre 166 images, 17,77 Mo et 105,06 Mo auparavant dans le relevé Chromium.
Ces tailles décodées sont des estimations RGBA issues des dimensions d'image,
pas une mesure du tas ou de toute la mémoire GPU du téléphone.

Les effets communs sont préparés avant le match. Les images propres aux bonus
sont chargées uniquement si le mode choisi en a besoin. Le bouton de lancement
attend leur décodage ; aucune règle de bonus n'est désactivée pour accélérer
le jeu. Le cache conserve uniquement le décor courant par canvas, et ne garde
pas de décor incomplet. Les images et modules partagent la révision du build.

## Calculs et mesures

Le profil initial en émulation mobile avec le fil principal ralenti ×4 donnait
un 95e percentile de 0,5 ms pour un tick physique et une pointe de 42,6 ms pour
l'anticipation native de l'IA. La physique reste sur le fil principal ; seul
le calcul d'anticipation identifié comme coûteux est isolé.

`web/planner-worker.js` instancie le même module WASM dans une copie privée et
rejoue les commandes et touches du moteur réel, dans leur ordre exact.
Le Worker propose uniquement quatre bits de commandes à l'IA. Il ne peut
modifier ni positions, ni forces, ni score du moteur réel. Les tests comparent
la copie au vrai moteur et comparent les résultats de planification.

Une seule requête d'anticipation est en attente à la fois. Les réponses de
plus de quatre ticks ou d'une ancienne partie sont rejetées. Les décisions
asynchrones peuvent s'appliquer au tick suivant ; le solveur et ses pas ne
changent pas. Le Worker est détruit en quittant/rejouant. S'il est indisponible
ou trop en retard, le contrôleur heuristique continue sans bloquer l'affichage.

`web/fixed-step.js` appelle toujours le moteur à 30 Hz, avec ses trois sous-pas
physiques de 1/96 s. Après une image en retard, il traite au maximum deux ticks
par image et conserve la dette pour les images suivantes. Aucun pas en attente
n'est supprimé et aucun delta variable n'est transmis au solveur. Le plafond
de 250 ms sur le temps écoulé et la remise à zéro à la pause existaient déjà.

Dans les paramètres, **Fluidité du jeu → Mesurer pendant 10 secondes** relance
la partie et mesure séparément les commandes, le contrôleur IA, l'anticipation
du Worker, la physique, l'interface et le rendu. Le diagnostic contient les
moyennes, médianes, 95es percentiles et maxima, le retard de simulation,
les images chargées et l'état du Worker. **Copier le diagnostic** permet
d'obtenir ces mesures sur un véritable iPhone ou Android, sans les envoyer
automatiquement ailleurs.

Les essais CDP et WebKit sont des émulations : cette refonte n'est pas une
mesure sur téléphone physique. Le ralentissement CDP s'applique au fil principal,
pas nécessairement aux Workers ; il ne faut pas comparer leurs temps comme
s'ils provenaient d'un processeur de téléphone identique.

La CI ajoute `check-runtime.cjs` aux scénarios existants. Elle vérifie les
ressources de démarrage, l'absence d'anticipation native sur le fil principal,
la parité du vrai Worker, les limites de rattrapage, les transitions de sortie
et le repli sans Worker. Les timings de performance restent des mesures
diagnostiques, pas un seuil de FPS dépendant de la machine du runner.
