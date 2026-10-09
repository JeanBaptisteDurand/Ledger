---
name: porte-de-sortie
description: Exit-bounded mandates for autonomous agents — an agent may take any position it cannot be trapped in, on Uniswap v4 pools and on ERC-4626 vaults (real Morpho WETH vaults on Base). Ask the analyst (answers only from read-only MCP tools), read what the agent decided and why, check whether each position can still be exited (the vault door: maxWithdraw vs position), propose a mandate from a sentence, and have the owner read and sign it on a Ledger through the Signer Kit (DMK) or the official APDU client. Use alongside `ledger-wallet-cli`: wallet-cli shows the way in (yields, balances, deposit); porte-de-sortie measures the way out.
---

# porte-de-sortie

Uniswap v4 on Base (pinned fork, block 50 614 000). Device: Ledger Flex — Speculos for the bench, USB for the real thing.

Run from repo root. Python tools need `. .venv/bin/activate`; Ledger JS tools live in `ledger/dmk` (`npm i` once).

> **Read-only first.** The MCP (`mcp/pds_mcp.py`) never signs, never sends, never launches anything. It serves the data
> that led to each decision and the data needed to analyse positions. Every tool call needs `key` (or `PDS_MCP_KEY`).
> The master key is read from the Ledger Key Ring when sealed (`scripts/ring-seal.sh`), else from `mcp/.mcp-key`;
> **each account has its own key**, derived (`HMAC-SHA256(master, address)`), never stored, that opens only that
> account's files (`PDS_ACCOUNT`, `PDS_JOURNAL`, `PDS_MANDATE`, `PDS_BOTS`) — the bench hands it out under **mon compte**.

> **The device decides, not the agent.** The agent holds a session key and can only call the vault. The vault enforces
> the mandate the owner signed on the Ledger: budget, maximum round-trip loss, expiry. Anything outside comes back to
> the owner as a one-shot exception to read and sign — or refuse.

> **Device contention.** One client at a time — a browser tab of the bench counts as one (FEEDBACK § 8). Never run two device commands in parallel (Signer Kit, `sign_mandate.py`, `wallet-cli`
> device commands). Run sequentially. `--auto` drives the **Speculos** screen only; on USB the owner taps.
> A **live DMK session keeps a heartbeat** (`b001000000` every few seconds): an open bench page in "ma Ledger ·
> navigateur" mode, or any other DMK client, will corrupt a server-side signing in flight (status `0x6901`
> observed). The page disconnects its session when the signer is server-side; do the same in your own tools.

> **Ambiguous requests — ask, don't guess.** No budget, no tolerance, no duration → ask. A mandate is signed once and
> the agent runs alone inside it.

---

## Intent map

| User says | Command |
| --- | --- |
| "what did the agent buy and why", "show me the decisions" | MCP `operations`, `decision(tick)` |
| "what do we hold", "how much budget is left" | MCP `positions`, `mandate` |
| "can we still get out of X", "has the exit closed" | `python3 agent/watch.py` (report) · `--sell-if <bps>` to exit while we still can |
| "what did the hook take", "is this hook honest" | MCP `hook_analysis(tick)` — TARE counterfactual, entry and exit, replayed live |
| "why can't the agent see the trap before buying" | MCP `universe_facts`, `compare_entry_exit` |
| "what does Ledger Earn show about a vault", "does Earn tell me about withdrawal" | MCP `ledger_earn_yields` (wraps `wallet-cli earn yields`, no device) |
| "propose a strategy", "1 WETH, cautious, memecoins on Base" | `python3 web/strategist.py "<sentence>"` → bounded mandate JSON (Claude Agent SDK via `claude -p`) |
| "compile the clear-signing descriptors for this vault" | `python3 ledger/compile_descriptor.py --kind mandate --vault <addr> --out ledger/dmk/descriptors/mandate.json` |
| "sign the mandate on the Ledger" (Signer Kit) | `python3 ledger/sign_mandate.py --vault <addr> --signer dmk [--usb]` |
| "sign the mandate on the Ledger" (official APDU client) | `python3 ledger/sign_mandate.py --vault <addr> --signer python` |
| "sign this typed data through the Signer Kit, raw" | `node ledger/dmk/sign_typed_data.cjs --typed-data x.json --descriptor d.json [--speculos URL \| --usb] [--auto]` |
| "show what a stock integration does without descriptors" | same, with `--blind` — the device refuses (0x6a80) while blind signing is off; the kit's report says `device_rejected_context` |
| "ask the analyst", "why was tick 2 refused", "explain what happened" | `python3 agent/analyst.py "<question>"` — answers **only** from MCP tool results, names the tool behind each number |
| "which vaults have a closed door today", "can Moonwell's depositors exit" | MCP `vault_openness` (ten real Morpho WETH vaults on Base: real round trip + top-holder door) |
| "run the yield agent on ERC-4626 vaults" | `python3 agent/vaults.py --ticks 4` (picks by advertised APY/size/listing — never sees the door) |
| "add a bot", "start a bot every minute", "stop that bot", "what did my bots do" | bench → **mes bots**: name, universe (pools / coffres), ticks per round, rhythm (one round, 30 s, 60 s, 5 min) → **ajouter et lancer**; **arrêter** on a live bot, **relancer** on a stopped one; the history keeps every stopped bot with its outcome. API: `POST /api/bots {name, universe, ticks, interval_s}`, `/api/bots/stop {id}`, `/api/bots/restart {id}`. All bots of an account share the vault and the signed mandate; rounds run one at a time per account (one session key, one journal); every journal line carries the bot |
| "leave it refused", "no, don't sign that one" | bench → **laisser refusé** on the out-of-bounds card (`POST /api/escalate_no`): the request is closed without a signature, the refusal is remembered (no bot re-proposes that position), and the next queued request, if any, takes its place |
| "which bot took this position", "show me the bots" (MCP) | tools `bots` (live and stopped, rounds, buys/refusals, exceptions, spend, refusal reasons, positions) and `operations(bot=<name>)`; `positions` rows carry `bot` |
| "log in with my Ledger", "connect my Ledger to the site" | bench header → **se connecter avec ma Ledger** (EIP-4361 Sign-In with Ethereum, signed in the browser via the Signer Kit + WebHID; the server verifies with `cast wallet verify`) — or, with a bench-side signer, the address read on the device (`/api/login_device`). One account = one proven address = `accounts/<address>/` (profile, mandate, journal, notifications, events) |
| "my MCP key", "the config to paste into Claude", "what did I do on the site" | bench → **mon compte** (`/api/account`, `?reveal=1` for the key): derived key, ready-to-paste `mcpServers` config bound to that account's files, and the event log (login, session, strategy, mandate_signed, run, run_done, notified, exception_signed, watch, analysis) |
| "who does what", "show me the architecture" | http://127.0.0.1:8099/schema.html — the agents, the tools, and the three bricks of the brief on one page |
| "sign on MY Ledger, in my browser" (SaaS path) | bench → **ma Ledger · navigateur**, then **USB (WebHID)** (a real Ledger, Chromium browsers) or **émulée (banc)** (the emulator through the `/speculos/*` same-origin proxy); the page signs what the server parks in `pending` and posts it to `/api/signed` |
| "rebuild the browser bundle" | `cd ledger/dmk && npm run build:web` → `web/dist/ledger-web.js` |
| "notify me when a buy is out of bounds" | start the bench with `PDS_NOTIFY_URL=<webhook>`; every escalation is POSTed there and appended to `agent/notifications.jsonl` |
| "the device says 0x6980 / nothing signs anymore" | the Ethereum app is stuck in `SIGNING_MESSAGE` after an aborted `signMessage` (FEEDBACK § 7): Speculos → `FORCE=1 ledger/speculos.sh up`; real Flex → quit and reopen the app |
| "0x6901 on everything", "the signature died while the screen was still up" | a **second client** talked to the app during a pending command (FEEDBACK § 8): a forgotten tab of the bench logged into the same account, a second DMK instance, a wallet polling. Close it; Speculos → `FORCE=1 ledger/speculos.sh up`. The page binds each pending signature to the tab that asked for it, and signing sessions run without the DMK's 1 s refresher |
| "use a real Ledger Flex", "install the test app on the device" | `ledger/build/build-flex.sh` (app-ethereum 1.22.4, `CAL_TEST_KEY=1`, Docker) then `ledger/build/load-flex.sh` (`ledgerblue.loadApp`, API level 26, **replaces the device's Ethereum app**; device unlocked, Ledger Wallet closed, accept *Allow unsafe manager* and the install on the screen). Then `--usb` on the Python/Node paths, or **USB (WebHID)** in the bench (Chrome, Ledger Wallet closed). Reinstall the official app from Ledger Wallet afterwards. `ledgerctl list` / `info` to check the device (venv: `ledgerwallet`, `ledgerblue`) |
| "run the whole demo" | `scripts/demo.sh` (`SIGNER=dmk` or `python`) |
| "open the bench" | `python3 web/server.py` → http://127.0.0.1:8099 |
| "seal the MCP key in the Key Ring" | `scripts/ring-seal.sh` (one-time `ring init` needs a Ledger on USB) |
| "run the contract tests" | `cd contracts && forge test --fork-url $BASE_RPC_URL --fork-block-number 50614000 -vv` |

## What the mandate is

EIP-712 `ExitMandate { agent, budgetToken, budgetAmount, maxRoundTripLossBps, expiry, nonce }`, domain `ExitVault/1`
on chain 8453, verified on-chain by `ecrecover`. On the device: `Contract · Exit mandate`, `Network · Base`,
`Agent`, `Budget · 1 WETH`, `Max round-trip loss (bps) · 300`, `Expires · <date>`. Only these three numbers bind;
slice size, tick count and risk profile guide the agent without binding it.

`ExitException { agent, budgetToken, poolKeyHash, amountIn, seenExitBps, expiry, nonce }` is the one-shot override:
one pool, one amount, **the exit cost the owner read on the screen**. If the exit got worse since, the vault refuses it
(`ExitWorseThanSeen`).

## Ledger pieces used, by name

- `@ledgerhq/device-management-kit` 1.9.1, `@ledgerhq/device-signer-kit-ethereum` 1.18.1 (`SignerEthBuilder`,
  `signTypedData`), `@ledgerhq/device-transport-kit-speculos` 1.2.1, `@ledgerhq/device-transport-kit-node-hid` 1.0.1;
- a custom `ContextModule` (`ledger/dmk/sign_typed_data.cjs`) that serves our compiled descriptors and keeps the kit's
  blind-signing report local instead of posting it to Ledger;
- `ledger-app-clients.ethereum` (the official Python client) for the APDU path and for **signing the descriptors** with
  the CAL test key (`cal.pem`) — the device runs app-ethereum 1.22.4 built with `CAL_TEST_KEY=1`;
- `@ledgerhq/wallet-cli` 2.1.0: `earn yields` (read), `ring init/encrypt/decrypt` (Key Ring, LKRP).

## Safety rules

- Never pass `--auto` against a USB device; never script a "Hold to sign" on real hardware.
- Never call `wallet-cli send`, `earn deposit`, `earn withdraw`, `swap execute` from this skill: the agent does not
  move funds through wallet-cli — only through the vault, under the mandate.
- The MCP key is a secret. Print it only on explicit request (`python3 mcp/pds_mcp.py --print-key`).
