/**
 * The bots, as a module beside the map: every agent the holder launched, its state, its numbers, and the decisions it
 * took, newest first. Same place as TARE (between the map and the side column) and the same grammar: a kicker, a title,
 * mono lines, one colour for the state. It opens on the agents phase when no round runs (TARE takes the place while one
 * runs and for a few seconds after), or by the « Bots » button in the rail, at any phase.
 */
import { useState } from 'react'
import { useBench } from '../../app/useBench'
import { fmtWei, short, type BenchState, type Bot, type JournalRow } from '../../app/api'
import { linkProps } from '../../app/router'
import { Badge } from '../landing/primitives'
import { duration } from '../../app/ui'

const exitOf = (r: JournalRow) => (r.kind === 'vault' ? (r.deposit_refused ? 10000 : (r.stuck_bps ?? r.exit)) : r.exit)
/** The journal rows this bot wrote, in the order the bench wrote them. */
export const botRows = (s: BenchState, b: Bot) => s.journal.filter((r) => r.bot === b.name)

const universeLabel = (u: Bot['universe']) => (u === 'vaults' ? '4626 vaults' : 'v4 pools')
const paceLabel = (b: Bot) => (b.interval_s ? `every ${duration(b.interval_s)}` : 'one round')
const stateOf = (s: BenchState, b: Bot) => (b.status === 'running' ? (s.bot_running === b.id ? 'live' : 'running') : b.status)

export function BotsPanel({ s }: { s: BenchState }) {
  const { act } = useBench()
  const bots = s.bots.slice().reverse()
  const [chosen, setChosen] = useState<string | null>(null)
  const sel = bots.find((b) => b.id === chosen) ?? bots.find((b) => b.id === s.bot_running) ?? bots.find((b) => b.status === 'running') ?? bots[0] ?? null
  const rows = sel ? botRows(s, sel).slice().reverse() : []
  const entries = rows.filter((r) => r.decision === 'EXECUTED')
  const refused = rows.filter((r) => r.decision !== 'EXECUTED')
  const traps = refused.filter((r) => { const e = exitOf(r); return e != null && e >= 10000 }).length
  const allows = s.mandate?.mandate.maxRoundTripLossBps ?? null
  const avgExit = entries.length ? Math.round(entries.reduce((n, r) => n + (exitOf(r) ?? 0), 0) / entries.length) : null
  const held = sel ? s.positions.filter((p) => p.bot === sel.name).length : 0
  const totalIn = s.bots.reduce((n, b) => n + b.executed, 0)
  const totalRefused = s.bots.reduce((n, b) => n + b.refused, 0)
  const live = s.bots.filter((b) => b.status === 'running').length
  const tone = sel ? (sel.status === 'running' ? 'running' : 'ok') : 'none'
  return (
    <aside className="tare bots" data-verdict={tone} aria-label="The bots">
      <p className="t-kicker tare__kicker">The bots · execution agents · no language model</p>
      <p className="tare__title">{s.bots.length ? `${s.bots.length} bot${s.bots.length > 1 ? 's' : ''} · ${totalIn} in · ${totalRefused} refused${live ? ` · ${live} running` : ''}` : 'No agent yet'}</p>
      {s.bots.length ? (
        <ul className="bots__list" aria-label="Your bots">
          {bots.map((b) => {
            const st = stateOf(s, b)
            return (
              <li key={b.id} className="bots__bot" data-state={st} data-chosen={sel?.id === b.id || undefined}>
                <button type="button" className="bots__pick" aria-pressed={sel?.id === b.id} onClick={() => setChosen(b.id)}>
                  <span className="bots__dot" aria-hidden />
                  <span className="bots__name">{b.name}</span>
                  <span className="t-kicker bots__meta">{universeLabel(b.universe)} · {paceLabel(b)} · {b.ticks} slice{b.ticks > 1 ? 's' : ''}</span>
                  <span className="t-mono-data bots__nums">{b.rounds} round{b.rounds > 1 ? 's' : ''} · <span className="is-success">{b.executed}</span> in · <span className="is-error">{b.refused}</span> refused{b.exceptions ? ` · ${b.exceptions} exc.` : ''} · {fmtWei(b.spent_wei)}</span>
                </button>
                {b.status === 'running'
                  ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => act('/bots/stop', { id: b.id })}>Stop</button>
                  : <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => act('/bots/restart', { id: b.id })} title={b.stop_reason ?? b.status}>Restart</button>}
              </li>
            )
          })}
        </ul>
      ) : <p className="t-body-md m-0 text-page-text-mute">Add one in the Agents drawer: it buys in your vault, under your mandate, and never sees the exit.</p>}

      {sel ? (
        <>
          <p className="t-kicker bots__sub">{sel.name} · {sel.status === 'running' ? 'running' : sel.status === 'done' ? 'finished' : 'stopped'}{sel.stop_reason && sel.status !== 'running' ? ` · ${sel.stop_reason === 'arrêté par le porteur' ? 'by you' : sel.stop_reason}` : ''}</p>
          <dl className="bots__perf">
            <div><dt>Entries</dt><dd className="is-success">{entries.length}</dd></div>
            <div><dt>Refused</dt><dd className="is-error">{refused.length}{traps ? <span className="t-kicker text-page-text-faint"> · {traps} blocked</span> : null}</dd></div>
            <div><dt>Exceptions</dt><dd>{sel.exceptions || 0}</dd></div>
            <div><dt>Positions held</dt><dd>{held}</dd></div>
            <div><dt>Spent</dt><dd>{fmtWei(sel.spent_wei)}</dd></div>
            <div><dt>Avg exit of entries</dt><dd>{avgExit == null ? '·' : <>{avgExit} <span className="t-kicker text-page-text-faint">bps{allows != null ? ` · mandate ${allows}` : ''}</span></>}</dd></div>
          </dl>
          {rows.length ? (
            <ol className="bots__history" aria-label={`Decisions of ${sel.name}, newest first`}>
              {rows.slice(0, 14).map((r, i) => {
                const vault = r.kind === 'vault'
                const e = exitOf(r)
                const ok = r.decision === 'EXECUTED'
                const seen = r.under_exception ? 'your decision' : vault ? `${r.apy_pct ?? '·'} % advertised` : `${r.entry} bps in`
                const measured = e == null ? '·' : e >= 10000 ? (r.deposit_refused ? 'deposit refused' : 'blocked') : `${e} bps out`
                return (
                  <li key={`${r.tick}-${r.pool}-${i}`} className="bots__row" data-state={r.under_exception ? 'exception' : ok ? 'ok' : 'refused'}>
                    <span className="t-kicker bots__tick">{r.under_exception ? 'exc.' : `t${r.tick}`}</span>
                    <span className="bots__pos">{r.name ?? short(r.pool, 10, 4)}</span>
                    <span className="t-mono-data bots__measure">{seen} → <b>{measured}</b></span>
                    <span className="bots__verdict">{r.under_exception ? <Badge tone="warning">entered · exception</Badge> : ok ? <Badge tone="success">{vault ? 'entered' : 'bought'}</Badge> : <Badge tone="error">refused</Badge>}</span>
                    {!ok && !r.under_exception && r.why ? <span className="t-caption bots__why">{r.why.length > 110 ? r.why.slice(0, 110).replace(/\s+\S*$/, '') + '…' : r.why}</span> : null}
                  </li>
                )
              })}
            </ol>
          ) : <p className="t-body-md m-0 text-page-text-mute">{sel.status === 'running' ? 'Its first round is coming.' : 'No decision yet.'}</p>}
          <p className="t-caption m-0 bots__foot">{rows.length > 14 ? `${rows.length - 14} older decisions, and ` : ''}the whole journal, the positions and the history: <a {...linkProps('/trades')} className="underline">the trades page</a>.</p>
        </>
      ) : null}
    </aside>
  )
}
