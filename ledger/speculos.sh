#!/usr/bin/env bash
# Lance (ou arrête) un Ledger Flex émulé servant l'app Ethereum compilée avec les clés de TEST.
#   ledger/speculos.sh up     -> http://127.0.0.1:5013
#   ledger/speculos.sh down
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARE="${TARE_ROOT:-$ROOT/../ETH_Online_2026}"
# L'app : d'abord celle que ledger/build/build-flex.sh compile ici (1.22.4 epinglee, cle de test, la meme que pour
# une vraie Flex) ; sinon celle que TARE a compilee a cote.
OURS="$ROOT/ledger/build/app-ethereum/build/flex/bin/app.elf"
APPS="$TARE/infra/speculos/apps"
ELF="${ELF:-$([[ -f "$OURS" ]] && echo "$OURS" || echo "$APPS/ethereum-flex-testkey.elf")}"
PORT="${PORT:-5013}"
NAME="${NAME:-pds-speculos}"
IMAGE="${SPECULOS_IMAGE:-ghcr.io/ledgerhq/speculos:latest}"

case "${1:-up}" in
  up)
    [[ -f "$ELF" ]] || { echo "[speculos] $ELF absent — compile d'abord : ledger/build/build-flex.sh (Docker, ~5 min)"; exit 1; }
    # Idempotent : un Flex déjà en marche et joignable n'est pas relancé (une session DMK — le navigateur
    # du porteur, par exemple — y est peut-être ouverte). FORCE=1 pour repartir d'un état neuf.
    if [[ -z "${FORCE:-}" ]] && docker ps --format '{{.Names}}' | grep -qx "$NAME" \
       && curl -sf "http://127.0.0.1:$PORT/events?currentscreenonly=true" >/dev/null 2>&1; then
      echo "[speculos] Flex déjà prêt sur http://127.0.0.1:$PORT (app : $(basename "$ELF")) — non relancé"
      exit 0
    fi
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --rm --name "$NAME" -p "$PORT:5000" -v "$(dirname "$ELF"):/apps" "$IMAGE" \
      --model flex --display headless --api-port 5000 --log-level apdu:DEBUG ${SPECULOS_LOG:-} "/apps/$(basename "$ELF")" >/dev/null
    for _ in $(seq 40); do curl -sf "http://127.0.0.1:$PORT/events?currentscreenonly=true" >/dev/null && break; sleep 0.25; done
    echo "[speculos] Flex prêt sur http://127.0.0.1:$PORT (app : $(basename "$ELF"))"
    ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 && echo "[speculos] arrêté" || echo "[speculos] rien à arrêter" ;;
  *) echo "usage: $0 {up|down}" >&2; exit 2 ;;
esac
