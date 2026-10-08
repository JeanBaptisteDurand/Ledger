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

