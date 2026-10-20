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

## Mise en place (une fois, environ 10 minutes)

1. Créer un compte gratuit sur dash.cloudflare.com.
2. **Clé TURN** : menu *Realtime* → *TURN Server* → *Create*. Garder la page
   ouverte : elle affiche l'identifiant de clé (*Turn Token ID*) et le jeton
   d'API, montré une seule fois.
3. **Worker** : menu *Workers & Pages* → *Create* → *Hello World*, nom
   `sportheads-turn` → *Deploy* → *Edit code*. Remplacer tout le code par le
   contenu de `turn-worker.js`, puis *Deploy*.
4. Dans le Worker : *Settings* → *Variables and Secrets* → *Add*, type
   **Secret** :
   - `TURN_KEY_ID` : l'identifiant de clé de l'étape 2 ;
   - `TURN_KEY_API_TOKEN` : le jeton d'API de l'étape 2.
5. Noter l'adresse du Worker, du type
   `https://sportheads-turn.<compte>.workers.dev`.
6. Sur GitHub : dépôt → *Settings* → *Secrets and variables* → *Actions* →
   onglet **Variables** → *New repository variable* :
   `SPORTHEADS_TURN_URL` = l'adresse du Worker. Ce n'est pas un secret.
7. Relancer le déploiement (*Actions* → *Validate and deploy Pages* →
   *Run workflow*). Le journal de construction indique « with TURN fallback ».

Ne collez jamais la clé ou le jeton dans un message, un ticket ou un commit.
En cas de fuite, supprimer la clé dans *Realtime* → *TURN Server* et en créer
une autre.

## Vérifier

Ouvrir `https://sportheads-turn.<compte>.workers.dev` dans le navigateur doit
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
