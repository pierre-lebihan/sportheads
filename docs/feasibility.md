# Faisabilité technique — Sports Heads Football European Edition

Investigation locale du 17 octobre 2026. Les preuves non versionnées restent locales ; le SWF, les ressources et le code décompilé ne sont pas distribués dans ce dépôt.

Ce document conserve le constat initial. Le code livré ensuite et les dernières
preuves sont décrits dans le [suivi du port physique](physics-progress.md).

## Décision proposée

Poursuivre la phase 1 avec un cœur de jeu Rust compilable en WebAssembly et un
rendu navigateur. La décompilation et le banc de comparaison sont exploitables
sur le fichier réel. Le choix de Rust est techniquement possible ; le coût
principal sera le port fidèle de la physique et des comportements Flash.

Le prototype Rust actuel ne reproduit que l'intégration du ballon sans contact.
Il ne constitue ni le jeu, ni un port complet de Box2D.

## Fichier étudié et outils

Source : `~/Documents/Jeux/Sports_Heads_Football_European_Edition.swf`.
SHA-256 : `6a8b371667a9f06da787301814f74afc7d6e80b5b8b0d9fb9b89e1982a559950`.
Le fichier source n'a pas été modifié ; les manipulations portent sur des copies.

Le fichier fait 1 434 969 octets, utilise SWF 9 / ActionScript 3, avec une scène
800 × 540 à 30 images par seconde et 41 images sur la timeline principale.

Outils réellement exécutés : JPEXS 26.3.0, Ruffle 0.7.1, Java 17.0.19,
Chrome 155 headless, Playwright 1.62.1 et Rust 1.99.1.
Versions et empreintes des archives : [tools.json](../evidence/tools.json).

## Code et ressources récupérés

JPEXS a exporté les 220 scripts sans erreur de décompilation signalée :

- 86 classes Box2D, totalisant 14 321 lignes de code décompilé ;
- 134 classes de jeu, d'affichage et d'utilitaires, totalisant 8 766 lignes ;
- 37 images, 205 formes vectorielles SVG, 12 ressources sonores et 7 polices ;
- le SWF contient aussi 157 définitions de sprites et leurs timelines.

Ces volumes donnent un ordre de grandeur, pas une estimation de charge. Les
classes d'affichage comprennent beaucoup de petits scripts. La logique principale
est concentrée dans `MainTimeline.as`, le gestionnaire des bonus, les collisions
et quelques utilitaires.

Les noms des méthodes et beaucoup de variables restent lisibles : `initLevel`,
`onFrame_game`, `checkWinPoint`, `spawnPU`, etc. Les paramètres temporaires de
certains helpers sont renommés par le décompilateur, mais le fonctionnement est
compréhensible. Il reste possible qu'une fonction décompilée soit incorrecte :
la réussite de l'export n'est pas une preuve d'équivalence du code source obtenu.

Preuves : [audit.json](../evidence/audit.json), [decompile.log](../evidence/decompile.log),
[assets-export.log](../evidence/assets-export.log).

## Comportements à préserver

Le moteur embarqué annonce la version Box2D `2.0.2`. Le code récupéré est la
référence, y compris ses éventuelles adaptations ; une bibliothèque moderne
portant le même nom ne garantit pas le même résultat.

Dans `MainTimeline.resetWorld` :

- gravité `(0, 300)` ; échelle physique égale à 1 ;
- pas de simulation `1/96` seconde ;
- 48 itérations de vitesse et 48 de position ;
- trois appels à `m_world.Step` par mise à jour du jeu.

Ainsi, 30 mises à jour de jeu font avancer la physique de `30 × 3/96 = 0,9375`
seconde simulée. Le chronomètre, lui, décrémente après 30 mises à jour. Remplacer
cela par une physique standard à 60 ou 96 Hz changerait les sensations.

Les personnages sont des cercles à rotation bloquée. Chaque pied est un corps
rectangulaire relié par une articulation motorisée : la frappe dépend donc aussi
du solveur d'articulation. Les nombres ActionScript du moteur sont des doubles ;
un port visant la fidélité doit commencer en `f64`, en conservant l'ordre des
opérations et les conversions entières explicites.

La logique ne se limite pas à Box2D :

- les buts et certains effets utilisent `hitTestObject` sur les objets affichés ;
- le compte à rebours démarre le match depuis un script d'animation ;
- des événements `ENTER_FRAME` et `RENDER` construisent le terrain et déclenchent
  des actions différées, notamment après un but ;
- les bonus, la remise en jeu et certains effets utilisent `Math.random()` ;
- les collisions, l'IA, les améliorations et les animations doivent garder leur
  ordre de mise à jour.

Il faudra convertir les timelines en animations et événements explicites, et
exporter les géométries nécessaires aux tests d'intersection visuels.

## Référence Flash dans le navigateur

Le SWF brut s'arrête dans l'introduction avec une erreur AVM2 du préchargeur
`pb_Preloader_2` dans la configuration Ruffle testée. Le banc passe explicitement
à l'image 3 pour conserver l'initialisation du jeu et rejoindre les instructions.
Ce problème de compatibilité n'est donc pas considéré comme résolu sur le SWF brut.

Après ce contournement, un match local à deux joueurs a réellement fonctionné :
terrain, joueurs, ballon, déplacements, sauts, frappes et score. Le test navigateur
enregistre les erreurs et bloque les requêtes vers les domaines externes. Aucun
service historique de score n'est nécessaire aux scénarios validés.

Capture : [match en cours](../evidence/oracle-moved.png).

L'audio a été chargé et les sons sont récupérés ; leur fidélité auditive n'a pas
été évaluée dans Chrome headless. Les anciens services de classement, tous les
terrains et l'ensemble du tournoi n'ont pas été validés.

## Instrumentation et tests côte à côte

Deux variantes de référence sont séparées :

1. `instrumented.swf` : seule la classe `KeyPoll` est remplacée pour exposer les
   commandes et les états à JavaScript. Après redécompilation, les 219 autres
   classes, dont `MainTimeline` et Box2D, sont identiques aux exports originaux.
   Cette vérification porte sur le texte décompilé ; ce n'est pas une preuve
   formelle d'identité de chaque octet du SWF.
2. `seeded.swf` : variante de test supplémentaire qui remplace les 12 appels à
   `Math.random()` de `MainTimeline` par un générateur contrôlé. Le moteur Box2D
   n'est pas porté ni remplacé. Le code principal est recompilé par JPEXS pour
   cette variante ; sa parité avec la première variante a été vérifiée sur le
   scénario déterministe décrit ci-dessous.

Le pont récupère les positions, vitesses, angles et vitesses angulaires des cinq
corps dynamiques principaux, ainsi que les scores, chronomètres, états de pause,
commandes et quelques variables des bonus.

Résultats mesurés :

- Trois contextes navigateur neufs rejouent le même scénario de 180 mises à jour,
  avec les mêmes états à chaque étape et les mêmes empreintes SHA-256.
- Le compteur évolue de 60 à 54 secondes sur ces 180 mises à jour ; le saut est
  vérifié et un but ne peut pas être compté deux fois.
- La variante à hasard contrôlé produit les mêmes états que la variante minimale
  sur ce même scénario, avant la première apparition automatique de bonus.
- Trois autres exécutions rejouent 300 événements `ENTER_FRAME` réels avec le
  hasard contrôlé. Les timelines et callbacks différés avancent réellement ; les
  trois séquences d'états sont identiques. Elles comprennent une apparition de
  bonus, un but et le redémarrage du point avec son compte à rebours.
- Les derniers essais n'ont aucune erreur AVM2 inattendue pendant le match ; les
  erreurs connues du préchargeur restent explicitement enregistrées.

Preuves : [replay.json](../evidence/replay.json),
[replay-seeded-validation.json](../evidence/replay-seeded-validation.json),
[timeline-replay.json](../evidence/timeline-replay.json).

Les premiers essais du banc forçaient trop tôt la construction du terrain. Cela
a été corrigé : il laisse maintenant Flash construire les objets et déclencher
`RENDER` avant les captures. Les erreurs correspondantes ne sont pas ignorées
par les tests finaux.

Les replays de 180 mises à jour pilotent seulement la boucle de jeu pendant que
le lecteur est suspendu : ils ne valident pas les timelines. C'est le rôle du
second scénario, avec les 300 événements réels. La reproductibilité mesurée reste
limitée à ces scénarios et à cet environnement.

## Preuve Rust / WebAssembly

Un petit module Rust `f64` a été compilé en WebAssembly et exécuté dans Chrome.
Il porte seulement l'intégration de la position et de la vitesse du ballon en
vol libre, avec les trois sous-pas et l'ordre de calcul de Box2D embarqué.

Pour l'état de départ contrôlé `(x=400, y=300, vx=75, vy=-100)`, le module donne
exactement les mêmes positions et vitesses verticales que le Flash pendant les
35 premières mises à jour. Il diverge à la 36e, lorsque l'intégration sans contact
ne suffit plus à reproduire la trajectoire du jeu.

Cette expérience valide le chemin Rust → WASM → navigateur et une première
comparaison numérique. Elle ne valide ni les collisions, ni les articulations,
ni l'ensemble du gameplay. Le test Rust natif passe aussi.

Preuves : [code Rust](../spikes/rust-parity/src/lib.rs),
[rust-build.log](../evidence/rust-build.log),
[wasm-parity.json](../evidence/wasm-parity.json).

## Suite de la phase 1

1. Porter le sous-ensemble exact du moteur physique nécessaire au jeu, à partir
   du code récupéré : cercles/polygones, contacts, friction, rebond et articulations
   motorisées. Étendre les comparaisons à ces cas avant de compléter les menus.
2. Porter les commandes, le score, l'IA, les modes de partie et les 18 catégories
   de bonus, avec des scénarios de référence dédiés.
3. Recréer le rendu avec les ressources récupérées, les transformations et les
   événements des timelines ; ajouter les comparaisons visuelles et la validation
   jouable des sons et des sensations.
4. Valider le tournoi, la sélection des joueurs/terrains, les améliorations et la
   sauvegarde. Une copie « à l'identique » comprend aussi ces parcours.

Le cœur Rust doit recevoir des commandes indexées par étape et contenir un état
indépendant du navigateur, avec un hasard explicite. On pourra ainsi réutiliser
ce cœur pour le serveur de la phase 2. Les rooms et le réseau restent hors phase 1.

## Limites ouvertes

- Pas encore de reconstruction complète : le solveur de collisions et le moteur
  d'articulations Rust restent à porter et à comparer.
- Pas de preuve de parité générale entre Ruffle et le lecteur Adobe Flash
  historique. Une référence native connue permettrait de compléter ce contrôle.
- Le générateur contrôlé couvre les appels du code principal. Le hasard des
  autres utilitaires et tous les parcours de tournoi ne sont pas encore couverts.
- Pas encore de validation exhaustive des bonus, terrains, captures visuelles,
  sons, sauvegardes ou performances sur téléphone.
- Pas de garantie de déterminisme entre la future compilation native serveur et
  WASM tant que ce point n'a pas ses propres tests.

Ces limites déterminent les prochains tests ; elles n'empêchent pas de commencer
le portage avec une référence mesurable.

## Documentation des outils

- [JPEXS — export et remplacement de scripts](https://github.com/jindrapetrik/jpexs-decompiler/wiki/Commandline-arguments)
- [Ruffle — intégration web](https://github.com/ruffle-rs/ruffle/wiki/Using-Ruffle)
- [Rust — cible WebAssembly](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html)
