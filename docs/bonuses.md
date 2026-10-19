# Les bonus du match

Le sélecteur propose Aucun bonus (0), Bonus historiques (1, par défaut) et Bonus V2 (2).
V2 ajoute cinq effets aux dix-huit historiques, dont trois avec variantes bleues
et rouges. Le pool compte donc 26 pastilles,
avec la même fréquence d’apparition qu’avant : un bonus après 201 ticks actifs.
La sélection s’applique au prochain match et reste verrouillée pendant celui-ci.
Les aides manuelles des joueurs restent un paramètre distinct des bonus à ramasser.

- **Frappe puissante (19)** : renforce le prochain contact pied-ballon lorsque le
  joueur appuie sur Tir. Consommée une fois ; le pied cassé empêche de l’utiliser.
  Elle expire après 8 secondes sans utilisation.
- **Bouclier de but (20)** : repousse un seul ballon entrant, légèrement devant
  le but protégé, pendant 5 secondes maximum. Le contrôle du franchissement
  couvre les tirs rapides entre deux sous-pas physiques.
- **Ballon lourd (21)** : double la masse du ballon et sa gravité pendant
  6 secondes ; un second ramassage renouvelle la durée.
- **Tête ressort (22)** : renforce pendant 6 secondes le rebond lors d’un contact
  réel entre la tête du bénéficiaire et le ballon.
- **Zone trampoline (23)** : pendant 6 secondes, entre x=320 et x=480, un contact
  avec le sol fait bondir les deux joueurs et le ballon.

Les pastilles V2 reprennent le style historique : contour dentelé, dégradé,
halo sombre et pictogramme jaune. Frappe puissante, Bouclier de but et Tête ressort
existent en **bleu** (IDs 19, 20, 22) pour le dernier joueur ayant touché le ballon,
et en **rouge** (IDs 24, 25, 26) pour son adversaire. La couleur ne désigne pas
le camp bleu ou rouge. Ballon lourd et Zone trampoline sont jaunes, car partagés.
Les variantes ont exactement les mêmes effets et durées, seul le bénéficiaire change.

Les durées suivent les 30 ticks du jeu par seconde. La pause et le compte à rebours
ne les font pas avancer. Tous les effets V2 sont retirés à la remise en jeu après
un but ; le mode choisi reste actif pour la suite du match. Le trampoline ne crée
pas de commande tactile supplémentaire et la frappe puissante exige toujours un tir manuel.

Le code historique `src/powerups.rs` et ses 18 identifiants restent intacts.
`src/bonus_v2.rs` possède les effets supplémentaires. Les changements de taille
ou de rebond historiques du ballon conservent le multiplicateur de masse lourd
et l’expiration restaure la masse de la forme actuelle. Les simulations d’IA
utilisent des copies complètes de ces états sans consommer les bonus du vrai match.

Les icônes sont dessinées au canvas, ainsi que les indicateurs de charge,
le bouclier, le ballon lourd et la zone trampoline. `game_bonus_value` expose
le mode, les durées et les flashes ; l’invité reçoit uniquement cet état validé,
sans simuler les collisions. Un invité ancien peut jouer avec les modes 0/1,
mais doit annoncer la capacité `bonusV2: 2` avant un match V2. Un invité qui
annonce encore `bonusV2: 1` doit actualiser sa page pour lire les trois nouvelles pastilles. Le code de salle reste inchangé.
Les réglages V2 sont récupérés au retour du créateur depuis l’invité resté dans la salle.

## Vérifications

- `python3 scripts/build-core.py` : tests historiques et V2, format, Clippy, WASM.
- `node --test tests/*.test.mjs` : états réseau, bornes, modes et quatre IA.
- `node scripts/check-bonuses.cjs URL` : trois sélections sur Chrome/WebKit mobile,
  guide, verrouillage, pause et cinq effets partagés dans une vraie salle.
- `node scripts/check-rejoin.cjs URL` : conservation du choix V2 après retour de l’hôte.
- `node scripts/check-ai-performance.cjs URL --v2` : fluidité avec l’IA Expert et
  les cinq effets actifs, sous ralentissement CPU x4 (pas un essai sur téléphone physique).

Pour l’ajout des variantes rouges, la référence de conservation a été comparée
à l’ancien WASM : les 32 scénarios sans bonus ou historiques sont identiques
(19 200 ticks). Seuls les scénarios V2 et les empreintes des règles de bonus
(`game.rs`, `bonus_v2.rs`) ont été actualisés, car le tirage inclut trois nouveaux
identifiants. Les sources du solveur physique et les règles historiques ne changent pas.
