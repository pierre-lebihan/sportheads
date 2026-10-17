# Jouer sur téléphone ou tablette

Ouvrir le site dans le navigateur du téléphone. Les réglages, les 12 joueurs récents,
les terrains, les aides individuelles et les salles restent accessibles. Le jeu et ses menus occupent
le viewport dès l'ouverture ; aucune installation ni
autorisation de plein écran n'est nécessaire.

- Le menu propose 2 joueurs ou En ligne, puis la préparation passe par
  Joueurs, Terrain et Paramètres. Dans une salle, l’invité suit le créateur
  et ne modifie que son propre personnage.
- Maintenir les flèches pour se déplacer. Saut et Tir peuvent être combinés
  avec le déplacement, avec plusieurs doigts.
- En local, les deux joueurs disposent de leur manette : Bleu et Rouge.
- À distance, seules les commandes de son propre joueur sont visibles.
- En paysage, les commandes entourent le terrain. En portrait, elles sont
  placées dans la bande sous le terrain. Les zones sûres de l'écran sont conservées.
- Pause, réglages et son sont dans une bande au-dessus du terrain, avec un
  score compact Bleu — Rouge. Cette bande ne recouvre aucune partie du terrain ;
  l'objectif de buts reste uniquement dans les paramètres.
- Pause arrête le match. La roue dentée ouvre les réglages
  dans le jeu et met en pause ; Retour au match ferme le menu. Reprendre
  relance ensuite la partie.

Si le créateur ferme sa page, l’invité peut garder la salle ouverte. Revenir
avec le lien ou le code reprend la place Bleu et retrouve les réglages ;
le match suivant se lance depuis le salon. Les deux joueurs doivent recharger
la page après la mise à jour vers le protocole de salles 7.

Chaque doigt garde son action jusqu'au relâchement, même s'il sort du bouton.
Les contrôles tactiles suivent les identifiants natifs des doigts et réconcilient
leur état avec la liste complète `TouchEvent.touches`. Un `pointerup` perdu ne
laisse donc plus une pression mémorisée ; si les événements de fin sont tous
perdus, le prochain geste retire les anciens contacts absents. Les vrais appuis
longs restent actifs sans délai de coupure arbitraire. La souris et le stylet
conservent la capture de pointeur. Voir la [définition de la liste des contacts](https://www.w3.org/TR/touch-events/#widl-TouchEvent-touches).
Les interruptions du navigateur, la perte de focus, les pauses et le démarrage
d'un autre match relâchent les commandes. Le tactile n'annule pas une touche
du clavier qui serait maintenue en même temps. Le défilement et les gestes
du navigateur restent disponibles dans les menus, hors des manettes.

## Validation

```sh
node scripts/check-mobile.cjs http://127.0.0.1:8766/
node scripts/check-touch-release.cjs http://127.0.0.1:8766/
```

Le test utilise les vrais événements multi-touch de Chrome via CDP, le WASM
et le vrai PeerServer/WebRTC entre deux navigateurs mobiles indépendants.
Il vérifie les déplacements, sauts et frappes simultanés des deux camps,
les annulations, le relâchement hors bouton, les pauses, la perte de focus,
le redémarrage et l'isolation des commandes à distance. Les captures couvrent
390 × 844, 844 × 390 et 320 × 568 pixels.
Il vérifie aussi qu'une fin de pointeur perdue chez l'invité transmet bien une
commande nulle à l'hôte. Le test de relâchement supprime volontairement les
événements de fin dans Chrome et WebKit : pression fantôme, réappuis, correction
au geste suivant, indépendance du clavier et maintien de la capture à la souris.

Il s'agit d'émulation de navigateur : aucun test sur téléphone physique ou
Safari iOS n'a encore été effectué. Les limites réseau des salles sont
décrites dans [multiplayer.md](multiplayer.md).
