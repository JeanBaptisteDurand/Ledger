/**
 * The live demo's shared pieces, for the map (A) and the cockpit (B). Everything here reads the bench through
 * useBench and acts through its routes, exactly as the account's pages do: nothing new is asked of the server.
 * The presenter's gestures on the Flex go through the live screen (click = tap, drag left = swipe, hold = sign).
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { useBench } from '../../app/useBench'
import { LiveScreen } from '../../app/device'
import { Field, Select, Skeleton } from '../../app/ui'
import { fmtWei, short, type BenchState, type JournalRow, type Universe } from '../../app/api'
import { linkProps } from '../../app/router'
import { Badge, Kicker } from '../landing/primitives'
import type { MapLive } from '../landing/SchemaMap'

export const STRATEGY = '0.5 WETH cautiously on the long tail of Base, I do not want to get stuck'
export const STRATEGY_IDEAS = [STRATEGY, '1 WETH, aggressive profile, 10 slices', '0.5 WETH on yield vaults, cautiously']
export const QUESTION = 'Which of my bots was refused, and why?'

/** The journal keeps a 12-character prefix of a pool id or a vault address; a request carries the full one. Match on the prefix, or on the name. */
export const sameId = (rowPool: string, fullId: string) => fullId.toLowerCase().startsWith(rowPool.toLowerCase()) || rowPool.toLowerCase().startsWith(fullId.toLowerCase().slice(0, 12))
export const rowOf = (s: BenchState, e: { pool_id: string; name?: string } | null | undefined): JournalRow | null =>
  e ? (s.journal.slice().reverse().find((x) => sameId(x.pool, e.pool_id) || (!!e.name && x.name === e.name)) ?? null) : null

/* ─── what is happening, read off the state ─── */

export type Phase = 'session' | 'bounds' | 'mandate' | 'agents' | 'request' | 'watch' | 'analyst'
export type Activity = {
  phase: Phase
  /** one line for the presenter, what the system is doing right now */
  now: string
  signing: boolean
  lastRow: JournalRow | null
}

export function activity(s: BenchState, local: { asking: boolean }): Activity {
  const lastRow = s.journal.length ? s.journal[s.journal.length - 1] : null
  if (s.signing) {
    // The four gestures of the Ledger: the deposit and the withdrawal belong to the setup, the mandate and the exception have their own phase.
    const what = s.signing === 'mandate' ? 'the mandate' : s.signing === 'exception' ? 'the exception, with the number' : s.signing === 'deposit' ? 'the deposit, one ETH transfer to your vault' : 'the withdrawal authorisation'
    const phase: Phase = s.signing === 'mandate' ? 'mandate' : s.signing === 'exception' ? 'request' : 'session'
    return { phase, now: `On the Flex: ${what}. Read, swipe, hold to sign.`, signing: true, lastRow }
  }
  if (s.analysis?.pending) return { phase: 'analyst', now: 'The analyst queries the MCP tools.', signing: false, lastRow }
  if (s.watching) return { phase: 'watch', now: 'TARE re-probes every held position.', signing: false, lastRow }
  if (s.running) return { phase: 'agents', now: `Bot “${s.bots.find((b) => b.id === s.bot_running)?.name ?? 'round'}” chooses. TARE measures, the vault decides.`, signing: false, lastRow }
  if (s.escalation?.possible) return { phase: 'request', now: `${s.escalation.seen_exit_bps} bps to leave, the mandate allows ${s.escalation.mandate_allows_bps}. Sign on the Flex, or leave refused.`, signing: false, lastRow }
  if (local.asking) return { phase: 'bounds', now: 'The strategist proposes bounds.', signing: false, lastRow }
  if (!s.vault) return { phase: 'session', now: 'Open the session: the Base fork, the emulated Flex, a vault in your name.', signing: false, lastRow }
  if (!s.proposal && !s.signed) return { phase: 'bounds', now: 'One sentence in, three bounds out.', signing: false, lastRow }
  if (!s.signed) return { phase: 'mandate', now: 'Sign the bounds on the Flex, once.', signing: false, lastRow }
  if (s.positions.length && !s.watch) return { phase: 'watch', now: 'Re-probe the held positions.', signing: false, lastRow }
  if (s.journal.length && !s.analyses.length) return { phase: 'analyst', now: 'Ask the analyst why.', signing: false, lastRow }
  return { phase: 'agents', now: 'Add a bot, or run one round.', signing: false, lastRow }
}

/**
 * The map, drawn from the state: which nodes the journey has reached (they rise in, the edges between them are
 * drawn), which are live and in what colour, and what each node says now.
 */
export function mapLive(s: BenchState, a: Activity): MapLive {
  const nodes: MapLive['nodes'] = {}
  const edges: string[] = []
  let liveTone: MapLive['liveTone'] = 'hot'
  // Reached, cumulatively: the signer and the site at sign-in, the vault once the session is open, the agents'
  // side once a bot exists or a round ran, the reading side once the analyst was asked. The Key Ring and
  // wallet-cli come with the MCP: they are the operator's and the analyst's, not a step of the holder's.
  const reached = new Set<string>(['ledger', 'browser', 'bench'])
  if (s.vault) reached.add('vault')
  if (s.bots.length || s.journal.length) { reached.add('bots'); reached.add('tare'); reached.add('pools'); reached.add('vaults'); reached.add('journal') }
  if (s.analyses.length || s.analysis?.pending) { reached.add('mcp'); reached.add('analyst'); reached.add('walletcli'); reached.add('ring') }
  const m = s.mandate
  const mandateLines = m ? [`budget ${Number(m.mandate.budgetAmount) / 1e18} WETH · ${m.mandate.maxRoundTripLossBps} bps`, `expires ${new Date(m.mandate.expiry * 1000).toISOString().slice(0, 10)}`, 'signed'] : undefined
  const r = a.lastRow
  const tareLines = r ? [`${r.name ?? r.pool.slice(0, 12)}`, r.kind === 'vault' ? `door ${r.stuck_bps ?? r.exit ?? '·'} bps` : `hook in ${r.hook_in ?? r.entry} · out ${r.hook_out ?? r.exit ?? '·'} bps`, r.decision === 'EXECUTED' ? 'entered' : `refused: ${r.why.slice(0, 22)}`] : undefined
  const bots = s.bots.filter((b) => b.status === 'running')
  if (s.address) nodes.bench = { lines: [`account ${short(s.address, 6, 4)}`, s.vault ? `vault ${short(s.vault, 6, 4)}` : 'no vault yet', `${bots.length} bot${bots.length > 1 ? 's' : ''} running · ${s.positions.length} positions`] }
  // The agents' slots: one per bot you launched, filled as they come, lit while one runs.
  nodes.bots = { slots: s.bots.map((b) => ({ name: b.name, state: b.status === 'running' ? (s.bot_running === b.id ? 'live' : 'running') : b.status })) }
  if (mandateLines) nodes.vault = { lines: mandateLines }
  if (tareLines) nodes.tare = { lines: tareLines }
  nodes.pools = { lines: [`${s.positions.filter((p) => p.kind === 'pool').length} held`, `${s.journal.filter((x) => x.kind === 'pool' && x.decision !== 'EXECUTED').length} refused`, '0 → 9 990 bps'] }
  nodes.vaults = { lines: [`${s.positions.filter((p) => p.kind === 'vault').length} held`, `${s.journal.filter((x) => x.kind === 'vault' && x.decision !== 'EXECUTED').length} refused`, '27 % closed'] }
  switch (a.phase) {
    case 'session':
      nodes.bench = { ...nodes.bench, tone: 'hot' }
      if (s.signing === 'deposit' || s.signing === 'withdraw') {
        // The second and fourth gestures of the Ledger: the deposit (a transaction) and the withdrawal (an EIP-712 authorisation).
        nodes.ledger = { tone: 'asks', hot: s.signing === 'deposit' ? 1 : 3 }
        liveTone = 'asks'
        edges.push(s.signer === 'browser' ? 'ledger>browser' : 'ledger>bench', 'bench>vault')
      }
      break
    case 'bounds': nodes.bench = { ...nodes.bench, tone: 'hot', lines: ['strategist', 'sentence → three bounds', 'proposal pending'] }; break
    case 'mandate':
      nodes.ledger = { tone: a.signing ? 'asks' : 'hot', lines: a.signing ? ['REVIEW TYPED MESSAGE', 'BUDGET · MAX LOSS · EXPIRES', 'hold to sign'] : ['mandate ready', 'budget · max loss · expiry', 'sign once'] }
      if (a.signing) liveTone = 'asks'
      edges.push(s.signer === 'browser' ? 'ledger>browser' : 'ledger>bench', 'bench>vault'); break
    case 'agents':
      nodes.bots = { ...nodes.bots, tone: 'hot' }
      if (s.signed) nodes.ledger = { tone: 'ok', lines: ['mandate signed', 'idle'] }
      if (s.running) { nodes.tare = { ...nodes.tare, tone: 'hot' }; nodes.vault = { ...nodes.vault, tone: 'hot' }; edges.push('bench>bots', 'bots>tare', 'bots>vault', 'tare>pools', 'vault>pools', 'vault>vaults') }
      else if (r) { nodes.vault = { ...nodes.vault, tone: r.decision === 'EXECUTED' ? 'ok' : 'refused' }; liveTone = r.decision === 'EXECUTED' ? 'ok' : 'refused'; edges.push('bots>vault', r.kind === 'vault' ? 'vault>vaults' : 'vault>pools') }
      break
    case 'request':
      nodes.vault = { ...nodes.vault, tone: 'refused', lines: [`exit ${s.escalation?.seen_exit_bps ?? '·'} bps measured`, `mandate allows ${s.escalation?.mandate_allows_bps ?? '·'}`, 'CannotExit → request'] }
      nodes.ledger = { tone: 'asks', lines: a.signing ? ['EXIT COST (BPS)', String(s.escalation?.seen_exit_bps ?? ''), 'hold to sign · reject'] : ['out-of-bounds request', 'read and sign · leave refused', `${s.escalation_queue.length} more waiting`] }
      liveTone = 'asks'
      edges.push('bench>vault', s.signer === 'browser' ? 'ledger>browser' : 'ledger>bench'); break
    case 'watch': nodes.tare = { ...nodes.tare, tone: 'hot', lines: s.watching ? ['re-probing positions', 'exit measured now', 'exit if worse'] : nodes.tare?.lines }; edges.push('tare>pools', 'bots>tare'); break
    case 'analyst': nodes.mcp = { tone: 'hot', lines: s.analysis?.pending ? ['querying', '10 tools, read only', 'account key'] : undefined }; nodes.analyst = { tone: 'hot', lines: s.analyses.length && !s.analysis?.pending ? ['answered', s.analyses[s.analyses.length - 1].tools_used.map((t) => t.tool).join(' · ') || 'no tool called', 'read only'] : undefined }; edges.push('bench>mcp', 'mcp>analyst', 'walletcli>analyst'); break
  }
  const stamp = `${a.phase}-${s.signing ?? ''}-${s.running}-${s.watching}-${s.analysis?.pending}-${s.journal.length}-${s.escalation?.pool_id ?? ''}-${s.bots.length}`
  return { nodes, edges, reached, liveTone, stamp }
}

/* ─── the door: one click on the bench Flex ─── */

/** The bench is absent: what the online site says, and the one command that brings it back on a machine that has it. */
export function BenchOffline() {
  return (
    <div className="live-door">
      <p className="t-body-lg m-0 max-w-[52ch] text-pretty text-page-text-mute">The bench is not running behind this page. On a machine with the bench, one command at the root of the repository starts it; the page resumes on its own.</p>
      <pre className="t-mono-data m-0 mt-6 is-info">{'scripts/site.sh'}</pre>
    </div>
  )
}

export function Door({ children }: { children?: ReactNode }) {
  const { state, offline, act } = useBench()
  const [busy, setBusy] = useState(false)
  if (offline || !state) return <BenchOffline />
  const enter = async () => { setBusy(true); await act('/login_device'); setBusy(false) }
  return (
    <div className="live-door">
      <p className="t-body-lg m-0 max-w-[52ch] text-pretty text-page-text-mute">The demo drives the real bench. Sign in with the emulated Flex in one click: the address is read on the device. Or bring your own Ledger from the sign-in page.</p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost btn-ghost--hot t-button-cap" onClick={enter} disabled={busy || !state.speculos}>{busy ? 'Reading the Flex…' : 'Sign in with the emulated Flex'}</button>
        <a {...linkProps('/connexion')} className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap">My own Ledger</a>
      </div>
      {!state.speculos ? <p className="t-body-md m-0 mt-4 is-warning">The emulated Flex is powered off. Start Speculos, then sign in.</p> : null}
      {children}
    </div>
  )
}

/* ─── the conductor: the steps of the journey, in order, each one a real action ─── */

type StepState = 'done' | 'live' | 'ahead' | 'pending'
type StepDef = { id: Phase; label: string; hint: string; state: StepState; action?: () => void; actionLabel?: string; second?: () => void; secondLabel?: string }
export type StepsLocal = { asking: boolean; setAsking: (v: boolean) => void; sentence?: string }

export function useSteps(local: StepsLocal): { steps: StepDef[]; a: Activity; s: BenchState | null; ask: (text?: string) => Promise<void> } {
  const { state: s, act } = useBench()
  const ask = async (text?: string) => {
    const prompt = (text ?? local.sentence ?? '').trim() || STRATEGY
    local.setAsking(true)
    await act('/chat', { prompt })
    local.setAsking(false)
  }
  if (!s) return { steps: [], a: { phase: 'session', now: '', signing: false, lastRow: null }, s: null, ask }
  const a = activity(s, local)
  const steps: StepDef[] = [
    { id: 'session', label: 'Open the session', hint: 'a Base fork, the emulated Flex, a vault in your name', state: s.vault ? 'done' : 'live', action: s.vault ? undefined : () => act('/boot'), actionLabel: 'Open' },
    { id: 'bounds', label: 'Ask for bounds', hint: local.sentence?.trim() || STRATEGY, state: s.signed || s.proposal ? 'done' : s.vault ? (local.asking ? 'pending' : 'live') : 'ahead', action: s.vault && !s.signed && !local.asking ? () => ask() : undefined, actionLabel: s.proposal ? 'Ask again' : 'Ask' },
    { id: 'mandate', label: 'Sign the mandate', hint: 'budget, max round-trip loss, expiry: read, then hold to sign', state: s.signed ? 'done' : s.signing === 'mandate' ? 'pending' : s.proposal ? 'live' : 'ahead', action: s.proposal && !s.signed && !s.signing ? () => act('/sign_mandate') : undefined, actionLabel: 'Sign on Ledger' },
    { id: 'agents', label: 'Run the agents', hint: 'add a bot, or run one round: TARE measures, the vault decides', state: s.running ? 'pending' : s.journal.length ? 'done' : s.signed ? 'live' : 'ahead', action: s.signed && !s.running ? async () => { await act('/universe', { universe: s.universe }); await act('/run') } : undefined, actionLabel: 'Run one round' },
    { id: 'request', label: 'Answer the request', hint: 'read the number, sign the exception, or leave it refused', state: s.signing === 'exception' ? 'pending' : s.escalation?.possible ? 'live' : s.exception_buys.length || s.refused_escalations.length ? 'done' : 'ahead', action: s.escalation?.possible && !s.signing ? () => act('/escalate') : undefined, actionLabel: 'Read and sign', second: s.escalation?.possible && !s.signing ? () => act('/escalate_no') : undefined, secondLabel: 'Leave refused' },
    { id: 'watch', label: 'Re-probe the positions', hint: 'TARE measures the exit again on every held position', state: s.watch ? 'done' : s.watching ? 'pending' : s.positions.length ? 'live' : 'ahead', action: s.positions.length && !s.watching ? () => act('/watch') : undefined, actionLabel: 'Re-probe', second: s.positions.length && !s.watching ? () => act('/watch_sell') : undefined, secondLabel: 'Re-probe and exit' },
    { id: 'analyst', label: 'Ask the analyst', hint: QUESTION, state: s.analyses.length && !s.analysis?.pending ? 'done' : s.analysis?.pending ? 'pending' : s.journal.length ? 'live' : 'ahead', action: s.journal.length && !s.analysis?.pending ? () => act('/analyze', { question: QUESTION }) : undefined, actionLabel: 'Ask why' },
  ]
  return { steps, a, s, ask }
}

export function Conductor({ steps, compact = false }: { steps: StepDef[]; compact?: boolean }) {
  return (
    <ol className={`conductor ${compact ? 'conductor--compact' : ''}`} aria-label="The journey, step by step">
      {steps.map((st, i) => (
        <li key={st.id} className="conductor__step" data-state={st.state}>
          <span className="t-kicker conductor__index">{String(i + 1).padStart(2, '0')}</span>
          <div className="conductor__body">
            <span className="conductor__label">{st.label}</span>
            {!compact ? <span className="t-caption block text-page-text-faint">{st.hint}</span> : null}
          </div>
          <div className="conductor__actions">
            {st.state === 'pending' ? <span className="t-kicker text-hot">{st.id === 'mandate' || st.id === 'request' ? 'on the Flex' : 'working…'}</span> : null}
            {st.action ? <button type="button" className={`btn-ghost btn-ghost--small t-button-cap ${st.id === 'mandate' || st.id === 'request' ? 'btn-ghost--hot' : ''}`} onClick={st.action}>{st.actionLabel}</button> : null}
            {st.second ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={st.second}>{st.secondLabel}</button> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ─── the Flex, live, with its status line ─── */

export function Flex({ s, a }: { s: BenchState; a: Activity }) {
  return (
    <div className="live-flex">
      <LiveScreen live={s.speculos} signing={s.signing} real={false} />
      <p className={`t-body-md m-0 mt-4 max-w-[36ch] text-pretty ${a.signing ? 'text-hot' : 'text-page-text-mute'}`} aria-live="polite">{a.now}</p>
      <p className="t-caption m-0 mt-2 text-page-text-faint">Signing path: {s.signer === 'browser' ? 'this page, through the proxy' : s.signer === 'dmk' ? 'Signer Kit on the bench' : 'APDU client on the bench'}. <a {...linkProps('/connexion')} className="underline">Change</a></p>
    </div>
  )
}

/* ─── the funds, signed on the Ledger: a deposit (one ETH transfer), a withdrawal (an EIP-712 authorisation) ─── */

export function Funds({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [dep, setDep] = useState('0.3')
  const waiting = !!s.signing || !!s.pending
  const browser = s.signer === 'browser'
  const deposit = async (e: FormEvent) => { e.preventDefault(); await act('/deposit', { amount_eth: dep }) }
  return (
    <div className="funds">
      <Kicker>Funds · signed on the Ledger</Kicker>
      <dl className="kv">
        <div className="kv__row"><dt className="t-mono-data text-page-text">Vault</dt><dd className="t-body-md m-0 text-page-text-mute">{s.vault ? `${fmtWei(s.weth)} available · ${fmtWei(s.spent)} spent` : 'not opened'}</dd></div>
        <div className="kv__row"><dt className="t-mono-data text-page-text">Your address</dt><dd className="t-body-md m-0 text-page-text-mute">{(Number(s.owner_eth || '0') / 1e18).toFixed(4)} ETH</dd></div>
      </dl>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={deposit}>
        <div style={{ flex: '0 1 130px' }}><Field label="Deposit (ETH)" type="number" step="any" min={0} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} disabled={waiting || !s.vault} /></div>
        <button type="submit" className="btn-ghost btn-ghost--hot btn-ghost--small t-button-cap" disabled={waiting || !browser || !s.vault}>Deposit from my Ledger</button>
        <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => act('/withdraw', { amount: 'tout' })} disabled={waiting || !s.vault || Number(s.weth) <= 0}>Withdraw all to my Ledger</button>
      </form>
      {!browser ? <p className="t-caption m-0 mt-2 text-page-text-faint">The deposit is signed in this page: choose “My Ledger · this browser” at the door.</p> : <p className="t-caption m-0 mt-2 text-page-text-faint">The only transaction the device signs, and an authorisation read in clear. <a {...linkProps('/account')} className="underline">More on the account page</a>.</p>}
    </div>
  )
}

/* ─── the agents: who runs, add one, the one-round shortcut ─── */

export function Agents({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [name, setName] = useState('')
  const [universe, setUniverse] = useState<Universe>(s.universe)
  const [interval, setIntervalS] = useState('0')
  const [ticks, setTicks] = useState('3')
  const [busy, setBusy] = useState(false)
  const add = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await act('/bots', { name: name.trim() || (universe === 'vaults' ? 'Yield' : 'DCA'), universe, ticks: Math.max(1, Math.min(12, Number(ticks) || 3)), interval_s: Number(interval) || 0 })
    if (r.ok) setName('')
    setBusy(false)
  }
  return (
    <div className="agents">
      <Kicker>The agents · no language model</Kicker>
      {s.bots.length ? (
        <ul className="agents__list">
          {s.bots.slice().reverse().map((b) => (
            <li key={b.id} className="agents__row" data-state={b.status === 'running' ? (s.bot_running === b.id ? 'live' : 'running') : 'stopped'}>
              <span className="agents__dot" aria-hidden />
              <span className="t-title-md agents__name">{b.name}</span>
              <span className="t-kicker text-page-text-faint">{b.universe === 'vaults' ? '4626 vaults' : 'v4 pools'} · {b.interval_s ? `every ${b.interval_s} s` : 'one round'}</span>
              <span className="t-mono-data text-page-text-mute">{b.rounds} rounds · <span className="is-success">{b.executed}</span> in · <span className="is-error">{b.refused}</span> refused{b.exceptions ? ` · ${b.exceptions} exc.` : ''}</span>
              {b.status === 'running' ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => act('/bots/stop', { id: b.id })}>Stop</button> : <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => act('/bots/restart', { id: b.id })} title={b.stop_reason ?? b.status}>Restart</button>}
            </li>
          ))}
        </ul>
      ) : <p className="t-body-md m-0 text-page-text-mute">No agent yet. Add one: it buys in your vault, under your mandate, and never sees the exit.</p>}
      <form onSubmit={add} className="agents__form mt-5">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={universe === 'vaults' ? 'Yield' : 'DCA'} maxLength={40} autoComplete="off" disabled={!s.signed} />
        <Select label="Universe" value={universe} onChange={(e) => setUniverse(e.target.value as Universe)} disabled={!s.signed}>
          <option value="pools">v4 pools</option>
          <option value="vaults">4626 vaults</option>
        </Select>
        <Select label="Pace" value={interval} onChange={(e) => setIntervalS(e.target.value)} disabled={!s.signed}>
          <option value="0">One round</option>
          <option value="30">Every 30 s</option>
          <option value="60">Every 60 s</option>
          <option value="300">Every 5 min</option>
        </Select>
        <Field label="Slices" type="number" min={1} max={12} value={ticks} onChange={(e) => setTicks(e.target.value)} disabled={!s.signed} />
        <button type="submit" className="btn-ghost btn-ghost--small t-button-cap" disabled={busy || !s.signed}>{busy ? 'Launching…' : 'Add and launch'}</button>
      </form>
      {!s.signed ? <p className="t-caption m-0 mt-3 text-page-text-faint">Locked until the mandate is signed: a bot can only act inside a rule you read.</p> : <p className="t-caption m-0 mt-3 text-page-text-faint">The history, the journal and the positions: <a {...linkProps('/trades')} className="underline">the trades page</a>.</p>}
    </div>
  )
}

/* ─── TARE: the measure of the last decision, the security level ─── */

export function Measure({ s, a }: { s: BenchState; a: Activity }) {
  const e = s.escalation?.possible ? s.escalation : null
  // The measure shown is the request's when one waits on the Flex (its own journal row), else the last decision's.
  const r = e ? (rowOf(s, e) ?? a.lastRow) : a.lastRow
  const allows = s.mandate?.mandate.maxRoundTripLossBps ?? s.proposal?.max_round_trip_loss_bps ?? null
  const vault = e ? (e.kind ?? r?.kind) === 'vault' : r?.kind === 'vault'
  const exit = e ? e.seen_exit_bps : r ? (vault ? (r.stuck_bps ?? r.exit) : r.exit) : null
  const entry = r ? (vault ? (r.apy_pct != null ? `${r.apy_pct} %` : '·') : `${r.hook_in ?? r.entry}`) : null
  const verdict = e ? 'asks' : r ? (r.decision === 'EXECUTED' ? 'ok' : 'refused') : null
  return (
    <div className="measure" data-verdict={verdict ?? 'none'}>
      <Kicker>TARE · {vault ? 'the door, measured in the transaction' : 'what the hook takes, measured in the transaction'}</Kicker>
      {r || e ? (
        <>
          <p className="t-body-md m-0 text-page-text">{e ? (e.name ?? short(e.pool_id, 10, 6)) : (r!.name ?? short(r!.pool, 10, 6))} <span className="text-page-text-faint">· {e ? 'out of bounds' : vault ? 'ERC-4626 vault' : 'Uniswap v4 pool'}</span></p>
          <div className="exit-pair mt-4">
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">{vault ? 'advertised' : 'to enter'}</span><span className="t-mono-data-lg text-page-text">{entry ?? '·'} {vault ? '' : <span className="t-kicker text-page-text-faint">bps</span>}</span></div>
            <span className="exit-pair__rule" aria-hidden />
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">{vault ? 'door' : 'to leave'}</span><span className={`measure__exit t-numeral-hero ${verdict === 'ok' ? 'text-page-text' : 'text-hot'}`}>{exit == null ? '·' : exit >= 10000 ? 'blocked' : exit} <span className="exit-pair__unit t-kicker text-page-text-faint">{exit != null && exit < 10000 ? 'bps' : ''}</span></span></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {allows != null ? <span className="t-kicker text-page-text-mute">mandate allows {allows} bps</span> : null}
            {verdict === 'ok' ? <Badge tone="success">entered</Badge> : verdict === 'refused' ? <Badge tone="error">refused by the vault</Badge> : verdict === 'asks' ? <Badge tone="warning">back to the Flex with the number</Badge> : null}
          </div>
          {r && !e ? <p className="t-caption m-0 mt-3 max-w-[48ch] text-pretty text-page-text-faint">{r.why}</p> : null}
        </>
      ) : (
        <p className="t-body-md m-0 text-page-text-mute">No decision yet. When a bot picks a pool, the hook is swapped for 89 inert bytes, the pool is quoted twice, and the gap is what the hook takes. For a vault, a real deposit and withdrawal, undone, and the largest depositor’s door. That figure lands here.</p>
      )}
    </div>
  )
}

/* ─── the journal, compact: the last decisions, newest first ─── */

export function JournalStrip({ s, max = 6 }: { s: BenchState; max?: number }) {
  const rows = s.journal.slice(-max).reverse()
  if (!rows.length) return null
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>T</th><th>Bot</th><th>Position</th><th className="num">Seen by the bot</th><th className="num">Measured exit</th><th>Decision</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const vault = r.kind === 'vault'
            return (
              <tr key={`${r.tick}-${r.pool}-${i}`} className={i === 0 ? 'rise-in' : ''} title={r.why}>
                <td>{r.under_exception ? 'exc.' : r.tick}</td>
                <td className="label is-mute">{r.bot ?? '·'}</td>
                <td className={vault ? 'label' : ''}>{r.name ?? short(r.pool, 10, 4)}</td>
                <td className="num is-mute">{r.under_exception ? 'human decision' : vault ? `${r.apy_pct ?? '·'} % advertised` : `${r.entry} bps on entry`}</td>
                <td className="num">{vault ? (r.deposit_refused ? 'deposit refused' : `door ${r.stuck_bps ?? r.exit ?? '·'} bps`) : (r.exit != null && r.exit >= 10000 ? 'blocked' : `${r.exit ?? '·'} bps`)}</td>
                <td className="label">{r.under_exception ? <span className="is-warning">entered · exception</span> : r.decision === 'EXECUTED' ? <span className="is-success">{vault ? 'entered' : 'bought'}</span> : <span className="is-error">refused</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─── the analyst's last answer, with its trace ─── */

export function Analyst({ s }: { s: BenchState }) {
  const last = s.analyses.length ? s.analyses[s.analyses.length - 1] : null
  if (!last) return null
  return (
    <div className="thread">
      <p className="thread__you t-body-md m-0">{last.question}</p>
      <div className="thread__them t-body-md">
        {last.pending ? <span className="text-page-text-faint">It is querying the tools…</span> : <span>{(last.answer || `No answer: ${last.error ?? ''}`).slice(0, 420)}{last.answer && last.answer.length > 420 ? '…' : ''}</span>}
        {!last.pending ? <span className="thread__trace t-kicker">MCP → {last.tools_used.length ? last.tools_used.map((t) => `${t.tool}(${Object.entries(t.args ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')})`).join(' · ') : 'no tool called'}</span> : null}
      </div>
    </div>
  )
}

/** The holdings, in one line: what the vault keeps, what was spent. */
export function Holdings({ s }: { s: BenchState }) {
  return (
    <dl className="kv">
      <div className="kv__row"><dt className="t-mono-data text-page-text">Vault</dt><dd className="t-body-md m-0 text-page-text-mute">{s.vault ? short(s.vault, 8, 6) : 'not opened'}</dd></div>
      <div className="kv__row"><dt className="t-mono-data text-page-text">Available</dt><dd className="t-body-md m-0 text-page-text-mute">{fmtWei(s.weth)}</dd></div>
      <div className="kv__row"><dt className="t-mono-data text-page-text">Spent under mandate</dt><dd className="t-body-md m-0 text-page-text-mute">{fmtWei(s.spent)}</dd></div>
      <div className="kv__row"><dt className="t-mono-data text-page-text">Positions</dt><dd className="t-body-md m-0 text-page-text-mute">{s.positions.length}{s.positions.some((p) => p.under_exception) ? ', some under exception' : ''}</dd></div>
    </dl>
  )
}

export function LiveSkeleton() { return <Skeleton rows={5} /> }
