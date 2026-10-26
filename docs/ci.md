# Publication rapide des personnages

Une modification limitée aux listes de personnages et de groupes, à leurs PNG
sources, à l’atlas `portraits.webp`, au générateur de cet atlas et au test de
groupes emprunte un parcours court. Les fichiers Markdown peuvent l’accompagner.

La CI compare **tous les changements depuis la dernière publication réussie**.
Elle réutilise son WASM inchangé, vérifie les contrats d’état et de sélection,
puis contrôle chaque portrait, chaque groupe, le choix aléatoire et le lancement
d’un match dans Chromium et WebKit. Ces vérifications ont lieu dans le même job
que le build, sans lancer les trois lots de scénarios complets.

Tout autre fichier modifié impose le parcours complet : compilation et tests
Rust, tous les tests JavaScript, puis les trois lots navigateur avant publication.
Un changement du moteur ou du réseau qui aurait échoué lors d’un push précédent
reste dans la comparaison : un ajout de portrait ne peut pas le contourner.

Sans référence valide, si l’historique a été réécrit ou si l’artefact réutilisable
a expiré (14 jours), la CI revient au parcours complet. Les pull requests restent
sur ce parcours. Un lancement manuel force aussi tous les contrôles par défaut ;
décocher `force_full` réactive uniquement la détection automatique.

Après compilation, les contrôles courts sont disponibles localement :

```sh
npm run test:roster
npm run test:browser -- --roster
```

Pour un ajout cosmétique, ces contrôles suffisent localement : il n’est pas utile
de rejouer aussi les suites de physique, d’IA et de réseau avant la même CI.
La physique et les règles du jeu ne sont pas modifiées par ce parcours.
