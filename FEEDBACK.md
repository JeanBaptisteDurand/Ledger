# Developer experience feedback — Ledger stack

*Written for Ledger Dev Rel, as the N3XT brief asks: "where the documentation lost you, which workflow
was confusing, what context was missing, and one concrete suggestion. Be blunt."*

Everything below was hit while building [Porte de sortie](README.md). Each item says what we expected,
what happened, and the one change that would fix it. Nothing here is second-hand: every claim has a
file, a line, or a command.

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

