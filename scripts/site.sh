#!/usr/bin/env bash
# Le site en une commande : le banc (fork de Base, Flex émulée, serveur), le front, et au choix un porteur automatique.
#
#   scripts/site.sh              # banc + front, puis ouvre http://127.0.0.1:5173/connexion
#   PORTEUR=1 scripts/site.sh    # idem, plus un porteur automatique qui approuve les écrans de la Flex émulée
#                                # (une démo sans appareil : on clique, la Flex signe toute seule, 2 s par écran)
#   scripts/site.sh stop         # arrête le front, le serveur, le porteur (le fork et l'émulateur restent)
#
# Prérequis : README › Prérequis (le .venv, Docker, foundry, node). Les modèles 3D du héros sont téléchargés s'ils manquent.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
URL="http://127.0.0.1:5173/connexion"

if [[ "${1:-}" == "stop" ]]; then
  pkill -f "scripts/porteur.py" 2>/dev/null || true
  pkill -f "python3 web/server.py" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  echo "[site] front, serveur et porteur arrêtés — le fork (anvil) et la Flex émulée tournent encore"
  exit 0
fi

[[ -d .venv ]] || { echo "[site] pas de .venv : suivre README › Prérequis (python3 -m venv .venv && pip install -r requirements.txt)"; exit 1; }
# shellcheck disable=SC1091
. .venv/bin/activate

ledger/speculos.sh up

if ! pgrep -f "python3 web/server.py" >/dev/null; then
  nohup python3 web/server.py > /tmp/pds-web.log 2>&1 &
  echo "[site] serveur du banc lancé (journal : /tmp/pds-web.log)"
fi
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8099/api/state >/dev/null && break; sleep 1; done

( cd front
  [[ -d node_modules ]] || npm ci
  [[ -f public/Ledger_Stax.fbx && -f public/Ledger_Nano_X.fbx ]] || scripts/fetch-models.sh
  if ! pgrep -f "vite" >/dev/null; then
    nohup npm run dev > /tmp/pds-front.log 2>&1 &
    echo "[site] front lancé (journal : /tmp/pds-front.log)"
  fi )
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:5173/ >/dev/null && break; sleep 1; done

if [[ "${PORTEUR:-0}" == "1" ]] && ! pgrep -f "scripts/porteur.py" >/dev/null; then
  nohup python3 -u scripts/porteur.py 7200 2 > /tmp/porteur.log 2>&1 &
  echo "[site] porteur automatique lancé : la Flex émulée approuve chaque écran après 2 s (journal : /tmp/porteur.log)"
fi

echo "[site] $URL"
echo "[site] Flex émulée : « Emulated Flex (bench) » + « My Ledger · this browser », puis « Sign in with my Ledger »."
echo "[site] Vraie Ledger : « Real Ledger (USB) » dans Chrome, Edge ou Brave, Ledger Wallet fermé, l'app Ethereum ouverte."
command -v open >/dev/null 2>&1 && open "$URL" || true
