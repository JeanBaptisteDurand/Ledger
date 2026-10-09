#!/bin/bash
# Compile app-ethereum (1.22.4, tag épinglé) avec la clé de test (CAL_TEST_KEY=1) : l'app accepte alors nos descripteurs
# de clear signing. La même sortie sert l'émulateur (build/flex/bin/app.elf, que ledger/speculos.sh prend en premier)
# et une VRAIE Ledger Flex (bin/app.hex, chargé par load-flex.sh). Le client Python officiel est dans app-ethereum/client.
set -e; cd "$(dirname "$0")"
[ -d app-ethereum ] || git clone --depth 1 -b stax_1.10.1_1.22.4_sdk_v26.6.2 https://github.com/LedgerHQ/app-ethereum.git
(cd app-ethereum && git submodule update --init --recursive --depth 1)
docker run --rm -v "$PWD/app-ethereum:/app" -w /app ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder:latest \
  bash -c 'export BOLOS_SDK=$FLEX_SDK; echo "SDK $(cd $BOLOS_SDK && git describe --tags)"; make -j4 CAL_TEST_KEY=1 | tail -3; ls -la bin/'
echo "→ charger sur la Flex (déverrouillée, Ledger Wallet fermé, accepter sur l'écran) : ledger/build/load-flex.sh"
