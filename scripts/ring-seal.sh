#!/usr/bin/env bash
# Scelle la clé du MCP dans le Ledger Key Ring (LKRP), avec le `ring` CLI de l'Agent Stack.
#
#   scripts/ring-seal.sh            # scelle mcp/.mcp-key -> mcp/.mcp-key.ring
#   scripts/ring-seal.sh --wipe     # ... puis efface la clé en clair (le MCP déchiffrera au démarrage)
#   scripts/ring-seal.sh --status   # où en est le ring sur cette machine
#
# Ce que ça change : la clé qui ouvre les données de l'agent (le MCP, lecture seule) n'est plus un
# fichier en clair sur le disque ; elle est chiffrée (AES-256-GCM) sous une clé dérivée de la graine
# du porteur, partagée avec cette machine par le Key Ring Protocol, révocable depuis l'appareil.
#
# Ce que ça demande, honnêtement :
#   - `ring init` : UNE fois, un Ledger en USB (pas Speculos — wallet-cli est USB-only) ;
#   - `ring encrypt` / `ring decrypt` : plus d'appareil ensuite, mais le réseau (le trustchain LKRP
#     est restauré depuis les serveurs de Ledger).
# Sans ring, le MCP lit .mcp-key en clair et le dit dans son journal. Rien ne casse.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${WALLET_CLI:-$ROOT/ledger/dmk/node_modules/@ledgerhq/wallet-cli/bin/wallet-cli}"
KEY="$ROOT/mcp/.mcp-key"
SEALED="$ROOT/mcp/.mcp-key.ring"
RING_KEY_NAME="${RING_KEY_NAME:-porte-de-sortie-mcp}"   # doit être le même que dans ledger/walletcli.py

[[ -x "$W" ]] || { echo "wallet-cli introuvable ($W) — cd ledger/dmk && npm i"; exit 1; }

status() {
  "$W" ring keys --output json 2>/dev/null | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d.get("ok"): print("ring : initialisé —", json.dumps(d.get("data")))
else: print("ring :", d.get("error", {}).get("message", "?"))'
  [[ -f "$SEALED" ]] && echo "clé scellée : $SEALED" || echo "clé scellée : absente"
  [[ -f "$KEY" ]] && echo "clé en clair : $KEY" || echo "clé en clair : absente"
}

case "${1:-}" in
  --status) status; exit 0 ;;
esac

# 0. la clé en clair doit exister (le MCP la crée au premier appel)
[[ -f "$KEY" ]] || { . "$ROOT/.venv/bin/activate" 2>/dev/null || true; python3 "$ROOT/mcp/pds_mcp.py" --print-key >/dev/null; }

# 1. le ring, une fois, avec l'appareil
if ! "$W" ring keys --output json >/dev/null 2>&1 || ! "$W" ring keys --output json 2>/dev/null | grep -q '"ok":true'; then
  echo "[ring] non initialisé : branche le Ledger, déverrouille-le, et suis l'appareil (une fois)."
  "$W" ring init --name "porte-de-sortie-$(hostname -s)"
fi

# 2. sceller
"$W" ring encrypt --key "$RING_KEY_NAME" -i "$KEY" -o "$SEALED"
chmod 600 "$SEALED"
echo "[ring] scellé : $SEALED (clé « $RING_KEY_NAME »)"

# 3. vérifier qu'on retombe sur la même clé
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
"$W" ring decrypt --key "$RING_KEY_NAME" -i "$SEALED" -o "$TMP"
cmp -s "$KEY" "$TMP" && echo "[ring] déchiffrement vérifié : identique à la clé en clair" \
                     || { echo "[ring] ÉCHEC : le déchiffré diffère — on garde la clé en clair"; exit 1; }

if [[ "${1:-}" == "--wipe" ]]; then
  rm -f "$KEY"
  echo "[ring] clé en clair effacée — le MCP déchiffrera au démarrage (sans appareil, avec réseau)"
fi
status
