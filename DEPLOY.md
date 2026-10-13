# Deploying Net·Out

**<https://netout.tech>** serves the whole site and the bench behind it: the same as `scripts/site.sh` locally, on a
server. This file covers how it is served, what was verified from outside, and the known limits.

## Current setup (13 October 2026)

The domain points to an OVH VPS (Ubuntu 26.04, 6 cores, 11 GB) that other sites already share, behind their Caddy
container. The certificate is from Let's Encrypt, obtained and renewed by that Caddy; `www.netout.tech` redirects to
`netout.tech`.

| what runs | where | how |
|---|---|---|
| the front end (Vite build) | `/home/ubuntu/netout/dist`, mounted read-only in the Caddy container | served as is, every route falls back to `index.html` |
| the bench server (`web/server.py`) | `127.0.0.1:8199` on the host | systemd service `netout-banc`, capped at 2.2 GB; client-side signing by default (`PDS_SIGNER=browser`) |
| the Caddy → bench relay | Unix socket `/home/ubuntu/netout/sock/banc.sock` | `netout-banc-proxy.socket` and `systemd-socket-proxyd` |
| the Base fork (anvil) | `127.0.0.1:8545` | started by the server when the first session opens |
| the emulated Flex (Speculos) | `127.0.0.1:5013`, in Docker | `ledger/speculos.sh up`; the bench relays it under `/speculos` |
| the automatic holder | off by default | `netout-porteur`, started for a video or an unattended demo |
| the analyst and the strategist | the OpenAI API, `gpt-4o-mini` | `PDS_LLM=openai` in the service; the key in `/home/ubuntu/netout/openai.env` (600), outside the repo |

Caddy sends `/api/*`, `/speculos/*` and `/dist/*` to the bench, everything else to the front end. **No port is opened
for Net·Out** and the server's firewall is untouched: Caddy reaches the bench through a file, not over the network.
The emulator listens on the machine only; the Internet reaches it only through the bench's relay.

## What was verified from outside

From another machine, on `https://netout.tech`, with headless Chromium:

- **The full journey** (`FRONT_URL=https://netout.tech node front/scripts/parcours-app.mjs`, an automated holder
  tapping the emulated Flex through the site's `/speculos` relay): SIWE sign-in, vault, deposit signed on the device,
  bounds, mandate, a pool bot, one exception signed and one left refused, re-probe and exit, withdrawal, a vault bot
  stopped, the Bots panel, sign-out and back in, the sign-in gate on the account pages. **Everything passes in 179 s**,
  except the analyst (see below).
- **The same journey, by hand** (`APPROVER=page`): no automated holder; each approval is a mouse gesture on the image
  of the Flex shown by the page, as a judge would do it. **Everything passes in 220 s, in 29 gestures**, except the
  analyst. This test showed that `/account` and `/trades` requested signatures without showing the Flex: it now
  appears there, bottom left, as soon as a signature is waiting for it.
- **The usage and device suites** (`FRONT_URL=https://netout.tech BENCH_SSH=vps-ovh`): the three signing paths, a
  rejection on the device, two tabs on the same account, the bench then the emulator restarted under an open page,
  invalid inputs, the menu on a phone, the reset. Everything passes, except the questions to the analyst.
- **Funds only, by hand** (`PARCOURS=fonds APPROVER=page`): sign-in, deposit, mandate, withdrawal. Everything passes
  in 91 s, in 17 gestures.

## One command

```bash
scripts/deploy.sh          # builds the front end, copies it, copies the bench code, restarts the bench, checks the site
scripts/deploy.sh front    # front end only: the bench keeps running
```

The script never copies the bench state (accounts, sessions, MCP key, logs) or any secret, and deletes nothing on the
server outside the front-end folder. The one-time server files are in [`deploy/`](deploy/).

## Initial setup

What was done on the server, in order, with what the repo provides:

```bash
# the tools: uv and Python 3.12 (the system has 3.14), foundry, node 22, the Speculos image
python3 -m venv ~/uvenv && ~/uvenv/bin/pip install uv && ~/uvenv/bin/uv python install 3.12
mkdir -p ~/.foundry/bin && curl -sL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz | tar xz -C ~/.foundry/bin
sudo apt-get install -y nodejs npm python3-venv && docker pull ghcr.io/ledgerhq/speculos:latest

# the code: this repo (scripts/deploy.sh), TARE next to it (the measurement corpus), the pinned Ethereum app client
git clone https://github.com/JeanBaptisteDurand/ETH_Online_2026 ~/ETH_Online_2026   # + .env: BASE_RPC_URL only, chmod 600
# + infra/speculos/apps/ethereum-flex-testkey.elf, the app built with the test key (ledger/build/build-flex.sh)
cd ~/Ledger/ledger/build && git clone --depth 1 -b stax_1.10.1_1.22.4_sdk_v26.6.2 https://github.com/LedgerHQ/app-ethereum.git
cd ~/Ledger && ~/uvenv/bin/uv venv --python 3.12 .venv
~/uvenv/bin/uv pip install --python .venv/bin/python ./ledger/build/app-ethereum/client -r ledger/requirements.txt
# then the exact versions from the local bench (uv pip freeze), minus PyQt6, pygame and speculos: the emulator runs in Docker
(cd ledger/dmk && npm ci)

# the bench, its socket, the holder; then the Caddy block (deploy/Caddyfile.netout) and two mounts in the Caddy container:
#   /home/ubuntu/netout/dist:/usr/share/caddy:ro   and   /home/ubuntu/netout/sock:/run/netout
mkdir -p ~/netout/bin ~/netout/sock && cp deploy/banc.sh ~/netout/ && cp deploy/bin/claude ~/netout/bin/
sudo cp deploy/*.service deploy/*.socket /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now netout-banc netout-banc-proxy.socket
```

`deploy/banc.sh` starts the server with the right `PATH`: foundry, node, and first `deploy/bin/claude`, which hands
over to the real `claude` CLI if it is signed in on the server, and otherwise says so in one sentence. On the live
server, `PDS_LLM=openai` routes the analyst and the strategist through the OpenAI API: the key goes in
`/home/ubuntu/netout/openai.env` (`OPENAI_API_KEY=…`, mode 600), which the service reads.

## Six pitfalls and their fixes

1. **The Caddy container has a read-only file system.** A mount on a path that does not exist in the image
   (`/srv/netout`) stops the container from starting, and the other sites go down with it. So the front end is mounted
   on `/usr/share/caddy`, which exists in the image; once recreated, the container served the other sites again in 5 s.
2. **The server's firewall (ufw, DROP policy) blocks a container that calls the host.** `host.docker.internal`
   returned a 502. No port was opened: the bench is reached through a Unix socket mounted in the container.
3. **Docker's published ports bypass ufw.** Speculos published on `0.0.0.0:5013` was reachable from the Internet;
   `ledger/speculos.sh` now publishes it on `127.0.0.1` (`BIND` to change it).
4. **Port 8099 on the host was taken** by another service: the bench listens on 8199 (`PORT`).
5. **`pkill -f` matches its own command line** when passed through `ssh`: the session dropped mid-install. A pattern
   like `[a]nvil` does not match itself.
6. **The bench and the emulator clashed over `PORT`.** The service sets `PORT=8199` for the bench, and `speculos.sh`
   read the same variable: relaunched by the bench right after a restart, it targeted 8199, removed the healthy
   container on 5013 and failed. The emulator's port is now `SPECULOS_PORT` (5013 by default).

## Checking from outside

```bash
curl -sI https://netout.tech | head -1                                         # HTTP/2 200
curl -s https://netout.tech/api/state | head -c 120                            # the bench state, as JSON
curl -s 'https://netout.tech/speculos/events?currentscreenonly=true' | head -c 120   # the emulated Flex's screen
FRONT_URL=https://netout.tech BENCH_SSH=vps-ovh node front/scripts/tests-usage.mjs  # the suites, on the live site
```

For a video with nobody at the mouse: `sudo systemctl start netout-porteur` on the server, then `stop`.

To start again from a fresh fork, with the README's numbers (Moonwell at 2,693: each run lowers it by one or two
points): "Start over" on `/demo`, then

```bash
ssh vps-ovh 'pkill -u ubuntu -f "[a]nvil --fork-url"; sudo systemctl restart netout-banc'
```

The next session to open restarts the fork at block 50,614,000.

## Operating notes

- **The emulated Flex is shared.** There is only one: everyone who picks it shares the same holder, hence the same
  account, and it signs one thing at a time. A real Ledger opens its own account. A signature abandoned mid-review no
  longer blocks it: a screen left three minutes without a gesture or a command is rejected on the device by the bench
  (`PDS_STALE_SCREEN_S`), and meanwhile the one-click sign-in says the Flex is busy.
- **The real Ledger online**: replayed on this domain on 13 October, in Chrome. The sign-in and an exception are in
  photos ([`captures/ledger-reelle/`](captures/ledger-reelle/)); the mandate of the same account, signed by the same
  Flex, is on the map. It needs Chrome, Edge or Brave (WebHID) and the
  Ethereum app built with the test key. The deposit it signs is a real Base transaction, which the bench broadcasts
  only on the fork: it would remain valid on mainnet at the same nonce. Test with an address that holds no ETH on Base.
- **The analyst and the strategist** run on the OpenAI key set on the server, and every visitor question is billed
  to it. Without a key, the strategist falls back to a deterministic mode and the analyst says it cannot run.
