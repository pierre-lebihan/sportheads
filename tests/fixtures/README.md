# Références physiques

Les fichiers `physics/*.txt` contiennent les paramètres des scènes et des états
capturés dans le moteur ActionScript du SWF original avec Ruffle 0.7.1.
Ils ne sont pas produits par le moteur Rust.

La détection continue et le sommeil sont désactivés dans ces scènes pour isoler
le solveur discret et les articulations. Le test navigateur capture tous les
états ; ces fichiers conservent des instants représentatifs et les changements
du nombre de contacts.

Le test Rust natif accepte un écart absolu maximal de `1e-7` sur chaque valeur
enregistrée. Le rapport navigateur donne aussi les écarts réellement mesurés.
L'absence d'écart sur ces scènes ne prouve pas la fidélité de tout le jeu.

Mise à jour volontaire, après vérification du rapport :

```sh
node scripts/physics-parity.cjs
node scripts/capture-physics-goldens.cjs
```

La compilation et les tests ne régénèrent jamais ces références.

## Matchs complets

Les fichiers `match/*.txt` enregistrent des matchs à deux joueurs,
avec détection continue et sommeil actifs. Les trois scénarios sans bonus
contiennent 180 frames ; `big-player` en conserve 120 pour la régression native.
Le rapport navigateur compare toujours les 180 frames du scénario géant.
Les chemins numériques natif et WASM accumulent des arrondis différents après
des contacts répétés ; cette fenêtre native maintient les seuils indiqués.
Le scénario `big-player` applique le
bonus 14 au joueur de droite avant la première frame (`collect 14 1`), puis
fait avancer les deux joueurs vers le centre avec sauts et frappes.

Les commandes `tolerances` indiquent les seuils absolus de comparaison :
positions et angles `1e-7`, vitesses linéaires et angulaires `1e-6` pour ce
scénario géant. Les autres matchs conservent `1e-7` sur tous les champs.
La tolérance des vitesses couvre une dérive mesurée maximale de `5.97e-7` après
180 frames ; celle des positions reste inchangée (écart mesuré `1.54e-8` pixel).

Capture volontaire depuis Flash, après reconstruction du WASM :

```sh
node scripts/match-parity.cjs --big-player --capture
```

## Terrains

`pitches/original.json` contient les corps statiques des 19 blueprints jouables
(frames 2 à 20), capturés depuis le Flash instrumenté. Il conserve l'empreinte
du SWF et les paramètres des formes, notamment les troncatures int/uint de Flash.
Les tests WASM comparent positions, angles, dimensions et rayons à cette référence.

```sh
# Capture volontaire depuis Flash préparé et servi sur le port 8765 :
node scripts/capture-pitches.cjs
# Régénérer le code à partir de la référence versionnée :
python3 scripts/generate-pitches.py
cargo fmt
```

La capture complète est écrite dans `evidence/pitches.json`. La référence
versionnée en conserve uniquement les métadonnées et obstacles ; elle ne doit
jamais être régénérée depuis Rust. Les builds ne la modifient pas.
