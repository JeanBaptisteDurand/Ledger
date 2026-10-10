# The product pages — how to run them

The hero is Florent's and is not touched. Everything the product does lives in `src/app/` and `src/styles/app.css`,
built on the tokens of `src/styles/tokens.css` and the rules of `DESIGN.md`.

Like any SaaS: the pitch and the idea before the account, then what is yours once your Ledger has proven your address.
An account page opened without a session sends you to `/connexion`, then back where you were going.

| path | who | what |
|---|---|---|
| `/` | anyone | the hero and the pitch, how it works, the door to the account |
| `/schema` | anyone | the whole system on one sheet, then thirteen bands: the principle, the other axis, the agents, the site, the account, one signature step by step, the analyst's ten tools, the bricks, the numbers, the limits, what it needs to run, the findings, the SaaS promise |
| `/connexion` | anyone | choose the Ledger (USB or the emulated Flex) and the signing path, sign the login message |
| `/app` | account | overview: session and vault, **deposit and withdrawal signed on the Ledger**, strategy and mandate, the agents at a glance, out-of-bounds requests, positions |
| `/app/agents` | account | my trading agents (bots): add, live, stopped, restart, the journal; the requests they raise |
| `/app/analyste` | account | my analysis agent: the conversation, the MCP calls under each answer |
| `/compte` | account | the address proven by the Ledger, the MCP key and Claude configuration (one-click copy), what was done |
| `/appareil` | account | my Ledger: which device, where the signature is made, the live screen with a finger |

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

With a real Ledger: Chrome, Edge or Brave; Ledger Wallet closed; device unlocked with the Ethereum app open (the
test-key build, see `../ledger/build/`). On `/appareil`, choose **Ma Ledger · ce navigateur**, then
**Vraie Ledger (USB)**. To switch during a demo: log out, change the device, log in again — one address, one account.

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

Last run (10 October, late evening, on Florent's merged home): login signed in the page 7 s, **deposit of 0.5 ETH signed on
the device 8.5 s** (kept as WETH), mandate clear-signed 7.3 s (`isBlindSign=false`), pools bot 2 buys / 8 refusals, exception
9.9 s with a queue of 3, « laisser refusé », watch and sell, **withdrawal of 0.1 WETH authorised on the device 8.6 s**, vaults
bot and Moonwell exception, the analyst through `bots` in 20 s, the account, logout and reconnection on the same state —
146 s, no failure. The device tests pass (refusal, two tabs, bench restart); the bench page's own journey passes.

## Files

- `src/app/api.ts` — the bench's routes and shapes (the contract is `../FRONT.md`)
- `src/app/useBench.ts` — the polled state, actions, the rule "only the tab that asked signs"
- `src/app/ledger.ts` — the Ledger in the browser: connect, Sign-In with Ethereum, signing a pending mandate or exception
- `src/app/ui.tsx` — the components of `DESIGN.md` as React
- `src/app/*Page.tsx` — the four pages
