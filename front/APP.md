# The product pages — how to run them

The hero is Florent's and is not touched. Everything the product does lives in `src/app/` and `src/styles/app.css`,
built on the tokens of `src/styles/tokens.css` and the rules of `DESIGN.md`.

Like any SaaS: the pitch and the idea before the account, then what is yours once your Ledger has proven your address.
Signing in lands on the demo's live map, which drives the bench with the holder's own vault. Two account pages stand next
to it on the same surface (12 October, evening): the trades and the account. An account page opened without a session
sends you to `/connexion`, then back where you were going.

| path | who | what |
|---|---|---|
| `/` and `/home` | anyone | the scene, then the whole explanation: the claim, the trap, the principle, the agent goes in anyway, one signature, the system on one sheet, two kinds of agents, when it overflows step by step, measured end to end, the account, the findings, the bricks, the limits, the call |
| `/demo` | anyone | the live map: the system's map revealed as the journey goes (a node rises in when reached, an edge is drawn between reached nodes), one colour code (orange acts, gold waits for you on the Flex, green signed or entered, red refused), the NOW card above the Flex with the one button for the next step, the four phases in drawers, the recap under the stage. It drives the real bench and signs in with the emulated Flex in one click |
| `/connexion` | anyone | on the home's surface: choose the Ledger (USB or the emulated Flex) and the signing path, sign the login message, the live Flex beside. Signed in, the door stays: it is where the device and the path are changed |
| `/trades` | account | my trading agents (add, live, stopped, restart), the out-of-bounds requests they raise (read and sign on the Ledger, or leave refused, the device mirror beside), the positions and their re-probe, the journal decision by decision with its filters |
| `/account` | account | my funds signed on the Ledger (the vault, **a deposit from the device, a withdrawal to it**), my analyst (the whole conversation, the tool cited under every answer), the address, the MCP key and the Claude configuration (one-click copy), what I did, the bench's log |

The demo's live map and cockpit carry the same gestures in their drawers: the sentence for the bounds, the funds, the
agents (with the map's slots filling as bots are launched), the request, the re-probe and a compact analyst. The map's
Ledger node names the four gestures the device makes, never a purchase: the sign-in, the deposit, the mandate and the
exceptions, the withdrawal; the one in progress lights up.

## The funds, signed on the Ledger (10 October)

The vault is funded **from the holder's Ledger**: an ETH transfer to the vault, the one transaction the device signs,
clear-signed by any Ethereum app (amount, recipient, fees); the vault keeps it as WETH. Funds come back through an
EIP-712 withdrawal authorisation read in clear on the device (amount, recipient, expiry), executed by the bench's key,
which cannot change a digit (`withdrawWithAuthorization`, six tests). On the fork, the bench also puts 5 fictional ETH on
the holder's address and 5 demo WETH in the vault (`PDS_FUND_VAULT=0` turns the latter off). The journey exercises
both gestures (`01b-depot`).

**A real network, testnet first.** `PDS_NETWORK=live BASE_RPC_URL=<Base Sepolia or Base RPC> PDS_DEPLOYER_KEY=… PDS_AGENT_KEY=…
PDS_AGENT_ADDRESS=… python3 web/server.py`: no anvil, nothing credited, the chain id read from the node (the mandate,
the descriptors and the SIWE message follow it). On Sepolia the vault, the deposit, the mandate and the withdrawal
work; the trap pools and the Morpho vaults only exist on Base mainnet, so the bots find nothing there. The same
configuration with a Base RPC is mainnet — real money, tiny amounts.

One command does that pass with the emulated Flex and the automatic holder — `scripts/reseau-reel.sh` (it needs
`.env.live` at the root and test ETH on the deployer, the agent and the device's address); with a real Ledger,
`APPAREIL=vrai scripts/reseau-reel.sh` starts the bench in live mode and leaves the gestures to you in Chrome. The journey
has a reduced mode for it, `PARCOURS=fonds node scripts/parcours-app.mjs`: sign in, deposit, mandate, withdrawal, log out.

## The hero's 3D models

`public/Ledger_Nano_X.fbx` and `public/Ledger_Stax.fbx` are Ledger's brand assets (brand.ledger.com → 3D assets). They are
not in git; without them the scene fails to load and the landing stays black. `scripts/fetch-models.sh` downloads them.

## Run

The pages talk to the bench at the root of this repository (`web/server.py`, port 8099) through the Vite proxy (`/api`, `/speculos`, `/dist`).

```bash
# 1. the bench: fork of Base, emulated Flex, server
cd .. && . .venv/bin/activate
ledger/speculos.sh up && python3 web/server.py          # http://127.0.0.1:8099

# 2. this front
npm install && npm run dev                               # http://127.0.0.1:5173
```

Or everything in one command from the repository root: `scripts/site.sh` (the fork, the emulated Flex, the server, this front,
and the door opened in the browser); `PORTEUR=1 scripts/site.sh` adds an automatic holder that approves every screen of
the emulated Flex after 2 s, for a demonstration without a device. `scripts/site.sh stop` stops the front, the server and
the holder.

With a real Ledger: Chrome, Edge or Brave; Ledger Wallet closed; device unlocked with the Ethereum app open (the
test-key build, see `../ledger/build/`). On `/connexion`, choose **Real Ledger (USB)**, then **My Ledger · this browser**.
To switch during a demo: log out, change the device, log in again — one address, one account.

## Check everything end to end

```bash
python3 ../scripts/porteur.py 3600 2 &   # an automatic holder approves the emulated device's screens
node scripts/parcours-app.mjs                                 # the whole journey in headless Chromium, screenshots in design-shots/app/
```

Edge cases around the device (the holder refuses on the device; two tabs of the same account, only the asking one
signs; the bench restarts under the page) — with **no** holder running, the script starts its own, and its third test
restarts the bench server:

```bash
node scripts/tests-appareil.mjs
```

A usability pass, as a person meets the site (with **no** holder running either): the home and its door, the device
choice, wrong deposit amounts, bounds typed with Enter and the example chips, a rhythmic bot stopped and relaunched from
its history, two bots at once, the journal filters, a request left refused then one signed, the analyst with a follow-up
question, the account's key and configuration, a cancelled reset, the two bench signing paths each on a fresh mandate, a tap
on the live screen, an emulator restart under the page, the phone menu, the bench page's own deposit and withdrawal, and an
accepted reset. It prints its usability remarks at the end (240 s on 11 October, all passed):

```bash
node scripts/tests-usage.mjs
```

Final campaign of 12 October, late evening, on a quiet host, all green: the usability pass (`tests-usage.mjs`, 39 checks, 323 s),
the device tests (refusal on the device, two tabs, bench restart), the bench page's own journey (112 s), the funds journey
(`PARCOURS=fonds`: sign-in 9 s, deposit 8.6 s, withdrawal 8.6 s, 83 s in all), the 38 Foundry tests, and the full journey below.

Full journey (12 October, on the pages above, with Florent's branch merged), every step passed: sign-in, deposit of 0.5 ETH
signed on the device, bounds (Claude), mandate clear-signed (`isBlindSign=false`), pools bot 2 buys / 8 refusals, exception
with a queue of 3, « leave refused », re-probe and exit (one position sold at 310 → 600 bps), withdrawal of 0.1 WETH
authorised on the device, vaults bot (Moonwell at 2 691 bps) stopped from the live table and its exception signed, the
analyst through `bots` in 33 s, the account (80 gestures, the key, the configuration), the live map and the cockpit, logout
and reconnection on the same state through the bench device, the SaaS door. The reference timings are the 10 and 11 October
runs below (the 12 October host was shared with other workloads, which slows the emulator, not the product). The scripts run
headless without WebGL: the hero shows its poster, everything else is the product.

Previous run (10 October, late evening, on Florent's merged home): login signed in the page 7 s, **deposit of 0.5 ETH signed on
the device 8.5 s** (kept as WETH), mandate clear-signed 7.3 s (`isBlindSign=false`), pools bot 2 buys / 8 refusals, exception
9.9 s with a queue of 3, « laisser refusé », watch and sell, **withdrawal of 0.1 WETH authorised on the device 8.6 s**, vaults
bot and Moonwell exception, the analyst through `bots` in 20 s, the account, logout and reconnection on the same state —
146 s, no failure. The device tests pass (refusal, two tabs, bench restart); the bench page's own journey passes.

## Files

- `src/app/api.ts` — the bench's routes and shapes (the contract is `../FRONT.md`)
- `src/app/useBench.ts` — the polled state, actions, the rule "only the tab that asked signs"
- `src/app/ledger.ts` — the Ledger in the browser: connect, Sign-In with Ethereum, signing a pending mandate or exception
- `src/app/ui.tsx` — the components of `DESIGN.md` as React
- `src/components/account/shell.tsx` — the account pages' shell on the home's surface: the gate, the hero in its finished state, the sheet motion
- `src/components/account/Account.tsx`, `src/components/account/analyst.tsx`, `src/components/trades/Trades.tsx` — the two account pages and the analyst's thread (full on the account, compact in the demo)
- `src/components/demo/` — the demo: the replay (`content.ts`, `Demo.tsx`), the live stage (`Stage.tsx`, `live.tsx`)
- `scripts/shots-pages.mjs` — every page signed in, at 1440 and 390 px, with the page errors and overflows reported
