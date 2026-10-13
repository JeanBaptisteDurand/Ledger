# Net·Out

**An agent cannot enter a position it cannot net out.**

Built by **Jean-Baptiste Durand** and **Florent Belotti** · 42Blockchain, École 42 Paris · for the **Ledger N3XT** hackathon, October 2026.

**Live demo: <https://netout.tech>** · **Video: <https://youtu.be/8AGHwGirckI>**

Plug in your **real Ledger** over USB (Chrome, Edge or Brave): it signs in, deposits, signs the mandate, each exception
and the withdrawal, everything read in clear on the device. No Ledger at hand? The site also ships a Ledger Flex in the
browser (Speculos, same Ethereum app): click **Sign in with the emulated Flex** and sign with the mouse (a click taps, a
drag to the left turns the page, a long press signs). Behind it, a fork of Base mainnet pinned at block 50,614,000.

![The Net·Out system on one sheet: the holder's Ledger signs the sign-in, the deposit, the mandate, each exception and the withdrawal through Ledger's Signer Kit in the browser; the server runs the bots; the ExitVault contract measures the exit inside every entry with TARE's counterfactual; the analyst reads ten read-only MCP tools](captures/site/schema.png)

## The problem

Agent policies bound what an agent **spends**: a daily cap, an allow-list, a maximum slippage. Nothing bounds what it
can **get back**: a token whose hook blocks the resale, a yield vault you only leave after a seven-day queue.

On Base it is not hypothetical. Across **125,072 measurements** of Base's long tail of WETH pools, **six real Uniswap v4
pools let you in for 0 bps and take 9,990 bps on the way out**; before buying they look like 77 healthy pools. On the
yield side, at the block we measured, **Base's largest WETH vault had 27 % of its largest depositor's position locked**,
and five of ten real ERC-4626 vaults refused even the deposit.

## What it does

The holder signs a mandate **once**, on their Ledger: a budget, a tolerated round-trip loss in basis points, an expiry,
read in clear on the screen. A contract in their name, [`ExitVault`](contracts/src/ExitVault.sol), applies it at
**every** entry: it buys, simulates the full resale in the same transaction, and reverts if the exit costs more than the
mandate allows. For an ERC-4626 vault it performs the real deposit and redemption, reverted, and reads the door.

What overflows comes back to the device **with the number**: the holder reads the real exit cost and signs a single-use
exception, or leaves it refused. Funds leave the Ledger as one ETH transfer and come back on a withdrawal authorisation
read in clear. After the purchase, a watcher re-probes every position and exits while it still can.

> **The agent** chooses which position, when and how much, inside the mandate.
> **The human** signs once, on the Ledger.
> **The contract** applies it at every purchase. To change the rule, you go back to the device.

## The measure: TARE

The exit is measured by [**TARE**](https://github.com/JeanBaptisteDurand/ETH_Online_2026), our ETHOnline 2026
instrument (**finalist, Uniswap Foundation prize "Best Uniswap Stack Contribution"**). On a fork, `anvil_setCode`
replaces a hook's bytecode with 89 inert bytes and quotes the same swap twice: the gap is what the hook takes, on the way
in and on the way out. Here it runs inside the vault at every entry, in the watcher, and live in the TARE panel of the
demo.

## Ledger's four bricks

| Brick | Role |
|---|---|
| **Signer Kit + DMK** (1.18.1 / 1.9.1) | In the holder's browser, over WebHID or Speculos: Sign-In with Ethereum, the deposit, the mandate, each exception, the withdrawal. Never a purchase. |
| **Clear signing** (ERC-7730) | Our descriptors for the mandate, the exception and the withdrawal, served by our own context module: the device shows every field, the kit reports `isBlindSign=false`. Verified on a real Flex ([photos](captures/ledger-reelle/)). |
| **Agent Stack** (wallet-cli 2.1.0) | The analyst: a language model on a read-only MCP of ten tools, one of them Ledger's `earn yields`. It cites the tool behind every number and cannot sign anything. [`SKILL.md`](SKILL.md) and [`AGENTS.md`](AGENTS.md) follow Ledger's skill format. |
| **Ring CLI** (Ledger Key Ring Protocol) | Seals the master secret every account's MCP key is derived from (`HMAC-SHA256(master, address)`), under the operator's Ledger seed: [`scripts/ring-seal.sh`](scripts/ring-seal.sh). Initialised with a real Flex over USB. |

## The agents, and the line between them

The **bots** act without a language model: each has its own universe (v4 pools or ERC-4626 vaults), size and pace, and
its key can only call the vault. The **analyst** understands and can do nothing. The one that acts has no LLM; the one
with an LLM cannot act. An injected instruction can make a bot *choose* a trap; it cannot make it *exceed* the mandate.

## What is proven

On a Base fork pinned at block 50,614,000.

**Six rounds of the bot, with the real exit.**

| Round | Pool | Entry | Exit | Decision |
|---|---|---|---|---|
| 1 | `0x1043dc3ea2` | 11.93 bps | 238 bps | **bought** |
| 2 | `0x0160bf7c02` | 0.00 bps | 10,000 bps | refused: the token is not even transferable |
| 3 | `0x08d98bfaba` | 0.00 bps | 10,000 bps | refused: same |
| 4 | `0x093635e4ed` | 0.00 bps | 10,000 bps | refused: same |
| 5 | `0x2e8f977628` | 0.00 bps | 1,899 bps | refused: `CannotExit` |
| 6 | `0x4435362cad` | 0.00 bps | 1,899 bps | refused: `CannotExit` |

Sort by entry: nothing separates bought from refused. Sort by exit: everything does.

**Ten real ERC-4626 WETH vaults, same mandate (300 bps).**

| Vault | Advertised | Round trip, 0.01 WETH | Door closed | Decision |
|---|---|---|---|---|
| **Moonwell Flagship ETH**, the largest (1,957 WETH) | 1.36 % | 0 bps | **2,693 bps** (522.6 WETH position, 381.8 withdrawable) | **refused** |
| Safe × Steakhouse ETH | 1.37 % | 0 bps | 264 bps | accepted (refused at 200) |
| Gauntlet WETH Core · Clearstar · Yearn OG | 1.5–1.9 % | 0 bps | 0 bps | accepted |
| Seamless · Extrafi · Re7 · Steakhouse · Pyth | — | deposit refused: `AllCapsReached`, the vault is full | — | — |

For Moonwell's largest depositor, `previewRedeem` says 522.57 WETH while `maxWithdraw` says 381.82: the trap is written
in the standard, not in the vault.

**38 Foundry tests, 8 suites, all green.**

| Suite | Tests | What it checks |
|---|---|---|
| ExitVault | 8 | the six traps detected, healthy pools accepted, the mandate bounded |
| Vault4626 | 6 | ten real vaults: Moonwell refused, five full, entry, exit, exception |
| Escalation | 6 | what an exception allows, and everything it does not |
| MultiAgent | 5 | several agents, separate budgets, revocation one by one |
| Exit | 5 | buy, sell, withdraw, and the probe confirmed by the real execution |
| Withdrawal | 6 | the deposit from the Ledger becomes WETH; the signed withdrawal is never replayed or altered |
| GasProbe | 1 | a real `take()` costs 35,377 gas, the bound is 400,000 |
| LedgerScene | 1 | the full scene, with the signature that came from the device |

The whole journey, from sign-in to withdrawal, also runs in a real browser on the local bench and on the live site, and
the mandate and an exception were clear-signed on a physical Ledger Flex.

```bash
./scripts/demo.sh                     # signs the mandate on the device -> mandate.json
cd contracts
MANDATE_FILE=../mandate.json forge test --fork-url "$BASE_RPC_URL" --fork-block-number 50614000 -vv
```

![A real Ledger Flex over USB on https://netout.tech: the Sign-In with Ethereum message, then an exception read in clear with EXIT COST (bps) 1889, Hold to sign, and the position entered under the exception](captures/ledger-reelle/planche.jpg)

## The site

| | |
|---|---|
| ![The door](captures/site/porte.png) | ![The live map](captures/site/carte-vivante.png) |
| [`/connexion`](https://netout.tech/connexion): your Ledger or the in-browser Flex, then the sign-in. | [`/demo`](https://netout.tech/demo): the system lit up live, the Flex beside it. |
| ![The TARE panel](captures/site/volet-tare.png) | ![The Bots panel](captures/site/volet-bots.png) |
| TARE during a round: the counterfactual, the number, the verdict. | The bots: each one, its numbers, its decisions. |
| ![Trades](captures/site/trades.png) | ![Account](captures/site/compte.png) |
| [`/trades`](https://netout.tech/trades): agents, out-of-bounds requests, positions, journal. | [`/account`](https://netout.tech/account): deposit, withdrawal, the analyst, the MCP key. |

## Plug your own agent in

Each account has an MCP key, shown on `/account`. Your agent gets the analyst's ten read-only tools on that account:

```bash
claude mcp add --transport http netout https://netout.tech/api/mcp --header "Authorization: Bearer <your key>"
```

## Upstream findings

Filed on 13 October, each checked against that day's code:
[device-sdk-ts#1987](https://github.com/LedgerHQ/device-sdk-ts/issues/1987) (`signMessage` drops any message with one
non-ASCII character), [device-sdk-ts#1988](https://github.com/LedgerHQ/device-sdk-ts/issues/1988) (the Signer Kit
detects blind signing but does not tell the developer), [speculos#685](https://github.com/LedgerHQ/speculos/issues/685)
(two clients on one emulated app get each other's answers), [ethereum/ERCs#2069](https://github.com/ethereum/ERCs/pull/2069)
(invalid formats in the ERC-7730 example), and a confirmation at chain 8453 of
[app-ethereum#1114](https://github.com/LedgerHQ/app-ethereum/pull/1114). Details: [`FEEDBACK.md`](FEEDBACK.md).

## Where things are

```
contracts/src/ExitVault.sol   the mandate and the exception (EIP-712), the two exit probes, the purchase
contracts/test/               the 38 tests above
ledger/                       our clear-signing descriptors, the Signer Kit in Node and in the browser (dmk/), wallet-cli
agent/                        the bots (agent.py: v4 pools, vaults.py: ERC-4626), the watcher (watch.py),
                              TARE's counterfactual (counterfactual.py), the analyst (analyst.py)
mcp/pds_mcp.py                the read-only MCP: ten tools, also served over HTTP
web/                          the bench server: accounts, the bot scheduler, the strategist, the API the site calls
front/                        the site (Vite + React): Florent's 3D scene, the explanation, the live map, the account
scripts/                      site.sh (everything in one command), demo.sh, ring-seal.sh, deploy.sh, browser journeys
upstream/                     what we filed with Ledger and the ERC repo
```

## Run it locally

With Docker, Foundry, Python 3.12+, Node 20+ and a Base RPC URL:

```bash
git clone https://github.com/JeanBaptisteDurand/Ledger && cd Ledger
git clone https://github.com/JeanBaptisteDurand/ETH_Online_2026 ../ETH_Online_2026   # the TARE corpus
cp ../ETH_Online_2026/.env.example ../ETH_Online_2026/.env                            # then set BASE_RPC_URL
ledger/build/build-flex.sh                      # the Ethereum app 1.22.4 with the test key, about 5 min
(cd contracts && forge install)
uv venv .venv && . .venv/bin/activate
uv pip install -e ledger/build/app-ethereum/client -r ledger/requirements.txt
(cd ledger/dmk && npm ci)
scripts/site.sh                                 # the fork, the Flex, the server and the site: http://127.0.0.1:5173
```

The analyst uses the `claude` CLI, or OpenAI's API with `PDS_LLM=openai` and `OPENAI_API_KEY`. Going live on Base:
[`MAINNET.md`](MAINNET.md). How the site is served: [`DEPLOY.md`](DEPLOY.md).

## Team

**Jean-Baptiste Durand**: the contract, the bench, the agents, the MCP, the clear-signing descriptors, the upstream
feedback. **Florent Belotti**: the 3D scene, the home page, the demo and the site's design. Both at École 42 Paris
(42Blockchain).

Designed and built by the two of us, with Claude Code as a coding assistant. In the product, the analyst runs on a
language model (`gpt-4o-mini` live, Claude locally); every exit cost comes from the Base fork and the contract, never
from a model.

## License

Apache-2.0 ([`LICENSE`](LICENSE)). Not covered, under their own terms: the 3D models of the devices
([`front/public/references.txt`](front/public/references.txt)), Google's Draco decoder, the lens flare of
`lensflare-threejs-vanilla`, and the two sounds of the hero.
