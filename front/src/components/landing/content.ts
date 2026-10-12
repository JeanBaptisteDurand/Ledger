/**
 * The home's content, once. Every figure is quoted from README.md by section and no other is invented.
 * English, like the hero's screen words.
 *
 * A title is three parts, [before, hot, after]: the hot part is what stays incandescent after the title has
 * cooled, the one thing the eye should land on. A `takeaway` is the section in one mono line, its figures
 * README.md's, read before anything else; a `mirrorHot` names the device line that matters.
 */
export type HotTitle = readonly [string, string, string]

export const CLAIM = {
  title: ['Agent Policies bound what an agent spends. Nobody bounds ', 'what it can recover.', ''] as HotTitle,
  takeaway: 'Spend is bounded. Recovery is not.',
  source: 'README.md, “In English, on one page”, the gap.',
}

export const TRAP = {
  title: ['The entry ', 'lies', ' about the exit.'] as HotTitle,
  takeaway: 'Six pools · 0 bps in · 9 990 bps out · Moonwell closed at 2 693 bps',
  entry: 0,
  exit: 9990,
  unit: 'bps',
  note: ['Six real pools on Base. The same hook sets both prices, and an agent only ever sees ', 'the first', '. All six were refused. The witnesses were accepted.'] as const,
  vaultsTitle: 'Second instance, ERC-4626 vaults',
  vaults: [
    ['Real vaults probed', '10', ''],
    ['Moonwell, largest WETH vault on Base', '2 693 bps closed', 'error'],
    ['previewRedeem says', '522.57 WETH', ''],
    ['maxWithdraw says', '381.82 WETH', ''],
    ['Vaults full', '5 of 10', 'hot'],
  ] as const,
  standard: ['The standard writes the trap in: ', 'previewRedeem', ' must ignore withdrawal limits. The door is read from ', 'maxWithdraw', '.'] as const,
  source: 'README.md, “The gap” and “What is proven”, measured on a Base fork at block 50 614 000.',
}

export const AGENT = {
  title: ['And the agent ', 'goes in anyway.', ''] as HotTitle,
  takeaway: 'earn yields: four fields, and no exit',
  mirrorHot: 'Exit',
  lead: 'The yield agent takes Moonwell first, on the displayed yield, like any agent would. It never sees the door, because nothing it reads carries one.',
  body: ['Ledger’s own ', 'earn yields', ' returns four fields for a position. None of them is the way out.'] as const,
  mirrorTitle: 'wallet-cli earn yields',
  mirror: [['Provider', 'Moonwell'], ['Token', 'WETH'], ['Yield', 'displayed APY'], ['Deposit', 'link'], ['Exit', 'not returned']] as const,
  caption: 'What their tool returns. The last line is the one that is not there.',
  source: 'README.md, “The agents” (ledger_earn_yields), and FEEDBACK.md.',
}

export const RULE = {
  title: ['', 'One signature.', ''] as HotTitle,
  takeaway: 'Budget · max loss 150 bps · expiry, signed once, on the device',
  mirrorHot: 'Max round trip loss (bps)',
  lead: 'You write what you want in a sentence. A strategist turns it into bounds. Three of them travel to your Ledger: the budget, the exit loss you tolerate, the expiry.',
  body: 'A contract holds that rule at every position, by measuring the way out inside the transaction itself. The device cannot do this, because it has no network and no state. So it authorises the contract that does.',
  mirrorTitle: 'Exit mandate',
  mirror: [['Network', 'Base'], ['Agent', '0x7099…79C8'], ['Budget', '0.5 WETH'], ['Max round trip loss (bps)', '150'], ['Expires', '2026-10-02 18:00 UTC']] as const,
  caption: 'Read on the device, then hold to sign. Once.',
  source: 'README.md, “The mechanism” and “The agents”.',
}

export const OVERFLOW = {
  title: ['When it overflows, it comes back ', 'with the number.', ''] as HotTitle,
  takeaway: 'Refused at 2 693 bps → back to the device, with the number',
  mirrorHot: 'EXIT COST (bps)',
  lead: 'Nothing goes to the Ledger while the rule holds. When the contract refuses, the request returns to the device, with the exit cost it measured.',
  mirrorTitle: 'Exit exception',
  mirror: [['Position', 'Moonwell Flagship ETH'], ['Amount', '0.05 WETH'], ['EXIT COST (bps)', '2693'], ['Valid until', '2026-09-25 19:12 UTC']] as const,
  sign: ['read and sign', 'Once, for this position, this amount, and the number you just read. If the exit worsens before it lands, the exception is worth nothing.'] as const,
  refuse: ['leave refused', 'The refusal is kept. No bot asks for that position again.'] as const,
  source: 'README.md, “The mechanism”: what overflows comes back to the device with the number.',
}

export type Step = { label: string; duration?: string; outcome?: string; tone?: 'success' | 'warning' | 'error' }
export const MEASURED = {
  title: ['Measured, ', 'end to end.', ''] as HotTitle,
  takeaway: '124 s · 0 alerts · 2 bought, 8 refused',
  lead: 'The whole path, in a real browser, on the final code, with a holder approving each screen in 3 seconds.',
  total: 124,
  alerts: 0,
  note: ['Every refusal on the way is the contract measuring the exit inside the transaction and reverting with the reason, ', 'CannotExit(lossBps, maxBps)', '. The agent reads why.'] as const,
  steps: [
    { label: 'Sign in with Ethereum, on the Ledger', duration: '7 s' },
    { label: 'Mandate signed in the page', duration: '10 s', outcome: 'isBlindSign=false · eip7730', tone: 'success' },
    { label: 'Ten pool rounds', outcome: '2 bought, 8 refused' },
    { label: 'Exception read and signed', duration: '11 s', outcome: '1 312 → 1 312 bps, sold' },
    { label: 'Five vault rounds', outcome: 'Moonwell refused, door at 2 681 bps', tone: 'error' },
    { label: 'Exception on Moonwell signed', duration: '10 s' },
    { label: 'Bot added, first round, stopped, found in history', duration: '2 s' },
    { label: 'The analyst answers, by bots and vault_openness', duration: '35 s' },
    { label: 'Reconnect by the device', outcome: 'same vault, five positions, two exceptions', tone: 'success' },
  ] as Step[],
  source: 'The 25 September 2026 run, in a real browser. front/APP.md for the latest run.',
}

export const FINDINGS = {
  title: ['What we found in ', 'their stack', ', building this.'] as HotTitle,
  takeaway: '5 findings · 3 reproduced · 2 PRs and 5 issues written · all documented',
  rows: [
    { what: 'Clear signing is closed without a partner token, and fails silently', detail: 'The registry answers 403 without an origin token. We built the production app with its test key and signed our descriptors ourselves.', tone: 'error', status: 'worked around, documented' },
    { what: 'signMessage drops any message with one non ASCII character', detail: 'The kit counts characters and encodes bytes. One accent and the app stays stuck in SIGNING_MESSAGE. Replayed on 10 October: 600 bytes of ASCII sign, ten accented letters fail.', tone: 'error', status: 'reproduced, issue written' },
    { what: 'chainId at or above 256 breaks the filter encoding', detail: 'In the official Python client. A one line fix.', tone: 'warning', status: 'PR to open' },
    { what: 'The kit detects blind signing and does not tell the developer', detail: 'It reports it to Ledger. Measured in both directions.', tone: 'info', status: 'documented' },
    { what: 'A second client during a signature kills the app', detail: '0x6901 to everything until restart. One tab, one device.', tone: 'error', status: 'reproduced' },
  ] as Array<{ what: string; detail: string; tone: 'error' | 'warning' | 'info'; status: string }>,
  source: 'FEEDBACK.md, sections 1 to 8. The pull requests and issues are written in upstream/.',
}

export const BRICKS = {
  title: ['Three bricks, ', 'three roles.', ''] as HotTitle,
  takeaway: 'The one that acts has no LLM · the one with an LLM cannot act',
  lead: 'The one that acts has no LLM. The one with an LLM cannot act. The model never touches a key.',
  items: [
    { name: 'Signer', version: 'Signer Kit 1.18.1 on DMK 1.9.1', role: 'approve', line: 'The rule is born on the device. The mandate and every exception go through the official kit, in the holder’s own browser.', without: 'Without it we lose everything. It is the trust.' },
    { name: 'Agent Stack', version: 'wallet-cli 2.1.0', role: 'read and understand', line: 'The real agent is an analyst wired only to a read only MCP. It cites the tool under every number and cannot act.', without: 'Without it we lose the real agent, and the reading of their Earn.' },
    { name: 'Ring', version: 'Ledger Key Ring Protocol', role: 'keep a secret', line: 'It seals the key that opens the data to the analyst, under the operator’s seed, revocable from the device.', without: 'Without it, a key in clear on the disk. In SaaS it is the brick we would remove.' },
  ],
  source: 'README.md, “Ledger’s bricks, one role each”.',
}

export const CALL = {
  title: ['Your Ledger ', 'stays with you.', ''] as HotTitle,
  takeaway: 'Your funds from your Ledger · one mandate · back on one signature',
  lead: 'You fund the vault from your Ledger, we only hold a mandate, and your funds come back on an authorisation you read on the device.',
  cta: 'Open your account',
  href: '/connexion',
  source: 'README.md, “As a service”.',
}

/*
 * ── The explanation, whole (2026-10-12) ──────────────────────────────────
 * What the schema page said is said here now, in the home's grammar: the principle, the system on one sheet, the
 * two kinds of agents and the analyst's ten tools, one signature step by step, the account, the limits and the
 * keys, the service. Every figure is README.md's, FRONT.md's or FEEDBACK.md's. No dash, no semicolon.
 */
export type Fact = readonly [string, string, '' | 'hot' | 'success' | 'warning' | 'error' | 'info']
export type Principle = { kicker: string; title: string; text: string; facts: readonly Fact[] }
export type Pair = readonly [string, string]

export const PRINCIPLE = {
  title: ['Everyone bounds the spend. Nobody bounds ', 'the exit.', ''] as HotTitle,
  takeaway: 'Agent Policies: what the agent commits · us: what it can get back out',
  lead: 'A daily cap, an allow-list, a maximum slippage: everyone bounds what an agent commits. Nobody checks what it will be able to recover. A token whose hook blocks the resale, a vault you only leave after a queue: the same closed door, invisible at entry.',
  rows: [
    { kicker: 'You sign · the Signer', title: 'Once', text: 'Your Ledger signs three things: the sign-in, the mandate, each exception. Never a purchase. Ledger’s Signer Kit runs in your browser. The device shows the budget, the tolerated exit loss and the expiry, in clear.', facts: [['Brick', 'Signer Kit · DMK', ''], ['Standard', 'EIP-712 · EIP-4361', '']] },
    { kicker: 'The contract applies', title: 'At every entry', text: 'The vault buys and simulates the resale in the same transaction. If the exit costs more than your mandate, it refuses. For a yield vault it performs the real deposit and withdrawal, reverted, and reads the largest depositor’s door.', facts: [['Contract', 'ExitVault', ''], ['Universes', 'Uniswap v4 · ERC-4626', '']] },
    { kicker: 'What overflows comes back to you', title: 'With the number', text: 'A negotiable refusal becomes a request on the device. You read the real exit cost and you sign a one-time exception, or you leave it refused. If the exit worsens in the meantime, the exception is worth nothing.', facts: [['Screen', 'EXIT COST (BPS)', 'hot'], ['Scope', 'one position, once', '']] },
    { kicker: 'Why a contract, and not the device', title: 'It authorises, the contract measures', text: 'The device has no network and no state: it cannot measure the market. It authorises the rule, in clear, and the contract measures it at every entry, in the execution block. That is the only place where the exit cost can be read at the moment it counts.', facts: [['The device', 'reads, authorises', ''], ['The contract', 'measures, refuses', '']] },
  ] as readonly Principle[],
  source: 'README.md, “The gap” and “The mechanism”.',
}

export const MAP = {
  title: ['The whole system ', 'on one sheet.', ''] as HotTitle,
  takeaway: 'Orange: what the holder approves · green: what reads without acting · blue: the secret',
  note: ['One path leads to a purchase: a bot, its session key, ', 'the vault', '. Everything else reads, measures or signs a rule. The language model is on the right, on the side that can do nothing.'] as const,
  source: 'README.md, “Ledger’s bricks, one role each”. AGENTS.md, “Layout”.',
}

export const AGENTS = {
  title: ['Two kinds of agents, ', 'one boundary.', ''] as HotTitle,
  takeaway: 'The bots act without an LLM · the analyst has an LLM and can do nothing',
  lead: 'The agent chooses which position to take, when and how much. The human signs the budget, the tolerated exit and the expiry. The contract applies. The agent can neither raise the threshold, nor change the rule, nor touch the key.',
  bots: { kicker: 'They act · no language model', title: 'The bots', text: 'Execution agents you name, start and stop. One does DCA on the Uniswap v4 long tail, the other looks for yield in vaults. They rank on what they see and never see the exit: the contract measures it, and a watcher re-probes every held position and exits while it still can, because a door can close after the purchase. Their key can only call your vault.', facts: [['Cadence', 'one round · 30 s · 60 s · 5 min', ''], ['Scheduling', 'one round at a time per account', ''], ['Memory', 'the journal, line by line', '']] as readonly Fact[] },
  analyst: { kicker: 'It understands · Agent Stack', title: 'The analyst', text: 'Claude, wired only to our read-only tools. It answers from your account’s data, cites the tool behind every number, and can sign nothing, send nothing, stop nothing. Ledger’s wallet-cli is one of its tools.', facts: [['Tools', '10 · read only', 'hot'], ['Key', 'derived from your address', ''], ['Example', 'bots() · vault_openness()', '']] as readonly Fact[] },
  tools: [
    ['bots', 'your trading agents: live and stopped, universe, cadence, rounds, purchases and refusals, exceptions, spend'],
    ['operations', 'the operations attempted, the outcome and its reason, per agent if asked'],
    ['decision', 'everything that led to a decision: universe, shortlist, scores and their detail, probe, outcome'],
    ['positions', 'what the vault holds, which agent took it, what is left of the signed budget'],
    ['mandate', 'the mandate signed on the Ledger, and what it allows'],
    ['compare_entry_exit', 'the entry against the exit, operation by operation'],
    ['universe_facts', 'why a trap cannot be told apart before buying, with the figures'],
    ['hook_analysis', 'what each hook takes, measured again live by TARE’s counterfactual, at entry and at exit'],
    ['vault_openness', 'the door of the ERC-4626 vaults, measured now: real round trip, locked share of the largest depositor, full vaults'],
    ['ledger_earn_yields', 'what Ledger’s Agent Stack (wallet-cli earn yields) says about a yield position, and what it does not say: the exit'],
  ] as readonly Pair[],
  note: ['No language model touches a key. An instruction injected into a page the agent reads can make it ', 'choose', ' a trap. It cannot make it exceed your mandate.'] as const,
  source: 'README.md, “The agents” and “The MCP”. mcp/pds_mcp.py.',
}

export const SIGNATURE = {
  title: ['The server asks, your page signs, ', 'the contract verifies.', ''] as HotTitle,
  takeaway: 'The server never sees the device · one token per signature · one client at a time',
  lead: 'The server puts a signature on hold. Only the page that asked for it has it signed on your Ledger. The contract verifies before it acts. Here, an exception.',
  steps: [
    ['A trading agent', 'wants to enter. The vault measures the exit inside the transaction itself and refuses: it costs more than your mandate'],
    ['The server', 'prepares the exception (EIP-712: position, amount, exit cost read, expiry) and puts it on hold with a token'],
    ['Your page', 'the one that asked, it holds the token, fetches the clear-signing descriptor of your vault'],
    ['The Signer Kit', 'in your browser, sends the exception to the device: WebHID, or the emulated Flex through the proxy'],
    ['Your Ledger', 'shows EXIT COST (BPS) and the rest in clear. You sign, or you refuse'],
    ['The contract', 'verifies the signature and measures the exit again: if it has worsened since you read it, it refuses. Otherwise it enters, once'],
  ] as readonly Pair[],
  note: ['One client at a time on the device: two pages talking to it while you read break the signature (', '0x6901', '). A second tab therefore never signs what it did not ask for.'] as const,
  source: 'FRONT.md § 2.2. FEEDBACK.md § 8.',
}

export const ACCOUNT = {
  title: ['A proven address, a folder, ', 'a key written nowhere.', ''] as HotTitle,
  takeaway: 'No user database · no password · HMAC-SHA256(master secret, address)',
  lead: 'An account is the address that signed the sign-in message. Everything it owns is filed under it, and nothing from another account is visible to it.',
  rows: [
    { kicker: 'Sign in', title: 'Sign-In with Ethereum', text: 'An EIP-4361 message in pure ASCII, signed on the device in the browser, verified by the server: one-time nonce, address, signature. One accented character and the Signer Kit drops the whole message, a bug we document. Then a session by cookie.', facts: [['Standard', 'EIP-4361', ''], ['Session', 'HttpOnly cookie', '']] },
    { kicker: 'What is yours', title: 'accounts/‹address›/', text: 'One folder per address, and each file says one thing: the profile, the signed mandate, your agents, every decision in the bot’s name, what you were told about, what you did.', facts: [['mandate.json', 'the signed mandate', ''], ['journal.jsonl', 'every decision, in the bot’s name', ''], ['events.jsonl', 'what you did', '']] },
    { kicker: 'Your MCP key', title: 'Derived, never stored', text: 'HMAC-SHA256(master secret, address): the key is recomputed whenever it is needed and opens only your files. One secret to keep for every account, the one the Ledger Key Ring seals.', facts: [['Your key', 'your data, read only', 'hot'], ['Someone else’s', 'refused', 'error']] },
  ] as readonly Principle[],
  note: ['What the sign-in proves, honestly: ', 'an address', ', not a device. Any wallet can sign that message. The Ledger makes the difference at the mandate: that is where the rule is read in clear and signed, on its screen.'] as const,
  source: 'FRONT.md § 2.3. README.md, “The bench, in the browser”, step 0.',
}

export const PROOFS = {
  kicker: 'Two proofs beside the bricks',
  rows: [['Clear signing', 'our descriptors, signed with Ledger’s test key in a build of their production app: Ledger only signs for its partners', ''], ['A real Flex', 'the mandate clear-signed over USB by the Signer Kit, the signature verified by ecrecover', 'hot']] as readonly Fact[],
}

export const SERVICE = {
  keeps: { kicker: 'What the holder keeps', rows: [['Their key', 'on their Ledger, nowhere else'], ['Their sign-in', 'Sign-In with Ethereum, signed in their page'], ['Their vault', 'a contract in their name, one per account'], ['Their mandate', 'read and signed on the device, once'], ['Their funds', 'deposited from their Ledger, taken back on an authorisation read in clear'], ['Their data', 'a read-only MCP, a key derived from their address']] as readonly Pair[] },
  holds: { kicker: 'What we hold', rows: [['A session key', 'it can only call their vault, within their mandate'], ['A master secret', 'sealed in the operator’s Ledger Key Ring'], ['Nothing else', 'no key, no funds, no right to take anything out']] as readonly Pair[] },
  caption: 'The deposit is an ETH transfer signed on the Ledger. The withdrawal is an authorisation read in clear on the device and executed by us, without being able to change a digit. Still to build: revoking a mandate before its expiry.',
  demo: 'See the demo',
  demoHref: '/demo',
}
