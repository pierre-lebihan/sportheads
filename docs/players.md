# Joueurs, terrains et aides

Le site propose uniquement des matchs simples en local ou à distance, au
nombre de buts choisi (7 par défaut). Il ne contient ni tournoi, coupe,
boutique, monnaie, amélioration à débloquer ou sauvegarde de progression.

## Aider son adversaire

Chaque camp possède un réglage indépendant, neutre par défaut :

- Niveau 1 : accélération et vitesse de course, impulsion de saut et vitesse
  du mouvement de frappe multipliées par 1,10.
- Niveau 2 : multiplicateur 1,20.
- Niveau 3 : multiplicateur 1,30.

Ces pourcentages concernent les commandes ; ils ne garantissent pas un
pourcentage de buts ou une trajectoire identique. La physique, les contacts
et la gravité restent inchangés. Les aides se combinent aux bonus ramassés
et ne contournent ni le gel ni le pied cassé. Elles restent actives après
les remises en jeu. Elles sont choisies avant le match, puis verrouillées
jusqu'à la fin. En ligne, le créateur les choisit pour les deux camps et
transmet leur valeur avec l'état du moteur. La revanche conserve le choix
des réglages de la page ; un rechargement revient aux valeurs par défaut.

## Joueurs récents

Mbappé, Haaland, Lamine Yamal, Dembélé, Bellingham, Palmer, Pedri, Vitinha,
Hakimi, Nuno Mendes, Van Dijk et Donnarumma. Le choix est cosmétique : mêmes
corps physiques et même hauteur de référence pour la condition de saut.
Les différences de niveau proviennent uniquement des aides et des bonus.

La sélection reprend les onze joueurs du [World 11 FIFPRO 2025](https://www.fifpro.org/en/articles/2025/11/who-is-in-the-2025-fifpro-men-s-world-11),
avec [Haaland également présent dans les classements FIFA 2026](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/power-rankings).
Aucune appartenance à un club n'est affichée.

Les portraits sont des caricatures générées pour ce projet avec l'outil
intégré imagegen. L'atlas transparent `web/assets/modern-players.png` contient
4 colonnes et 3 rangées, dans l'ordre de `web/players.js`. Le renderer découpe
les cellules directement à l'affichage ; le fichier original est conservé.
Le [prompt de création](avatar-prompt.md) documente leur provenance.

## Terrains et vérifications

Les 19 blueprints originaux sont proposés, avec aperçu ; le numéro 8 est
le terrain libre. Leurs 52 obstacles sont des rectangles ou cercles statiques
capturés dans Flash, avec ses troncatures int/uint. Le rendu utilise les SVG
originaux. Le créateur choisit le terrain à distance.

`tests/assistance.rs` couvre les trois niveaux, les deux camps, les bonus
et la conservation après un but. Les captures historiques sans aide
restent vérifiées. `tests/pitches.test.mjs` vérifie les 19 géométries du WASM.
`scripts/check-setup.cjs URL` vérifie les portraits distincts, les réglages
et le partage des aides dans une vraie salle WebRTC.
