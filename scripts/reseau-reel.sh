#!/usr/bin/env bash
# Le parcours des fonds sur un VRAI reseau (Base Sepolia d'abord), avec la Flex emulee et le porteur automatique :
# se connecter, deposer, signer le mandat, retirer. Les pools pieges et les coffres Morpho n'existent qu'en mainnet,
# donc rien d'autre. Il faut .env.live a la racine (cles neuves, a toi) et des ETH de test sur trois adresses :
# le deployeur, l'agent (dans .env.live) et l'adresse de l'appareil (la Flex emulee : 0xDad7..., graine de test).
#
#   scripts/reseau-reel.sh            # Speculos + porteur automatique, tout seul
#   APPAREIL=vrai scripts/reseau-reel.sh   # ta vraie Ledger : le banc attend, tu fais les gestes dans Chrome
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f .env.live ]] || { echo ".env.live manquant (PDS_NETWORK, BASE_RPC_URL, PDS_DEPLOYER_KEY, PDS_AGENT_KEY, PDS_AGENT_ADDRESS)"; exit 2; }
set -a; . ./.env.live; set +a
[[ "${PDS_NETWORK:-}" == "live" ]] || { echo "PDS_NETWORK doit valoir live"; exit 2; }
. .venv/bin/activate
echo "== chaîne $(cast chain-id --rpc-url "$BASE_RPC_URL") · déployeur $(cast wallet address --private-key "$PDS_DEPLOYER_KEY") : $(cast balance --rpc-url "$BASE_RPC_URL" --ether "$(cast wallet address --private-key "$PDS_DEPLOYER_KEY")") ETH · agent $PDS_AGENT_ADDRESS : $(cast balance --rpc-url "$BASE_RPC_URL" --ether "$PDS_AGENT_ADDRESS") ETH"
pkill -f "web/server.py" >/dev/null 2>&1 || true; pkill -f porteur.py >/dev/null 2>&1 || true; sleep 1
python3 web/server.py > /tmp/pds-live-server.log 2>&1 &
for _ in $(seq 30); do curl -sf http://127.0.0.1:8099/api/state >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:5173/ >/dev/null || { (cd front && npm run dev > /tmp/pds-live-vite.log 2>&1 &); for _ in $(seq 30); do curl -sf http://127.0.0.1:5173/ >/dev/null && break; sleep 1; done; }
if [[ "${APPAREIL:-speculos}" == "vrai" ]]; then
  echo "== le banc est en mode réseau réel sur http://127.0.0.1:5173 : choisis « Vraie Ledger (USB) », connecte-toi, dépose, signe, retire."
  exit 0
fi
FORCE=1 ledger/speculos.sh up
echo "== adresse de la Flex émulée : $(python3 -c "import sign_mandate as sm; print(sm.device_address())" 2>/dev/null || echo '?') — elle doit avoir des ETH de test pour le dépôt"
python3 scripts/porteur.py 900 2 > /tmp/pds-live-porteur.log 2>&1 &
(cd front && PARCOURS=fonds node scripts/parcours-app.mjs /tmp/pds-live-captures) ; rc=$?
pkill -f porteur.py >/dev/null 2>&1 || true
exit $rc
