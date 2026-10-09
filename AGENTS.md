# AGENTS.md — porte-de-sortie

For coding agents working in this repository. The user-facing skill is [SKILL.md](SKILL.md) (Ledger `skill` format).

## What this is

An agent may take **any position it cannot be trapped in**. The owner signs one EIP-712 mandate on a Ledger
(budget, maximum round-trip loss in bps, expiry); an `ExitVault` contract enforces it on every entry by probing the
exit in the same transaction (`probeExit` → `revert CannotExit`). Out-of-bounds cases come back to the owner as a
one-shot `ExitException` to read and sign on the device. Two instances, same mandate, same refusal: Uniswap v4 swaps
(six real traps on Base) and ERC-4626 vaults (ten real Morpho WETH vaults on Base — `vaultExitLossBps` = real
deposit/redeem round trip, plus the top depositor's door `maxWithdraw` vs `convertToAssets`).

## Layout

| path | what |
| --- | --- |
| `contracts/src/ExitVault.sol` | the vault: mandate/exception verification, exit probe, buy/sell, holdability probe |
| `contracts/test/*.t.sol` | 32 tests, 7 suites; `LedgerScene.t.sol` replays a device-signed `mandate.json` |
| `agent/agent.py` | the DCA agent (session key `anvil #1`); scores depth/entry/registry, **never sees the exit** |
| `agent/counterfactual.py` | TARE: hook bytecode swapped for an 89-byte stub, quoted twice, live |
| `agent/vaults.py` | the yield agent: ten real Morpho WETH vaults on Base (seed + API refresh), picks by advertised APY — never sees the door |
| `agent/analyst.py` | **the real agent**: `claude -p` + our read-only MCP only (`--strict-mcp-config`); answers from tool results, cites tools |
| `agent/watch.py` | re-probes held positions (pools and vaults: our door and the top holder's); `--sell-if` exits while still possible |
| `contracts/test/Vault4626.t.sol` | 6 tests on real vaults: Moonwell refused (door 2 693 bps), five full (`AllCapsReached`), enter/exit/exception |
| `ledger/sign_mandate.py` | EIP-712 payloads (`build_mandate`, `build_exception`), filters, APDU path, Speculos driver |
| `ledger/compile_descriptor.py` | compiles + signs our clear-signing descriptors with the CAL **test** key |
| `ledger/signers.py` | one entry point, two paths: `dmk` (Signer Kit) / `python` (APDU client) |
| `ledger/dmk/sign_typed_data.cjs` | DMK + Signer Kit ETH + Speculos/USB transport + our `ContextModule` |
| `ledger/walletcli.py` | `@ledgerhq/wallet-cli` wrapper: `earn yields`, Key Ring status/decrypt |
| `mcp/pds_mcp.py` | read-only MCP (stdio JSON-RPC 2.0), 10 tools (incl. `bots`; `operations(bot=…)`, `decision(seq|tick,kind)`); master key from Key Ring or file, **per-account key** = `HMAC-SHA256(master, address)` when `PDS_ACCOUNT` is set (`PDS_JOURNAL`, `PDS_MANDATE`, `PDS_BOTS` point at that account's files) |
| `web/server.py`, `web/index.html`, `web/strategist.py` | the bench on :8099, **one state per account** (cookie session → `accounts/<address>/`); strategist = `claude -p`; three signing paths (`dmk`, `python`, `browser`); login by SIWE (`/api/siwe/*`) or by the bench device (`/api/login_device`); `/api/account` (profile, derived key, MCP config, events); `/api/descriptor`, `/api/signed` (each pending signature carries a `token`: only the tab that asked signs it); same-origin Speculos proxy `/speculos/*` (SSE relayed; `PDS_PROXY_LOG=<file>` traces every APDU); webhook `PDS_NOTIFY_URL` |
| `web/accounts.py` | accounts: address → directory, derived MCP key, profile, event log (`events.jsonl`), sessions |
| `web/server.py` (bots) | named execution bots per account: `bots.json`, one scheduler thread per account (`ensure_scheduler`) running rounds **one at a time** (one session key, one journal; never while a signature is pending), `run_round` → `agent.py`/`vaults.py` with `PDS_BOT`, routes `POST /api/bots`, `/api/bots/stop`, `/api/bots/restart`; a bot ends by itself after one round (`interval_s = 0`), when the budget is spent, the mandate expired, or nothing new is left to try. Out-of-bounds requests from several bots queue (`escalation_queue`), one on the device at a time; `escalate_no` (« laisser refusé ») closes the current one and remembers the refusal (`refused_escalations`, rebuilt from `events.jsonl`) so no bot re-proposes that position |
| `web/schema.html` | one page: the agents, the tools, the three bricks of the brief (`/schema.html`) |
| `scripts/parcours.mjs` | the whole browser journey, end to end, in headless Chromium (SIWE → vault → mandate → pools → exception → watch → vaults → exception → analyst → account → device login) |
| `ledger/dmk/src/ledger-web.js` → `web/dist/ledger-web.js` | the Signer Kit **in the browser** (DMK + WebHID or Speculos-through-proxy, our context module); `npm run build:web` (esbuild) |
| `ledger/dmk/repro_signmessage_bug.cjs` | reproduces FEEDBACK § 7: `signMessage` > ~229 bytes → header-only APDU, app stranded in `SIGNING_MESSAGE` |
| `scripts/demo.sh`, `scripts/ring-seal.sh` | full CLI demo; seal the MCP key in the Ledger Key Ring |
| `FEEDBACK.md` | DX feedback for Ledger Dev Rel, every claim with a file and a line |
| `FRONT.md` | the front-end brief (French): every screen, element, state, route and data shape — the contract a new front must honour |

## Commands

```bash
. .venv/bin/activate                       # Python: requests + ledger-app-clients.ethereum (see ledger/requirements.txt)
(cd ledger/dmk && npm i)                   # DMK 1.9.1, Signer Kit 1.18.1, transports, wallet-cli 2.1.0
ledger/speculos.sh up                      # Flex on http://127.0.0.1:5013, app-ethereum 1.22.4 built with CAL_TEST_KEY=1
python3 web/server.py                      # bench on :8099
scripts/demo.sh                            # Speculos → signed mandate → LedgerScene on a Base fork
cd contracts && forge test --fork-url $BASE_RPC_URL --fork-block-number 50614000 -vv
```

## Rules for agents editing this repo

- **Numbers must have a command.** Anything stated in README/FEEDBACK (bps, versions, block, line numbers) must be
  reproducible from a file or command in this repo. Do not round up.
- **One device client at a time.** Speculos and USB devices reject interleaved APDUs, and a second client during a
  pending command strands the app (`0x6901`, FEEDBACK § 8). A bench tab left open in *any* browser — including the
  Playwright MCP's Chrome — is a client: close it before device tests.
- **Do not widen the vault.** One vault per agent; no `depositAndSetMandate`, no 7702 — these are deliberately
  parked (see `ledger/FINAL-STACK.md` in the parent notes).
- **Keep the MCP read-only.** No tool may sign, send, or launch a process that changes chain state — it lists bots, it
  never starts or stops one.
- **One round at a time per account.** Bots share one session key and one journal: rounds are serialized by the
  account's scheduler and never overlap a pending signature. Agents skip what the account already holds and what
  the same bot already tried (`PDS_BOT`), so a bot advances through its universe instead of retrying a refusal.
- **French in user-facing text and comments, English in `FEEDBACK.md`, `SKILL.md`, `AGENTS.md`** (their readers are
  Ledger Dev Rel and coding agents). No non-ASCII in Solidity string literals.
- **Git**: author/committer is the repository owner only; do not add tool trailers. Commit only when asked.
