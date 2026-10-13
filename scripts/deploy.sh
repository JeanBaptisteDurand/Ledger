#!/usr/bin/env bash
# Met Net·Out en ligne sur le serveur de https://netout.tech : le front construit, le code du banc, puis le banc relancé.
#
#   scripts/deploy.sh             # le front et le banc
#   scripts/deploy.sh front       # le front seul (statique : le banc ne s'arrête pas)
#   HOST=user@host scripts/deploy.sh
#
# Ce que le serveur porte une fois pour toutes (Caddy, systemd, la prise Unix, le venv, foundry, Speculos) : DEPLOY.md
# et le dossier deploy/. Ce script ne copie jamais l'état du banc (comptes, sessions, clé MCP, journaux) ni un secret,
# et n'efface rien côté serveur hors du dossier du front, qui est à nous seuls.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-vps-ovh}"
APP="${APP:-/home/ubuntu/Ledger}"
DIST="${DIST:-/home/ubuntu/netout/dist}"
SITE="${SITE:-https://netout.tech}"

( cd "$ROOT/front" && { [[ -d node_modules ]] || npm ci; }; [[ -f public/Ledger_Stax.fbx ]] || scripts/fetch-models.sh; npm run build )
ssh -o ConnectTimeout=15 "$HOST" "mkdir -p '$DIST'"
rsync -az --delete --exclude='.DS_Store' "$ROOT/front/dist/" "$HOST:$DIST/"
echo "[deploy] front → $HOST:$DIST"
if [[ "${1:-}" == "front" ]]; then exit 0; fi

rsync -az --exclude-from=- "$ROOT/" "$HOST:$APP/" <<'LIST'
.git/
.venv/
node_modules/
__pycache__/
front/
captures/
ledger/build/
accounts/
mandate.json
mcp/.mcp-key
agent/watch.jsonl
agent/notifications.jsonl
.env
.env.*
*.log
.DS_Store
LIST
echo "[deploy] banc → $HOST:$APP (sans état ni secret)"
ssh "$HOST" "sudo -n systemctl restart netout-banc && sleep 3 && systemctl is-active netout-banc"
for _ in $(seq 1 20); do curl -sf -m 5 "$SITE/api/state" >/dev/null && { echo "[deploy] $SITE : le site et le banc répondent"; exit 0; }; sleep 1; done
echo "[deploy] $SITE/api/state ne répond pas : journalctl -u netout-banc sur le serveur" >&2; exit 1
