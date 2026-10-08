#!/usr/bin/env bash
# PORTE DE SORTIE — la démonstration complète, en une commande.
#
#   1. un Ledger Flex émulé (Speculos) sert l'app Ethereum compilée avec les clés de test
#   2. le porteur lit et SIGNE le mandat sur l'appareil, en clair, avec NOS filtres
#   3. sur un fork de Base épinglé, l'agent achète seul — puis se fait piéger, et le coffre refuse
#
# Rien n'est envoyé à Ledger, rien n'est envoyé sur une vraie chaîne.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARE="${TARE_ROOT:-$ROOT/../ETH_Online_2026}"
DEPLOYER=0x00000000000000000000000000000000Dec0dE01
BLOCK="${FORK_BLOCK:-50614000}"
MANDATE="$ROOT/mandate.json"
SHOTS="$ROOT/captures"

[[ -n "${BASE_RPC_URL:-}" ]] || BASE_RPC_URL="$(grep -E '^BASE_RPC_URL=' "$TARE/.env" | cut -d= -f2-)"
[[ -n "$BASE_RPC_URL" ]] || { echo "BASE_RPC_URL manquant (env ou $TARE/.env)"; exit 1; }

say() { printf "\n\033[1m%s\033[0m\n" "$*"; }

say "0 · le coffre naîtra à une adresse connue d'avance"
VAULT="$(cast compute-address "0x00000000000000000000000000000000Dec0dE01" --nonce 0 | awk '{print $NF}')"
echo "    ExitVault = $VAULT   (c'est ce que l'appareil verra dans le domaine EIP-712)"

say "1 · le Ledger Flex émulé"
"$ROOT/ledger/speculos.sh" up

cleanup() { "$ROOT/ledger/speculos.sh" down >/dev/null 2>&1 || true; }
trap cleanup EXIT

say "2 · le porteur lit et signe le mandat SUR L'APPAREIL"
# Deux chemins vers l'appareil, une même signature : SIGNER=dmk (le Signer Kit de Ledger sur le DMK,
# avec notre context module — défaut si `ledger/dmk` est installé) ou SIGNER=python (client officiel).
# shellcheck disable=SC1091
[[ -f "$ROOT/.venv/bin/activate" ]] && . "$ROOT/.venv/bin/activate"
SIGNER_ARGS=(); [[ -n "${SIGNER:-}" ]] && SIGNER_ARGS=(--signer "$SIGNER")
SHOTS_DIR="$SHOTS" python3 "$ROOT/ledger/sign_mandate.py" --vault "$VAULT" --out "$MANDATE" "${SIGNER_ARGS[@]}"

say "3 · la scène, sur un fork de Base au bloc $BLOCK"
cd "$ROOT/contracts"
MANDATE_FILE="$MANDATE" forge test --match-contract LedgerSceneTest \
  --fork-url "$BASE_RPC_URL" --fork-block-number "$BLOCK" -vv

say "3 bis · la seconde instance : dix coffres ERC-4626 réels de Base, même mandat, même refus"
forge test --match-contract Vault4626Test --fork-url "$BASE_RPC_URL" --fork-block-number "$BLOCK" -vv 2>&1 \
  | grep -E "PASS|FAIL|coffre|bps|DEPOT|sur 10|Suite result" | grep -v "forge-lint"

say "4 · pour rejouer les chiffres seuls (les six pièges, les témoins, le mandat, les coffres)"
echo "    cd contracts && forge test --fork-url \$BASE_RPC_URL --fork-block-number $BLOCK -vv"
echo "    captures de l'appareil : $SHOTS/"
