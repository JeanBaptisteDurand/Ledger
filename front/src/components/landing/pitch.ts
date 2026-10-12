/**
 * The home's pitch (2026-10-12): nine sections, each led by one argument. Every figure is README.md's,
 * APP.md's or FEEDBACK.md's, and the section says where. House rule for every string: no dash, no semicolon.
 */
import type { HotTitle } from './content'

export const CLAIM = {
  title: ['Every agent policy bounds what it spends. ', 'Nobody weighs what it gets back.', ''] as HotTitle,
  takeaway: 'Spend is bounded. Recovery is not.',
  lead: 'A daily cap, an allow-list, a maximum slippage. All of it bounds the entry. A token whose hook blocks the resale, a vault you only leave after a queue: the same closed door, and nothing at the entry says so.',
  source: 'README.md, “The gap”.',
}

export const TRAP = {
  title: ['The entry ', 'lies', ' about the exit.'] as HotTitle,
  takeaway: '6 real pools · 0 bps in · 9 990 bps out · 5 of 10 yield vaults refuse deposits',
  entry: 0,
  exit: 9990,
  unit: 'bps',
  note: ['Six real pools on Base. Indistinguishable before buying: ', 'seventy-seven healthy pools', ' cost the same 0 bps to enter. The same hook sets both prices, the agent only reads the first.'] as const,
  vaultsTitle: 'The same door, on yield vaults',
  vaults: [
    ['Real Morpho WETH vaults probed', '10', ''],
    ['Moonwell, largest WETH vault on Base', '2 693 bps closed', 'error'],
    ['Share of its largest depositor locked', '27 %', 'error'],
    ['Vaults that refuse the deposit', '5 of 10', 'hot'],
  ] as const,
  standard: ['The standard writes the trap in: ', 'previewRedeem', ' must ignore withdrawal limits. The door is read from ', 'maxWithdraw', '.'] as const,
  source: 'README.md, “The gap” and “What is proven”, measured on a Base fork at block 50 614 000.',
}

export const PRODUCT = {
  title: ['', 'Net', ' before you enter. ', 'Out', ' whenever you decide.'] as const,
  takeaway: 'Weigh the exit before the entry · one signature · what overflows comes back with the number',
  lead: 'Net·Out puts a contract between the agent and the position. The contract weighs the exit inside every entry and refuses what cannot come back out. You sign the bounds once, on your Ledger, and keep the way out.',
  cols: [
    { word: 'Net', kicker: 'TARE · the measure', title: 'What the hook takes, weighed in the transaction', text: 'The hook is swapped for 89 inert bytes, the pool is quoted twice, and the gap is what the hook takes, at entry and at exit. For a yield vault, a real deposit and redeem, reverted, and the largest depositor’s door. The position’s net value, before any money moves.', facts: [['Pools', 'hook in · hook out, in bps', ''], ['Vaults', 'maxWithdraw against convertToAssets', ''], ['Where', 'inside the same transaction', 'hot']] },
    { word: 'Sign', kicker: 'Your Ledger · once', title: 'Three numbers, read in clear', text: 'A budget, a maximum round-trip loss, an expiry. Clear-signed on your Ledger, with our ERC-7730 descriptors, isBlindSign=false. The contract holds that rule at every position. The device never signs a purchase.', facts: [['Signed', 'budget · max loss · expiry', ''], ['Never', 'a purchase', ''], ['Report', 'isBlindSign=false · eip7730', 'hot']] },
    { word: 'Out', kicker: 'The way out · yours', title: 'Refused, watched, or back on the device', text: 'An exit past your bound is refused in the same transaction. A door that closes after the purchase is re-probed, and the position sold while it still can be. A negotiable refusal comes back to the Flex with the number: you sign a one-time exception, or leave it refused.', facts: [['Refused', 'CannotExit(lossBps, maxBps)', ''], ['Watched', 'watch.py re-probes, exits', ''], ['Yours', 'read and sign, or leave refused', 'hot']] },
  ] as const,
  source: 'README.md, “The mechanism”, “Ce que le hook prend vraiment”, “L’escalade”.',
}

export const RULE = {
  title: ['', 'One signature.', ' Then the contract holds the rule, not the device.'] as HotTitle,
  takeaway: 'Budget · max round-trip loss 150 bps · expiry, signed once, isBlindSign=false',
  mirrorHot: 'Max round trip loss (bps)',
  lead: 'Say what you want in one sentence. A strategist turns it into bounds. Three of them travel to your Ledger, and you read them on the screen before you hold to sign.',
  body: 'The device has no network and no state, so it cannot measure a market. It authorises the contract that does, in the execution block, the only place the exit cost can be read at the moment it counts.',
  mirrorTitle: 'Exit mandate',
  mirror: [['Network', 'Base'], ['Agent', '0x7099…79C8'], ['Budget', '0.5 WETH'], ['Max round trip loss (bps)', '150'], ['Expires', '2026-10-02 18:00 UTC']] as const,
  caption: 'Read on the device, then hold to sign. Once.',
  source: 'README.md, “The mechanism”. Clear-signed on a real Flex over USB, ecrecover matches.',
}

export const OVERFLOW = {
  title: ['Out of bounds ', 'does not mean no.', ' It means your call.'] as HotTitle,
  takeaway: 'Refused at 2 693 bps → back on the Flex, with the number',
  mirrorHot: 'EXIT COST (bps)',
  lead: 'Nothing reaches the Ledger while the rule holds. When the contract refuses, the request comes back to the device with the exit cost it measured. You decide, with the number in front of you.',
  mirrorTitle: 'Exit exception',
  mirror: [['Position', 'Moonwell Flagship ETH'], ['Amount', '0.05 WETH'], ['EXIT COST (bps)', '2693'], ['Valid until', '2026-09-25 19:12 UTC']] as const,
  sign: ['read and sign', 'Once, for this position, this amount and the number you just read. If the exit worsens before it lands, the exception is worth nothing.'] as const,
  refuse: ['leave refused', 'The refusal is kept. No bot asks for that position again.'] as const,
  source: 'README.md, “L’escalade”.',
}

export const AGENTS = {
  title: ['An injected prompt can make a bot ', 'choose', ' a trap. It cannot make it ', 'exceed', ' your mandate.'] as const,
  takeaway: 'The one that acts has no LLM · the one with an LLM cannot act',
  lead: 'Two kinds of agents, one boundary. The bots act without a language model and never see the exit: the contract measures it. The analyst is Claude on ten read-only tools: it cites the tool behind every number and can sign nothing, send nothing, stop nothing.',
  bots: { kicker: 'They act · no language model', title: 'The bots', facts: [['Universes', 'Uniswap v4 pools · ERC-4626 vaults', ''], ['Key', 'a session key, the vault only', 'hot'], ['Sees', 'depth, entry, yield. Never the exit', '']] as ReadonlyArray<readonly [string, string, '' | 'hot']> },
  analyst: { kicker: 'It understands · Agent Stack', title: 'The analyst', facts: [['Tools', '10, read only, through our MCP', 'hot'], ['Key', 'derived from your address, written nowhere', ''], ['Can', 'answer, and cite', '']] as ReadonlyArray<readonly [string, string, '' | 'hot']> },
  mapNote: ['One path leads to a purchase: a bot, its session key, ', 'the vault', '. Everything else reads, measures or signs a rule.'] as const,
  source: 'README.md, “The agents”. mcp/pds_mcp.py.',
}

export const MEASURED = {
  title: ['Not a promise. ', 'A run.', ''] as HotTitle,
  takeaway: '124 s · real browser · emulated Flex and a real one · 38 Foundry tests',
  lead: 'The whole journey, in a real browser, on the final code, with a holder approving each screen in 3 seconds. Sign in, mandate, bots, refusals, an exception, watch and sell, the analyst, reconnection.',
  total: 124,
  alerts: 0,
  note: ['Every refusal on the way is the contract measuring the exit inside the transaction and reverting with the reason, ', 'CannotExit(lossBps, maxBps)', '. The agent reads why.'] as const,
  source: 'The 25 September 2026 run. front/APP.md for the latest, 146 s with the deposit and the withdrawal signed on the device.',
}

export const FINDINGS = {
  title: ['We built on their stack. ', 'We found five things.', ''] as HotTitle,
  takeaway: '5 upstream findings · 3 reproduced · 2 PRs and 5 issues written',
  lead: 'Each with a command, a file or a trace behind it. The detail is in FEEDBACK.md, with what we would change.',
  bricks: 'Four Ledger bricks, one role each: the Signer approves (Signer Kit 1.18.1 on DMK 1.9.1), clear signing shows the fields (ERC-7730, app-ethereum 1.22.4), the Agent Stack reads (wallet-cli 2.1.0), the Key Ring keeps the master secret.',
  source: 'FEEDBACK.md, § 1 to 8. The pull requests and issues are written in upstream/.',
}

export const CALL = {
  title: ['Your Ledger ', 'stays with you.', ''] as HotTitle,
  takeaway: 'Your funds from your Ledger · one mandate · back on one signature',
  lead: 'You fund the vault from your Ledger. We hold a mandate, and nothing else. Your funds come back on an authorisation you read on the device, and no one can change a digit of it.',
  cta: 'Open your account',
  href: '/connexion',
  demo: 'See the demo',
  demoHref: '/demo',
  source: 'README.md, “As a service”.',
}
