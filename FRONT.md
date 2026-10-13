# FRONT.md — everything the front needs, screen by screen

*The front-end contract: every screen, element, state, route and data shape the server exposes.*

---

## 1 · The product in ten lines

A user plugs in their Ledger, signs in to the site with it, and gets an **account** (a proven address) and a
**vault** (a contract deployed in their name on a fork of Base). They describe what they want in plain words; a
strategist (a language model) proposes **bounds** (budget, tolerated exit loss, expiry) and they **sign them once** on their
Ledger: that is the **mandate**. Then they create **bots** (execution agents without an LLM: name, universe, pace)
that buy through this vault, under this mandate; the contract measures the **exit** at every entry and refuses
whatever does not come back out. A “negotiable” refusal becomes an **out-of-bounds request** that the user reads on
their Ledger and signs (a single-use exception) or leaves refused. They see their **positions**, **re-probe** them,
**exit** them. They talk to **their account's analyst** (a language model, plugged read-only into their data) and read, in
**my account**, their MCP key, their Claude configuration, and the history of their actions and their bots.

Two universes: **Uniswap v4 pools** (Base's long tail of WETH pools, six real traps) and **ERC-4626 vaults** (ten
real Morpho vaults; Moonwell has 27 % of its door closed).

Vocabulary to keep as is in the interface (it is the pitch's): *mandate*, *bounds*, *vault*, *bot*, *round*,
*slice*, *out-of-bounds request*, *exception*, *door* (of a vault), *exit* (of a position), *re-probe*, *the holder*
(the user, the one who holds the Ledger).

---

## 2 · The contract with the server

- **A Python server** (`web/server.py`, port 8099), JSON everywhere. Every route is under `/api/`.
  POSTs take a JSON body and answer `{"ok": true|false, "msg": "…", …}`; an `ok:false` is a message to show (a
  toast), not an exception.
- **Session**: an HttpOnly cookie, `pds_session`, set at sign-in. Every request with the cookie speaks for **the
  account**; without it, for “the guest” (who can choose the signing path, nothing more).
- **State**: the front polls `GET /api/state` (every 1.4 s in the mock-up, `web/index.html`) and redraws everything
  from that object. This is deliberately simple; the server has no push channel for the state.
- **The Ledger is in the browser.** The bundle `dist/ledger-web.js` exposes `window.LedgerWeb` (Ledger's Signer Kit
  and the WebHID transport, or the bench's emulator through the `/speculos/*` proxy). In this mode the server never
  sees the device: it **puts a signature on hold** (`state.pending`), the page has it signed on the device, then
  hands it back to `POST /api/signed`. Two other paths exist for the bench (server-side Signer Kit, Python APDU
  client): there the server talks to the emulator, and the page only displays.
- **One client on the device at a time.** A pending signature carries a `token`; only the page that clicked (it
  received the token in the POST's response) has it signed. A second tab on the same account must never try to
  sign: two clients while a human is reading the screen break the signature (`0x6901`).
- **Addresses**: always checksummed (`0xDad7…D8D`), as the server returns them.
- **Amounts**: the server returns wei as strings (`"500000000000000000"`). Show WETH with 4 decimals above 0.001,
  wei below. Exit costs are in **bps** (basis points; 100 bps = 1 %).

### 2.1 · `window.LedgerWeb` (the bundle, already built)

```js
await LedgerWeb.connect('webhid' | 'speculos', location.origin + '/speculos')  // -> address; WebHID opens the browser's device picker
LedgerWeb.address()                      // connected address, or null
await LedgerWeb.signMessage(text, onStep) // -> { signature, address }  (Sign-In with Ethereum)
await LedgerWeb.signTypedData(typedData, descriptor, onStep) // -> { signature, address, report }  (mandate, exception)
await LedgerWeb.disconnect()
LedgerWeb.webHidSupported()              // false on Firefox / Safari: offer the emulator or another browser
```
`onStep(iv)` receives the kit's steps (`iv.requiredUserInteraction`: `'sign-typed-data'`, `'web3-checks-opt-in'`,
`'none'`): show “your Ledger: read the fields, then press and hold *Hold to sign*”. If the device first asks “Enable
Transaction Check?”, the question comes from Ledger: the user answers *Maybe later*. A `connect` error can be
transient (device not ready): retry once after 1.5 s, unless it is an explicit refusal (`reject`, `6985`, `denied`).

### 2.2 · The protocol of a signature in the page

1. The user clicks **approve on the Ledger** (mandate) or **read and sign** (exception) → `POST /api/sign_mandate`
   or `POST /api/escalate` → response `{ok, msg, pending_token}`. Keep `pending_token`.
2. On the next `state`, `state.pending = {kind: 'mandate'|'exception', typedData, expiry, token, …}` and
   `state.signing = kind`. If `pending.token === pending_token`: `GET /api/descriptor?kind=<kind>` (this vault's
   clear-signing descriptor), then `LedgerWeb.signTypedData(pending.typedData, descriptor, onStep)`.
3. Success → `POST /api/signed {kind, signature, owner, report}`. Refusal or error → `POST /api/signed {kind, error}`.
4. The server verifies, executes (deploys the mandate, or buys under the exception), clears `pending`, and updates
   the state.

### 2.3 · Sign-In with Ethereum

`GET /api/siwe/nonce` → `{nonce, domain, chainId, statement}`. Build the EIP-4361 message **without `statement`, with
`Issued At` to the second**, in pure ASCII (a single non-ASCII character and the Signer Kit drops the whole message,
`FEEDBACK.md` § 7):

```
<domain> wants you to sign in with your Ethereum account:
<address>

URI: <origin>
Version: 1
Chain ID: 8453
Nonce: <nonce>
Issued At: 2026-09-25T10:00:00Z
```
`LedgerWeb.signMessage(msg)`, then `POST /api/siwe/verify {message, signature, address}` → `{ok, address}` + cookie.
The other path, for the bench: `POST /api/login_device {}` (the server reads the address on the emulator).

---

## 3 · The screens

Each screen lists its elements, its states and its calls. “state” means `GET /api/state`.

### 3.1 · Sign-in

Before any account. What the page shows:
- The **path to the device** (three choices, `POST /api/signer {signer}`): `browser` (*my Ledger · browser*, the
  user's path), `dmk` (the Signer Kit on the bench side), `python` (the official APDU client). For `browser`, the
  **transport**: `webhid` (USB, Chrome/Edge/Brave) or `speculos` (the bench's emulator), a local choice
  (`localStorage`) not sent to the server.
- The **sign in with my Ledger** button: `browser` path → SIWE (§ 2.3); otherwise `POST /api/login_device`.
  States: *signing in…*, *your Ledger: read the sign-in message, then sign*, error (toast), signed in.
- The **installed bricks** (`state.ledger_stack`: versions of the DMK, the Signer Kit, the transports, wallet-cli)
  and the **Key Ring** status (`state.ring`): informative, small.
- The live device screen (§ 3.8) is already visible here: it is where the user signs.

After sign-in, the header shows the account (`state.address`, truncated), a **my account** button, a **diagram**
link, and **reset** (danger: `POST /api/reset` wipes the account; mandate and bots are deleted).

### 3.2 · My account (dashboard)

`GET /api/account` (add `?reveal=1` for the key in clear) →
`{ok, profile, events, mcp_key, mcp_config, dir, key_note}`.
- **Address** (proven by the Ledger), **since** (`profile.created`), **sign-ins** (`profile.logins`), last path
  (`profile.last_via`), current vault (`profile.vault`).
- **My bots**: *N active (names) · M stopped* from `state.bots`; two shortcuts: **manage my bots** (§ 3.4) and
  **talk to the analyst** (§ 3.7).
- **Your MCP key**: masked (`4y_w…RFW`), a **reveal / hide** button; a **Claude config** button that shows
  `mcp_config` (JSON ready to paste into Claude: command, arguments, `env` with `PDS_ACCOUNT`, `PDS_MCP_KEY`,
  `PDS_JOURNAL`, `PDS_MANDATE`, `PDS_BOTS`, `ANVIL_URL`) with a **copy** button. Text: *“paste this configuration
  into your Claude: it will read your vault, your journal, your bots, with your key, read-only”*.
- **What you did**: the `events` list (the last 80), newest first, one line per action: time, label, details.
  Kinds (`kind`) and labels:
  `login` sign-in · `session` session opened · `strategy` strategy requested · `mandate_signed` mandate signed ·
  `bot_added` bot added · `run` round started · `run_done` round finished · `bot_stopped` bot stopped ·
  `bot_restarted` bot restarted · `bot_done` bot finished · `notified` notified · `exception_signed` exception
  signed · `exception_refused` refusal kept · `watch` watching · `analysis` question to the analyst · `reset`
  account reset. The event's other fields are its details (bot, position, bps, tools…).
- **Sign out**: `POST /api/logout` (clears the cookie), then `LedgerWeb.disconnect()`.

### 3.3 · Session, strategy, mandate

**The bench / the session.** Button **open a session** (`POST /api/boot`): the server deploys a vault in the
account's name (and starts the fork and the emulator if they are not running). Disabled without an account, or if
`state.vault` exists. Show `state.vault` (the vault's address), `state.weth` (available budget, wei), `state.anvil` /
`state.speculos` (are the fork and the device up). For `dmk`/`python`, the address read on the device must be the
account's.

**1 · Ask for a strategy** (the strategist's chat). A thread (`state.chat`: `{role:'user'|'assistant', text,
warning?}`), a field, suggestions (“1 WETH cautiously on Base memecoins”, “0.5 WETH, aggressive profile, 10
slices”…). `POST /api/chat {prompt}` → `{ok, msg, proposal}`. The assistant's reply shows `rationale` and, as a
warning, `warning` (*what these bounds do not protect*) and the source (*claude CLI*).

**2 · The mandate, to read and sign.** `state.proposal`: `budget_weth`, `max_round_trip_loss_bps`, `slice_weth`,
`ticks`, `days`, `risk` (`prudent`|`balanced`|`aggressive`), `min_depth_sizes`, `require_registry`, `rationale`,
`warning`. Show the bounds as cards; say that **only the budget, the exit loss and the expiry** go to the device
(the rest guides the bots without binding them). Button **approve on the Ledger** → § 2.2 with `kind:'mandate'`.
States: disabled if `state.signed` or `state.signing`; *mandate signed ✓*; the **Signer Kit's last report**
(`state.last_report`: `isBlindSign`, `clearSigningType`…; show *isBlindSign=false · eip7730*).
After signing, `state.mandate`: `owner`, `vault`, `signature`, `signer`, `mandate{agent, budgetToken,
budgetAmount, maxRoundTripLossBps, expiry, nonce}`. On the device, the user sees: *Exit mandate · Network Base ·
Agent · Budget 0.5 WETH · Max round-trip loss (bps) 150 · Expires*.

### 3.4 · My bots

Visible once `state.signed`.
- **Default universe**: two buttons, *v4 pools* / *ERC-4626 vaults* (`POST /api/universe {universe:'pools'|'vaults'}`,
  read from `state.universe`), with one explanatory sentence per universe (the agent never sees the exit / the door).
- **Run a round**: `POST /api/run` → creates a single-round bot in the current universe (named “single round N ·
  pools/vaults”). The demo's simple action.
- **Add a bot** (form): **name** (40 characters max, default “bot N”), **universe**, **slices per round** (1–12;
  vaults cap at 5), **pace** (*a single round* = 0, *every 30 s*, *60 s*, *5 min*; free on the API side: `interval_s`
  in seconds), optional **slice size** (`slice_weth`, otherwise the proposal's; minimum 0.01 WETH for a vault).
  `POST /api/bots {name, universe, ticks, interval_s, slice_weth?}` → `{ok, msg, bots}`. Ask for permission to
  notify (Notification API) on this action.
- **Active bots** (`state.bots` with `status:'running'`): name + subline (*3 slices · every 60 s*), universe,
  **state** (*round running* if `state.bot_running === bot.id`, otherwise *active · next round in N s* computed from
  `next_run`, or *waiting* for a single round), **rounds** (`rounds`), **buys / refusals** (`executed` / `refused`),
  **exc.** (`exceptions`), **positions**, **spent** (`spent_wei`), a **stop** button (`POST /api/bots/stop {id}`).
  An account can have several active bots; their rounds run one at a time.
- **Stopped bots: the history** (`status:'stopped'|'done'`, newest first): name, universe, **from → to**
  (`started` → `stopped`), rounds, buys / refusals, exceptions, spent, **end**: a *stopped* or *finished* badge +
  `stop_reason` (*stopped by the holder*, *a single round was asked*, *the mandate's budget is spent*, *the mandate
  has expired*, *nothing new left to try in this universe*, *no mandate when the bench restarted*), a **restart**
  button (`POST /api/bots/restart {id}`; a single-round bot, once restarted, runs every 60 s).
- **The journal** (`state.journal`, one row per decision, in order): columns *t* (tick, or *exc.*), **bot**,
  position (`name` or truncated `pool`), hook →/← (`hook_in`/`hook_out`, pools only), *entry · advertised* (`entry`
  bps for a pool, `apy_pct` % for a vault, *human decision* under an exception), *exit · door* (`exit` bps; for a
  vault `stuck_bps` or `deposit_refused`; *exit read N bps* under an exception), *decision* (`decision:'EXECUTED'`
  → *bought* / *entered*; otherwise *refused*, with `error` as a tooltip; under an exception *entered · exception
  ⚑*), and `why` (the agent's reason) on hover or in a detail view. A red or green line on the left, by decision.
  Under the table, the **reading**: *N buys, M refusals* and two sentences that explain the columns (they are in
  the mock-up; reuse them as is).

### 3.5 · Out-of-bounds requests

`state.escalation` (the current request) and `state.escalation_queue` (those waiting, in order).
A card or a modal, in gold, only if `escalation && escalation.possible && !state.signing`:
- The requesting **bot** (`escalation.bot.name`), the **question** (`escalation.question`: *“this pool costs 354 bps
  to exit, your mandate allows 150: do you sign anyway?”* or, for a vault, *“Moonwell: 2685 bps of the largest
  position cannot get out today (the door is 73.2 % open)…”*), `seen_exit_bps` against `mandate_allows_bps`, the
  position (`name` or `pool_id`), the amount (`amount_in`, wei), and *N other requests waiting* if the queue is not
  empty.
- The text: *out of bounds does not mean no; it means ask the human. An exception is single-use, bound to this
  position, this amount and the number you are about to read: if the exit gets worse in the meantime, it is worth
  nothing.*
- **Read and sign on the Ledger**: `POST /api/escalate` → § 2.2 with `kind:'exception'`. On the device: *Exit
  exception · Position · Amount · EXIT COST (bps) · Valid until*. While signing: *your Ledger: read the exit cost,
  then sign, or refuse*. Afterwards: the position appears with ⚑ *acquired under an exception*, and the next request
  takes its place.
- **Leave refused**: `POST /api/escalate_no` → the request is closed and the refusal kept (no bot will ask for this
  position again); the next one takes its place.
- A **banner** and a **browser notification** when a request appears (the server also sends a webhook if
  `PDS_NOTIFY_URL` is set; outside the front).

### 3.6 · Positions and watching

- **Positions** (`state.positions`): *budget spent* (`state.spent`, wei) and the number of rows; table: tick
  (`tick`, or *exc.*), position (`name` or `pool`), **bot**, kind (pool / vault), balance (`balance`, in short
  notation), exit at purchase (`exit_bps`), ⚑ if `under_exception`. Note: *⚑ acquired under an exception: you read
  the exit cost on the device and accepted it.*
- **Watching the exits**: text (*a hook can let you sell today and block you tomorrow… the only defence is to
  re-probe, and to exit while you still can*), buttons **re-probe** (`POST /api/watch`) and **re-probe and exit**
  (`POST /api/watch_sell`: exits every position whose exit now exceeds the mandate). `state.watching` during the
  probe. Result `state.watch = {ts, rows, sell_if}`; `rows[]`: `kind`, `pool_id`, `name`, `exit_bps_at_buy`,
  `exit_bps_now`, `blocked`, `delta_bps`, `action` (`aucune` = none | `SORTI` = exited | `exit refused`). Columns:
  position, at purchase, now (*BLOCKED* if `blocked`), gap (sign and colour), action. Sentence: *N position(s), M
  whose exit has closed. This is not a guarantee: between two passes, the door can close.*

### 3.7 · The account's analyst (chat)

Visible once `state.vault` is set. A chat: a field, suggestions (*why was the last round refused, and what did the
hook take?* · *which vaults have their door closed today, and by how much?* · *what does Ledger's Earn say about a
position, and what does it not say?* · *what are my bots doing, and which one has the most refusals?*).
`POST /api/analyze {question}` → `{ok, msg}`; one question at a time (`state.analysis.pending`).
The thread is `state.analyses[]`: `{question, pending, answer, tools_used[{tool, args}], error, ts}`. Under each
answer, the **tool trace**: *MCP → operations() · vault_openness(vault=Moonwell) · decision(tick=1)*.
While waiting: *it is querying the MCP's tools…* (20 to 40 s). Intro text: *the real agent, plugged into your
account with your key; it does not answer from memory, it queries the read-only MCP and cites the tool behind every
number; it can do nothing else.* The thread's history is passed back to the model: a question can refer to the
previous one.

### 3.8 · The device

- **The live screen**: `GET /api/screen?t=<timestamp>` (the emulator's PNG), refreshed ~2 times a second when
  `state.speculos`. Status text: *powered on* / *powered off* / *waiting for you* (`state.signing`).
- **The finger**: `POST /api/finger {action:'press'|'release', x, y}` on click; a drag (press at one point, release
  at another) is a swipe; a long press (~2 s) is “Hold to sign”. Legend: *click = tap · drag left = swipe · long
  press = Hold to sign*. Useful on the bench; with a real Ledger, it is the physical device.
- **The signing path** (§ 3.1) and, when it is server-side, the waiting message during `state.signing`.
- **The Signer Kit's last report** (`state.last_report`) and **the installed bricks** (`state.ledger_stack`).

### 3.9 · The rest

- **Diagram**: the map of the system and its explanation are on the site's home page (`/`, the “The whole system on
  one sheet” band and the ones after it); the bench keeps its static page `/schema.html`.
- **The bench's log** (`state.log[]`, strings): the technical feed of everything that happens (useful in demos and
  debugging; can be a collapsible panel).
- **Reset** (`POST /api/reset`): confirmation required.
- **Notifications**: ask for permission on a user action (run a round, add a bot); notify on every new out-of-bounds
  request, and when a bot finishes.

---

## 4 · Route reference

| route | body | response | notes |
|---|---|---|---|
| `GET /api/state` | — | the full state (§ 5) | to poll; the cookie picks the account |
| `GET /api/account[?reveal=1]` | — | `{ok, profile, events[], mcp_key, mcp_config, dir, key_note}` | account required |
| `GET /api/siwe/nonce` | — | `{nonce, domain, chainId, statement}` | single-use nonce |
| `POST /api/siwe/verify` | `{message, signature, address}` | `{ok, address}` + cookie | sign-in, browser path |
| `POST /api/login_device` | `{}` | `{ok, address}` + cookie | sign-in through the bench's device |
| `POST /api/logout` | `{}` | `{ok}` (cookie cleared) | |
| `POST /api/signer` | `{signer:'browser'\|'dmk'\|'python'}` | `{ok, signer}` | |
| `POST /api/boot` | `{}` | `{ok, msg}` | opens the session: a vault in the account's name |
| `POST /api/chat` | `{prompt}` | `{ok, msg, proposal}` | the strategist (10–30 s) |
| `POST /api/sign_mandate` | `{}` | `{ok, msg, pending_token}` | puts the mandate on hold for signing |
| `GET /api/descriptor?kind=mandate\|exception\|withdraw` | — | the JSON descriptor | for `LedgerWeb.signTypedData` |
| `POST /api/signed` | `{kind, signature, owner, report}` or `{kind, error}` | `{ok, msg}` | returns the signature made in the page |
| `POST /api/universe` | `{universe:'pools'\|'vaults'}` | `{ok, universe}` | default universe |
| `POST /api/run` | `{}` | `{ok, msg, pending_token}` | a single-round bot |
| `POST /api/bots` | `{name, universe, ticks, interval_s, slice_weth?}` | `{ok, msg, bots[]}` | adds and starts |
| `POST /api/bots/stop` | `{id}` | `{ok, msg, bots[]}` | |
| `POST /api/bots/restart` | `{id}` | `{ok, msg, bots[]}` | |
| `POST /api/escalate` | `{}` | `{ok, msg, pending_token}` | puts the exception on hold for signing |
| `POST /api/escalate_no` | `{}` | `{ok, msg}` | leave refused |
| `POST /api/watch` / `POST /api/watch_sell` | `{}` | `{ok, msg}` | result in `state.watch` |
| `POST /api/analyze` | `{question}` | `{ok, msg}` | answer in `state.analyses` |
| `POST /api/reset` | `{}` | `{ok, msg}` | resets the account |
| `POST /api/deposit` | `{amount_eth}` | `{ok, msg, pending_token}` | puts the deposit on hold: one ETH transfer signed on the Ledger |
| `POST /api/withdraw` | `{amount}` (WETH, or `"tout"`/`"all"`) | `{ok, msg, pending_token}` | puts the withdrawal authorisation (EIP-712) on hold for signing |
| `POST /api/mcp` | JSON-RPC (MCP Streamable HTTP) | JSON-RPC | the read-only MCP; `Authorization: Bearer <the account's MCP key>`, 403 otherwise |
| `GET /api/screen?t=` | — | PNG | the device's screen |
| `GET /api/events` | — | `{events[]}` | the texts shown on the screen (emulator) |
| `POST /api/finger` | `{action, x, y}` | `{ok}` | the finger on the emulator |
| `GET /schema.html`, `GET /dist/ledger-web.js`, `/speculos/*` | — | — | static; the emulator's proxy for the bundle |

The actions (`boot`, `sign_mandate`, `run`, `escalate`, `escalate_no`, `watch`, `watch_sell`, `reset`) all answer
`{ok, msg, pending_token}` (`pending_token` is `null` when nothing is waiting for a signature).

---

## 5 · The data model (`GET /api/state`)

```
anvil, speculos          bool   the fork and the device respond
ledger_stack             {dmk, signer_kit, …: versions}      ring: Key Ring status or null
address                  the account's address (checksummed) or null (guest)
owner, vault, weth       the vault's owner, the vault's address, available WETH (wei, string)
signer                   'browser' | 'dmk' | 'python'        universe: 'pools' | 'vaults'
chat[]                   {role, text, warning?}               proposal: § 3.3 or null
signing                  'mandate' | 'exception' | 'deposit' | 'withdraw' | null       pending: {kind, typedData, expiry, token, …} or null
mandate, signed          § 3.3; bool                           last_report: the Signer Kit's report or null
running, bot_running     a round is running; the bot's id
bots[]                   {id, name, universe, ticks, interval_s, slice_wei, created, started, stopped, status,
                          rounds, next_run, stop_reason, executed, refused, exceptions, positions, spent_wei, last_ts}
journal[]                {tick, bot, pool, hook, kind, name, apy_pct, under_exception, own_bps, stuck_bps,
                          deposit_refused, entry, exit, hook_in, hook_out, registry, decision, error, why}
spent                    wei spent (string)                   positions[]: {pool, token, kind, name, bot, exit_bps,
                                                                            tick, under_exception, balance}
escalation               {possible, pool_id, hook, currency1, fee, tickSpacing, seen_exit_bps, mandate_allows_bps,
                          amount_in, question, bot:{id,name}, name?, vault?, ref_holder?} or null
escalation_queue[]       same objects, waiting                 refused_escalations[]: refused pool_ids
exception_buys[]         {pool, token, name, kind, exit_bps, tick:'exc.', under_exception, bot}
watch, watching          {ts, rows[], sell_if} or null; bool
analysis, analyses[]     the current question; the thread (§ 3.7)
log[]                    the bench's log (strings)
```

The account's events (`GET /api/account`): `{ts, kind, …details}` (§ 3.2).

---

## 6 · Rules and states to honour

1. **One thing at a time with the device.** During `state.signing`, everything that signs is disabled; the bots'
   rounds wait; out-of-bounds requests are not shown.
2. **A pending signature is taken only by the tab that asked for it** (the `pending_token`). After a reload, the
   foreground tab can take it back; a background tab, never.
3. **The mandate first**: no bots and no watching without `state.signed`; no session without an account.
4. **The bots share the mandate**: the budget spent and the tolerated exit loss are the account's, not the bot's.
   A bot stops by itself when the budget is spent, the mandate has expired, or the universe is exhausted.
5. **Out-of-bounds requests queue up**: one at a time, the last round's first; *leave refused* keeps the refusal.
6. **Errors**: `ok:false` → a toast with `msg`. Three device codes to put in plain words for the user: *0x6985*
   refused on the device; *0x6980* the app is stuck after an abandoned message (quit and reopen the Ethereum app);
   *0x6901* another client is talking to the device (close the other tabs, reopen the app).
7. **WebHID**: Chrome, Edge and Brave only, without Ledger Live open (it holds the device). Otherwise, offer the
   bench's emulator.
8. **A server restart** gives the account back as it was (vault, mandate, journal, positions, bots), except the
   conversation with the strategist.

---

## 7 · Beyond the mock-up: deposit, withdrawal, filters, mobile

- **Depositing and withdrawing funds.** `POST /api/deposit {amount_eth}` → a `pending` request of kind `deposit`
  with `tx` (the EIP-1559 envelope: chainId, nonce, fees, gas, recipient = the vault, amount) that the page has
  signed (`LedgerWeb.signTransaction(tx)`) and returns with `POST /api/signed {kind: "deposit", raw}`;
  `POST /api/withdraw {amount | "tout"}` (`"tout"` or `"all"`: the whole balance) → a `pending` request of kind
  `withdraw` (EIP-712 `ExitWithdrawal`, descriptor `/api/descriptor?kind=withdraw`) signed like the mandate. The
  state carries `owner_eth` (the holder's ETH) next to `weth`.
- **The journal filters** (all, entries, refusals, and by bot) are on `/trades`; every page also works at 390 px
  (**mobile**).

---

## 8 · Pointers

- Screenshots of the current site, in `captures/site/`: `porte.png` (`/connexion`), `carte-vivante.png` (the live
  map, `/demo`), `volet-tare.png` and `volet-bots.png` (its TARE and Bots panels), `trades.png` (`/trades`),
  `compte.png` (`/account`), `schema.png` (the whole system on one sheet).
- The mock-up is dark, with labels in monospace small caps, and three colours that carry meaning: **gold** = what
  needs the holder (mandate, exception), **green** = entered / bought / active, **red** = refused. Beyond these
  three colours, the style is open.
- To test without hardware: `python3 web/server.py`, `ledger/speculos.sh up` (the emulator),
  `python3 scripts/porteur.py 3600 3 &` (an automatic holder that approves the screens), then
  `node scripts/parcours.mjs` (the full journey in headless Chromium: what a front must let a person redo by hand).
- The server, in one read: `web/server.py` (routes at the bottom, actions in the middle, bots in `run_round` and
  `ensure_scheduler`); the accounts: `web/accounts.py`.
