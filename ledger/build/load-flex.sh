#!/bin/bash
# Charge sur une Flex en USB l'app Ethereum 1.22.4 compilée avec la clé de test (CAL_TEST_KEY=1).
# Remplace l'app Ethereum installée (--delete). Appareil déverrouillé, Ledger Wallet fermé. Accepter sur l'écran.
set -e; cd "$(dirname "$0")/app-ethereum"
source ../../../.venv/bin/activate
exec python3 -m ledgerblue.loadApp --targetId 0x33300004 --targetVersion="" --apiLevel 26 --fileName bin/app.hex --appName "Ethereum" --appFlags 0xa00 --delete --tlv --dataSize $((0x`cat debug/app.map | grep _envram_data | tr -s ' ' | cut -f2 -d' ' |cut -f2 -d'x' ` - 0x`cat debug/app.map | grep _nvram_data | tr -s ' ' | cut -f2 -d' ' | cut -f2 -d'x'`)) --installparamsSize $((0x`cat debug/app.map | grep _einstall_parameters | tr -s ' ' | cut -f2 -d' ' |cut -f2 -d'x'` - 0x`cat debug/app.map | grep _install_parameters | tr -s ' ' | cut -f2 -d' ' |cut -f2 -d'x'`)) | grep "Application" | cut -f5 -d' ' > build/flex/bin/app.sha256
