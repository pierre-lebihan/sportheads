# Joueurs, terrains et aides

Le site propose uniquement des matchs simples contre l’IA, en local ou à distance, au
nombre de buts choisi (7 par défaut, entre 1 et 9 avec les boutons − et +). Il ne contient ni tournoi, coupe,
boutique, monnaie, amélioration à débloquer ou sauvegarde de progression.

## Aider son adversaire

Un seul curseur propose onze positions, neutre au centre :
Bleu +52 / +40 / +30 / +20 / +10 %, neutre, Rouge +10 / +20 / +30 / +40 / +52 %.
Un seul camp peut être aidé à la fois, y compris dans le moteur et dans les
états acceptés par l'invité. Les cinq intensités sont :

- Niveau 1 : accélération et vitesse de course, impulsion de saut et vitesse
  du mouvement de frappe multipliées par 1,10.
- Niveau 2 : multiplicateur 1,20.
- Niveau 3 : multiplicateur 1,30.
- Niveau 4 : multiplicateur 1,40.
- Niveau 5 : multiplicateur 1,52.

Ces pourcentages concernent les commandes ; ils ne garantissent pas un
pourcentage de buts ou une trajectoire identique. La physique, les contacts
et la gravité restent inchangés. Les aides se combinent aux bonus ramassés
et ne contournent ni le gel ni le pied cassé. Elles restent actives après
les remises en jeu. Elles sont choisies avant le match, puis verrouillées
jusqu'à la fin. En ligne, le créateur choisit la position du curseur et
transmet leur valeur avec l'état du moteur. La revanche conserve le choix
des réglages de la page ; un rechargement revient aux valeurs par défaut.

## Joueurs récents

Mbappé, Haaland, Lamine Yamal, Dembélé, Bellingham, Palmer, Pedri, Vitinha,
Hakimi, Nuno Mendes, Van Dijk et Donnarumma. Le choix est cosmétique : mêmes
corps physiques et même hauteur de référence pour la condition de saut.
Les différences de niveau proviennent uniquement des aides et des bonus.

La sélection présente les deux portraits face à face et une grille de 12 personnages.
En local et contre l’IA, touchez le camp Bleu ou Rouge puis une case pour choisir
son personnage. Le bouton Aléatoire reste disponible pour chaque camp. Les repères
Bleu/Rouge indiquent les deux choix, y compris quand ils portent sur la même case.
Au clavier, les flèches déplacent le focus dans la grille et Entrée choisit le portrait.
En ligne, chacun choisit uniquement son camp ; le portrait et les repères changent
en direct sur les deux appareils, avant que le créateur valide le duel et passe au terrain.

La sélection reprend les onze joueurs du [World 11 FIFPRO 2025](https://www.fifpro.org/en/articles/2025/11/who-is-in-the-2025-fifpro-men-s-world-11),
avec [Haaland également présent dans les classements FIFA 2026](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/power-rankings).
Aucune appartenance à un club n'est affichée.

Les portraits sont des caricatures générées pour ce projet avec l'outil
intégré imagegen. L'atlas transparent `web/assets/modern-players.png` contient
4 colonnes et 3 rangées, dans l'ordre de `web/players.js`. Le renderer découpe
les cellules directement à l'affichage ; le fichier original est conservé.
Le [prompt de création](avatar-prompt.md) documente leur provenance.

## Terrains et vérifications

Les 16 terrains symétriques sont proposés, avec aperçu ; le numéro 8 est
le terrain libre. Les 19 blueprints historiques restent dans le noyau de comparaison.
Leurs obstacles sont des rectangles ou cercles statiques capturés dans Flash,
avec ses troncatures int/uint. Le rendu utilise les SVG originaux.
Le créateur choisit le terrain à distance.

Les terrains 2, 4, 6, 9, 14, 15, 16, 17 et 18 sont recentrés et leurs paires
alignées en hauteur et en angle. Leurs dimensions physiques sont conservées.
Le rendu de ces neuf variantes utilise les mêmes dimensions que les collisions.
Les terrains 13, 19 et 20 restent exclus : leur disposition demanderait un autre dessin.
La [galerie avant/après](https://pierre-lebihan.github.io/sportheads/terrains.html)
conserve les versions originales et permet de visualiser les corrections.

`data/balanced-pitches.json` est la source des corrections. `scripts/generate-pitches.py`
produit la géométrie Rust et le module de rendu `web/pitch-geometry.js`.
Le jeu utilise `game_start_balanced_pitch`, qui conserve la variante lors des remises
en jeu. L’API historique `game_start_on_pitch` et les fixtures Flash restent intactes.
Le paquet de publication versionne aussi le WASM pour charger ensemble le moteur
et le rendu actualisés. En ligne, les messages annoncent la variante géométrique.
Un invité plus ancien doit actualiser sa page avant que l’hôte puisse lancer une
variante corrigée ; un invité récent conserve le rendu historique face à un ancien
hôte. Les salles et leurs codes restent sur le même protocole.

`tests/assistance.rs` couvre les cinq niveaux, les deux camps, les bonus
et la conservation après un but. Les captures historiques sans aide
restent vérifiées. `tests/pitches.test.mjs` vérifie les 19 géométries historiques, la symétrie des 16
terrains publics et leur correspondance avec la source partagée.
`tests/balanced_pitches.rs` vérifie la conservation des corrections après un but.
`scripts/check-balanced-pitches.cjs URL` compare les pixels réellement dessinés aux
collisions du WASM sur Chrome et WebKit, puis lance un match corrigé.
`scripts/check-setup.cjs URL` vérifie les portraits distincts, les réglages
et le partage des aides dans une vraie salle WebRTC.
`scripts/check-character-selection.cjs URL` vérifie la grille, les deux camps,
le clavier, les formats mobiles et les choix en direct entre Chrome et WebKit.

La préparation du match est découpée en écrans : choix du mode, puis joueurs,
terrain, et enfin paramètres (objectif, bonus et curseur). Le mode en ligne
intercale la création ou la jonction à une salle. Le créateur décide des étapes ;
l’invité suit les écrans et voit leurs valeurs en lecture seule, tout en gardant
son seul choix de personnage modifiable. Le score discret flotte en haut du terrain,
sans bande de fond. Les boutons sont dans les marges latérales en paysage et dans
les coins du terrain en portrait. Le rendu du match est recadré à 800 × 480 :
les 60 pixels inutilisés sous le sol sont supprimés de l’affichage. La physique
conserve son repère historique. En portrait, seules les commandes tactiles
réservent de la place sous le terrain. Le bouton Plein écran complète ces dispositions.
