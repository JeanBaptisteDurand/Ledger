# Developer experience feedback — Ledger stack

*Written for Ledger Dev Rel, as the N3XT brief asks: "where the documentation lost you, which workflow
was confusing, what context was missing, and one concrete suggestion. Be blunt."*

Everything below was hit while building [Porte de sortie](README.md). Each item says what we expected,
what happened, and the one change that would fix it. Nothing here is second-hand: every claim has a
file, a line, or a command.

---

## 1. Clear signing is closed to anyone without a partner token, and it fails silently

**What happened.** We wired `SignerEthBuilder` without an `originToken`, as the sample does. The signer
works. The device shows raw hex. No error, no warning, no log line.

**Your own skill documents this** (`agent-skills`, `skills/dmk/dmk-business-logic/SKILL.md:29`):

> `originToken` is an optional partner token passed to `SignerEthBuilder`. Without it, the signer works
> but the device shows raw hex — **the experience silently degrades to blind signing with no runtime
> error.**

Measured on 2026-09-19:

```
GET crypto-assets-service.api.ledger.com/v1/dapps?output=descriptors_calldata…   → 403
POST global.api.prd.ledger.com/transaction-checks/v3/ethereum/scan/tx            → 403
GET crypto-assets-service.api.ledger.com/v1/tokens?…                             → 200
```

**Why it hurts.** Every team at this hackathon will hit it, most of them without realising: their demo
will *look* like it works. "Optional" is the wrong word for a parameter whose absence silently turns
clear signing into blind signing.

**And the kit already knows.** We wired the Signer Kit for real (`device-signer-kit-ethereum` 1.18.1 on
DMK 1.9.1, `ledger/dmk/sign_typed_data.cjs`). Reading the shipped code:

- `BuildEIP712ContextTask` asks the context module for filters; on `type: "error"` it silently falls
  back to `ClearSigningType.BASIC` — no throw, no warning, one counter (`contextErrorCount`);
- `BlindSigningDetectionTask` then computes `isBlindSign` (`!hasContext || usedFallback`), builds a report
  with `blindSignReason` (`no_clear_signing_context` / `device_rejected_context`), **posts it to the
  context module's reporter** (`contextModule.report(...)`, i.e. to Ledger's telemetry) and logs it at
  **debug** level;
- the device action's output type is `Signature` — `{r, s, v}` and nothing else.

So the kit detects blind signing, tells Ledger, and hands the integrator a signature indistinguishable
from a clear-signed one. We measured it: with our descriptors the report says `isBlindSign=false,
clearSigningType=eip7730, partialContextErrors=0`; without them (`--blind`), `isBlindSign=true,
blindSignReason=device_rejected_context` — and, blind signing being off by default on the Flex, the
device refused with `0x6a80` and displayed *"This transaction cannot be clear-signed. Enable blind
signing in the settings."* The device is strict. The stack is silent.

**One concrete suggestion.** Put `isBlindSign` and `blindSignReason` in the device action's output next
to `{r, s, v}` — the data already exists in the internal state — and log one warning, once per session,
when `originToken` is absent and a descriptor lookup returns 403: *"no originToken: clear signing
disabled, the device will display raw data."* Failing silently into the exact failure mode the product
exists to prevent is the one thing this stack should never do.

---

## 2. A one-line bug in `ledger-app-clients.ethereum` breaks EIP-712 filtering on every chain ≥ 256

**Where.** `client/src/ledger_app_clients/ethereum/eip712/InputData.py`, `init_signature_context`,
lines 577-581:

```python
chainid = domain["chainId"]
sig_ctx["chainid"] = bytearray()
for i in range(8):
    sig_ctx["chainid"].append(chainid & (0xff << (i * 8)))   # <-- the byte is masked, never shifted back
sig_ctx["chainid"].reverse()
```

`8453 & (0xff << 8)` is `0x2000`, and `bytearray.append` refuses anything above 255:

```
chainId     1 (Ethereum) → ok      0000000000000001
chainId   137 (Polygon)  → ok      0000000000000089
chainId  8453 (Base)     → ValueError: byte must be in range(0, 256)
chainId 42161 (Arbitrum) → ValueError
```

Broken: Base, Arbitrum, Avalanche, zkSync, Linea, Scroll. Your three EIP-712 fixtures use chainId 1, 5
and 137 — all below 256 — which is why nobody has seen it.

**The fix, one line**, byte-identical for every value that works today (verified for 0, 1, 5, 137):

```python
sig_ctx["chainid"] = bytearray(int(chainid).to_bytes(8, "big"))
```

**One concrete suggestion.** Take the fix and add one fixture at chainId 8453. We are happy to open the
PR. Until then we monkey-patch it (`ledger/sign_mandate.py`, `patch_chainid_bug`).

---

## 3. `ledger-app-builder:latest` is not in sync with `app-ethereum` master

**What happened.** `make BOLOS_SDK=$FLEX_SDK` on app-ethereum 1.22.4 failed:

```
src/nbgl/ui_nbgl.h:4:10: fatal error: 'nbgl_icons.h' file not found
```

This is not a `make -j` race — it failed identically at `-j1`. The include arrived in app-ethereum on
**13 August 2026** (`b9ea1ed8`, "Fix multsig glyph"); our `latest` image, pulled a few days earlier,
carried a Flex SDK from **3 June**. After `docker pull`, the SDK is from 18 September and it builds.

**Why it hurts.** The error points at the app, not at the toolchain. We spent an hour looking for a
missing generated header in a repository that was fine.

**One concrete suggestion.** Two lines in the app-builder README: *"pull the image before every build;
`latest` tracks the SDK, not your checkout."* Better still, have the Makefile print the SDK's API level
and commit date at the start of a build — a one-line `git -C $BOLOS_SDK log -1` in the banner would have
saved the hour.

---

## 4. Transaction Check parses the provider message and never displays it

**Where.** `src/features/provide_tx_simulation/cmd_get_tx_simulation.c`. `TX_CHECKS_PROVIDER_MSG` (tag
`0x82`, 30 chars) is parsed at l. 182-186, registered at l. 242 — and its only use in the whole file is
a debug `PRINTF` at l. 373. What the user sees is a fixed sentence compiled into the app, chosen from a
(risk, category) pair.

So the channel carries: one risk byte, one category byte, a provider name from the PKI certificate, a
short URL — **and no number, anywhere**. Category 4 is literally named *Losing Operation*.

**Why it hurts.** We understand this is a deliberate reduction — Blockaid's VTX proposal from October
2024 carried the full signed simulation, and you shipped a smaller thing on purpose. Your CTO writes it
plainly: *"if you're about to sign a swap of 100 ETH against 1 USD on Uniswap, Transaction Check won't
flag any risk."* But parsing a field and discarding it is confusing to read, and it makes the format
look richer than the screen.

**One concrete suggestion.** Either display `PROVIDER_MSG` under the fixed sentence, or drop the tag
from the TLV. And if you ever want a number in there, the category already exists — it's the payload
that's missing.

---

## 5. Uniswap v4 is not clear-signed, and the work is sitting there

**What happened.** We wanted to clear-sign a v4 swap through the Universal Router. On a stock device,
it is not decoded at all: `app-plugin-uniswap` declares `V4_SWAP = 0x10` in its enum
(`src/handle_provide_parameter.c:56`) and lets it fall through to
`default: PRINTF("Error: command %d not handled"); return -1;` (l. 112-113). The ERC-7730 registry has
no Universal Router descriptor either — `registry/uniswap/` holds V3Router02, permit2, and four
UniswapX EIP-712 files.

**The work exists.** [app-plugin-uniswap#40](https://github.com/LedgerHQ/app-plugin-uniswap/pull/40)
(14 July 2026, +1 637/−145) adds the V4 action-program parser, built from a census of 10 976 real v4
commands. It has **zero reviews** two months later, while you merged its companion
`ledger-asset-dapps#296`. `device-sdk-ts#1643` has only a Copilot review.

**One thing we noticed in that diff**, and it is a design choice worth stating out loud:

```c
case INPUT_V4_SWAP_PATHKEY_HOOKS:  // hooks address: not displayed; skip
```

In v4, the hook is the contract that decides what the swap costs and who may sell. Even once #40 lands,
it will never reach the screen. We measured six Base pools where the hook takes **0 bps to enter and
9 990 bps to exit** — the same hook, a hundred times more expensive to leave than to join.

**One concrete suggestion.** Review #40. And when you do, consider one more screen for the hook: an
address alone is not much, but it is the difference between "this swap is decoded" and "this swap is
decoded except for the part that decides its price". We would gladly contribute that screen and the
test fixtures — the five v4 tests in #40 all use `hooks = 0x0000…0000`, so none of them exercises a
hook at all.

---

## 6. `"format": "number"` in the ERC-7730 spec's own example is not a valid format

The example at `ERCS/erc-7730.md` lines 855-857 uses `"format": "number"` twice and `"format":
"bytes32"` once. Neither is defined by the spec, and the reference linter rejects them:

```
Value "number" is not valid: Input should be 'raw', 'addressName', … or 'chainId'
```

**One concrete suggestion.** Fix the example — anyone who copies it gets an invalid descriptor. Happy to
open that PR too.

---

## 7. `signMessage` drops the whole message as soon as it contains one non-ASCII character — and strands the app

**What happened.** We wired Sign-In with Ethereum (EIP-4361) through the Signer Kit
(`device-signer-kit-ethereum` 1.18.1, `signMessage`). Our first SIWE message, with a French `statement`
("Porte de sortie — ta Ledger reste chez toi."), failed in ~150 ms with `InvalidStatusWordError`; the same
message without the statement signed. We first read it as a length limit (~229 bytes). It is not: on 10 October
we replayed it on Speculos (app-ethereum 1.22.4) with ASCII messages of 230, 255, 256 and 600 bytes — all sign,
chunked correctly — and with `"é"` repeated ten times (10 characters, 20 bytes), which fails. The exchange:

```
=> e008000019 05 8000002c 8000003c 80000000 00000000 00000000 0000000a     (path + length 10, ZERO message bytes)
<= 9000                                                                       (the app waits for the rest)
   SendSignPersonalMessageTask → InvalidStatusWordError                       (no second chunk is ever sent)
=> e00800001e … 00000005 68656c6c6f                                           ("hello", right after)
<= 6980                                                                       (SWO_COMMAND_NOT_ALLOWED: the app is stuck)
```

**Where.** `internal/app-binder/task/SendSignPersonalMessageTask.ts`: l. 51 sizes the `ByteArrayBuilder` with
`message.length + 1 + (paths.length + 1) * PATH_SIZE` and l. 61 writes `message.length` as the length field — both
are **UTF-16 character counts**. L. 64 then calls `addAsciiStringToData(message)`, which (`ByteArrayBuilder.ts`
l. 229) encodes the string with `TextEncoder` — **UTF-8 bytes**. One accented letter is two bytes: the buffer is
one byte short, `addBufferToData` (l. 198) records a `DataOverflowError` and drops the whole message, `build()`
returns the header alone, and `getErrors()` is never read. `SignPersonalMessageCommand.parseResponse` turns the
app's intermediate `9000` into `InvalidStatusWordError("R is missing")`.

**Why it hurts twice.** Any message with an accent, a typographic dash, an emoji or a non-Latin script fails —
that is most SIWE statements outside English. And on the device side, `handle_sign_personal_message`
(`src/features/sign_message/cmd_sign_message.c`) sets `appState = APP_STATE_SIGNING_MESSAGE` **before** parsing
the first chunk: once the client gives up, the app answers `0x6980` to every following message until it is quit
and reopened. A user sees "it worked yesterday, now nothing signs".

**One concrete suggestion.** Encode once — `const bytes = new TextEncoder().encode(message)` — and use
`bytes.length` for both the builder size and the length field (the app counts bytes); check `getErrors()`
wherever a builder may overflow. On the app, arm `APP_STATE_SIGNING_MESSAGE` only after the first chunk parses, or
drop back to idle on a parse error. Our workaround: a SIWE message in plain ASCII, without `statement` — 217 bytes.
Reproduction: `ledger/dmk/repro_signmessage_bug.cjs` (any string with a non-ASCII character).

---

## 8. Two clients on one app: one stray poll during a pending command, and the app answers `0x6901` to everything

**What happened.** Our own page, left open in a forgotten tab (a browser kept alive by a previous tool
session), was logged into the same account as the page under test. When the server put a signature in
waiting, both tabs started the same Signer Kit flow — two DMK sessions on one emulated Flex. The trace, taken
at the proxy between the browser and Speculos (app-ethereum 1.22.4, API level 26):

```
06:56:04.645  e006000000  -> 020116049000            GET_APP_CONFIGURATION (tab A)
06:56:04.650  e032010000  ...                        Transaction Check opt-in prompt, waits for the user (tab A)
06:56:04.77   B0010000    ...                        transport connect() from tab B, while the prompt is on screen
06:56:05.423  e032010000  -> 6901   (0.78 s)         the PENDING command is refused: SWO_COMMAND_NOT_ACCEPTED
06:56:05.424  B0010000    -> 6901
06:56:05.439  e002…, b001000000, e020…, e01a…  -> 6901, 6901, 6901, 6901 …   every APDU, until Speculos was restarted
```

Reproduced three times. `b001000000` (`GET_APP_AND_VERSION`) is answered by the OS layer, not the app, and it
was refused too: nothing was accepted again without a relaunch.

**Where.** `status_words.h`: `SWO_COMMAND_NOT_ACCEPTED 0x6901`. `io_legacy/src/os_io_legacy.c` (~l. 397):
*"TOCTOU: reject a new command while a previous one still awaits its reply"* — a latch `io_reply_pending`,
armed when a command is accepted, released in `io_legacy_apdu_tx` when the app replies. Refusing the newcomer
is the right call. What we observed is that the *pending* command was refused as well and the latch never
released — consistent with the reply going out through a path that does not clear it. Not verified on
hardware (we have no Flex): emulator only.

**Speculos makes it worse before the app has a say.** `speculos/api/apdu.py` builds one `APDUBridge` per
HTTP request (flask-restful instantiates a `Resource` per request), so its `endpoint_lock` serializes nothing,
and every bridge appends itself to `seph.apdu_callbacks` for the life of the process: two concurrent `/apdu`
POSTs are both written to the app, and each response is handed to every waiting request. We watched a
`B0010000` receive the address answer of an `e002…`.

**Why it is easy to be the second client.** The DMK session refresher sends `b001000000` every second
(`DEVICE_SESSION_REFRESHER_POLLING_INTERVAL = 1e3`, `PINGER_TIMEOUT = 800`). Any second DMK instance — a
second tab, a second app, a wallet polling in the background — is that client, and a human reading a screen
for ten seconds is the window.

**What we changed on our side.** Signing sessions are opened with
`sessionRefresherOptions: { isRefresherDisabled: true }` (one heartbeat fewer while a human reads), and a
pending signature is bound to the tab that asked for it (a token per request, a background tab never signs).
With that, the same flows pass with a signer who takes 20 s per screen, opt-in prompt included.

**The second client can be your own second tab.** A tab of the same account that never asked for the
signature must not adopt it either: our first rule ("no token and the tab has focus") let a tab opened
*before* the request start the same flow — in the trace, a `B0010000` lands at 21:14:52.076 in the middle
of the EIP-712 filters, the pending `e00c` is refused with `6901` 1.2 s later, and the device still shows
the review and gets signed by a holder whose signature no longer has anywhere to go. The rule that holds:
a tab without a token adopts only a request *older than itself* (the asking tab was reloaded), never one
born while it was already open. Tested: refusal on the device, two tabs of the same account, bench
restarted under the page — all three pass (`ledger/FRONTEND_FLO/scripts/tests-appareil.mjs`).

**One unexplained run out of six.** Once, on a freshly started Speculos and with a slow holder, the first
EIP-712 signature after the Transaction Check opt-in came back as "This transaction cannot be clear-signed"
(the kit's blind fallback), the app having gone to its home screen right after « Maybe later ». Fresh
Speculos plus slow holder was replayed twice afterwards and passed both times, as did three other runs.
We note it; we could not reproduce it.

**Two concrete suggestions.** In the SDK, when a newcomer is refused with `0x6901`, leave the pending command
and its latch untouched — one stray poll should cost the poller, not the signer. In Speculos, make
`APDUBridge` a singleton per `SeProxyHal` (and unregister callbacks when an exchange ends), so concurrent
exchanges are serialized instead of mixed.

---

## 9. Smaller things, in one line each

- **The device's display vocabulary has 12 `ParamType`s and none of them is a number with provenance.**
  `MUST_BE` compares a field to at most five constants — never a field to another field. We needed
  "this value, compared to that one" and had to do it in a contract instead.
- **`interoperableAddressName` (ERC-7930) is in the spec and on `develop`, but no registry descriptor
  uses it.** Worth a line in the docs saying which format is live on which firmware.
- **The Speculos finger API is undocumented for swipes.** `press` at one point and `release` at another
  is a swipe; we found it by trial. Two lines in the Speculos README would help every team writing
  device tests.
- **Test keys are the best-kept secret of this stack.** `makefile_conf/features.mk` (`CAL_TEST_KEY`,
  `SET_PLUGIN_TEST_KEY`) plus `client/.../keychain/*.pem` let anyone sign their own filters and test
  them end to end on Speculos. That is exactly what a hackathon team needs, and it is documented
  nowhere we could find. One paragraph in the clear-signing docs would turn a two-day dig into a
  ten-minute setup.

---

## What we would keep

The TLV documentation (`doc/tlv_structs.md`) is genuinely good — it is how we understood that nine
signed structures are verified on the Secure Element, and it is more precise than most protocol docs we
read this year. Speculos plus the official app builder means a team with no hardware can still ship
something real. And the Python client, chainId bug aside, does the hard part: it signs the filters, so
we never had to reimplement your format.

*Contact: the team behind [TARE](https://github.com/JeanBaptisteDurand/ETH_Online_2026) — ETHOnline 2026 finalist, Uniswap Foundation
"Best Uniswap Stack Contribution".*
