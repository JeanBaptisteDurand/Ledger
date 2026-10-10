client: fix EIP-712 chain id encoding for every chain id >= 256

**What breaks.** `ledger_app_clients.ethereum.eip712.InputData.init_signature_context` builds the 8-byte chain id
with a loop that masks each byte but never shifts it back:

```python
sig_ctx["chainid"] = bytearray()
for i in range(8):
    sig_ctx["chainid"].append(chainid & (0xff << (i * 8)))
sig_ctx["chainid"].reverse()
```

For any `chainId >= 256`, `chainid & (0xff << 8)` is already larger than 255 and `bytearray.append` raises
`ValueError: byte must be in range(0, 256)`. So EIP-712 filtering through this client works on mainnet, Goerli,
Optimism, BNB and Polygon (1, 5, 10, 56, 137) and fails on Base (8453), Arbitrum (42161), Avalanche (43114), zkSync
(324), Linea (59144), Scroll (534352)… The ragger test inputs under `tests/ragger/eip712_input_files/` all use
chain ids below 256, which is why it went unnoticed.

**The fix.** One line — encode the chain id as 8 bytes big-endian directly:

```python
sig_ctx["chainid"] = bytearray(int(chainid).to_bytes(8, "big"))
```

It is byte-for-byte identical to the previous loop for every chain id below 256 (checked for 0, 1, 5, 10, 56, 137,
255), so nothing changes for the existing tests; for 8453 it yields `0000000000002105`.

**How we found it.** Building a clear-signing flow for an EIP-712 mandate on a Base fork, with the app compiled
with `CAL_TEST_KEY=1` and filters signed by this client. Reproduced on app-ethereum 1.22.4 and on today's `master`
(`client/src/ledger_app_clients/ethereum/eip712/InputData.py`, lines 577–581).

Happy to add a ragger input file with `"chainId": 8453` to the test set if you want the regression covered.
