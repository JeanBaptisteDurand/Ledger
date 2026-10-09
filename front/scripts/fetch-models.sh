#!/bin/bash
# The hero's two device models are Ledger's own brand assets (https://brand.ledger.com/brand-design/3d-assets,
# "07 3d Assets" → Google Drive). They are not committed here (44 MB of binaries); fetch them into public/.
set -e; cd "$(dirname "$0")/../public"
get() { curl -sL -A "Mozilla/5.0" -o "$1" "https://drive.usercontent.google.com/download?id=$2&export=download&confirm=t"; head -c 18 "$1" | grep -q "Kaydara FBX" || { echo "échec : $1 n'est pas un FBX (quota Drive ?)"; exit 1; }; echo "ok  $1 ($(wc -c < "$1") octets)"; }
get Ledger_Nano_X.fbx 1QvKh1zFN4f7wb91lFGz7g_vryVhNPt13   # 5 374 032 octets
get Ledger_Stax.fbx   1cETwYqKdLMhZcwCdG8pEiFA66dRzxNff   # 38 982 848 octets
# get Ledger_Flex.fbx 1pFuDxZDqRJoN-341zqSlPSZCUz4NpMQq   # 75 914 496 octets — not used by the scene
