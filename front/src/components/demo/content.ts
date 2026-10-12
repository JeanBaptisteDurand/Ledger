/**
 * The demo's script: the journey on the bench, replayed scene by scene. Every Flex screen is a real capture of the
 * emulated device (captures/ at the repository root, copied to public/demo/). Every figure is one of the measured
 * runs: the six rounds table and the watcher's sentence in README.md, the last run's timings in front/APP.md, the
 * mandate and the exception as the device displayed them. No figure is invented. House rule: no dash, no semicolon.
 */
import type { HotTitle } from '../landing/content'

export type Screen = 'idle' | 'review-mandate' | 'mandate-1' | 'mandate-2' | 'hold' | 'signed' | 'review-exception' | 'exception-1' | 'exception-2' | 'hold-exception'
export const SCREENS: Record<Screen, { src: string; alt: string }> = {
  idle: { src: '/demo/flex-idle.png', alt: 'The Flex shows the Ethereum app, idle' },
  'review-mandate': { src: '/demo/flex-review-mandate.png', alt: 'Review typed message, swipe to review, 1 of 4' },
  'mandate-1': { src: '/demo/flex-mandate-1.png', alt: 'Contract Exit mandate, Network Base, Agent 0x7099…79C8, 2 of 4' },
  'mandate-2': { src: '/demo/flex-mandate-2.png', alt: 'Budget 1 WETH, Max round-trip loss 300 bps, Expires 2026-09-30, 3 of 4' },
  hold: { src: '/demo/flex-hold-to-sign.png', alt: 'Sign typed message? Hold to sign, 4 of 4' },
  signed: { src: '/demo/flex-signed.png', alt: 'Message signed' },
  'review-exception': { src: '/demo/flex-review-exception.png', alt: 'Contract Exit exception, Network Base, Agent 0x7099…79C8, 2 of 5' },
  'exception-1': { src: '/demo/flex-exception-1.png', alt: 'Pool 0x1043…D02E, Amount 50000000000000000 wei, EXIT COST 395 bps, 3 of 5' },
  'exception-2': { src: '/demo/flex-exception-2.png', alt: 'Valid until 2026-09-22 01:01:03 UTC, 4 of 5' },
  'hold-exception': { src: '/demo/flex-hold-to-sign-exception.png', alt: 'Sign typed message? Hold to sign, 5 of 5' },
}

export type Line = readonly [string, string]
export type Panel =
  | { kind: 'mirror'; title: string; lines: readonly Line[]; hot?: string; report?: string }
  | { kind: 'journal'; rows: ReadonlyArray<{ round: number; pool: string; entry: string; exit: string; decision: 'bought' | 'refused'; why?: string }> }
  | { kind: 'request'; bot: string; question: string; seen: number; allows: number; sign: string; refuse: string; chosen: 'sign' | 'refuse' }
  | { kind: 'watch'; rows: ReadonlyArray<{ position: string; atBuy: string; now: string; action: string; tone: 'success' | 'error' }> }
  | { kind: 'trace'; question: string; tools: readonly string[]; line: string }

/** A beat: one Flex screen, the number of panel items revealed so far, one sentence. */
export type Beat = { screen: Screen; reveal: number; caption: readonly [string, string, string] }
export type Scene = { id: string; title: string; duration: string; panel: Panel; beats: readonly Beat[] }

export const HERO = {
  title: 'DEMO',
  catch: 'The whole journey on the bench, replayed with the real screens of the Flex.',
  heading: 'Demo: the journey, replayed',
}

export const REPLAY = {
  title: ['The run, ', 'replayed.', ''] as HotTitle,
  takeaway: '8 scenes · 146 s on the bench · every Flex screen a real capture',
  lead: 'What a holder does, what the device shows, what the contract decides. Play it, or step through it. The Flex shows exactly what the emulated device showed when this was measured.',
  source: 'Device screens: captures/ (the emulated Flex, Ethereum app 1.22.4 built with the test key). Rounds and the watcher: README.md, “Six tours, sortie réelle” and “watch.py”. Timings: front/APP.md, the 10 October run (146 s).',
}

export const SCENES: readonly Scene[] = [
  {
    id: 'sign-in',
    title: 'Sign in with the Ledger',
    duration: '7 s',
    panel: { kind: 'mirror', title: 'Sign-In with Ethereum', lines: [['Domain', '127.0.0.1:5173'], ['Address', '0xDad7…6D8D'], ['Chain', '8453'], ['Nonce', 'one use']], hot: 'Address' },
    beats: [
      { screen: 'idle', reveal: 1, caption: ['No e-mail, no password. ', 'The address the device proves', ' is the account.'] },
      { screen: 'idle', reveal: 4, caption: ['A short message, signed on the device in the browser, ', 'verified by the server', '. It opens the account and authorises nothing else.'] },
    ],
  },
  {
    id: 'deposit',
    title: 'Fund the vault from the Ledger',
    duration: '8.5 s',
    panel: { kind: 'mirror', title: 'ETH transfer', lines: [['To', 'the vault, 0xB592…D40e'], ['Amount', '0.5 ETH'], ['Fees', 'read on the device']], hot: 'Amount' },
    beats: [
      { screen: 'idle', reveal: 1, caption: ['The vault is a contract in your name. ', 'Its funds come from your Ledger', ', not from us.'] },
      { screen: 'hold', reveal: 3, caption: ['One ETH transfer, ', 'the only transaction the device signs', '. The vault keeps it as WETH.'] },
      { screen: 'signed', reveal: 3, caption: ['Signed on the device in 8.5 s. ', '0.5 WETH available', ' under the mandate to come.'] },
    ],
  },
  {
    id: 'mandate',
    title: 'One signature: the mandate',
    duration: '7.3 s',
    panel: { kind: 'mirror', title: 'Exit mandate', lines: [['Contract', 'Exit mandate'], ['Network', 'Base'], ['Agent', '0x7099…79C8'], ['Budget', '1 WETH'], ['Max round-trip loss (bps)', '300'], ['Expires', '2026-09-30 00:51 UTC']], hot: 'Max round-trip loss (bps)', report: 'isBlindSign=false · eip7730' },
    beats: [
      { screen: 'review-mandate', reveal: 0, caption: ['You wrote one sentence. A strategist turned it into bounds. ', 'Three of them travel to the Ledger.', ''] },
      { screen: 'mandate-1', reveal: 3, caption: ['The device reads the contract, the network and ', 'the agent’s session key', ', field by field.'] },
      { screen: 'mandate-2', reveal: 6, caption: ['Budget, ', 'tolerated exit loss', ', expiry. Our descriptors show the rule in clear.'] },
      { screen: 'hold', reveal: 6, caption: ['Hold to sign. ', 'Once.', ' From here the contract holds the rule, not the device.'] },
      { screen: 'signed', reveal: 7, caption: ['The Signer Kit’s report says it: ', 'isBlindSign=false', '. The device read fields, not a blob.'] },
    ],
  },
  {
    id: 'rounds',
    title: 'Six rounds, nothing on the device',
    duration: '10 rounds',
    panel: {
      kind: 'journal',
      rows: [
        { round: 1, pool: '0x1043dc3ea2', entry: '11.93', exit: '238', decision: 'bought' },
        { round: 2, pool: '0x0160bf7c02', entry: '0.00', exit: '10 000', decision: 'refused', why: 'the token is not even transferable' },
        { round: 3, pool: '0x08d98bfaba', entry: '0.00', exit: '10 000', decision: 'refused', why: 'same' },
        { round: 4, pool: '0x093635e4ed', entry: '0.00', exit: '10 000', decision: 'refused', why: 'same' },
        { round: 5, pool: '0x2e8f977628', entry: '0.00', exit: '1 899', decision: 'refused', why: 'CannotExit' },
        { round: 6, pool: '0x4435362cad', entry: '0.00', exit: '1 899', decision: 'refused', why: 'CannotExit' },
      ],
    },
    beats: [
      { screen: 'idle', reveal: 1, caption: ['A bot ranks on depth, entry cost and the registry. ', 'It never sees the exit.', ' Round 1 goes in: 238 bps to leave, under 300.'] },
      { screen: 'idle', reveal: 4, caption: ['Three pools let you in for 0 bps and take ', '10 000', ' at the exit. The token is not even transferable. Refused in the same transaction.'] },
      { screen: 'idle', reveal: 6, caption: ['Two more at 1 899 bps, refused with the reason: ', 'CannotExit(lossBps, maxBps)', '. Nothing went to the Ledger.'] },
    ],
  },
  {
    id: 'exception',
    title: 'It overflows: back to the device with the number',
    duration: '9.9 s',
    panel: {
      kind: 'request',
      bot: 'DCA prudente',
      question: 'This pool costs 395 bps to leave. Your mandate allows 300. Sign anyway?',
      seen: 395,
      allows: 300,
      sign: 'Once, for this position, this amount and the number you just read. If the exit worsens before it lands, the exception is worth nothing.',
      refuse: 'The refusal is kept. No bot asks for that position again.',
      chosen: 'sign',
    },
    beats: [
      { screen: 'idle', reveal: 1, caption: ['The vault measured 395 bps on the way out, above the 300 you signed. ', 'The request comes back to you', ', in the bot’s name.'] },
      { screen: 'review-exception', reveal: 2, caption: ['You chose to read it. ', 'An exit exception', ' goes to the device, with the same clear signing as the mandate.'] },
      { screen: 'exception-1', reveal: 2, caption: ['The pool, the amount, and ', 'EXIT COST (bps) 395', ': the number the contract measured, read on the screen.'] },
      { screen: 'exception-2', reveal: 2, caption: ['Valid until a few minutes from now. ', 'One position, one amount, once.', ''] },
      { screen: 'hold-exception', reveal: 2, caption: ['Hold to sign. ', 'Leaving it refused would have been a decision too', ', not a cancel.'] },
      { screen: 'signed', reveal: 3, caption: ['The contract verifies the signature and measures the exit again. ', 'Not worse than what you read', ': it enters, under exception.'] },
    ],
  },
  {
    id: 'watch',
    title: 'Watch, and leave while you still can',
    duration: 'every interval',
    panel: { kind: 'watch', rows: [{ position: 'a pool bought under the mandate', atBuy: '354 bps', now: '818 bps', action: 'sold', tone: 'error' }] },
    beats: [
      { screen: 'idle', reveal: 0, caption: ['A switch flipped after the purchase cannot be prevented. ', 'It can be watched.', ''] },
      { screen: 'idle', reveal: 1, caption: ['The watcher re-probes each position. From the measured run: ', '354 bps at the purchase, 818 bps later', '. Sold while the door was still open.'] },
    ],
  },
  {
    id: 'analyst',
    title: 'Ask the analyst, read only',
    duration: '20 s',
    panel: { kind: 'trace', question: 'Which of my bots was refused, and why?', tools: ['bots()', 'operations(bot=“DCA prudente”)', 'decision(tick=2)'], line: 'The answer cites the tool under every number. The analyst can sign nothing, send nothing, stop nothing.' },
    beats: [
      { screen: 'idle', reveal: 1, caption: ['The one real agent: Claude on a read-only MCP of ten tools, ', 'with a key derived from your address', '.'] },
      { screen: 'idle', reveal: 3, caption: ['Under the answer, the trace: ', 'which tools it called, with which arguments', '. That is what makes the answer checkable.'] },
    ],
  },
  {
    id: 'withdraw',
    title: 'Your Ledger stays with you',
    duration: '8.6 s',
    panel: { kind: 'mirror', title: 'Withdrawal authorisation', lines: [['Amount', '0.1 WETH'], ['Recipient', '0xDad7…6D8D'], ['Expires', 'read on the device']], hot: 'Recipient', report: 'executed by the bench, not a digit changed' },
    beats: [
      { screen: 'hold', reveal: 3, caption: ['An EIP-712 authorisation, read in clear: ', 'the amount, your address, the expiry', '.'] },
      { screen: 'signed', reveal: 4, caption: ['The bench executes it and pays the gas, ', 'without being able to change a digit', '. We only ever held a mandate.'] },
    ],
  },
]

export const LIVE = {
  title: ['Now for real, ', 'on the bench.', ''] as HotTitle,
  takeaway: 'The same page, the emulated Flex live, your own vault',
  signedIn: 'You are signed in. The Flex below is live: go to the overview, ask for bounds, sign them on this screen, start a bot.',
  signedOut: 'Sign in with the emulated Flex or your own Ledger, and run the journey yourself: the mandate, the bots, the requests, the analyst.',
  offline: 'The bench is not running. Start it at the root of the repository and this sheet comes alive.',
  commands: '. .venv/bin/activate\nledger/speculos.sh up && python3 web/server.py',
  cta: 'Go to the overview',
  ctaOut: 'Sign in with my Ledger',
  source: 'web/server.py, port 8099. front/APP.md, “Run”.',
}
