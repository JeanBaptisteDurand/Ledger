# Mettre Net·Out en ligne

**<https://netout.tech>** sert le site entier et le banc derrière lui : la même chose que `scripts/site.sh` en local,
sur un serveur. Ce fichier dit comment c'est servi, ce qui a été vérifié de l'extérieur, et ce qui ne l'est pas.

## Où on en est (13 octobre 2026)

Le domaine pointe sur un VPS OVH (Ubuntu 26.04, 6 cœurs, 11 Go) que d'autres sites partagent déjà, derrière leur Caddy
en conteneur. Le certificat est celui de Let's Encrypt, obtenu et renouvelé par ce Caddy ; `www.netout.tech` redirige
vers `netout.tech`.

| ce qui tourne | où | comment |
|---|---|---|
| le front (Vite, construit) | `/home/ubuntu/netout/dist`, monté en lecture seule dans le conteneur Caddy | servi tel quel, toute route renvoyée vers `index.html` |
| le serveur du banc (`web/server.py`) | `127.0.0.1:8199` sur l'hôte | service systemd `netout-banc`, plafonné à 2,2 Go ; chemin du client par défaut (`PDS_SIGNER=browser`) |
| le relais Caddy → banc | prise Unix `/home/ubuntu/netout/sock/banc.sock` | `netout-banc-proxy.socket` et `systemd-socket-proxyd` |
| le fork de Base (anvil) | `127.0.0.1:8545` | lancé par le serveur à l'ouverture de la première session |
| la Flex émulée (Speculos) | `127.0.0.1:5013`, dans Docker | `ledger/speculos.sh up` ; le banc la relaie sous `/speculos` |
| le porteur automatique | rien, par défaut | `netout-porteur`, à démarrer pour une vidéo ou une démo sans personne |
| l'analyste et le stratège | l'API d'OpenAI, `gpt-4o-mini` | `PDS_LLM=openai` dans le service ; la clé dans `/home/ubuntu/netout/openai.env` (600), hors du dépôt |

Caddy envoie `/api/*`, `/speculos/*` et `/dist/*` au banc, le reste au front. **Aucun port n'est ouvert pour Net·Out**
et le pare-feu du serveur n'a pas été touché : Caddy joint le banc par un fichier, pas par le réseau. L'émulateur
n'écoute que sur la machine ; Internet ne le joint que par le relais du banc.

## Ce qui a été vérifié, de l'extérieur

Depuis une autre machine, sur `https://netout.tech`, avec Chromium headless :

- **Le parcours complet** (`FRONT_URL=https://netout.tech node front/scripts/parcours-app.mjs`, un porteur qui tape la
  Flex émulée à travers le relais `/speculos` du site) : connexion SIWE, coffre, dépôt signé sur l'appareil, bornes,
  mandat, un bot de pools, une dérogation signée et une laissée refusée, resondage et sortie, retrait, un bot de
  coffres arrêté, le volet Bots, déconnexion et retour, la porte des pages du compte. **Tout passe en 179 s**, sauf
  l'analyste (plus bas).
- **Le même parcours, à la main** (`APPROVER=page`) : aucun porteur ; chaque approbation est un geste de souris sur
  l'image de la Flex que la page montre, comme un juré la ferait. **Tout passe en 220 s, en 29 gestes**, sauf
  l'analyste. C'est ce test qui a montré que `/account` et `/trades` faisaient signer sans montrer la Flex : elle s'y
  affiche désormais, en bas à gauche, dès qu'une signature l'attend.
- **Les suites d'usage et d'appareil** (`FRONT_URL=https://netout.tech BENCH_SSH=vps-ovh`) : les trois chemins de
  signature, un refus sur l'appareil, deux onglets du même compte, le banc puis l'émulateur redémarrés sous la page,
  les mauvaises saisies, le menu sur téléphone, la remise à zéro. Tout passe, sauf les questions à l'analyste.
- **Les fonds seuls, à la main** (`PARCOURS=fonds APPROVER=page`) : connexion, dépôt, mandat, retrait. Tout passe en
  91 s, en 17 gestes.

## Une commande

```bash
scripts/deploy.sh          # construit le front, le copie, copie le code du banc, relance le banc, vérifie le site
scripts/deploy.sh front    # le front seul : le banc ne s'arrête pas
```

Le script ne copie jamais l'état du banc (comptes, sessions, clé MCP, journaux) ni un secret, et n'efface rien côté
serveur hors du dossier du front. Les fichiers que le serveur porte une fois pour toutes sont dans [`deploy/`](deploy/).

## La première installation

Ce qui a été fait sur le serveur, dans l'ordre, avec ce que le dépôt fournit :

```bash
# les outils : uv et Python 3.12 (le système a 3.14), foundry, node 22, l'image Speculos
python3 -m venv ~/uvenv && ~/uvenv/bin/pip install uv && ~/uvenv/bin/uv python install 3.12
mkdir -p ~/.foundry/bin && curl -sL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz | tar xz -C ~/.foundry/bin
sudo apt-get install -y nodejs npm python3-venv && docker pull ghcr.io/ledgerhq/speculos:latest

# le code : ce dépôt (scripts/deploy.sh), TARE à côté (le corpus des mesures), le client de l'app Ethereum épinglé
git clone https://github.com/JeanBaptisteDurand/ETH_Online_2026 ~/ETH_Online_2026   # + .env : BASE_RPC_URL seul, chmod 600
# + infra/speculos/apps/ethereum-flex-testkey.elf, l'app compilée avec la clé de test (ledger/build/build-flex.sh)
cd ~/Ledger/ledger/build && git clone --depth 1 -b stax_1.10.1_1.22.4_sdk_v26.6.2 https://github.com/LedgerHQ/app-ethereum.git
cd ~/Ledger && ~/uvenv/bin/uv venv --python 3.12 .venv
~/uvenv/bin/uv pip install --python .venv/bin/python ./ledger/build/app-ethereum/client -r ledger/requirements.txt
# puis les versions exactes du banc local (uv pip freeze), moins PyQt6, pygame et speculos : l'émulateur tourne dans Docker
(cd ledger/dmk && npm ci)

# le banc, sa prise, le porteur ; puis le bloc Caddy (deploy/Caddyfile.netout) et deux montages dans le conteneur Caddy :
#   /home/ubuntu/netout/dist:/usr/share/caddy:ro   et   /home/ubuntu/netout/sock:/run/netout
mkdir -p ~/netout/bin ~/netout/sock && cp deploy/banc.sh ~/netout/ && cp deploy/bin/claude ~/netout/bin/
sudo cp deploy/*.service deploy/*.socket /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now netout-banc netout-banc-proxy.socket
```

`deploy/banc.sh` lance le serveur avec le bon `PATH` : foundry, node, et en tête `deploy/bin/claude`, qui passe la main
au vrai CLI `claude` s'il est connecté sur le serveur, et le dit en une phrase sinon. En ligne, `PDS_LLM=openai` fait
passer l'analyste et le stratège par l'API d'OpenAI : la clé se pose dans `/home/ubuntu/netout/openai.env`
(`OPENAI_API_KEY=…`, droits 600), que le service lit.

## Cinq pièges déjà payés

1. **Le conteneur Caddy a un système de fichiers en lecture seule.** Un montage sur un point qui n'existe pas dans
   l'image (`/srv/netout`) empêche le conteneur de démarrer, et les autres sites tombent avec lui. Le front est donc
   monté sur `/usr/share/caddy`, qui existe dans l'image ; recréé, le conteneur servait de nouveau les autres sites en 5 s.
2. **Le pare-feu du serveur (ufw, politique DROP) bloque un conteneur qui appelle l'hôte.** `host.docker.internal`
   donnait une 502. Plutôt que d'ouvrir un port, le banc est joint par une prise Unix montée dans le conteneur.
3. **Docker publie ses ports par-dessus ufw.** Speculos publié sur `0.0.0.0:5013` était joignable d'Internet ;
   `ledger/speculos.sh` le publie désormais sur `127.0.0.1` (`BIND` pour changer).
4. **Le port 8099 de l'hôte était pris** par un autre service : le banc écoute sur 8199 (`PORT`).
5. **`pkill -f` reconnaît sa propre ligne de commande** quand on le passe par `ssh` : la session s'est coupée en
   pleine installation. Un motif comme `[a]nvil` ne se reconnaît pas lui-même.

## Vérifier de l'extérieur

```bash
curl -sI https://netout.tech | head -1                                         # HTTP/2 200
curl -s https://netout.tech/api/state | head -c 120                            # l'état du banc, en JSON
curl -s 'https://netout.tech/speculos/events?currentscreenonly=true' | head -c 120   # l'écran de la Flex émulée
FRONT_URL=https://netout.tech BENCH_SSH=vps-ovh node front/scripts/tests-usage.mjs  # les suites, en ligne
```

Pour une vidéo sans personne à la souris : `sudo systemctl start netout-porteur` sur le serveur, puis `stop`.

Pour repartir d'un fork neuf, aux nombres du README (Moonwell à 2 693 : chaque passage le fait baisser d'un ou deux
points) : « Start over » sur `/demo`, puis

```bash
ssh vps-ovh 'pkill -u ubuntu -f "[a]nvil --fork-url"; sudo systemctl restart netout-banc'
```

La prochaine ouverture de session relance le fork au bloc 50 614 000.

## Ce qui n'est pas fait

- **Une Flex par visiteur.** Il n'y en a qu'une, émulée : tous ceux qui la choisissent partagent le même porteur, donc
  le même compte, et elle signe une chose à la fois. Une vraie Ledger ouvre son propre compte.
- **La vraie Ledger en ligne** n'a pas été rejouée sur ce domaine. Elle demande Chrome, Edge ou Brave (WebHID) et l'app
  Ethereum compilée avec la clé de test. Le dépôt qu'elle signe est une vraie transaction Base, que le banc ne publie
  que sur le fork : elle resterait valable sur le réseau principal au même nonce. Tester avec une adresse sans ETH sur Base.
- **L'analyste et le stratège coûtent** : ils tournent sur la clé OpenAI posée sur le serveur, et chaque question d'un
  visiteur est payée par elle. Rien ne les plafonne encore. Sans clé, le stratège passe en repli déterministe et
  l'analyste dit qu'il ne peut pas tourner.
