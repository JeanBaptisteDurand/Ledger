/**
 * What the home still reads from here (2026-10-13): the frieze's steps and the findings' rows, every figure
 * README.md's or FEEDBACK.md's. The pitch (titles, takeaways, leads) is pitch.ts. A title is three parts,
 * [before, hot, after]: the hot part stays incandescent once the rest has cooled.
 */
export type HotTitle = readonly [string, string, string]

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
  source: 'A full run in a real browser. front/APP.md for the latest run.',
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

export type Fact = readonly [string, string, '' | 'hot' | 'success' | 'warning' | 'error' | 'info']
export type Principle = { kicker: string; title: string; text: string; facts: readonly Fact[] }
export type Pair = readonly [string, string]

