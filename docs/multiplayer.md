# Salles privées

Le site GitHub Pages propose deux parcours : jeu sur le même clavier et jeu à
distance. Les deux utilisent le même cœur Rust/WASM, sans IA. Le premier à atteindre l’objectif de buts gagne, sans limite de temps :
7 par défaut, réglable de 1 à 99. Les buts sont classiques et les bonus activables.

## Créer et rejoindre

1. Le créateur choisit « À distance », puis « Créer une salle ».
2. Il partage le code de huit caractères ou le lien qui contient `?room=CODE`.
3. L'invité saisit le code, ou ouvre le lien et clique sur « Rejoindre ».
4. Le créateur lance la partie. Il joue Bleu ; l'invité joue Rouge.

Chaque joueur contrôle uniquement son camp, avec les boutons tactiles sur
mobile, ou avec les flèches et P ou Q/A, D, Z/W et espace au clavier. Chacun choisit parmi 26 personnages avec aperçu ; le créateur
choisit parmi les 19 terrains, les bonus et le nombre de buts pour gagner. Cet objectif est transmis à l’invité, reste fixe pendant
le match et est conservé pour la revanche.
Un troisième navigateur est refusé. Le créateur peut proposer une nouvelle
partie avec le bouton Rejouer ; l'invité attend ce lancement.

Le créateur peut aussi choisir une coupe à deux au meilleur des 3 ou 5 matchs.
Les deux humains restent dans la même salle ; chaque résultat et le vainqueur
sont partagés. Les réglages restent fixes pendant la coupe. Les tableaux à 4 ou
8 participants sont réservés au local. Quitter ou remplacer un joueur abandonne
la compétition ; aucune progression ne persiste après fermeture.

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
- Le créateur transmet les corps actifs, animations, bonus, score, terrain, objectif de victoire et historique de coupe.
  L'invité utilise une façade de lecture pour le même renderer. Il ne recalcule
  pas la physique et ne peut pas modifier le camp adverse par ses commandes.
- Les messages sont validés : version du protocole (3), ordre des états/commandes,
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

Des messages de présence détectent une connexion muette après huit secondes.
Une connexion en cours expire après 18 secondes. En cas de déconnexion, le
match s'arrête ; il n'y a pas de reprise silencieuse avec des commandes anciennes.
Si l'invité part, le créateur peut partager le même code à un nouvel adversaire,
ce qui remet les joueurs dans le salon pour une nouvelle partie. Si le créateur
ferme son onglet ou quitte la salle, le code cesse de fonctionner. Aucun état
de partie n'est sauvegardé côté service.

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
node scripts/check-competition.cjs http://127.0.0.1:8765/_site/
node scripts/check-mobile.cjs http://127.0.0.1:8765/_site/
# Diagnostic séparé, ne pas confondre avec un test validé :
node scripts/check-online.cjs http://127.0.0.1:8765/_site/ --relay
```

Le test navigateur utilise de vraies connexions PeerServer/WebRTC et plusieurs
contextes Chrome indépendants : création, lien, codes invalides/inexistants,
salle complète, commandes séparées, identité des états à l'arrêt, pause des deux
joueurs, bonus, buts, fin de partie, revanche, fermeture et remplacement d'invité.
Les tests sans réseau vérifient les paquets contre le WASM réel et les erreurs
de cycle de connexion. Les régressions physiques Flash/Rust restent inchangées.

Le test de compétition joue aussi les finales des tableaux locaux à 4 et 8,
la coupe distante complète, le partage du terrain et du champion, et le retour au salon.
