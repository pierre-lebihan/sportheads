# Personnages, terrains et tournois

Les 26 personnages du jeu original sont sélectionnables par nom avec un aperçu.
Chaque joueur choisit le sien en local et à distance. La hauteur visuelle du
personnage reste utilisée par la condition de saut, comme dans Flash.

Le sélecteur à deux joueurs du Flash expose 19 terrains (frames 2 à 20).
Ils sont tous proposés, avec aperçu ; la frame 8 est le terrain libre. Leurs
52 obstacles sont des rectangles ou cercles statiques. Les positions, dimensions
et rotations proviennent des corps créés par Flash, avec ses troncatures
int/uint, et non d'une approximation des dessins. Le rendu utilise les SVG
originaux. Le créateur choisit le terrain à distance.

Trois formats humains sont disponibles :

- Duel : un match au nombre de buts choisi (7 par défaut).
- Coupe à deux : premier à 2 victoires (3 matchs maximum) ou 3 victoires
  (5 matchs maximum), sur le même écran ou à distance dans la même salle.
- Tournoi local à 4 ou 8 : tableau à élimination directe, sans tirage aléatoire,
  noms et personnages choisis à l'inscription. Les participants se relaient
  sur le même appareil à chaque match ; les vainqueurs avancent jusqu'à la finale.

Chaque résultat vient d'un match réellement joué ; aucune IA ni simulation
de résultat. Les paramètres restent fixes pendant la compétition. Le bouton
« Match suivant » présente la rencontre suivante ; le champion clôt le tableau.
« Retour aux réglages » abandonne la compétition. Fermer la page ou quitter
la salle efface la progression. Il n'existe pas encore de sauvegarde.

Les tournois sont une interface web adaptée au jeu entre humains, sans reprise
du championnat solo Flash. Le réseau accueille toujours deux joueurs.

## Améliorations de l'original

L'original enregistre des niveaux de saut, déplacement vers l'avant et l'arrière,
et puissance de frappe : ces achats restent acquis pour les matchs suivants,
contrairement aux bonus ramassés sur le terrain qui expirent. La boutique
contient également des charges consommables (spécial, petit but et ours).
Les niveaux et points sont sauvegardés dans le SharedObject Flash. Cette
boutique et cette sauvegarde ne sont pas implémentées dans la version web.

## Vérification

`tests/pitches.test.mjs` compare les 19 géométries du WASM aux captures Flash
et vérifie leur stabilité pendant 500 étapes. `tests/tournament.test.mjs`
couvre les résultats, appariements, champions, doublons et entrées invalides.
`scripts/check-competition.cjs URL` joue les tableaux complets, la coupe en
vraie connexion WebRTC, et vérifie les réglages partagés et le rendu mobile.
