#!/usr/bin/env bash
# Met le site en ligne, version statique : la scène, l'accueil (l'explication et la carte) et les portes de la démo et du compte,
# qui disent « the bench is not running » tant qu'aucun banc ne tourne derrière. Le banc complet (fork, Flex émulée, serveur)
# se lance sur une machine avec Docker, foundry et le venv : `scripts/site.sh`.
#
# En ligne : https://netout.tech, servi par le Caddy du VPS OVH (51.91.78.204). Le bloc `netout.tech` de son Caddyfile
# monte ce dossier (volume /home/ubuntu/netout/dist → /usr/share/caddy, lecture seule), renvoie toute route vers index.html,
# et relaie /api, /speculos et /dist vers host.docker.internal:8199 — le port du banc s'il tourne un jour sur l'hôte
# (`PORT=8199 scripts/site.sh`, 8099 y étant pris).
#
#   scripts/deploy-static.sh                      # vers vps-ovh:/home/ubuntu/netout/dist/
#   HOST=user@host DEST=/chemin scripts/deploy-static.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-vps-ovh}"
DEST="${DEST:-/home/ubuntu/netout/dist}"
( cd "$ROOT/front" && { [[ -d node_modules ]] || npm ci; }; [[ -f public/Ledger_Stax.fbx ]] || scripts/fetch-models.sh; npm run build )
ssh -o ConnectTimeout=15 "$HOST" "mkdir -p '$DEST'"
# --delete seulement sur ce dossier à nous, jamais plus haut
rsync -az --delete --exclude='.DS_Store' "$ROOT/front/dist/" "$HOST:$DEST/"
echo "[deploy] $HOST:$DEST ← front/dist (statique). Caddy sert ce dossier sur https://netout.tech ; /api, /speculos, /dist → le banc sur le port 8199 de l'hôte s'il tourne."
