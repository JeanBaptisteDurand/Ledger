# Upstream — the pull requests and issues we owe Ledger, ready to open

Everything here comes from `FEEDBACK.md`, with the exact file, line and reproduction. Nothing is opened yet:
`open.sh` does it under the GitHub account that runs it (`gh auth status` first), one item at a time, and prints
the URLs to paste into `FEEDBACK.md`.

| # | repository | kind | file here |
|---|---|---|---|
| 1 | `LedgerHQ/app-ethereum` (`client/`) | pull request, one line | `01-app-ethereum-client-chainid.md` + `.patch` |
| 2 | `LedgerHQ/device-sdk-ts` | issue, with reproduction | `02-device-sdk-ts-signmessage-non-ascii.md` |
| 3 | `LedgerHQ/device-sdk-ts` | issue | `03-device-sdk-ts-isblindsign-in-output.md` |
| 4 | `LedgerHQ/ledger-secure-sdk` | issue | `04-ledger-secure-sdk-6901-latch.md` |
| 5 | `LedgerHQ/speculos` | issue | `05-speculos-apdubridge-per-request.md` |
| 6 | `ethereum/ERCs` | pull request, three words | `06-ercs-erc7730-example-format.md` + `.patch` |
| 7 | `LedgerHQ/ledger-app-builder` | issue | `07-ledger-app-builder-latest-vs-master.md` |

Each `.md` is the title (first line) and the body (the rest), in the repository's language, English.
The two patches apply to the repositories' `master` as of 10 October 2026 (`git apply`).
