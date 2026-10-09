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
| `/app` | account | overview: session and vault, strategy and mandate, the agents at a glance, out-of-bounds requests, positions |
| `/app/agents` | account | my trading agents (bots): add, live, stopped, restart, the journal; the requests they raise |
| `/app/analyste` | account | my analysis agent: the conversation, the MCP calls under each answer |
| `/compte` | account | the address proven by the Ledger, the MCP key and Claude configuration (one-click copy), what was done |
| `/appareil` | account | my Ledger: which device, where the signature is made, the live screen with a finger |

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

Last run: login signed in the page, vault, mandate signed in 10 s (`isBlindSign=false`), a pools bot (2 buys,
8 refusals), an exception signed, « laisser refusé », watch 349 → 784 bps sold, a vaults bot stopped and found in the
history, the Moonwell exception, the analyst answering through the `bots` tool, the account, and a second login through
the bench's device landing on the same state — 98 to 177 s depending on the holder's pace, no failure (4 October: six runs, five passed; the one failure, the first EIP-712 after the Transaction Check opt-in on a fresh Speculos with a slow holder, did not reproduce in two replays). The device tests pass: refusal, two tabs, bench restart.

## Files

- `src/app/api.ts` — the bench's routes and shapes (the contract is `../FRONT.md`)
- `src/app/useBench.ts` — the polled state, actions, the rule "only the tab that asked signs"
- `src/app/ledger.ts` — the Ledger in the browser: connect, Sign-In with Ethereum, signing a pending mandate or exception
- `src/app/ui.tsx` — the components of `DESIGN.md` as React
- `src/app/*Page.tsx` — the four pages
