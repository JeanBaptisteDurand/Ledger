#!/usr/bin/env bash
# Met le site en ligne, version statique : la scène, l'accueil (l'explication et la carte) et les portes de la démo et du compte,
# qui disent « the bench is not running » tant qu'aucun banc ne tourne derrière. Le banc complet (fork, Flex émulée, serveur)
# se lance sur une machine avec Docker, foundry et le venv : `scripts/site.sh`, puis un proxy nginx de /api, /speculos et /dist
# vers le port 8099 du banc.
#
#   scripts/deploy-static.sh                      # vers root@92.112.193.140:/var/www/netout/ (le VPS de TARE)
#   HOST=user@host DEST=/var/www/netout scripts/deploy-static.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-root@92.112.193.140}"
DEST="${DEST:-/var/www/netout}"
( cd "$ROOT/front" && [[ -d node_modules ]] || npm ci; [[ -f public/Ledger_Stax.fbx ]] || scripts/fetch-models.sh; npm run build )
ssh -o ConnectTimeout=15 "$HOST" "mkdir -p '$DEST'"
# jamais --delete sur /var/www : d'autres dossiers y vivent
rsync -az --exclude='.DS_Store' "$ROOT/front/dist/" "$HOST:$DEST/"
echo "[deploy] $HOST:$DEST ← front/dist (statique). nginx : root $DEST ; try_files \$uri /index.html ; proxy /api /speculos /dist → http://127.0.0.1:8099 si le banc tourne là."
