# IA locale

Quatre niveaux sont disponibles dans « Contre l’IA » : Facile, Normal,
Difficile et Expert. Les personnages gardent les mêmes caractéristiques
physiques que les humains. Le curseur d’aide et les bonus restent indépendants.

`web/opponent.js` gère le placement, le repli, le freinage et les occasions de
saut/frappe. Facile garde une imprécision et des occasions manquées ; les autres
niveaux réagissent progressivement plus vite. Le contrôleur lit les positions,
vitesses et bonus visibles. Les commandes réelles du joueur ne lui sont pas fournies.

`src/opponent.rs` évalue des commandes sur des copies indépendantes du match,
y compris les collisions, les pieds, les obstacles et les bonus existants. Les
nouveaux bonus aléatoires n’apparaissent pas dans ces simulations. Les essais
n’avancent pas le match réel et ne consomment pas son générateur aléatoire.

Expert compare douze actions sur dix-huit ticks, puis vérifie ses trois meilleurs
choix face à une seconde réponse adverse. Les actions sont réévaluées au plus tous
les quatre ticks (environ 133 ms), avec une première réaction au tick suivant.
Normal et Difficile emploient un horizon plus court, dans des situations plus proches.

Les comparatifs reproductibles utilisent l’ancienne version du contrôleur,
conservée dans `tests/fixtures/opponent-v1.mjs`. Les mêmes seeds et terrains sont
joués dans les deux sens. Chaque séquence s’arrête à 3 buts ou 2400 ticks ;
une avance au score en fin de séquence ne signifie donc pas toujours que le
match complet aurait été remporté. Le second groupe emploie d’autres terrains
et seeds que le groupe de mise au point.

```sh
node scripts/benchmark-ai.mjs
node scripts/benchmark-ai.mjs --expert --rival=hard
node scripts/benchmark-ai.mjs --expert --rival=hard --validation
node --test tests/opponent.test.mjs
python3 scripts/build-core.py
node scripts/check-ai.cjs http://127.0.0.1:8768/
node scripts/check-ai-performance.cjs http://127.0.0.1:8768/
```

Les tests natifs vérifient que les simulations préservent intégralement le match
et ses tirages futurs. Les tests JS couvrent les 19 terrains historiques et les
18 bonus, le relâchement des commandes, les phases et les réactions. Le parcours
navigateur couvre les quatre niveaux sur Chrome et WebKit, les commandes mobiles,
les pauses et les revanches. Le test de performance mesure la cadence du vrai jeu
Expert dans Chrome avec un ralentissement CPU ×4 ; il s’agit d’émulation, pas
d’une mesure sur téléphone physique.
