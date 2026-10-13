# Upstream — the issues and the pull request we filed for Ledger, 13 October 2026

Everything here comes from `FEEDBACK.md`, with the exact file, line and reproduction. Filed on 13 October 2026, the
links are in the table below. `open.sh` is what opened them, under the GitHub account that runs it (`gh auth status`
first), one item at a time.

| # | repository | kind | file here |
|---|---|---|---|
| 1 | `LedgerHQ/app-ethereum` (`client/`) | already proposed: [#1114](https://github.com/LedgerHQ/app-ethereum/pull/1114), 12 October, the same one-line fix; we confirm it at chain 8453 | `01-app-ethereum-client-chainid.md` + `.patch` |
| 2 | `LedgerHQ/device-sdk-ts` | issue, with reproduction: [#1987](https://github.com/LedgerHQ/device-sdk-ts/issues/1987) | `02-device-sdk-ts-signmessage-non-ascii.md` |
| 3 | `LedgerHQ/device-sdk-ts` | issue: [#1988](https://github.com/LedgerHQ/device-sdk-ts/issues/1988) | `03-device-sdk-ts-isblindsign-in-output.md` |
| 5 | `LedgerHQ/speculos` | issue, with reproduction: [#685](https://github.com/LedgerHQ/speculos/issues/685) | `05-speculos-apdubridge-per-request.md` |
| 6 | `ethereum/ERCs` | pull request, three words: [#2069](https://github.com/ethereum/ERCs/pull/2069) | `06-ercs-erc7730-example-format.md` + `.patch` |

**Checked on 13 October 2026** against today's code (app-ethereum `5a48940`, device-sdk-ts `8528b2f`, speculos
`abc6b7d`, ERCs `c9f4e26`), with live runs on a separate Speculos. Two drafts were withdrawn then. The `0x6901`
"latch" in ledger-secure-sdk: the SDK refuses only the newcomer and releases once the app replies; what we saw was
Speculos crossing two clients' answers (item 5) and a prompt nobody answered. And ledger-app-builder "latest vs
master": both branches build on today's image; our failure came from a stale local tree.

Each `.md` is the title (first line) and the body (the rest), in the repository's language, English.
The patch of item 6 applies to ethereum/ERCs `master` (`c9f4e26`, 13 October, `git apply --check`); the one of
item 1 applies to app-ethereum `master`, and #1114 already carries the same change.
