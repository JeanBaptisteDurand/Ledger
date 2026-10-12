/**
 * The live stage: one screen, no scroll. A rail of four phases on top (setup · agents · request · watch and
 * analyst), the map or the cockpit's three columns in the middle, one strip at the bottom (TARE's last measure,
 * the one sentence that says what the system is doing). The phase follows the bench on its own: the active
 * phase's drawer is open, the others are folded to one line, and the map zooms to the region that acts. A click on
 * a phase pins it (Follow brings the auto back). Fullscreen for the projector. The recap stays under the stage.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBench } from '../../app/useBench'
import { LiveScreen } from '../../app/device'
import { fmtWei, short, type BenchState } from '../../app/api'
import { linkProps } from '../../app/router'
import { prefersReducedMotion } from '../../motion/flags'
import { Badge } from '../landing/primitives'
import { SchemaMap, type MapFocus } from '../landing/SchemaMap'
import { activity, Agents, Door, mapLive, Measure, useSteps, type Activity, type Phase } from './live'

export type StageMode = 'map' | 'cockpit'
type Act = 'setup' | 'agents' | 'request' | 'watch'
const ACTS: { id: Act; label: string; phases: Phase[] }[] = [
  { id: 'setup', label: 'Setup', phases: ['session', 'bounds', 'mandate'] },
  { id: 'agents', label: 'Agents', phases: ['agents'] },
  { id: 'request', label: 'Request', phases: ['request'] },
  { id: 'watch', label: 'Watch and analyst', phases: ['watch', 'analyst'] },
]
const FOCUS: Record<Act, MapFocus> = {
  setup: { x: 20, y: 0, w: 760, h: 560 },
  agents: { x: 20, y: 330, w: 760, h: 490 },
  request: { x: 400, y: 0, w: 400, h: 560 },
  watch: { x: 20, y: 160, w: 1160, h: 500 },
}
const actOf = (p: Phase): Act => ACTS.find((a) => a.phases.includes(p))!.id

export function Stage({ mode }: { mode: StageMode }) {
  const [asking, setAsking] = useState(false)
  const { steps, a, s } = useSteps({ asking, setAsking })
  const [pinned, setPinned] = useState<Act | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  // Once a live mode is chosen the stage is what the presenter looks at: bring it into view, once.
  useEffect(() => { stage.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }) }, [mode])
  if (!s || !s.address) return <div ref={stage} className="live-stage live-stage--door"><Door /></div>
  const auto = actOf(a.phase)
  const act = pinned ?? auto
  const live = mapLive(s, a)
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.current?.requestFullscreen?.() }
  return (
    <div ref={stage} className={`live-stage ${full ? 'is-full' : ''}`} data-mode={mode} data-act={act}>
      <div className="live-stage__rail">
        <ol className="acts" aria-label="Phases">
          {ACTS.map((x, i) => {
            const state = x.id === act ? 'live' : ACTS.findIndex((y) => y.id === auto) > i ? 'done' : 'ahead'
            return (
              <li key={x.id} data-state={state}>
                <button type="button" className="acts__btn" aria-current={x.id === act ? 'step' : undefined} onClick={() => setPinned(x.id === auto ? null : x.id)}>
                  <span className="t-kicker acts__index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="acts__label">{x.label}</span>
                  <span className="t-kicker acts__sum">{summary(x.id, s)}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className="live-stage__tools">
          {pinned ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setPinned(null)}>Follow</button> : <span className="t-kicker text-page-text-faint">following the bench</span>}
          <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={toggleFull}>{full ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>

      {mode === 'map' ? (
        <div className="live-stage__body live-stage__body--map">
          <div className="live-stage__map"><SchemaMap live={live} focus={FOCUS[act]} fit /></div>
          <div className="live-stage__side">
            <div className="live-stage__flex"><LiveScreen live={s.speculos} signing={s.signing} real={false} /></div>
            <Drawers act={act} s={s} a={a} steps={steps} onOpen={(x) => setPinned(x === auto ? null : x)} />
          </div>
        </div>
      ) : (
        <div className="live-stage__body live-stage__body--cockpit">
          <div className="live-stage__col">
            <Drawers act={act} s={s} a={a} steps={steps} onOpen={(x) => setPinned(x === auto ? null : x)} />
          </div>
          <div className="live-stage__col live-stage__col--flex">
            <LiveScreen live={s.speculos} signing={s.signing} real={false} />
          </div>
          <div className="live-stage__col">
            <div className="panel panel--lift-2 live-stage__measure-panel"><Measure s={s} a={a} /></div>
            <div className="panel panel--lift-2 mt-4"><Agents s={s} /></div>
          </div>
        </div>
      )}

      <div className="live-stage__strip">
        {mode === 'map' ? <MeasureLine s={s} a={a} /> : <span className="t-kicker text-page-text-faint">{s.journal.length} decisions · {s.positions.length} positions · {(s.escalation?.possible ? 1 : 0) + s.escalation_queue.length} requests waiting</span>}
        <p className={`t-body-md m-0 text-pretty ${a.signing ? 'text-hot' : 'text-page-text'}`} aria-live="polite">{a.now}</p>
      </div>
    </div>
  )
}

/** One line per phase, folded: what it has to say about itself. */
function summary(act: Act, s: BenchState): string {
  if (act === 'setup') return s.signed ? `mandate ${s.mandate ? Number(s.mandate.mandate.budgetAmount) / 1e18 : s.proposal?.budget_weth} WETH · ${s.mandate?.mandate.maxRoundTripLossBps ?? s.proposal?.max_round_trip_loss_bps} bps` : s.proposal ? 'bounds proposed, to sign' : s.vault ? 'vault open' : 'no vault yet'
  if (act === 'agents') { const live = s.bots.filter((b) => b.status === 'running').length; const bought = s.journal.filter((r) => r.decision === 'EXECUTED').length; return s.bots.length ? `${s.bots.length} bot${s.bots.length > 1 ? 's' : ''} · ${bought} in · ${s.journal.length - bought} refused${live ? ' · running' : ''}` : 'no agent yet' }
  if (act === 'request') { const w = (s.escalation?.possible ? 1 : 0) + s.escalation_queue.length; return w ? `${w} waiting on the Flex` : `${s.exception_buys.length} signed · ${s.refused_escalations.length} left refused` }
  return `${s.positions.length} positions${s.watch ? ' · probed' : ''}${s.analyses.length ? ' · analyst answered' : ''}`
}

/** The four drawers: the active one open, the others one line. Clicking a folded one opens it (pins it). */
function Drawers({ act, s, a, steps, onOpen }: { act: Act; s: BenchState; a: Activity; steps: ReturnType<typeof useSteps>['steps']; onOpen: (x: Act) => void }) {
  return (
    <div className="drawers">
      {ACTS.map((x) => {
        const open = x.id === act
        return (
          <section key={x.id} className="drawer" data-open={open || undefined} aria-label={x.label}>
            <button type="button" className="drawer__head" aria-expanded={open} onClick={() => onOpen(x.id)}>
              <span className="drawer__title">{x.label}</span>
              <span className="t-kicker drawer__sum">{summary(x.id, s)}</span>
            </button>
            {open ? <div className="drawer__body">{x.id === 'setup' ? <SetupDrawer s={s} steps={steps} /> : x.id === 'agents' ? <AgentsDrawer s={s} a={a} steps={steps} /> : x.id === 'request' ? <RequestDrawer s={s} steps={steps} /> : <WatchDrawer s={s} steps={steps} />}</div> : null}
          </section>
        )
      })}
    </div>
  )
}

type Steps = ReturnType<typeof useSteps>['steps']
const step = (steps: Steps, id: Phase) => steps.find((x) => x.id === id)!

function StepRow({ st }: { st: Steps[number] }) {
  return (
    <div className="steprow" data-state={st.state}>
      <span className="steprow__label">{st.label}</span>
      <span className="steprow__actions">
        {st.state === 'pending' ? <span className="t-kicker text-hot">{st.id === 'mandate' || st.id === 'request' ? 'on the Flex' : 'working…'}</span> : null}
        {st.state === 'done' ? <span className="t-kicker text-page-text-faint">done</span> : null}
        {st.action ? <button type="button" className={`btn-ghost btn-ghost--small t-button-cap ${st.id === 'mandate' || st.id === 'request' ? 'btn-ghost--hot' : ''}`} onClick={st.action}>{st.actionLabel}</button> : null}
        {st.second ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={st.second}>{st.secondLabel}</button> : null}
      </span>
    </div>
  )
}

function SetupDrawer({ s, steps }: { s: BenchState; steps: Steps }) {
  const m = s.mandate, p = s.proposal
  const lines: [string, string][] = m || p ? [['Budget', `${m ? Number(m.mandate.budgetAmount) / 1e18 : p!.budget_weth} WETH`], ['Max round-trip loss', `${m ? m.mandate.maxRoundTripLossBps : p!.max_round_trip_loss_bps} bps`], ['Expires', m ? new Date(m.mandate.expiry * 1000).toISOString().slice(0, 10) : `in ${p!.days} days`]] : []
  return (
    <>
      <StepRow st={step(steps, 'session')} />
      <StepRow st={step(steps, 'bounds')} />
      <StepRow st={step(steps, 'mandate')} />
      {lines.length ? (
        <div className={`mirror t-mono-device mt-3 ${s.signing === 'mandate' ? 'app-mirror--pending' : ''}`}>
          <div className="mirror__title">Exit mandate{s.signed ? ' · signed' : ''}</div>
          <div className="mirror__lines">{lines.map(([k, v]) => <Line key={k} k={k} v={v} hot={k === 'Max round-trip loss'} />)}</div>
          {s.signed && s.last_report ? <p className="t-kicker m-0 mt-3 text-state-success">isBlindSign={String(s.last_report.isBlindSign)} · {s.last_report.clearSigningType ?? ''}</p> : null}
        </div>
      ) : null}
      <dl className="kv mt-3">
        <div className="kv__row"><dt className="t-mono-data text-page-text">Vault</dt><dd className="t-body-md m-0 text-page-text-mute">{s.vault ? `${short(s.vault, 8, 6)} · ${fmtWei(s.weth)}` : 'not opened'}</dd></div>
      </dl>
    </>
  )
}

function Line({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return <><span className="mirror__key">{k}</span><span className={`mirror__value ${hot ? 'mirror__hot' : ''}`}>{v}</span></>
}

function AgentsDrawer({ s, a, steps }: { s: BenchState; a: Activity; steps: Steps }) {
  return (
    <>
      <StepRow st={step(steps, 'agents')} />
      <div className="mt-3"><Agents s={s} /></div>
      {a.lastRow ? <p className="t-caption m-0 mt-3 text-page-text-faint">Last: {a.lastRow.name ?? short(a.lastRow.pool, 10, 4)}, {a.lastRow.decision === 'EXECUTED' ? 'entered' : 'refused'}, {a.lastRow.why.slice(0, 90)}</p> : null}
    </>
  )
}

function RequestDrawer({ s, steps }: { s: BenchState; steps: Steps }) {
  const e = s.escalation?.possible ? s.escalation : null
  return (
    <>
      <StepRow st={step(steps, 'request')} />
      {e ? (
        <div className={`request mt-3 ${s.signing === 'exception' ? 'app-mirror--pending' : ''}`}>
          <p className="t-kicker m-0 text-page-text-faint">bot “{e.bot?.name ?? '·'}” · {e.name ?? short(e.pool_id, 10, 6)}</p>
          <p className="t-body-md m-0 mt-2 text-page-text">{e.question}</p>
          <div className="exit-pair mt-3">
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">mandate allows</span><span className="t-mono-data-lg text-page-text">{e.mandate_allows_bps} <span className="t-kicker text-page-text-faint">bps</span></span></div>
            <span className="exit-pair__rule" aria-hidden />
            <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">measured on the way out</span><span className="t-mono-data-lg text-hot">{e.seen_exit_bps} <span className="t-kicker text-page-text-faint">bps</span></span></div>
          </div>
          {s.escalation_queue.length ? <p className="t-kicker m-0 mt-3 text-page-text-faint">{s.escalation_queue.length} more waiting</p> : null}
        </div>
      ) : (
        <p className="t-body-md m-0 mt-3 text-page-text-mute">{s.exception_buys.length || s.refused_escalations.length ? `${s.exception_buys.length} exception${s.exception_buys.length > 1 ? 's' : ''} signed on the Flex, ${s.refused_escalations.length} left refused.` : 'No request. One appears here the moment a bot meets a position the mandate refuses.'}</p>
      )}
    </>
  )
}

function WatchDrawer({ s, steps }: { s: BenchState; steps: Steps }) {
  const rows = (s.watch?.rows ?? []).slice(0, 3)
  const last = s.analyses.length ? s.analyses[s.analyses.length - 1] : null
  return (
    <>
      <StepRow st={step(steps, 'watch')} />
      {rows.length ? (
        <dl className="kv mt-2">
          {rows.map((r, i) => <div key={i} className="kv__row"><dt className="t-mono-data text-page-text">{r.name ?? short(r.pool_id, 8, 4)}</dt><dd className="t-body-md m-0 text-page-text-mute">{r.exit_bps_at_buy ?? '·'} → {r.blocked ? 'blocked' : `${r.exit_bps_now ?? '·'} bps`}{r.action === 'SORTI' ? ', exited' : ''}</dd></div>)}
        </dl>
      ) : null}
      <StepRow st={step(steps, 'analyst')} />
      {last ? (
        <div className="thread__them t-body-md mt-2">
          {last.pending ? <span className="text-page-text-faint">It is querying the tools…</span> : <span>{(last.answer || `No answer: ${last.error ?? ''}`).slice(0, 220)}…</span>}
          {!last.pending ? <span className="thread__trace t-kicker">MCP → {last.tools_used.map((t) => t.tool).join(' · ') || 'no tool called'}</span> : null}
        </div>
      ) : null}
    </>
  )
}

/** TARE in one line, for the strip under the map. */
function MeasureLine({ s, a }: { s: BenchState; a: Activity }) {
  const r = a.lastRow
  const e = s.escalation?.possible ? s.escalation : null
  const allows = s.mandate?.mandate.maxRoundTripLossBps ?? s.proposal?.max_round_trip_loss_bps
  if (!r && !e) return <span className="t-kicker text-page-text-faint">TARE · no measure yet</span>
  const vault = r?.kind === 'vault'
  const exit = e ? e.seen_exit_bps : vault ? (r!.stuck_bps ?? r!.exit) : r!.exit
  return (
    <span className="measure-line">
      <span className="t-kicker text-page-text-faint">TARE</span>
      <span className="t-body-md text-page-text">{e ? (e.name ?? short(e.pool_id, 8, 4)) : (r!.name ?? short(r!.pool, 8, 4))}</span>
      <span className="t-mono-data text-page-text-mute">{e ? '' : vault ? `${r!.apy_pct ?? '·'} % advertised →` : `in ${r!.hook_in ?? r!.entry} →`}</span>
      <span className="t-mono-data-lg text-hot">{exit == null ? '·' : exit >= 10000 ? 'blocked' : `${exit} bps`}</span>
      {allows != null ? <span className="t-kicker text-page-text-faint">mandate {allows}</span> : null}
      {e ? <Badge tone="warning">to the Flex</Badge> : r!.decision === 'EXECUTED' ? <Badge tone="success">entered</Badge> : <Badge tone="error">refused</Badge>}
    </span>
  )
}

/** Under the stage: what happened, for whoever scrolls. */
export function Recap({ children }: { children?: ReactNode }) {
  const { state: s } = useBench()
  const act = useMemo(() => (s ? activity(s, { asking: false }) : null), [s])
  if (!s || !s.address || !act) return null
  return (
    <div className="recap">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="xl:col-span-5"><div className="panel panel--lift-2"><Measure s={s} a={act} /></div></div>
        <div className="xl:col-span-7">
          <dl className="kv">
            <div className="kv__row"><dt className="t-mono-data text-page-text">Account</dt><dd className="t-body-md m-0 text-page-text-mute">{s.address} · <a {...linkProps('/connexion')} className="underline">sign out</a></dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Vault</dt><dd className="t-body-md m-0 text-page-text-mute">{s.vault ? `${s.vault} · ${fmtWei(s.weth)} available · ${fmtWei(s.spent)} spent` : 'not opened'}</dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Bots</dt><dd className="t-body-md m-0 text-page-text-mute">{s.bots.length ? s.bots.map((b) => `${b.name} (${b.universe}, ${b.executed} in, ${b.refused} refused)`).join(' · ') : 'none'}</dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Exceptions</dt><dd className="t-body-md m-0 text-page-text-mute">{s.exception_buys.length} signed · {s.refused_escalations.length} left refused</dd></div>
          </dl>
        </div>
      </div>
      {children}
    </div>
  )
}
