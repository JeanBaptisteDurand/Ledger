#!/usr/bin/env bash
# Opens the pull requests and issues of this folder under the GitHub account that runs it. Nothing runs without
# an explicit item: `upstream/open.sh 1` opens item 1, `upstream/open.sh all` opens them all. Needs `gh` logged in.
#
#   1  LedgerHQ/app-ethereum        PR   client: chain id >= 256         (patch)
#   2  LedgerHQ/device-sdk-ts       issue signMessage, non-ASCII
#   3  LedgerHQ/device-sdk-ts       issue isBlindSign in the output
#   4  LedgerHQ/ledger-secure-sdk   issue 0x6901 latch
#   5  LedgerHQ/speculos            issue APDUBridge per request
#   6  ethereum/ERCs                PR   ERC-7730 example formats         (patch)
#   7  LedgerHQ/ledger-app-builder  issue latest vs master
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${WORK:-/tmp/pds-upstream}"
mkdir -p "$WORK"
gh auth status >/dev/null

title() { head -1 "$HERE/$1"; }
body()  { tail -n +3 "$HERE/$1"; }

issue() {  # repo, file
  echo "== issue on $1 : $(title "$2")"
  gh issue create --repo "$1" --title "$(title "$2")" --body "$(body "$2")"
}

pr() {  # repo, file, patch, branch
  echo "== pull request on $1 : $(title "$2")"
  local dir="$WORK/$(basename "$1")"
  if [[ ! -d "$dir/.git" ]]; then
    gh repo fork "$1" --clone=false >/dev/null 2>&1 || true
    git clone --quiet --depth 1 "https://github.com/$1.git" "$dir"
  fi
  (
    cd "$dir"
    git checkout -q -b "$4" 2>/dev/null || git checkout -q "$4"
    git apply "$HERE/$3"
    git -c user.name="Jean-Baptiste Durand" -c user.email="130129090+JeanBaptisteDurand@users.noreply.github.com" \
      commit -q -a -m "$(title "$2")"
    local me; me="$(gh api user --jq .login)"
    git remote add fork "https://github.com/$me/$(basename "$1").git" 2>/dev/null || true
    git push -q fork "$4"
    gh pr create --repo "$1" --head "$me:$4" --title "$(title "$2")" --body "$(body "$2")"
  )
}

items=("$@")
[[ "${items[*]:-}" == "all" ]] && items=(1 2 3 4 5 6 7)
[[ ${#items[@]} -eq 0 ]] && { echo "usage: $0 <1..7|all>"; exit 2; }
for item in "${items[@]}"; do
  case "$item" in
    1) pr LedgerHQ/app-ethereum 01-app-ethereum-client-chainid.md 01-app-ethereum-client-chainid.patch fix/client-eip712-chainid ;;
    2) issue LedgerHQ/device-sdk-ts 02-device-sdk-ts-signmessage-non-ascii.md ;;
    3) issue LedgerHQ/device-sdk-ts 03-device-sdk-ts-isblindsign-in-output.md ;;
    4) issue LedgerHQ/ledger-secure-sdk 04-ledger-secure-sdk-6901-latch.md ;;
    5) issue LedgerHQ/speculos 05-speculos-apdubridge-per-request.md ;;
    6) pr ethereum/ERCs 06-ercs-erc7730-example-format.md 06-ercs-erc7730-example-format.patch fix/erc-7730-example-formats ;;
    7) issue LedgerHQ/ledger-app-builder 07-ledger-app-builder-latest-vs-master.md ;;
    *) echo "item inconnu : $item" >&2; exit 2 ;;
  esac
done
