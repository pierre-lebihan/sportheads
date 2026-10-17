# Match à deux joueurs

La version publique exécute le cœur Rust/WASM en direct, sans Flash ni Ruffle.
Elle propose les 19 terrains du sélecteur original, dont le terrain libre
(numéro 8), avec les 18 bonus originaux, sans améliorations ni IA.

## Comportement

- Joueur bleu à gauche : A/Q et D pour bouger, W/Z pour sauter, espace pour frapper.
- Joueur rouge à droite : flèches gauche/droite, flèche haut et P.
- Paramètres des corps, accélération, ralentissement, impulsion de saut et
  asservissement des pieds repris de `MainTimeline`.
- Compte à rebours initial de 89 étapes à 30 Hz ; aucune limite de temps.
- Un but donne un point à l'autre camp, une seule fois. Après 15 étapes, le
  terrain est réinitialisé et le compte à rebours revient. Le score et l’objectif
  sont conservés.
- Le premier à atteindre l’objectif gagne (7 par défaut, réglable de 1 à 99).
  Les commandes ne font plus avancer le match une fois terminé.
- Pause/reprise, nouvelle partie et pause automatique à la perte de focus.
- Hasard explicite pour le lancement du ballon. Même graine et mêmes commandes
  reproduisent les mêmes états dans la compilation testée.

Le moteur conserve les asymétries de l'original : le joueur de droite peut
sauter sur l'autre tête et la borne `x < 720` garde uniquement le mouvement
vers la droite. La détection de but utilise les limites visuelles du ballon
rotatif, comme le `hitTestObject` de la référence.
La condition de saut utilise la hauteur visuelle du personnage sélectionné,
y compris sous les bonus de taille, comme dans le Flash.

## Vérification

Les tests [match_rules.rs](../tests/match_rules.rs) couvrent les commandes des
deux joueurs, le saut, les zones de but, le score unique, les remises en jeu,
le compte à rebours, l'expiration du temps, le redémarrage et la reproductibilité.

`scripts/match-parity.cjs` compare un lancement et des commandes fixés à la
référence Flash : 180 mises à jour, avant l'apparition automatique des bonus.
Ce test suspend les timelines Flash et vérifie le jeu actif ; il ne prouve pas
la parité des animations de célébration ou de fin de partie.
Les variantes `--center` et `--roof` exercent les collisions entre joueurs et
la poussée automatique du ballon sur les buts. La variante `--big-player`
ajoute une tête agrandie : positions et angles comparés à `1e-7`, vitesses à
`1e-6`, pour une dérive numérique maximale de position inférieure à `2e-8` pixel
sur les 180 étapes vérifiées. La régression native de cette variante garde les
120 premières étapes : les chemins de calcul natif et WASM accumulent ensuite
des arrondis différents lors des contacts. Les trois autres scénarios gardent
180 étapes et `1e-7` partout.

`scripts/check-game.cjs URL` exerce le site dans Chrome : déplacements/sauts/
frappes des deux joueurs, pause, but, score, remise en jeu, partie complète,
rejouer, perte de focus et absence de débordement sur écran étroit.

## Suite de la phase 1

L'interface expose seulement deux modes : sur le même écran et à distance
avec code de salle. Les matchs se gagnent au nombre de buts, sans chronomètre,
avec buts classiques. Les variantes historiques chronométrées restent testées
dans le noyau pour les comparaisons Flash mais ne sont plus proposées. Les bonus peuvent toujours modifier temporairement les buts.
Les 26 personnages sont sélectionnables avec leur nom et un aperçu.

Les 18 bonus, le rendu des sprites, les animations et les sons sont intégrés.
Les 19 terrains et les tournois humains sont intégrés : coupe à deux en local
ou à distance, tableau à 4 ou 8 en local. Voir [terrains et tournois](selection-tournament.md).
Les améliorations et la sauvegarde restent hors de cette version. Les salles et le réseau sont décrits
dans [multiplayer.md](multiplayer.md).

Le rendu utilise les ressources originales exportées en SVG/PNG et les sons en MP3.
La page et ses réglages sont une interface web ; ils ne reproduisent pas encore
tous les menus Flash. L'affichage s'adapte aux petits écrans,
avec commandes tactiles sur mobile et clavier sur ordinateur. Voir [mobile](mobile.md).

## Preuves des blocs 3 et 4

43 scénarios comparent les 18 bonus pour chaque camp, leurs expirations et leurs
interactions : 657 états × 36 valeurs et temporisations, strictement identiques
entre Flash et le WASM validés. Les régressions natives utilisent ces captures.
Le test d'intégration applique chaque bonus dans le monde physique réel et
vérifie les corps et joints restants, puis les trois modes de victoire.

Le test navigateur vérifie la lecture des sprites, les commandes, une partie
complète, le choix local/distant, les 18 effets et
l'apparition automatique des objets. Le chargement des graphismes reprend les
requêtes échouées de manière transitoire. Les fichiers audio ont été chargés et
décodés ; l'identité auditive et la fidélité visuelle de toutes les combinaisons
de bonus ne sont pas prouvées par ces tests automatisés.
