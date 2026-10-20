# Relais TURN de secours

Le jeu tente d'abord une connexion WebRTC directe. Sur certains réseaux
(4G/5G derrière un CGNAT, Wi-Fi d'entreprise ou d'école), aucune route directe
n'existe : le relais TURN transporte alors les paquets du match. Il ne sert
qu'en dernier recours et ne change rien quand la connexion directe fonctionne.

Le relais utilisé est le service TURN de Cloudflare (offre gratuite :
1 000 Go de trafic sortant avant facturation, voir la page tarifs de Cloudflare
Realtime). Un match consomme quelques Mo. Le site étant statique, la clé TURN
reste dans un petit Worker Cloudflare (`turn-worker.js`, offre gratuite) qui
fournit au navigateur des identifiants valables 4 heures. Aucun secret n'est
dans le dépôt ni dans les pages publiées.

## Déploiement

Le Worker est déployé sur `https://sportheads-turn.lebihanp.workers.dev`, et
cette adresse publique est inscrite dans `web/ice-servers.js`. Pour le
redéployer depuis ce dossier :

```sh
export CLOUDFLARE_API_TOKEN=…   # jeton « Edit Cloudflare Workers »
export CLOUDFLARE_ACCOUNT_ID=…
npx wrangler deploy
npx wrangler secret put TURN_KEY_ID          # Realtime → TURN Server
npx wrangler secret put TURN_KEY_API_TOKEN
```

La variable de dépôt GitHub `SPORTHEADS_TURN_URL` permet, si besoin, de
remplacer l'adresse à la construction sans modifier le code.
Ne jamais commiter la clé TURN ni le jeton Cloudflare. En cas de fuite,
supprimer la clé dans *Realtime* → *TURN Server*, en créer une autre et
remettre les deux secrets.

## Vérifier

Ouvrir `https://sportheads-turn.lebihanp.workers.dev` dans le navigateur doit
répondre `Forbidden` : seul le site du jeu peut demander des identifiants.
Dans une salle en ligne, le diagnostic réseau contient `turn-config` avec
`source: relay`. Si le Worker ne répond pas en 3 secondes, le jeu garde les
serveurs par défaut de PeerJS, comme avant.

Pour tester depuis un serveur local, ajouter son origine à la variable
`ALLOWED_ORIGINS` du Worker (liste séparée par des virgules, par exemple
`https://pierre-lebihan.github.io,http://127.0.0.1:8765`).

## Limites

Le contrôle d'origine empêche les autres sites d'utiliser le relais depuis un
navigateur, mais un script peut imiter l'en-tête. Le risque se limite à
consommer le quota gratuit ; Cloudflare permet d'ajouter une alerte de
facturation et, si besoin, une règle de limitation de débit sur le Worker.
