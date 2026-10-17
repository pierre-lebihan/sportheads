# Salles privées

Le site GitHub Pages propose deux parcours : jeu sur le même clavier et jeu à
distance. Les deux utilisent le même cœur Rust/WASM, sans IA. Le premier à atteindre l’objectif de buts gagne, sans limite de temps :
7 par défaut, réglable de 1 à 99. Les buts sont classiques et les bonus activables.

## Créer et rejoindre

1. Le créateur choisit « En ligne », puis « Créer une salle ».
2. Il partage le code de huit caractères ou le lien qui contient `?room=CODE`.
3. L'invité saisit le code, ou ouvre le lien et clique sur « Rejoindre ».
4. Le créateur prépare les écrans Joueurs, Terrain, puis Paramètres et lance
   la partie. Il joue Bleu ; l'invité joue Rouge.

Le menu principal propose uniquement « 2 joueurs » et « En ligne ». En local,
la préparation passe par Joueurs → Terrain → Paramètres. En ligne, le créateur
suit ce même parcours après la création de la salle.

L'invité rejoint l'écran courant du créateur, même s'il arrive après les premiers
choix. Sa seule action de configuration est de choisir son personnage rouge.
Il suit les changements d'étape du créateur, dans les deux sens ; Terrain et
Paramètres sont en lecture seule et leurs valeurs sont actualisées en direct.
Son sélecteur de joueur reste disponible sous forme compacte sur ces écrans.
Il ne peut ni naviguer à la place du créateur, ni lancer le match. Le choix
des deux personnages, du terrain et des règles est conservé lors des retours.

Chaque joueur contrôle uniquement son camp, avec les boutons tactiles sur
mobile, ou avec les flèches et P ou Q/A, D, Z/W et espace au clavier. Chacun choisit parmi 12 joueurs récents avec aperçu ; le créateur
choisit parmi les 19 terrains, les bonus et le nombre de buts pour gagner. Cet objectif est transmis à l’invité, reste fixe pendant
le match et est conservé pour la revanche.
Un troisième navigateur est refusé. Le créateur peut proposer une nouvelle
partie avec le bouton Rejouer ; l'invité attend ce lancement.

Le créateur règle un curseur à sept positions : Bleu +30 / +20 / +10 %,
neutre, Rouge +10 / +20 / +30 % sur la vitesse, le saut et la frappe. Un seul
camp reçoit une aide. Le moteur neutralise l'autre camp et l'invité rejette
les états où les deux camps seraient aidés. Le curseur est partagé dès le
salon et verrouillé pendant le match. Le choix d'un personnage est visuel.
Les réglages et le partage du code sont accessibles dans le menu du jeu,
ouvert avec la roue dentée sous le sol.

Le code est tiré avec `crypto.getRandomValues`, sur un alphabet de 32 caractères
sans 0, 1, I ou O : 40 bits aléatoires. Les collisions d'identifiant sont reprises
avec un nouveau code. Le code constitue l'invitation : aucune liste publique de
salles, aucun compte ni historique. Il faut partager le code avec son adversaire.

## Synchronisation

- PeerJS 1.5.5 est versionné dans `web/vendor/` avec sa licence MIT.
- [PeerServer Cloud](https://peerjs.com/server/cloud) met les navigateurs en
  relation ; un canal WebRTC chiffré transporte ensuite les messages.
- Le navigateur du créateur est l'autorité : un seul moteur fait avancer le
  match à 30 Hz. L'invité envoie uniquement ses commandes et son personnage.
- Le créateur transmet les corps actifs, animations, bonus, score, terrain, objectif de victoire et niveaux d'aide, ainsi que l'étape de préparation.
  L'invité utilise une façade de lecture pour le même renderer. Il ne recalcule
  pas la physique et ne peut pas modifier le camp adverse par ses commandes.
- Les messages sont validés : version du protocole (6), ordre des états/commandes,
  schéma et limites numériques, bornes des collections et fréquence entrante.
  Les états périmés sont ignorés ; les corps remplacés ne grossissent pas les
  messages. Une file d'envoi saturée abandonne les vues obsolètes.

Ce modèle évite la divergence de deux simulations. Le créateur reste un joueur
de confiance ; il peut modifier son propre navigateur. Aucun classement ni
service de compétition n'est proposé. Le ressenti de l'invité dépend du délai
aller-retour : cette version n'utilise pas de prédiction ni de rollback réseau.

## Pauses et déconnexions

Une pause ou un changement d'onglet arrête le match pour les deux joueurs.
Chaque camp possède sa pause : un joueur ne peut pas annuler celle de l'autre.
Les touches sont relâchées sur perte de focus, et une commande distante qui
n'est plus rafraîchie cesse d'agir après 350 ms.

Passer dans une autre application pour partager le lien ne ferme plus la salle.
Le créateur conserve le même code et ses choix ; si la connexion au service de
salles a été suspendue, elle est rétablie au retour avec le même identifiant.
Le match reste en pause et se reprend avec le bouton Reprendre.

Des messages de présence laissent deux minutes à un navigateur distant suspendu
avant de libérer sa place. Le navigateur local suspendu ne déclenche pas son
propre délai d'expiration et vérifie la présence de l'autre au retour.
Une connexion en cours expire après 18 secondes. En cas de déconnexion, le
match s'arrête ; il n'y a pas de reprise silencieuse avec des commandes anciennes.
Si l'invité part, le créateur peut partager le même code à un nouvel adversaire,
ce qui remet les joueurs dans le salon pour une nouvelle partie. Si le créateur
ferme son onglet ou quitte la salle, le code cesse de fonctionner. Aucun état
de partie n'est sauvegardé côté service.
Si le téléphone détruit ou recharge entièrement la page, il faut recréer la salle.

## Réseaux et dépendances

GitHub Pages continue d'héberger l'ensemble du site. Aucun serveur applicatif
personnel ni abonnement payant n'a été créé. La découverte des salles dépend
du service public PeerServer, sans garantie de disponibilité.

La [configuration ICE de PeerJS 1.5.5](https://github.com/peers/peerjs/blob/v1.5.5/lib/util.ts)
inclut STUN et des relais TURN publics. Les essais réels ont validé les salles
avec une connexion WebRTC directe. Le test qui interdit les connexions directes
(`--relay`) échoue dans l'environnement de validation : aucun candidat relayé
n'est obtenu. La compatibilité avec les réseaux qui exigent TURN n'est donc
pas livrée comme garantie. Un relais dédié, avec des identifiants temporaires,
sera nécessaire pour couvrir ces réseaux si les relais publics ne répondent pas.

## Vérifications

```sh
node --test tests/*.test.mjs
node scripts/check-game.cjs http://127.0.0.1:8765/_site/
node scripts/check-online.cjs http://127.0.0.1:8765/_site/
node scripts/check-setup.cjs http://127.0.0.1:8765/_site/
node scripts/check-mobile.cjs http://127.0.0.1:8765/_site/
node scripts/check-background.cjs http://127.0.0.1:8765/_site/
# Diagnostic séparé, ne pas confondre avec un test validé :
node scripts/check-online.cjs http://127.0.0.1:8765/_site/ --relay
```

Le test navigateur utilise de vraies connexions PeerServer/WebRTC et plusieurs
contextes Chrome indépendants : création, lien, codes invalides/inexistants,
salle complète, commandes séparées, identité des états à l'arrêt, pause des deux
joueurs, bonus, buts, fin de partie, revanche, fermeture et remplacement d'invité.
Les tests sans réseau vérifient les paquets contre le WASM réel et les erreurs
de cycle de connexion. Les régressions physiques Flash/Rust restent inchangées.
Le test d'arrière-plan coupe réellement le WebSocket de signalisation, gèle des
pages Chrome pendant 12 à 15 secondes, puis vérifie le même lien, l'arrivée d'un
invité et la pause/reprise d'un match. Il ne remplace pas un essai sur téléphone physique.

Le test de réglages vérifie les 12 portraits, les terrains, les aides individuelles,
leur transmission dans une vraie salle et leur maintien lors de la revanche.

Le test de préparation vérifie aussi l'accueil, l'ordre des écrans, les retours,
l'arrivée tardive d'un invité, le suivi synchronisé des écrans, les paramètres
en lecture seule et le maintien du choix de personnage de l'invité.
