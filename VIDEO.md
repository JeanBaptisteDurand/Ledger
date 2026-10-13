# The video — the script, 3 min 20

**The video online: <https://youtu.be/8AGHwGirckI>**

*For Florent and Jean-Baptiste, 12 October 2026. The reviewed version of Florent's script, with what to put up front:
the Ledger's four gestures, the recompiled app, the upstream feedback, the hands-on walkthrough, the deposit and the withdrawal.
Every figure comes from the repository. Voice-over in bold italics = added or changed.*

| Time | On screen | Voice-over |
|---|---|---|
| **0:00** | `/`, let the dawn play, three scrolls, the three words SPENDING · THE EXIT · THE RULE | You give an agent a budget. You have set its limits: a cap, a list of contracts, a maximum slippage. It respects them all. And it can still take a position it will never get out of. Everyone bounds what an agent spends. No one bounds what it can get back. That is Net·Out: an agent cannot enter a position it cannot exit. |
| **0:30** | The "The entry lies about the exit" band, let the counter roll 0 → 9 990 | On Base, six real pools let you in for zero basis points, and take 9 990 on the way out. The same hook sets both prices. The agent only ever sees the first. And this is not only about memecoins. The largest WETH yield vault on Base has 27% of its largest depositor's position locked. Its API shows a yield. Never the exit. ***Neither does the "earn yields" tool in Ledger's Agent Stack: the provider, the token, the yield, a deposit link. Zero fields on the exit.*** |
| **0:55** | "Everyone bounds the spend", the four rows | Our answer fits in three gestures. You sign a mandate once, on your Ledger: a budget, a tolerated exit loss, an expiry. Three numbers, read in clear on the screen. A contract in your name enforces it on every entry. It buys, then simulates the resale in the same transaction. If the exit costs more than your mandate allows, it refuses. The transaction never happens. And anything that overflows comes back to the device, with the number. ***The device has no network and no state: it cannot measure the market. It authorises the rule. The contract does the measuring, in the block, the only place where the exit cost can be read at the moment it counts.*** |
| **1:20** | The map, zoom on the LEDGER FLEX node and its four lines; then the real Flex with the mandate (capture from 2 October) and the line `isBlindSign=false · eip7730` | ***Your Ledger does four things here, and not one more. It proves your address: that is your account, with no email and no password. It signs the deposit: an ETH transfer, the only transaction it will ever sign. It reads and signs the mandate, once, and each exception, with the number. It authorises the withdrawal. Never a purchase. Over USB in your browser, or on the bench's emulated Flex: the server never sees your device, it receives a signature. For the Flex to read all of this in clear, it needs descriptors, and Ledger's registry answers 403 without a partner token. So we compiled their Ethereum app with its test key, signed our descriptors with that key, and loaded the app onto a real Flex. The kit's report says so: isBlindSign=false.*** |
| **1:45** | "Two kinds of agents", the two panels and the ten tools | Two kinds of agents. The bots act, with no language model: they choose from what they see, and they never see the exit. The analyst understands: it is Claude, connected to ten read-only tools. It cites the tool behind every number, and it cannot sign anything. The one that acts has no LLM. The one with an LLM cannot act. An injected prompt can make it pick a trap. It cannot make it exceed your mandate. |
| **2:00** | "When it overflows", the EXIT COST (bps) 2693 mirror, the two outcomes | The moment no one else can show. The contract measured 2 693 basis points on the exit. Your mandate allows ***the number read on the screen: 150 for "cautiously", 300 otherwise***. The request comes back to the Flex, with that number. You read, and you decide: sign an exception, for this position, this amount, once. Or leave it refused. And if the exit gets worse between your reading and the execution, the exception is worth nothing. |
| **2:20** | `/connexion` (emulated Flex, one click), `/account` (0.5 ETH deposit signed on the Flex), `/demo` Live map in full screen (the sentence, the mandate), a vaults bot, the request, the signature, the bot's slot lighting up | ***Live, on an emulated Flex. No email, no password: I sign in with the Ledger. I deposit 0.5 ETH from my Ledger into my vault: the only transaction it signs. I write a sentence; the strategist turns it into three bounds and tells me what they do not protect. I read them on the Flex, I sign once.*** I add an agent on the vaults. ***TARE measures every vault: a real deposit and withdrawal, reverted within the transaction, and the largest depositor's door.*** The vault enters, or refuses. Moonwell: 2 693 at the door. The request goes up to the Ledger. I read it. I sign. The contract measures again, and enters, under the exception. |
| **2:45** | `/account`: a question to the analyst, the tool trace under the answer; the 0.1 WETH withdrawal signed on the Flex | ***I ask the analyst why. It answers, and under every number, the tool it called. Then I withdraw: an authorisation read in clear, executed by the bench, which cannot change a single digit of it.*** |
| **3:00** | The list of files in `upstream/` (the folder's README), then "Your Ledger stays with you" | ***Building this, we read their stack down to the bone, and we hand them our feedback, with the file and the line: a one-line bug that breaks clear signing on Base, whose fix another developer proposed the day before and we confirm; a signMessage that drops accented characters; a kit that sees blind signing and does not tell the developer.*** Your Ledger stays with you. Your funds leave from your Ledger and come back to it on an authorisation read in clear. We only hold a mandate: ***three numbers and an expiry***. An agent cannot enter a position it cannot exit. Net·Out. |

**Three lines from the old script to drop**: "it can be revoked in one gesture" (no button revokes; only the contract can);
"what the hook takes on entry" for a vaults bot (a vault has no hook: it is the door); "your mandate allows 300" as a
fixed figure (it depends on the sentence: "cautiously" gives 150).

**To shoot the live part online**, on <https://netout.tech>: the emulated Flex is approved with the mouse, in the page
(a click presses, a drag to the left turns the page, a long press signs); it appears by itself at the bottom left of
`/account` and `/trades` when a signature is waiting for it. To have it approve on its own after 2 s of reading:
`ssh vps-ovh sudo systemctl start netout-porteur`, then `stop` at the end. One person at a time: the emulated Flex
is shared.

- **The analyst (2:45) needs the `claude` CLI logged in on the server**: `ssh -t vps-ovh claude`, then `/login`,
  once. Without it, the answer says it is not logged in.
- **Moonwell reads 2 693 only on a fresh fork**: each run deposits a little into it and lowers it by one or two points.
  Before shooting: "Start over" on `/demo`, then restart from a fresh fork (the command is in `DEPLOY.md`).
- **Locally**, `PORTEUR=1 scripts/site.sh` starts the bench, the front end and this automatic holder; the machine must
  be dedicated to it (no other Docker containers, no training runs).

The vaults bot's round takes 20 to 40 s: allow 60 s on screen, or cut it in the edit.
