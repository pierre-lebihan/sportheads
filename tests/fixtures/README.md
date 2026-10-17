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
