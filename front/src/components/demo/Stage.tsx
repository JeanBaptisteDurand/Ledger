/**
 * The live stage: one screen, no scroll. A rail of four phases on top (setup · agents · request · watch and
 * analyst), the map in the middle, the Flex and the drawers beside it, one strip at the bottom (TARE's last
 * measure, the one sentence that says what the system is doing). Above the Flex, the NOW card: the step the
 * journey is at, what to do, the one button that does it, and what comes after. The phase follows the bench on its
 * own: the active drawer is open, the others fold to one line, the map zooms to the region that acts and reveals
 * the nodes as the journey reaches them. A click on a phase pins it (Follow brings the auto back). Fullscreen for
 * the projector. The recap stays under the stage.
 *
 * The colour code, everywhere on the stage: orange is acting now, gold waits for the holder on the Flex, green is
 * signed or entered, red is refused, grey is not reached yet.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBench } from '../../app/useBench'
import { LiveScreen } from '../../app/device'
import { Field } from '../../app/ui'
import { fmtWei, short, type BenchState } from '../../app/api'
import { linkProps } from '../../app/router'
import { prefersReducedMotion } from '../../motion/flags'
import { Badge } from '../landing/primitives'
import { SchemaMap, type MapFocus } from '../landing/SchemaMap'
import { AnalystThread } from '../account/analyst'
import { activity, Agents, Door, Funds, mapLive, Measure, rowOf, STRATEGY, STRATEGY_IDEAS, useSteps, type Activity, type Phase } from './live'
import { TarePanel } from './Tare'

type Act = 'setup' | 'agents' | 'request' | 'watch'
const ACTS: { id: Act; label: string; phases: Phase[] }[] = [
  { id: 'setup', label: 'Setup', phases: ['session', 'bounds', 'mandate'] },
  { id: 'agents', label: 'Agents', phases: ['agents'] },
  { id: 'request', label: 'Request', phases: ['request'] },
  { id: 'watch', label: 'Watch and analyst', phases: ['watch', 'analyst'] },
]
const FOCUS: Record<Act | 'tare', MapFocus> = {
  setup: { x: 20, y: 0, w: 760, h: 560 },
  agents: { x: 20, y: 330, w: 760, h: 490 },
  tare: { x: 20, y: 330, w: 760, h: 380 },
  request: { x: 400, y: 0, w: 400, h: 560 },
  watch: { x: 20, y: 160, w: 1160, h: 500 },
}
const actOf = (p: Phase): Act => ACTS.find((a) => a.phases.includes(p))!.id

/** What the setup drawer needs from the stage: the holder's sentence, and the way to send it. */
type Setup = { sentence: string; setSentence: (v: string) => void; ask: (text?: string) => Promise<void>; asking: boolean }

export function Stage() {
  const [asking, setAsking] = useState(false)
  const [sentence, setSentence] = useState(STRATEGY)
  const { steps, a, s, ask } = useSteps({ asking, setAsking, sentence })
  const [pinned, setPinned] = useState<Act | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const { act: benchAct } = useBench()
  // TARE stays open a few seconds after a round ends, so the verdict is read before the phase moves on.
  const running = !!s?.running
  const [hold, setHold] = useState(false)
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) { setHold(true); const t = window.setTimeout(() => setHold(false), 12000); wasRunning.current = false; return () => window.clearTimeout(t) }
    wasRunning.current = running
  }, [running])
  const [resetting, setResetting] = useState(false)
  const startOver = async () => {
    if (!window.confirm('Start the demo over? The mandate, the bots and the positions of this account are deleted. The bench keeps running.')) return
    setResetting(true); setPinned(null)
    await benchAct('/reset')
    setResetting(false)
  }
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  // The stage is what the presenter looks at: bring it into view once, when the session opens.
  const signedIn = !!s?.address
  useEffect(() => { if (signedIn) stage.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }) }, [signedIn])
  if (!s || !s.address) return <div ref={stage} className="live-stage live-stage--door"><Door /></div>
  const auto = actOf(a.phase)
  const act = pinned ?? auto
  const live = mapLive(s, a)
  const tare = (act === 'agents' && (running || !!a.lastRow)) || (hold && !pinned)
  const setup: Setup = { sentence, setSentence, ask, asking }
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.current?.requestFullscreen?.() }
  return (
    <div ref={stage} className={`live-stage ${full ? 'is-full' : ''}`} data-act={act}>
      <div className="live-stage__rail">
        <ol className="acts" aria-label="Phases">
          {ACTS.map((x, i) => {
            const state = x.id === auto ? (a.signing ? 'asks' : 'live') : ACTS.findIndex((y) => y.id === auto) > i ? 'done' : 'ahead'
            return (
              <li key={x.id} data-state={state} data-pinned={x.id === act || undefined}>
                <button type="button" className="acts__btn" aria-current={x.id === act ? 'step' : undefined} onClick={() => setPinned(x.id === auto ? null : x.id)}>
                  <span className="acts__dot" aria-hidden />
                  <span className="t-kicker acts__index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="acts__label">{x.label}</span>
                  <span className="t-kicker acts__sum">{summary(x.id, s)}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className="live-stage__tools">
          <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={startOver} disabled={resetting || !!s.signing}>{resetting ? 'Resetting…' : 'Start over'}</button>
          {pinned ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setPinned(null)}>Follow</button> : <span className="t-kicker text-page-text-faint">following the bench</span>}
          <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={toggleFull}>{full ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>

      <div className={`live-stage__body live-stage__body--map ${tare ? 'has-tare' : ''}`}>
        <div className="live-stage__map"><SchemaMap live={live} focus={tare ? FOCUS.tare : FOCUS[act]} fit /></div>
        {tare ? <TarePanel s={s} row={s.escalation?.possible ? (rowOf(s, s.escalation) ?? a.lastRow) : a.lastRow} running={running} /> : null}
        <div className="live-stage__side">
          <Now steps={steps} a={a} s={s} />
          <div className="live-stage__flex"><LiveScreen live={s.speculos} signing={s.signing} real={false} /></div>
          <Drawer act={act} s={s} a={a} steps={steps} setup={setup} />
        </div>
      </div>

      <div className="live-stage__strip">
        <MeasureLine s={s} a={a} />
        <p className={`t-body-md m-0 text-pretty ${a.signing ? 'text-hot' : 'text-page-text'}`} aria-live="polite">{a.now}</p>
      </div>
    </div>
  )
}

/** One line per phase, folded: what it has to say about itself. */
function summary(act: Act, s: BenchState): string {
  if (act === 'setup') return s.signed ? `mandate signed · ${s.mandate ? Number(s.mandate.mandate.budgetAmount) / 1e18 : s.proposal?.budget_weth} WETH · ${s.mandate?.mandate.maxRoundTripLossBps ?? s.proposal?.max_round_trip_loss_bps} bps${s.last_report && s.last_report.isBlindSign === false ? ' · clear-signed' : ''}` : s.proposal ? 'bounds proposed, to sign' : s.vault ? 'vault open' : 'no vault yet'
  if (act === 'agents') { const live = s.bots.filter((b) => b.status === 'running').length; const bought = s.journal.filter((r) => r.decision === 'EXECUTED').length; return s.bots.length ? `${s.bots.length} bot${s.bots.length > 1 ? 's' : ''} · ${bought} in · ${s.journal.length - bought} refused${live ? ' · running' : ''}` : 'no agent yet' }
  if (act === 'request') { const w = (s.escalation?.possible ? 1 : 0) + s.escalation_queue.length; return w ? `${w} waiting on the Flex` : `${s.exception_buys.length} signed · ${s.refused_escalations.length} left refused` }
  return `${s.positions.length} positions${s.watch ? ' · probed' : ''}${s.analyses.length ? ' · analyst answered' : ''}`
}

/** The active phase's drawer, alone: the rail above is where the other phases are. Its body is the one thing that scrolls. */
function Drawer({ act, s, a, steps, setup }: { act: Act; s: BenchState; a: Activity; steps: ReturnType<typeof useSteps>['steps']; setup: Setup }) {
  const x = ACTS.find((y) => y.id === act)!
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { body.current?.scrollTo({ top: 0 }) }, [act])
  return (
    <section className="drawer" data-open aria-label={x.label}>
      <div className="drawer__head">
        <span className="drawer__title">{x.label}</span>
        <span className="t-kicker drawer__sum">{summary(x.id, s)}</span>
      </div>
      <div ref={body} className="drawer__body">{x.id === 'setup' ? <SetupDrawer s={s} steps={steps} setup={setup} /> : x.id === 'agents' ? <AgentsDrawer s={s} a={a} steps={steps} /> : x.id === 'request' ? <RequestDrawer s={s} steps={steps} /> : <WatchDrawer s={s} steps={steps} />}</div>
    </section>
  )
}

type Steps = ReturnType<typeof useSteps>['steps']
const step = (steps: Steps, id: Phase) => steps.find((x) => x.id === id)!
const ORDER: Phase[] = ['session', 'bounds', 'mandate', 'agents', 'request', 'watch', 'analyst']

/**
 * The NOW card: the step the journey is at, in its colour, what to do and the one button that does it. While the
 * Flex waits for the holder it turns gold and says the gesture. Under it, in one line, what comes next.
 */
function Now({ steps, a, s }: { steps: Steps; a: Activity; s: BenchState }) {
  const cur = step(steps, a.phase)
  const i = ORDER.indexOf(a.phase)
  const next = ORDER.slice(i + 1).map((id) => step(steps, id)).find((x) => x.state !== 'done')
  const tone = a.signing ? 'asks' : cur.state === 'pending' ? 'working' : cur.state === 'done' ? 'done' : 'live'
  const gesture = s.signing === 'mandate' ? 'Read the three bounds, swipe to the end, hold to sign.' : s.signing === 'exception' ? 'Read the exit cost, then hold to sign, or reject.' : s.signing === 'deposit' ? 'Read the amount and the vault’s address, hold to sign.' : 'Read the authorisation, hold to sign.'
  return (
    <div className="now" data-tone={tone} aria-live="polite">
      <p className="t-kicker now__step">Step {i + 1} of {ORDER.length} · {tone === 'asks' ? 'on the Flex' : tone === 'working' ? 'working' : tone === 'done' ? 'done' : 'your move'}</p>
      <p className="now__title">{cur.label}</p>
      <p className="t-body-md m-0 mt-1 text-pretty now__text">{tone === 'asks' ? gesture : a.now}</p>
      <div className="now__actions">
        {tone === 'asks' ? <span className="now__wait"><span className="now__pulse" aria-hidden />waiting for your signature</span> : null}
        {tone === 'working' ? <span className="now__wait"><span className="now__pulse" aria-hidden />{cur.id === 'agents' ? 'the bot chooses, TARE measures' : cur.id === 'bounds' ? 'the strategist thinks' : cur.id === 'watch' ? 'TARE re-probes' : 'the analyst queries the tools'}</span> : null}
        {cur.action && tone !== 'asks' ? <button type="button" className="btn-ghost btn-ghost--now t-button-cap" onClick={cur.action}>{cur.actionLabel}</button> : null}
        {cur.second && tone !== 'asks' ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={cur.second}>{cur.secondLabel}</button> : null}
      </div>
      {next ? <p className="t-caption m-0 mt-2 now__next">Then: {next.label.toLowerCase()}{next.id === 'request' && !s.escalation?.possible ? ' (if a bot meets a position the mandate refuses)' : ''}</p> : tone === 'done' ? <p className="t-caption m-0 mt-2 now__next">The journey is complete. Add another bot, or re-probe.</p> : null}
    </div>
  )
}

function StepRow({ st }: { st: Steps[number] }) {
  const onFlex = st.state === 'pending' && (st.id === 'mandate' || st.id === 'request')
  return (
    <div className="steprow" data-state={onFlex ? 'asks' : st.state}>
      <span className="steprow__dot" aria-hidden />
      <span className="steprow__label">{st.label}</span>
      <span className="steprow__actions">
        {st.state === 'pending' ? <span className="t-kicker steprow__state">{onFlex ? 'on the Flex' : 'working…'}</span> : null}
        {st.state === 'done' ? <span className="t-kicker steprow__state">done</span> : null}
        {st.state === 'ahead' ? <span className="t-kicker steprow__state">later</span> : null}
        {st.action ? <button type="button" className={`btn-ghost btn-ghost--small t-button-cap ${st.id === 'mandate' || st.id === 'request' ? 'btn-ghost--hot' : ''}`} onClick={st.action}>{st.actionLabel}</button> : null}
        {st.second ? <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={st.second}>{st.secondLabel}</button> : null}
      </span>
    </div>
  )
}

function SetupDrawer({ s, steps, setup }: { s: BenchState; steps: Steps; setup: Setup }) {
  const m = s.mandate, p = s.proposal
  const lines: [string, string][] = m || p ? [['Budget', `${m ? Number(m.mandate.budgetAmount) / 1e18 : p!.budget_weth} WETH`], ['Max round-trip loss', `${m ? m.mandate.maxRoundTripLossBps : p!.max_round_trip_loss_bps} bps`], ['Expires', m ? new Date(m.mandate.expiry * 1000).toISOString().slice(0, 10) : `in ${p!.days} days`]] : []
  const last = s.chat.length ? s.chat[s.chat.length - 1] : null
  return (
    <>
      <StepRow st={step(steps, 'session')} />
      <StepRow st={step(steps, 'bounds')} />
      {s.vault && !s.signed ? (
        <form className="mt-2" onSubmit={(e) => { e.preventDefault(); setup.ask() }}>
          <Field label="In one sentence" value={setup.sentence} onChange={(e) => setup.setSentence(e.target.value)} placeholder={STRATEGY} autoComplete="off" disabled={setup.asking} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {STRATEGY_IDEAS.map((t) => <button key={t} type="button" className="segment t-caption text-left" onClick={() => { setup.setSentence(t); setup.ask(t) }} disabled={setup.asking}>{t}</button>)}
          </div>
        </form>
      ) : null}
      {last && last.role === 'assistant' && !s.signed ? <p className="t-caption m-0 mt-2 max-w-[48ch] text-pretty text-page-text-faint">{last.text}{last.warning ? ` Not protected: ${last.warning}` : ''}</p> : null}
      <StepRow st={step(steps, 'mandate')} />
      {lines.length ? (
        <div className={`mirror t-mono-device mt-3 ${s.signing === 'mandate' ? 'app-mirror--pending' : ''}`}>
          <div className="mirror__title">Exit mandate{s.signed ? ' · signed' : ''}</div>
          <div className="mirror__lines">{lines.map(([k, v]) => <Line key={k} k={k} v={v} hot={k === 'Max round-trip loss'} />)}</div>
          {s.signed && s.last_report ? <p className="t-kicker m-0 mt-3 text-state-success">isBlindSign={String(s.last_report.isBlindSign)} · {s.last_report.clearSigningType ?? ''}</p> : null}
        </div>
      ) : null}
      <div className="mt-4"><Funds s={s} /></div>
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
  return (
    <>
      <StepRow st={step(steps, 'watch')} />
      {rows.length ? (
        <dl className="kv mt-2">
          {rows.map((r, i) => <div key={i} className="kv__row"><dt className="t-mono-data text-page-text">{r.name ?? short(r.pool_id, 8, 4)}</dt><dd className="t-body-md m-0 text-page-text-mute">{r.exit_bps_at_buy ?? '·'} → {r.blocked ? 'blocked' : `${r.exit_bps_now ?? '·'} bps`}{r.action === 'SORTI' ? ', exited' : ''}</dd></div>)}
        </dl>
      ) : null}
      <StepRow st={step(steps, 'analyst')} />
      <div className="mt-2"><AnalystThread s={s} compact /></div>
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
            <div className="kv__row"><dt className="t-mono-data text-page-text">Account</dt><dd className="t-body-md m-0 text-page-text-mute">{s.address} · <a {...linkProps('/account')} className="underline">the account page</a></dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Vault</dt><dd className="t-body-md m-0 text-page-text-mute">{s.vault ? `${s.vault} · ${fmtWei(s.weth)} available · ${fmtWei(s.spent)} spent` : 'not opened'}</dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Bots</dt><dd className="t-body-md m-0 text-page-text-mute">{s.bots.length ? s.bots.map((b) => `${b.name} (${b.universe}, ${b.executed} in, ${b.refused} refused)`).join(' · ') : 'none'} · <a {...linkProps('/trades')} className="underline">the trades page</a></dd></div>
            <div className="kv__row"><dt className="t-mono-data text-page-text">Exceptions</dt><dd className="t-body-md m-0 text-page-text-mute">{s.exception_buys.length} signed · {s.refused_escalations.length} left refused</dd></div>
          </dl>
        </div>
      </div>
      {children}
    </div>
  )
}
