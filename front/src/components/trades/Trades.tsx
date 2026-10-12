/**
 * /trades — the trading agents and what they did, on the home's surface. The bots (add, stop, restart, the
 * history), the out-of-bounds requests they raise (the number back on the device, two outcomes), the positions and
 * their re-probe, the journal decision by decision. The Ledger signs one thing here: an exception, with the number.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ProductPage, Sheets } from '../account/shell'
import { askToNotify, useBench } from '../../app/useBench'
import { fmtWei, short, type Bot, type BenchState, type JournalRow } from '../../app/api'
import { linkProps } from '../../app/router'
import { Field, Segments, Select, SignOnDevice, duration, time } from '../../app/ui'
import { Badge, Band, DeviceMirror, hotTitle, Kicker, Mark, Note, Panel, Source, Takeaway, Title } from '../landing/primitives'
import type { HotTitle } from '../landing/content'

const HERO = { title: 'TRADES', catch: 'Your agents buy. The contract decides. Every decision, with its number.', heading: 'My trades' }

const AGENTS = {
  title: ['They buy. ', 'The contract decides.', ''] as HotTitle,
  takeaway: 'Execution agents, no language model · named, launched, stopped by you · they never see the exit',
  lead: 'A bot is an execution agent without a language model. It chooses on what it sees, the depth, the advertised yield, and never sees the exit. All your bots work in the same vault, under the same mandate.',
  source: 'agent/agent.py (DCA on the Uniswap v4 long tail), agent/vaults.py (advertised yield, ERC-4626). README.md, “Plusieurs agents”.',
}
const REQUESTS = {
  title: ['Out of bounds ', 'does not mean no.', ''] as HotTitle,
  takeaway: 'The number comes back to the device · read and sign, or leave refused · one position, one amount, once',
  lead: 'When a bot wants a position your mandate refuses, the request comes back to you, on the device, with the real number. An exception is worth this position, this amount and this number, once.',
  note: ['If the exit worsens between your reading and the purchase, ', 'the contract refuses the exception', ' (ExitWorseThanSeen). A refusal is kept: no bot asks for that position again.'] as const,
  source: 'contracts/src/ExitVault.sol, buyWithException(). README.md, “L’escalade”.',
}
const POSITIONS = {
  title: ['A door ', 'can close.', ''] as HotTitle,
  takeaway: 'The exit measured at the purchase · re-probed on demand · exit while you still can',
  lead: 'The probe measures the exit at the time of the purchase, not the future. The only answer is to probe again, and to leave while you still can.',
  source: 'agent/watch.py. README.md, “Ce que ça n’attrape pas”.',
}
const JOURNAL = {
  title: ['The journal, ', 'decision by decision.', ''] as HotTitle,
  takeaway: 'What the bot saw · what the contract measured · the decision and its reason',
}

export function TradesPage() {
  return (
    <ProductPage route="/trades" hero={HERO} skip="agents">
      <Sections />
    </ProductPage>
  )
}

function Sections() {
  const { state } = useBench()
  if (!state) return null
  return (
    <Sheets>
      <Band id="agents" label="Your trading agents">
        <Takeaway>{AGENTS.takeaway}</Takeaway>
        <Title size="xl" className="max-w-[16ch]">{hotTitle(AGENTS.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{AGENTS.lead}</p>
        <div className="mt-10" data-wipe><Bots s={state} /></div>
        <Source>{AGENTS.source}</Source>
      </Band>

      <Band id="requests" label="Out-of-bounds requests" lift={1}>
        <Takeaway>{REQUESTS.takeaway}</Takeaway>
        <Title className="max-w-[18ch]">{hotTitle(REQUESTS.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{REQUESTS.lead}</p>
        <div className="mt-10" data-wipe><Requests s={state} /></div>
        <div className="mt-8"><Note>{REQUESTS.note[0]}<Mark>{REQUESTS.note[1]}</Mark>{REQUESTS.note[2]}</Note></div>
        <Source>{REQUESTS.source}</Source>
      </Band>

      <Band id="positions" label="Positions" lift={2} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{POSITIONS.takeaway}</Takeaway>
          <Title className="max-w-[16ch]">{hotTitle(POSITIONS.title)}</Title>
          <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{POSITIONS.lead}</p>
          <div className="mt-10" data-wipe><Positions s={state} /></div>
          <Source>{POSITIONS.source}</Source>
        </div>
      </Band>

      <Band id="journal" label="The journal">
        <Takeaway>{JOURNAL.takeaway}</Takeaway>
        <Title className="max-w-[18ch]">{hotTitle(JOURNAL.title)}</Title>
        <div className="mt-10" data-wipe><Journal s={state} /></div>
      </Band>
    </Sheets>
  )
}

const universeLabel = (u: Bot['universe']) => (u === 'vaults' ? '4626 vaults' : 'v4 pools')

/* ─── the bots: add one, the live ones, the history ─── */

function Bots({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [name, setName] = useState('')
  const [universe, setUniverse] = useState(s.universe)
  const [ticks, setTicks] = useState(String(s.proposal?.ticks ? Math.min(s.proposal.ticks, 5) : 3))
  const [interval, setIntervalS] = useState('60')
  const [busy, setBusy] = useState(false)
  const live = s.bots.filter((b) => b.status === 'running')
  const old = s.bots.filter((b) => b.status !== 'running').slice().reverse()

  const add = async (e: FormEvent) => {
    e.preventDefault()
    askToNotify()
    setBusy(true)
    const r = await act('/bots', { name: name.trim(), universe, ticks: Number(ticks) || 3, interval_s: Number(interval) || 0 })
    if (r.ok) setName('')
    setBusy(false)
  }
  const oneRound = async () => { askToNotify(); await act('/universe', { universe }); await act('/run') }

  if (!s.signed) {
    return (
      <Panel lift={2}>
        <Kicker>First, the mandate</Kicker>
        <p className="t-body-md m-0 max-w-[60ch] text-pretty text-page-text-mute">Your agents buy in your vault and under your mandate: nothing leaves before you have read and signed it on your Ledger.</p>
        <div className="mt-5"><a {...linkProps('/demo', '#map')} className="btn-ghost btn-ghost--hot t-button-cap">Sign the mandate on the live map</a></div>
      </Panel>
    )
  }
  return (
    <>
      <Panel lift={2}>
        <Kicker>Add a bot</Kicker>
        <form onSubmit={add} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1.3fr_0.7fr_1.3fr_auto] xl:items-end">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={universe === 'vaults' ? 'Yield watcher' : 'Careful DCA'} maxLength={40} autoComplete="off" />
          <Select label="Universe" value={universe} onChange={(e) => setUniverse(e.target.value as typeof universe)}>
            <option value="pools">v4 pools</option>
            <option value="vaults">4626 vaults</option>
          </Select>
          <Field label="Slices" type="number" min={1} max={12} value={ticks} onChange={(e) => setTicks(e.target.value)} />
          <Select label="Pace" value={interval} onChange={(e) => setIntervalS(e.target.value)}>
            <option value="0">One round</option>
            <option value="30">Every 30 s</option>
            <option value="60">Every 60 s</option>
            <option value="300">Every 5 min</option>
          </Select>
          <button type="submit" className="btn-ghost btn-ghost--small t-button-cap" disabled={busy}>{busy ? 'Launching…' : 'Add and launch'}</button>
        </form>
        <p className="t-caption m-0 mt-4 text-page-text-faint">
          {universe === 'vaults'
            ? 'Ten real WETH vaults on Base. The largest has 27 % of its door closed; nothing in its API says so.'
            : 'The WETH long tail of Base. Six pools cost 0 bps to enter and 9 990 to leave: indistinguishable before buying.'}
        </p>
        <p className="m-0 mt-1"><button type="button" className="segment t-caption" aria-pressed="true" onClick={oneRound} disabled={s.running}>Or run one round now</button></p>
      </Panel>

      <h3 className="t-kicker m-0 mt-12 mb-3 text-page-text-faint">Live</h3>
      {live.length ? <BotsTable bots={live} running={s.bot_running} onStop={(id) => act('/bots/stop', { id })} /> : (
        <p className="t-body-md m-0 text-page-text-mute">No bot is running. Add one, or run one round to watch the contract refuse.</p>
      )}

      {old.length ? (
        <>
          <h3 className="t-kicker m-0 mt-12 mb-3 text-page-text-faint">Stopped · the history</h3>
          <HistoryTable bots={old} onRestart={(id) => act('/bots/restart', { id })} />
        </>
      ) : null}
    </>
  )
}

function BotsTable({ bots, running, onStop }: { bots: Bot[]; running: string | null; onStop: (id: string) => void }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>Bot</th><th>Universe</th><th>State</th><th className="num">Rounds</th><th className="num">In</th><th className="num">Refused</th><th className="num">Exc.</th><th className="num">Positions</th><th className="num">Spent</th><th /></tr></thead>
        <tbody>
          {bots.map((b) => {
            const next = Math.max(0, Math.round((b.next_run || 0) - Date.now() / 1000))
            return (
              <tr key={b.id}>
                <td className="label"><span className="text-page-text">{b.name}</span><br /><span className="is-faint">{b.ticks} slice{b.ticks > 1 ? 's' : ''} · {b.interval_s ? `every ${duration(b.interval_s)}` : 'one round'}</span></td>
                <td className="label">{universeLabel(b.universe)}</td>
                <td className="label">{running === b.id ? <Badge tone="warning">round in progress</Badge> : <><Badge tone="success">live</Badge>{b.interval_s ? <span className="is-faint"> · in {duration(next)}</span> : null}</>}</td>
                <td className="num">{b.rounds}</td>
                <td className="num is-success">{b.executed}</td>
                <td className="num is-error">{b.refused}</td>
                <td className="num">{b.exceptions || 0}</td>
                <td className="num">{b.positions}</td>
                <td className="num">{fmtWei(b.spent_wei)}</td>
                <td><button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => onStop(b.id)}>Stop</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HistoryTable({ bots, onRestart }: { bots: Bot[]; onRestart: (id: string) => void }) {
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>Bot</th><th>Universe</th><th>From</th><th>To</th><th className="num">Rounds</th><th className="num">In</th><th className="num">Refused</th><th className="num">Exc.</th><th className="num">Spent</th><th>End</th><th /></tr></thead>
        <tbody>
          {bots.map((b) => (
            <tr key={b.id}>
              <td className="label text-page-text">{b.name}</td>
              <td className="label">{universeLabel(b.universe)}</td>
              <td>{time(b.started)}</td>
              <td>{time(b.stopped)}</td>
              <td className="num">{b.rounds}</td>
              <td className="num is-success">{b.executed}</td>
              <td className="num is-error">{b.refused}</td>
              <td className="num">{b.exceptions || 0}</td>
              <td className="num">{fmtWei(b.spent_wei)}</td>
              <td className="label">{b.status === 'done' ? <Badge tone="info">finished</Badge> : <span className="is-mute">stopped</span>} <span className="is-faint">{b.stop_reason === 'arrêté par le porteur' ? 'by you' : b.stop_reason}</span></td>
              <td><button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => onRestart(b.id)}>Restart</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── the out-of-bounds requests ─── */

function Requests({ s }: { s: BenchState }) {
  const { act } = useBench()
  const e = s.escalation
  const waiting = s.escalation_queue.length
  const signing = s.signing === 'exception'
  if (!e || !e.possible) {
    return (
      <p className="t-body-md m-0 max-w-[60ch] text-pretty text-page-text-mute">
        {s.exception_buys.length || s.refused_escalations.length
          ? `${s.exception_buys.length} exception${s.exception_buys.length === 1 ? '' : 's'} signed on the Ledger, ${s.refused_escalations.length} left refused. No request waiting.`
          : 'No request. One appears here the moment a bot meets a position that overflows your mandate.'}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-5">
        <div className={`panel panel--lift-3 blink-in ${signing ? 'app-mirror--pending' : ''}`}>
          <Kicker>{e.bot ? `Request from bot “${e.bot.name}”` : 'Request'}</Kicker>
          <p className="t-body-lg m-0 text-page-text">{e.question}</p>
          <dl className="kv mt-5">
            <div className="kv__row"><dt className="t-mono-data text-page-text">Position</dt><dd className="t-body-md m-0 text-page-text-mute">{e.name ?? short(e.pool_id, 10, 6)}</dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Amount</dt><dd className="t-body-md m-0 text-page-text-mute">{fmtWei(e.amount_in)}</dd></div>
          </dl>
          <div className="exit-pair mt-5">
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">mandate allows</span><span className="t-mono-data-lg text-page-text">{e.mandate_allows_bps} <span className="t-kicker text-page-text-faint">bps</span></span></div>
            <span className="exit-pair__rule" aria-hidden />
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">measured on the way out</span><span className="t-mono-data-lg text-hot">{e.seen_exit_bps} <span className="t-kicker text-page-text-faint">bps</span></span></div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SignOnDevice onClick={() => act('/escalate')} disabled={!!s.signing}>Read and sign on Ledger</SignOnDevice>
            <button type="button" className="btn-ghost btn-ghost--quiet t-button-cap" onClick={() => act('/escalate_no')} disabled={!!s.signing}>Leave refused</button>
          </div>
          {waiting ? <p className="t-caption m-0 mt-4 text-page-text-faint">{waiting} more request{waiting > 1 ? 's' : ''} waiting.</p> : null}
        </div>
      </div>
      <div className="xl:col-span-7">
        <DeviceMirror
          title="Exit exception"
          hot="EXIT COST (bps)"
          className={signing ? 'app-mirror--pending' : ''}
          lines={[['Contract', 'Exit exception'], ['Network', 'Base'], ['Position', short(e.pool_id, 10, 6)], ['Amount', fmtWei(e.amount_in)], ['EXIT COST (bps)', String(e.seen_exit_bps)], ['Valid until', '1 h']]}
          caption="What the device shows, field by field: the same clear signing as the mandate."
        />
      </div>
    </div>
  )
}

/* ─── the positions, and the re-probe ─── */

function Positions({ s }: { s: BenchState }) {
  const { act } = useBench()
  const rows = s.watch?.rows ?? []
  const worse = rows.filter((r) => (r.delta_bps ?? 0) > 0 || r.blocked).length
  return (
    <>
      {s.positions.length ? (
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Position</th><th>Bot</th><th>Kind</th><th className="num">Balance</th><th className="num">Exit at the purchase</th><th>Acquired</th></tr></thead>
            <tbody>
              {s.positions.map((p, i) => (
                <tr key={i}>
                  <td className={p.kind === 'vault' ? 'label' : ''}>{p.name ?? p.pool}</td>
                  <td className="label is-mute">{p.bot ?? '·'}</td>
                  <td className="label">{p.kind === 'vault' ? 'vault' : 'pool'}</td>
                  <td className="num">{Number(p.balance).toExponential(3)}</td>
                  <td className="num">{p.exit_bps ?? '·'} bps</td>
                  <td className="label">{p.under_exception ? <span className="is-warning">under exception</span> : <span className="is-mute">within the mandate</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="t-body-md m-0 text-page-text-mute">No position. They appear here with the exit cost measured at the time of the purchase.</p>}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost t-button-cap" onClick={() => act('/watch')} disabled={s.watching || !s.positions.length}>{s.watching ? 'Probing…' : 'Re-probe'}</button>
        <button type="button" className="btn-ghost btn-ghost--quiet t-button-cap" onClick={() => act('/watch_sell')} disabled={s.watching || !s.positions.length}>Re-probe and exit</button>
      </div>

      {rows.length ? (
        <div className="data-scroll mt-8">
          <table className="data-table">
            <thead><tr><th>Position</th><th className="num">At the purchase</th><th className="num">Now</th><th className="num">Gap</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const bad = (r.delta_bps ?? 0) > 0 || r.blocked
                return (
                  <tr key={i}>
                    <td className={r.kind === 'vault' ? 'label' : ''}>{r.name ?? short(r.pool_id, 10, 4)}</td>
                    <td className="num">{r.exit_bps_at_buy ?? '·'} bps</td>
                    <td className={`num ${bad ? 'is-error' : ''}`}>{r.blocked ? 'blocked' : `${r.exit_bps_now ?? '·'} bps`}</td>
                    <td className={`num ${bad ? 'is-error' : 'is-success'}`}>{r.delta_bps == null ? '·' : `${r.delta_bps > 0 ? '+' : r.delta_bps < 0 ? '−' : ''}${Math.abs(r.delta_bps)} bps`}</td>
                    <td className="label">{r.action === 'SORTI' ? <Badge tone="success">exited</Badge> : r.action !== 'aucune' ? <Badge tone="error">{r.action}</Badge> : <span className="is-faint">·</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="t-caption m-0 mt-3 text-page-text-faint">{rows.length} position{rows.length > 1 ? 's' : ''}, {worse} whose exit has closed in. Not a guarantee: between two passes, a door can close.</p>
        </div>
      ) : null}
    </>
  )
}

/* ─── the journal ─── */

function Journal({ s }: { s: BenchState }) {
  const [which, setWhich] = useState<'all' | 'refused' | 'bought'>('all')
  const [bot, setBot] = useState('all')
  const names = Array.from(new Set(s.journal.map((r) => r.bot).filter((x): x is string => !!x)))
  const rows = s.journal.filter((r) => (which === 'all' || (which === 'refused') === (r.decision !== 'EXECUTED')) && (bot === 'all' || r.bot === bot))
  const bought = s.journal.filter((r) => r.decision === 'EXECUTED').length
  if (!s.journal.length) return <p className="t-body-md m-0 text-page-text-mute">No decision yet. Launch a bot, or run one round: every decision lands here with its number.</p>
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="t-body-md m-0 max-w-[60ch] text-page-text-mute">{bought} entr{bought === 1 ? 'y' : 'ies'}, {s.journal.length - bought} refusal{s.journal.length - bought === 1 ? '' : 's'}. “Seen by the bot” is all it knew; “measured exit” is what the contract found.</p>
        <div className="flex flex-wrap items-end gap-4">
          {names.length > 1 ? (
            <Select label="Bot" value={bot} onChange={(e) => setBot(e.target.value)}>
              <option value="all">all</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          ) : null}
          <Segments label="Filter the journal" value={which} onChange={setWhich} options={[{ value: 'all', label: 'All' }, { value: 'bought', label: 'Entries' }, { value: 'refused', label: 'Refusals' }]} />
        </div>
      </div>
      <JournalTable rows={rows} />
    </>
  )
}

export function JournalTable({ rows }: { rows: JournalRow[] }) {
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>T</th><th>Bot</th><th>Position</th><th className="num">Seen by the bot</th><th className="num">Measured exit</th><th>Decision</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const ok = r.decision === 'EXECUTED'
            const vault = r.kind === 'vault'
            const seen = r.under_exception ? 'human decision' : vault ? `${r.apy_pct ?? '·'} % advertised` : `${r.entry} bps on entry`
            const exit = vault
              ? (r.deposit_refused ? 'deposit refused' : `door ${r.stuck_bps ?? r.exit ?? '·'} bps`)
              : (r.exit != null && r.exit >= 10000 ? 'blocked' : `${r.exit ?? '·'} bps`)
            return (
              <tr key={i} title={r.why}>
                <td>{r.under_exception ? 'exc.' : r.tick}</td>
                <td className="label is-mute">{r.bot ?? '·'}</td>
                <td className={vault ? 'label' : ''}>{r.name ?? r.pool}</td>
                <td className="num is-mute">{seen}</td>
                <td className="num">{exit}</td>
                <td className="label">
                  {r.under_exception ? <span className="is-warning">entered · exception</span> : ok ? <span className="is-success">{vault ? 'entered' : 'bought'}</span> : <span className="is-error" title={r.error ?? ''}>refused</span>}
                  {!ok && !r.under_exception ? <Why text={r.why} /> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Why({ text }: { text: string }): ReactNode {
  return <span className="is-mute">, {text.length > 70 ? text.slice(0, 70).replace(/\s+\S*$/, '') + '…' : text}</span>
}
