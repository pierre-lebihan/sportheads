# Joueurs, terrains et aides

Le site propose uniquement des matchs simples contre l’IA, en local ou à distance, au
nombre de buts choisi (7 par défaut, entre 1 et 9 avec les boutons − et +). Il ne contient ni tournoi, coupe,
boutique, monnaie, amélioration à débloquer ou sauvegarde de progression.

## Aider son adversaire

Les réglages appartiennent aux camps du match, indépendamment du portrait choisi.
Cinq boutons remplacent l’ancien curseur global :

- **Normal** : aucun buff.
- **Superman** : +30 % aux cinq stats pour les deux camps.
- **Aides bleues / Aides rouges** : le camp choisi reçoit +10, +30 ou +50 %
  via un curseur à trois positions (un peu / normal / beaucoup), l’autre conserve ses capacités normales.
- **Manuel** : chaque camp possède cinq curseurs indépendants entre 0 et 50 %,
  par pas de 1 %. Passer en manuel conserve les valeurs du préréglage courant.

Seul **Manuel** affiche les portraits, les types d’amélioration et leurs pourcentages.
Les autres préréglages restent compacts, avec seulement le curseur d’intensité
pour les aides bleues ou rouges. L’invité voit les mêmes choix en lecture seule.

Les cinq stats sont l’impulsion de saut, le rayon de la tête, la protection
du but, la vitesse de course et le mouvement de frappe. Le saut multiplie l’impulsion verticale, pas directement la hauteur atteinte.
La protection réduit la hauteur du but d’autant : +50 % la divise par deux.
Le dessin, la barre physique et la détection des buts utilisent la même hauteur.
Le bonus de tête agrandit sa collision et son portrait, en conservant la taille du pied.
La vitesse multiplie l’accélération et la course ; la frappe multiplie la vitesse
du mouvement du pied, uniquement lorsqu’on frappe.
Les nouvelles dimensions peuvent naturellement changer les contacts avec le ballon.

Les buffs se composent avec les bonus ramassés et restent actifs après leur expiration
et les remises en jeu. Ils sont choisis avant le match puis verrouillés jusqu’à sa fin.
En ligne, seul le créateur les modifie ; l’invité peut toucher les deux portraits pour
consulter les curseurs. Les messages vérifient les pourcentages et la cohérence entre
le préréglage, les collisions et l’état transmis. Les réglages personnalisés reviennent
avec le créateur de la salle, même après fermeture de son onglet tant que l’invité reste.
La revanche conserve le choix ; une nouvelle page hors salle revient aux valeurs normales.
L’ancienne API `game_set_assistance` reste réservée aux comparaisons historiques.

## Joueurs récents

Mbappé, Haaland, Lamine Yamal, Dembélé, Bellingham, Palmer, Pedri, Vitinha,
Hakimi, Nuno Mendes, Van Dijk et Donnarumma, plus Pierre, Vilma, Thibaud, Marie, Corentin, Pierre Nomad, Maël, Baptiste, Jerem, Arthur et Vilma Dreadlocks, dessinés à partir de leur photo. Le choix est cosmétique : mêmes
corps physiques et même hauteur de référence pour la condition de saut.
Les différences de niveau proviennent uniquement des aides et des bonus.

La sélection présente les deux portraits face à face et une grille de 23 personnages.
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
Les deux portraits personnels sont dans `web/assets/pierre-vilma.png`, deux cellules
carrées côte à côte (Pierre puis Vilma). L’atlas `web/assets/thibaud-marie.png` utilise le même format (Thibaud puis Marie).
Le portrait de Corentin est refait à partir de sa photo au bord du lac :
`web/assets/corentin-v2.png`. Il conserve son nom et sa place dans la sélection.
La variante Pierre Nomad, cheveux longs et moue de la photo, utilise
`web/assets/pierre-nomad.png`. Elle se choisit séparément et conserve le Pierre original.
Maël possède un portrait carré dans `web/assets/mael.png`, avec ses lunettes de soleil.
Baptiste et Jerem partagent l’atlas `web/assets/baptiste-jerem.png`, deux cellules
carrées côte à côte (Baptiste puis Jerem).
Arthur possède un portrait carré dans `web/assets/arthur.png`.
La variante Vilma Dreadlocks utilise `web/assets/vilma-dreadlocks.png`,
avec sa coiffure asymétrique. Elle se choisit séparément de la Vilma originale.
Les photos de référence restent hors du dépôt.
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

`tests/buffs.rs` couvre les stats indépendantes, les deux camps, les limites,
les bonus et la conservation après un but. `tests/assistance.rs` conserve la preuve
de l’ancienne API historique. Les captures historiques sans aide
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
terrain, et enfin paramètres (objectif, bonus et équilibrage). Le mode en ligne
intercale la création ou la jonction à une salle. Le créateur décide des étapes ;
l’invité suit les écrans et voit leurs valeurs en lecture seule, tout en gardant
son seul choix de personnage modifiable. Le score discret flotte en haut du terrain,
sans bande de fond. Les boutons sont dans les marges latérales en paysage et dans
les coins du terrain en portrait. Le rendu du match est recadré à 800 × 480 :
les 60 pixels inutilisés sous le sol sont supprimés de l’affichage. La physique
conserve son repère historique. En portrait, seules les commandes tactiles
réservent de la place sous le terrain. Le bouton Plein écran complète ces dispositions.

`scripts/check-buffs.cjs URL` vérifie les préréglages et les curseurs précis sur Chrome
et WebKit, les formats mobiles et le verrouillage. `scripts/check-rejoin.cjs URL`
vérifie la récupération de deux profils manuels différents après le retour du créateur.
