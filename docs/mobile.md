# Jouer sur téléphone ou tablette

Ouvrir le site dans le navigateur du téléphone. Les réglages, les 12 joueurs récents,
les terrains, les aides individuelles et les salles restent accessibles. Le jeu et ses menus occupent
le viewport dès l'ouverture ; aucune installation ni
autorisation de plein écran n'est nécessaire.

- Maintenir les flèches pour se déplacer. Saut et Tir peuvent être combinés
  avec le déplacement, avec plusieurs doigts.
- En local, les deux joueurs disposent de leur manette : Bleu et Rouge.
- À distance, seules les commandes de son propre joueur sont visibles.
- En paysage, les commandes entourent le terrain. En portrait, elles sont
  placées dans la bande sous le terrain. Les zones sûres de l'écran sont conservées.
- Pause arrête le match. La roue dentée sous le sol ouvre les réglages
  dans le jeu et met en pause ; Retour au match ferme le menu. Reprendre
  relance ensuite la partie.

Chaque doigt garde son action jusqu'au relâchement, même s'il sort du bouton.
Les interruptions du navigateur, la perte de focus, les pauses et le démarrage
d'un autre match relâchent les commandes. Le tactile n'annule pas une touche
du clavier qui serait maintenue en même temps. Le défilement et les gestes
du navigateur restent disponibles dans les menus, hors des manettes.

## Validation

```sh
node scripts/check-mobile.cjs http://127.0.0.1:8766/
```

Le test utilise les vrais événements multi-touch de Chrome via CDP, le WASM
et le vrai PeerServer/WebRTC entre deux navigateurs mobiles indépendants.
Il vérifie les déplacements, sauts et frappes simultanés des deux camps,
les annulations, le relâchement hors bouton, les pauses, la perte de focus,
le redémarrage et l'isolation des commandes à distance. Les captures couvrent
390 × 844, 844 × 390 et 320 × 568 pixels.

Il s'agit d'émulation de navigateur : aucun test sur téléphone physique ou
Safari iOS n'a encore été effectué. Les limites réseau des salles sont
décrites dans [multiplayer.md](multiplayer.md).
