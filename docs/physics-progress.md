# Noyau physique Rust/WASM

État du 17 octobre 2026. Le noyau sert désormais à un match local jouable.

## Implémenté

- Cercles et polygones convexes de trois à huit sommets, calcul des masses et
  inerties en `f64`. Rectangles, triangles, trapèzes et hexagones sont couverts.
- Contacts cercle/cercle, cercle/polygone et polygone/polygone ; solveur à deux
  points, friction, restitution et réutilisation des impulsions.
- Articulations pivot motorisées, couple limité et correction des ancrages.
- Îlots de corps connectés, parcours des contacts et joints, groupes de collision.
- Sommeil par îlot après 0,5 seconde de repos et réveil lors d'une commande ou
  d'un contact avec un corps actif.
- Détection continue : formes internes, distance GJK, recherche du premier
  instant de contact et résolution sur le temps restant. Les corps dynamiques
  ordinaires utilisent les mêmes critères que Flash ; le mode bullet est disponible.
- Trois sous-pas de `1/96` seconde et 48 itérations par mise à jour du match à 30 Hz.

Le code reprend le comportement du Box2D 2.0.2 embarqué, y compris des particularités
observées dans sa résolution continue des joints. Remplacer ces boucles par celles
d'un Box2D moderne change les résultats. Les caches du sol partagé entre plusieurs
îlots ont un test indirect dans la comparaison du match complet.

Sources : [world.rs](../src/world.rs), [continuous.rs](../src/continuous.rs),
[body.rs](../src/body.rs), [contact.rs](../src/contact.rs), [joint.rs](../src/joint.rs).

## Validation

Le [rapport enregistré](../evidence/physics-parity.json) compare Flash dans Ruffle
et le WASM sur **25 scénarios et 2 232 mises à jour** :

- les 11 premières scènes de contacts et pieds motorisés ;
- un rebond avec la détection continue activée ;
- ballon rapide contre paroi fine et angle, rectangle rapide contre paroi,
  ballon bullet contre une tête ;
- sommeil puis réveil, sommeil d'un ensemble articulé ;
- interactions de trois cercles et pied articulé au sol avec détection continue ;
- rampe convexe, triangle, triangle rectangle, trapèze et hexagone.

**25/25 passent avec le seuil inchangé de `1e-7` par valeur.** Les 24 scènes
sans écart sont numériquement identiques sur tous les états comparés. Le plus
grand écart mesuré reste `1,1641532182693481e-10` (inertie de l'hexagone). Le sommeil est comparé comme un
état booléen et les essais vérifient qu'un endormissement et un réveil ont
réellement eu lieu. Les scènes rapides exercent effectivement des collisions.

Les [25 régressions natives](../tests/flash_goldens.rs) utilisent des états
capturés uniquement dans Flash. La compilation ne régénère jamais ces références.
Cinq tests supplémentaires ciblent la géométrie et le temps d'impact.

Le match ajoute sa propre comparaison des commandes, déplacements, articulations,
score et chronomètre : voir [match local](match-progress.md).

## Relancer

```sh
python3 scripts/build-core.py
python3 -m http.server 8765 --bind 127.0.0.1
# Dans un autre terminal, avec Playwright et Chrome installés :
node scripts/physics-parity.cjs
node scripts/match-parity.cjs
```

Les essais Flash nécessitent la référence locale préparée avec
`scripts/setup-reference.py`. Elle n'est pas distribuée dans le dépôt.
Le [banc public](https://pierre-lebihan.github.io/sportheads/physics.html) affiche
les enregistrements de ces essais ; le [match](https://pierre-lebihan.github.io/sportheads/)
exécute le moteur WASM en direct.

## Périmètre

Le moteur couvre les formes et articulations nécessaires au match. Les limites
d'angle des articulations, inutilisées par le jeu, ne sont pas implémentées.
Le parcours des paires reprend le broadphase quantifié historique (sweep-and-prune)
et l'ordre des événements de création des contacts. La première mise à jour d'un
contact conserve aussi l'éligibilité continue temporaire du moteur original. Les scénarios
validés ne constituent donc pas une preuve d'identité pour tous les mondes Box2D
possibles ni pour toutes les futures configurations de bonus.

Les bonus sont désormais intégrés et comparés séparément. Les autres terrains
nécessiteront leurs propres scénarios. L'IA est exclue à la demande de l'utilisateur. Les ressources graphiques et sonores nécessaires sont désormais publiées avec le match.
