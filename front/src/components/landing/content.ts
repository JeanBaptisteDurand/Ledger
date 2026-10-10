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
  source: 'README.md, « In English, on one page » and « Le problème ».',
}

export const TRAP = {
  title: ['The entry ', 'lies', ' about the exit.'] as HotTitle,
  takeaway: 'Six pools · 0 bps in · 9 990 bps out · Moonwell closed at 2 693 bps',
  entry: 0,
  exit: 9990,
  unit: 'bps',
  note: ['Six real pools on Base. The same hook sets both prices, and an agent only ever sees ', 'the first', '. All six were refused; the witnesses were accepted.'] as const,
  vaultsTitle: 'Second instance, ERC-4626 vaults',
  vaults: [
    ['Real vaults probed', '10', ''],
    ['Moonwell, largest WETH vault on Base', '2 693 bps closed', 'error'],
    ['previewRedeem says', '522.57 WETH', ''],
    ['maxWithdraw says', '381.82 WETH', ''],
    ['Vaults full', '5 of 10', 'hot'],
  ] as const,
  standard: ['The standard writes the trap in: ', 'previewRedeem', ' must ignore withdrawal limits. The door is read from ', 'maxWithdraw', '.'] as const,
  source: 'README.md, « Le problème » and « La seconde instance » — measured on a Base fork at block 50 614 000.',
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
  source: 'README.md, « Le MCP » (ledger_earn_yields) and « L’analyste »; FEEDBACK.md.',
}

export const RULE = {
  title: ['', 'One signature.', ''] as HotTitle,
  takeaway: 'Budget · max loss 150 bps · expiry — signed once, on the device',
  mirrorHot: 'Max round trip loss (bps)',
  lead: 'You write what you want in a sentence. A strategist turns it into bounds. Three of them travel to your Ledger: the budget, the exit loss you tolerate, the expiry.',
  body: 'A contract holds that rule at every position, by measuring the way out inside the transaction itself. The device cannot do this, because it has no network and no state; so it authorises the contract that does.',
  mirrorTitle: 'Exit mandate',
  mirror: [['Network', 'Base'], ['Agent', '0x7099…79C8'], ['Budget', '0.5 WETH'], ['Max round trip loss (bps)', '150'], ['Expires', '2026-10-02 18:00 UTC']] as const,
  caption: 'Read on the device, then hold to sign. Once.',
  source: 'README.md, « Le mécanisme » and « La frontière agent / humain ».',
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
  source: 'README.md, « L’escalade — hors bornes ne veut pas dire non ».',
}

export type Step = { label: string; duration?: string; outcome?: string; tone?: 'success' | 'warning' | 'error' }
export const MEASURED = {
  title: ['Measured, ', 'end to end.', ''] as HotTitle,
  takeaway: '124 s · 0 alerts · 2 bought, 8 refused',
  lead: 'The whole path, in a real browser, on the final code, with a bearer approving each screen in 3 seconds.',
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
  source: 'The 25 September 2026 run, in a real browser; front/APP.md for the latest run.',
}

export const FINDINGS = {
  title: ['What we found in ', 'their stack', ', building this.'] as HotTitle,
  takeaway: '5 findings · 3 reproduced · 2 PRs and 5 issues written · all documented',
  rows: [
    { what: 'signMessage drops any message with one non ASCII character', detail: 'The kit counts characters and encodes bytes; one accent and the app stays stuck in SIGNING_MESSAGE. Replayed on 10 October: 600 bytes of ASCII sign, ten accented letters fail.', tone: 'error', status: 'reproduced, issue written' },
    { what: 'chainId at or above 256 breaks the filter encoding', detail: 'In the official Python client. A one line fix.', tone: 'warning', status: 'PR to open' },
    { what: 'The kit detects blind signing and does not tell the developer', detail: 'It reports it to Ledger. Measured in both directions.', tone: 'info', status: 'documented' },
    { what: 'A second client during a signature kills the app', detail: '0x6901 to everything until restart. One tab, one device.', tone: 'error', status: 'reproduced' },
  ] as Array<{ what: string; detail: string; tone: 'error' | 'warning' | 'info'; status: string }>,
  source: 'FEEDBACK.md, sections 1 to 8; the pull requests and issues are written in upstream/.',
}

export const BRICKS = {
  title: ['Three bricks, ', 'three roles.', ''] as HotTitle,
  takeaway: 'The one that acts has no LLM · the one with an LLM cannot act',
  lead: 'The one that acts has no LLM. The one with an LLM cannot act. The model never touches a key.',
  items: [
    { name: 'Signer', version: 'Signer Kit 1.18.1 on DMK 1.9.1', role: 'approve', line: 'The rule is born on the device. The mandate and every exception go through the official kit, in the bearer’s own browser.', without: 'Without it we lose everything. It is the trust.' },
    { name: 'Agent Stack', version: 'wallet-cli 2.1.0', role: 'read and understand', line: 'The real agent is an analyst wired only to a read only MCP. It cites the tool under every number and cannot act.', without: 'Without it we lose the real agent, and the reading of their Earn.' },
    { name: 'Ring', version: 'Ledger Key Ring Protocol', role: 'keep a secret', line: 'It seals the key that opens the data to the analyst, under the operator’s seed, revocable from the device.', without: 'Without it, a key in clear on the disk. In SaaS it is the brick we would remove.' },
  ],
  source: 'README.md, « Les briques Ledger du brief, ligne à ligne ».',
}

export const CALL = {
  title: ['Your Ledger ', 'stays with you.', ''] as HotTitle,
  takeaway: 'Your funds from your Ledger · one mandate · back on one signature',
  lead: 'You fund the vault from your Ledger, we only hold a mandate, and your funds come back on an authorisation you read on the device.',
  cta: 'Open your account',
  href: '/connexion',
  source: 'README.md, « En SaaS — la Ledger reste chez le client ».',
}
