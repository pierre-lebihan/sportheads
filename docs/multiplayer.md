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
ouvert avec la roue dentée au-dessus du terrain.

Le code est tiré avec `crypto.getRandomValues`, sur un alphabet de 32 caractères
sans 0, 1, I ou O : 40 bits aléatoires. Les collisions d'identifiant sont reprises
avec un nouveau code. Le code constitue l'invitation : aucune liste publique de
salles, aucun compte ni historique. Il faut partager le code avec son adversaire.

## Synchronisation

- PeerJS 1.5.5 est versionné dans `web/vendor/` avec sa licence MIT.
- [PeerServer Cloud](https://peerjs.com/server/cloud) met les navigateurs en
  relation ; WebRTC chiffré transporte ensuite les messages.
- Le navigateur du créateur est l'autorité : un seul moteur fait avancer le
  match à 30 Hz. L'invité envoie uniquement ses commandes et son personnage.
- Le créateur transmet les corps actifs, animations, bonus, score, terrain, objectif de victoire et niveaux d'aide, ainsi que l'étape de préparation.
  L'invité garde une façade de lecture exacte pour les règles et le score.
  Une seconde façade anime uniquement les positions et angles à la fréquence de
  l'écran, avec une extrapolation limitée à 80 ms et des corrections sur 50 ms.
  Pause, but, changement de match, remplacement de corps et téléportation coupent
  le lissage. Il ne recalcule ni les collisions ni le résultat des tirs.
- Les messages sont validés : version du protocole (7), ordre des états/commandes,
  schéma et limites numériques, bornes des collections et fréquence entrante.
  Les états périmés sont ignorés ; les corps remplacés ne grossissent pas les
  messages. Une file d'envoi saturée abandonne les vues obsolètes.

Les deux navigateurs négocient un canal supplémentaire pour les positions et
commandes du match : non ordonné, sans retransmission, avec une file bornée.
Une mise à jour récente remplace une ancienne ; les numéros de séquence rejettent
les états périmés. Les commandes maintenues sont réémises toutes les 50 ms et
expirent chez l'hôte après 350 ms de silence. Les réglages, pauses, buts et fins
de match restent sur le canal fiable. Une ancienne version, ou l'échec du canal
rapide, conserve le transport fiable. Le protocole de salles 7 reste compatible.
Le canal supplémentaire est isolé du gestionnaire PeerJS pour qu'il ne remplace
pas son canal de contrôle.

Le créateur n'envoie que le dernier état après plusieurs ticks de rattrapage.
Les menus HTML ne sont plus reconstruits à chaque position ; ils sont mis à
jour quand leurs données changent. Ce modèle évite la divergence de deux
simulations : le lissage est visuel et ne change pas le score. Le créateur reste
un joueur de confiance ; il peut modifier son propre navigateur. Aucun classement
ni service de compétition n'est proposé. Le délai réel des actions dépend toujours
du trajet réseau. Cette version n'utilise pas de rollback ni de prédiction locale
des collisions ; une interruption prolongée peut encore produire un gel visuel.

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
La salle reste ouverte tant qu'un des deux joueurs garde sa page. Deux identifiants
PeerServer fixes réservent les places Bleu (créateur) et Rouge (invité). Rejoindre
avec le code réserve Rouge si cette place est libre ; si Rouge est déjà occupé,
la tentative réserve Bleu et reconnecte le créateur à l'invité encore présent.
Les réservations sont atomiques, y compris lors de deux retours simultanés.
Les deux places occupées refusent une troisième personne. Le code est la seule
invitation : une personne qui le connaît peut prendre la place libérée.

Si le créateur ferme son onglet ou quitte la salle, l'invité conserve le code et
attend son retour. Celui qui revient retrouve le rôle Bleu et récupère les deux
personnages, le terrain, l'objectif, les bonus et l'équilibrage auprès de l'invité.
Les joueurs reviennent au salon pour un nouveau match : le score et la simulation
en cours ne sont pas restaurés après une fermeture de page. Un invité peut aussi
revenir tant que le créateur est présent. Si les deux pages sont fermées, il faut
créer une nouvelle salle. Aucun état de partie n'est sauvegardé côté service.
Cette évolution utilise le protocole `sportheads-rooms-7` : recharger les deux
pages avant de créer une nouvelle salle après la mise à jour.

## Réseaux et dépendances

En cas d'échec, « Détails de connexion » permet de copier un diagnostic local :
version du réseau du jeu, navigateur, étapes de connexion, états ICE et codes
d'erreur. La révision 3 ajoute les types de candidats locaux et distants, les
routes essayées et leurs compteurs de requêtes/réponses. Elle indique si des
adresses réflexives sont identiques, sans exposer ces adresses. Les statistiques
sont conservées avant la fermeture du canal. Un compteur absent reste absent :
il n'est pas transformé en zéro. Le rapport ne contient ni code de salle, ni adresse IP, ni SDP, et n'est pas
envoyé automatiquement. Un échec de connexion initiale n'est plus présenté
comme un match arrêté. Les modules du site utilisent une révision commune dans
leurs URL afin qu'une page actualisée charge aussi le nouveau code réseau.

La révision 4 distingue les candidats envoyés, reçus par `addIceCandidate`,
acceptés, rejetés ou encore en attente. Elle conserve aussi le nombre de candidats
présents dans le SDP distant, sans enregistrer le SDP. Une liste de candidats
distants vide dans `getStats` ne suffit donc plus à conclure à une perte de
signalisation : le navigateur peut encore traiter leur résolution.

Un correctif local contourne la [perte silencieuse de messages de PeerJS](https://github.com/peers/peerjs/issues/1373)
lorsque son WebSocket n'est pas prêt : offres, réponses et candidats attendent
le prochain événement `open`. La file est bornée et supprimée au départ du joueur.
Les candidats natifs sont convertis explicitement en objets JSON. Ce correctif
ne modifie ni le transport direct du match ni les serveurs ICE. Son test reproduit
une panne de signalisation ; il ne prouve pas que cette panne explique l'échec
Samsung/iPhone observé sur le Wi-Fi du joueur.

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
node scripts/check-rejoin.cjs http://127.0.0.1:8765/_site/
node scripts/check-network-smoothness.cjs http://127.0.0.1:8765/_site/
node scripts/check-setup.cjs http://127.0.0.1:8765/_site/
node scripts/check-mobile.cjs http://127.0.0.1:8765/_site/
node scripts/check-background.cjs http://127.0.0.1:8765/_site/
node scripts/check-background.cjs http://127.0.0.1:8765/_site/ --join-during-background
node scripts/check-cross-browser.cjs http://127.0.0.1:8765/_site/
node scripts/check-cross-browser.cjs http://127.0.0.1:8765/_site/ --lan-only
node scripts/check-cross-browser.cjs http://127.0.0.1:8765/_site/ --lan-only --interrupt-signaling
node scripts/check-cross-browser.cjs http://127.0.0.1:8765/_site/ --lan-only --interrupt-candidates
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
Le test croisé utilise Chrome et WebKit dans deux processus et inverse les rôles.
Il vérifie aussi l'affichage d'un diagnostic sur une erreur de transport injectée.
Avec `--lan-only`, tous les serveurs ICE sont retirés et le test exige une route
host-vers-host avec des octets reçus. Il valide le chemin direct sur l'ordinateur
de test, sans reproduire le routeur ni les téléphones du joueur.
Les interruptions simulées rendent temporairement le socket indisponible, soit
dès l'offre/réponse, soit lors des premiers candidats ICE. La connexion doit
aboutir après réouverture, et le diagnostic doit confirmer l'envoi des messages
en attente puis l'acceptation des candidats distants. Ces deux scénarios échouent
sur la version sans correctif.
Ces essais ne prouvent pas la compatibilité de deux téléphones sur un autre réseau.

Le test de réglages vérifie les 12 portraits, les terrains, les aides individuelles,
leur transmission dans une vraie salle et leur maintien lors de la revanche.

Le test de préparation vérifie aussi l'accueil, l'ordre des écrans, les retours,
l'arrivée tardive d'un invité, le suivi synchronisé des écrans, les paramètres
en lecture seule et le maintien du choix de personnage de l'invité.

Le test de retour ferme réellement la page du créateur, garde l’invité présent,
puis vérifie le retour par lien et par code, la récupération des réglages, deux
retours simultanés, le refus d’un troisième joueur et le lancement du match suivant.
Le test Chrome/WebKit ferme aussi le créateur et le reconnecte dans les deux sens.

Le test de fluidité applique 100 à 190 ms de délai variable aux états et supprime
une mise à jour sur neuf. Il compare, sur les mêmes images, les mouvements
de la façade autoritaire et du rendu lissé. Il vérifie le canal sans retransmission
et le retour à l’état exact en pause. Il ne mesure pas le réseau des téléphones.
