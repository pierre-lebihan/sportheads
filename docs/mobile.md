# Jouer sur téléphone ou tablette

Ouvrir le site dans le navigateur du téléphone. Les réglages, les 12 joueurs récents,
les terrains, les aides individuelles et les salles restent accessibles. Le jeu et ses menus occupent
le viewport dès l'ouverture ; aucune installation ni
autorisation de plein écran n'est nécessaire.

- L’objectif se règle avec les boutons − et +, de 1 à 9 buts (7 par défaut).
  Le curseur d’aide a onze positions : neutre ou +10 / +20 / +30 / +40 / +52 % pour un seul camp.
- Le menu propose Contre l’IA, 2 joueurs ou En ligne, puis la préparation passe par
  Joueurs, Terrain et Paramètres. Dans une salle, l’invité suit le créateur
  et ne modifie que son propre personnage.
- Dans les réglages, **Commandes tactiles → Disposition sur cet appareil**
  propose deux choix, mémorisés sur le téléphone :
  - **2 pouces** (par défaut) : glisser sur le pavé gauche pour marcher ;
    monter vers une diagonale ajoute le saut, monter au centre saute sur place.
    Revenir en bas retire le saut, revenir au centre arrête le déplacement.
    Le pouce droit garde le bouton Tir, entièrement manuel.
  - **3 doigts** : pouce gauche pour marcher, index gauche sur Saut en haut
    à gauche et pouce droit sur Tir. En local, Rouge a son Saut en haut à droite.
  Un seuil distinct d’activation et de relâchement évite les oscillations à la
  limite de la zone de saut. Le choix reste modifiable pendant un match via la
  roue dentée, sans redémarrer la partie. Il est personnel, même pour l’invité
  quand les paramètres de la salle sont en lecture seule.
- En local, les deux joueurs disposent de leur manette : Bleu et Rouge.
- À distance, seules les commandes de son propre joueur sont visibles.
- En paysage, les commandes entourent le terrain. En portrait, elles sont
  placées dans la bande sous le terrain. Les zones sûres de l'écran sont conservées.
- Le rendu conserve les 800 × 480 pixels du terrain et coupe les 60 pixels
  inutilisés sous le sol. Les commandes en portrait réservent uniquement leur
  hauteur réelle ; il n’y a plus de bande de décor vide ni de barre blanche en haut.
- Le score compact Bleu — Rouge flotte en haut du terrain : sans fond,
  semi-transparent et sans intercepter les gestes. L’objectif reste dans les paramètres.
- En paysage, réglages, son et plein écran sont à gauche, pause et redémarrage
  à droite. Ils partagent les marges des manettes. Les zones de saut séparées
  sont placées sous ces boutons pour éviter les chevauchements.
- **Plein écran** est disponible dans les réglages, ainsi que sur le bord gauche
  en paysage lorsque le navigateur autorise l’[API Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen).
  Le bouton permet aussi de quitter ce mode et suit les sorties déclenchées par
  le navigateur. Les commandes maintenues sont relâchées lors de la transition.
  Si l’API est indisponible, le jeu propose l’ajout à l’écran d’accueil ; son
  manifeste demande une ouverture autonome, sans barre d’adresse. Cela n’ajoute
  pas de mode hors ligne ni de sauvegarde de partie.
- Pause arrête le match. La roue dentée ouvre les réglages
  dans le jeu et met en pause ; Retour au match ferme le menu. Reprendre
  relance ensuite la partie.

Si le créateur ferme sa page, l’invité peut garder la salle ouverte. Revenir
avec le lien ou le code reprend la place Bleu et retrouve les réglages ;
le match suivant se lance depuis le salon. Les deux joueurs doivent recharger
la page après la mise à jour vers le protocole de salles 7.

Les doigts sur Tir et sur le Saut séparé gardent leur action jusqu'au
relâchement, même hors bouton. Le doigt sur le pavé suit les zones traversées ;
sortir du pavé annule son déplacement et son saut. Changer de disposition
relâche tous les contacts ; les anciens doigts ne sont pas réactivés par un mouvement.
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
node scripts/check-touch-layouts.cjs http://127.0.0.1:8766/
node scripts/check-display.cjs http://127.0.0.1:8766/
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
Le test des dispositions vérifie les glissements, les combinaisons et les
relâchements indépendants, la modification en cours de partie et la mémorisation.
Il emploie des gestes CDP natifs sur Chrome et des snapshots de contacts DOM
sur WebKit ; les tests de relâchement utilisent aussi les taps natifs de WebKit.

Il s'agit d'émulation de navigateur : aucun test sur téléphone physique ou
Safari iOS n'a encore été effectué. Les limites réseau des salles sont
décrites dans [multiplayer.md](multiplayer.md).
