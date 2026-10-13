# From fork to mainnet

Everything this repo shows runs on **a Base fork pinned at block 50,614,000**, so every number replays identically.
The contract, the probe, the Uniswap v4 pools and the Morpho vaults are the real ones; what is specific to the bench is
the keys, the funding and one measurement. Below, line by line: what changes on Base, and in which order to do it,
with a real Ledger and tiny amounts.

## What changes

| on the fork (the bench) | on Base | where |
|---|---|---|
| the vault is deployed by anvil key #0 | **your Ledger** deploys it: `forge create --ledger` | step 1 |
| the vault is funded with 5 wrapped ETH by that key | **you**: a little WETH sent to the vault from your Ledger | step 3 |
| the agent signs with anvil key #1, which is **public** | a **fresh session key**, yours alone, with a little ETH for gas | step 2 |
| the mandate shows in clear: test app, our descriptors signed with Ledger's test key | with the test app (loaded on your Flex on 2 October): **in clear, the same**; with the production app, our descriptors are not recognised: the mandate is signed as raw fields ("Blind signing" and "Raw messages") until Ledger signs our descriptors | step 4 |
| the exit probe (inside the transaction itself) | **identical** | — |
| the single-use exception, the monitoring, the exit | **identical**; each action costs gas | — |
| TARE's counterfactual (`anvil_setCode`: the hook replaced by 89 inert bytes) | **does not exist** on-chain: it runs on a local fork of the current block, as TARE does | — |

Why the agent key matters: the mandate names **an agent address**. With a public key, anyone could act as that agent:
inside your mandate, so without leaving your bounds, but spending your budget. On the fork this is harmless; on Base
it never is.

## Base Sepolia or Base?

The six trap pools and the ten Morpho vaults exist only on Base. On Base Sepolia you can only check the plumbing:
deployment, signed mandate, a refusal on a pool you create yourself. **Recommendation: Base, with tiny amounts** (a few
thousandths of WETH): that is where the refusal means something.

## The steps, in order

```bash
export BASE_RPC_URL=<your Base RPC>
OWNER=<your address, the one on your Ledger>
WETH=0x4200000000000000000000000000000000000006
POOL_MANAGER=0x498581fF718922c3f8e6A244956aF099B2652b2b     # Uniswap v4, Base

# 1 · the vault, deployed by your Ledger (owner = you); a contract creation, so the device asks for "Blind signing"
cd contracts
forge create src/ExitVault.sol:ExitVault --ledger --rpc-url "$BASE_RPC_URL" --broadcast \
  --constructor-args "$OWNER" "$POOL_MANAGER"
VAULT=<the "Deployed to" address>

# 2 · a fresh agent key, kept out of the repo, with ~0.0005 ETH for gas
cast wallet new

# 3 · fund the vault: 0.002 WETH
cast send --ledger --rpc-url "$BASE_RPC_URL" "$WETH" "deposit()" --value 0.002ether
cast send --ledger --rpc-url "$BASE_RPC_URL" "$WETH" "transfer(address,uint256)" "$VAULT" 2000000000000000

# 4 · the mandate, signed on your Flex over USB: this agent, this budget, 300 bps, 7 days
cd .. && . .venv/bin/activate
python3 ledger/sign_mandate.py --usb --vault "$VAULT" --agent <agent address> \
  --budget 2000000000000000 --max-bps 300 --days 7 --out mandate.json
```

Then: a real purchase accepted (a healthy pool), a real refusal (a trap pool: the vault reverts, nothing is spent), a
real exit. These three actions go through the agent; see below.

## Code status

- **Network mode** (10 Oct.): `PDS_NETWORK=live` with `BASE_RPC_URL` (Base Sepolia first, then Base: same code, other
  RPC), `PDS_DEPLOYER_KEY`, `PDS_AGENT_KEY`, `PDS_AGENT_ADDRESS`. In "live" mode the bench does not start anvil,
  credits nothing, and refuses to proceed without these keys. The bots read `PDS_AGENT_KEY` (`agent/agent.py`,
  `agent/vaults.py`, `agent/watch.py`; anvil key #1 is only the fork fallback). A possible safeguard: reject an anvil
  key outside a fork.
- **Funding is now a Ledger action, in the page** (10 Oct.): the deposit is an ETH transfer to the vault, signed on the
  device (the vault holds it as WETH); the withdrawal is an EIP-712 authorisation read in clear and executed by the
  bench. On the fork, the bench still credits 5 demo WETH to the vault and 5 fictional ETH to the holder
  (`PDS_FUND_VAULT=0` turns off the former); in "live" mode, nothing. The vault deployment is still paid by the bench's
  deployer key: on a real network, that key is ours, funded with a little ETH for gas.
- **The counterfactual**: run it against a local fork of the current block rather than against the node.

None of this touches the contract: `ExitVault` is already the mainnet one.
