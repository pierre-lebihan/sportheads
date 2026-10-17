# Port du noyau physique — première étape implémentée

État du 17 octobre 2026. Le match complet et ses graphismes restent à porter.

## Code livré

Le projet contient désormais une bibliothèque Rust sans dépendance externe,
compilée nativement et en WebAssembly : `sportheads-core`.

- Corps circulaires et rectangulaires, masses/inerties et transformations en `f64`.
- Contacts cercle/cercle et cercle/polygone, y compris les angles.
- Contacts polygone/polygone avec jusqu'à deux points d'appui.
- Solveur de vitesse et de position, friction, restitution et réutilisation des
  impulsions de l'étape précédente.
- Articulation pivot motorisée correspondant au pied du jeu, sans limites d'angle,
  avec le plafond de couple et la correction de l'ancrage.
- Trois sous-pas de `1/96` seconde par mise à jour, avec 48 itérations, comme la
  boucle physique récupérée du SWF.

Sources : [src/](../src/), [Cargo.toml](../Cargo.toml).
Le `World` Rust est indépendant du navigateur. Les exports `core_*` servent au
banc de test WASM ; ils ne constituent pas une API réseau ni un système de rooms.

## Comparaisons exécutées

Onze scénarios font exécuter les mêmes paramètres aux deux moteurs, sur 1 170
mises à jour et 3 510 sous-pas :

- rebond et friction du ballon au sol ;
- ballon contre un mur incliné et contre un angle ;
- ballon contre une tête lourde ;
- séparation de cercles initialement superposés ;
- pied motorisé en mouvement, couple limité et frappe du ballon ;
- appui à deux points d'un rectangle au sol, chute d'un rectangle incliné ;
- pied motorisé avec les contacts du sol.

Les positions, vitesses, angles, vitesses angulaires, masses, inerties, angles
d'articulation et erreurs d'ancrage sont comparés à chaque mise à jour. Les
contacts sont aussi relevés à chacun des trois sous-pas : un choc bref peut
disparaître avant la capture suivante. Les tests vérifient qu'ils exercent
réellement des collisions et le cas d'appui à deux points.

Résultats :

- **11/11 scénarios navigateur passent.**
- **9 scénarios donnent les mêmes valeurs numériques sur tous les états comparés.**
- Les deux autres donnent un écart maximal de position de
  `1,107298430724768e-8` unité, soit autant de pixels avec l'échelle du jeu.
- Le seuil d'acceptation du banc est `1e-7` par valeur comparée. L'origine des
  petits écarts des contacts à deux points reste à isoler avant de prétendre à
  une identité numérique stricte sur ces cas.
- Aucune erreur Flash inattendue dans les essais physiques. Les erreurs connues
  de l'introduction Ruffle restent classées séparément.

Rapport complet : [physics-parity.json](../evidence/physics-parity.json).

Onze tests Rust natifs passent sur des états de référence capturés uniquement
dans Flash, aux instants importants des scénarios. Ces fichiers attendus ne
sont jamais régénérés par la compilation ou les tests.

Preuves : [flash_goldens.rs](../tests/flash_goldens.rs),
[références](../tests/fixtures/README.md).
La compilation native et la compilation WASM respectent donc la même tolérance
sur les scènes testées ; ce n'est pas une preuve de déterminisme universel.

## Voir et relancer

Le [banc visuel local](http://127.0.0.1:8765/probe/physics.html) permet de choisir un
scénario, lire les deux replays ou parcourir les étapes avec le curseur. Il
affiche des résultats enregistrés des essais, pas une simulation interactive
du match complet.

Depuis la racine du projet :

```sh
python3 scripts/build-core.py
python3 -m http.server 8765 --bind 127.0.0.1
```

Puis, dans un autre terminal :

```sh
node scripts/physics-parity.cjs
```

La construction exécute les tests natifs et Clippy, puis produit
`probe/physics-core.wasm`. Les outils utilisent Rust installé sur la machine, ou la chaîne locale
`tools/rust/` si elle existe. Les références SWF sont préparées avec `scripts/setup-reference.py`.

## Limite et prochaine étape

La détection continue des collisions et la mise en veille sont **désactivées
dans les deux moteurs** pour ces essais. C'est un port du solveur discret,
pas encore un remplacement de toute la physique du match original.

Il reste en particulier à porter la détection continue, l'ordre de traitement
des îlots et contacts dans les mondes complexes, puis la mise en veille et les
formes supplémentaires des terrains. Ces points devront passer de nouveaux
scénarios avant de brancher ce moteur sur la totalité du match.

Les limites d'angle des articulations ne sont pas portées : le joint créé par le
jeu n'en active pas. Les contrôles, bonus, IA, menus, animations et ressources
du match restent à intégrer ensuite. Les rooms et le réseau restent en phase 2.
