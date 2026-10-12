/**
 * /demo — the journey on the bench, replayed with the real screens of the Flex. On the home's surface (the
 * finished scene under glass sheets). One stage: the scenes on the left, the device in the middle, the account's
 * panel on the right, one sentence under them, the controls. Things come on by blinking, never by fading, and the
 * player only decides when. Then a second sheet: the same thing live, if the bench answers.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from '../Nav'
import { Hero } from '../Hero'
import { Footer } from '../Footer'
import { initSmoothScroll, setPageLocked } from '../../motion/scroll'
import { blurFade, focusSheets, treatTitle } from '../../motion/landing'
import { prefersReducedMotion } from '../../motion/flags'
import { createDemoPlayer, type Player } from '../../motion/demo'
import { Badge, Band, hotTitle, Kicker, Mark, Note, Source, Takeaway, Title } from '../landing/primitives'
import { BenchProvider, useBench } from '../../app/useBench'
import { LiveScreen } from '../../app/device'
import { Toasts } from '../../app/ui'
import { linkProps } from '../../app/router'
import { HERO, LIVE, REPLAY, SCENES, SCREENS, type Panel } from './content'
import { Recap, Stage } from './Stage'
import { Analyst, JournalStrip } from './live'
import { Segments } from '../../app/ui'

/** How long a beat holds, in seconds. The last beat of a scene holds a little longer: it is the one to read. */
const HOLD = 3.6
const HOLD_LAST = 4.8

export function DemoPage() {
  useEffect(() => {
    setPageLocked(false)
    document.documentElement.style.removeProperty('overflow')
    document.body.style.removeProperty('overflow')
    window.scrollTo(0, 0)
  }, [])
  useEffect(() => initSmoothScroll(), [])
  return (
    <BenchProvider>
      <div>
        <a href="#replay" className="skip-link t-kicker">Skip to content</a>
        <Nav hiddenUntilRelease={false} />
        <main>
          <Hero finished title={HERO.title} catchLine={HERO.catch} heading={HERO.heading} />
          <DemoSections />
        </main>
        <Footer product />
        <Toasts />
      </div>
    </BenchProvider>
  )
}

/** The beats, flattened: scene index and beat index for every cursor position. */
const BEATS = SCENES.flatMap((s, si) => s.beats.map((b, bi) => ({ si, bi, b, last: bi === s.beats.length - 1 })))

type Mode = 'replay' | 'map' | 'cockpit'
const MODES: { value: Mode; label: string }[] = [{ value: 'replay', label: 'Replay' }, { value: 'map', label: 'Live map' }, { value: 'cockpit', label: 'Cockpit' }]
const MODE_COPY: Record<Mode, { title: [string, string, string]; takeaway: string; lead: string; source: string }> = {
  replay: { title: ['The run, ', 'replayed.', ''], takeaway: REPLAY.takeaway, lead: REPLAY.lead, source: REPLAY.source },
  map: { title: ['The system, ', 'live on the map.', ''], takeaway: 'The system’s map, lit by the bench · the Flex beside it · the steps in drawers', lead: 'The same map as the home’s, read off the bench as it works. A node lights when it acts, an edge goes hot along the path a thing takes, and the Flex shows what it shows. Conduct from the steps: open, ask, sign, let the agents in, answer the request, re-probe, ask the analyst.', source: 'GET /api/state every 1.4 s, the bench’s own routes for every action (FRONT.md § 4). Nothing is asked of the server that the account’s pages do not already ask.' },
  cockpit: { title: ['The presenter’s ', 'cockpit.', ''], takeaway: 'Agents on the left · the Flex in the middle · TARE’s measure on the right', lead: 'Three columns for a projector. Who runs and who you add. What the Flex shows, large. What TARE measured on the last decision: the entry against the exit, the bound you signed, the vault’s verdict. The steps run under them, in order.', source: 'GET /api/state every 1.4 s, the bench’s own routes for every action (FRONT.md § 4). The TARE figures are the journal’s hook_in and hook_out.' },
}
const readMode = (): Mode => { const h = window.location.hash.replace('#', ''); return h === 'map' || h === 'cockpit' ? h : 'replay' }

function DemoSections() {
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>(readMode)
  const choose = (m: Mode) => { setMode(m); history.replaceState(null, '', m === 'replay' ? window.location.pathname : `#${m}`) }
  useGSAP(
    () => {
      const scope = root.current!
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s))
      const splits = q('[data-split]').map((el) => treatTitle(el, { trigger: el.closest('.band') ?? el }))
      q('[data-takeaway]').forEach((el) => blurFade([el], 0, el.closest('.band') ?? el))
      q('[data-lead]').forEach((el) => blurFade([el], 0, el))
      q('[data-wipe]').forEach((el) => blurFade([el], 0, el))
      const unfocus = focusSheets(scope)
      return () => { unfocus(); splits.forEach((s) => s?.revert()) }
    },
    { scope: root, dependencies: [mode] },
  )
  const copy = MODE_COPY[mode]
  return (
    <div ref={root} data-demo>
      <Band id="replay" label="The demo">
        <div className="mb-8"><Segments label="Demo mode" value={mode} options={MODES} onChange={choose} /></div>
        <div key={mode}>
          <Takeaway>{copy.takeaway}</Takeaway>
          <Title size="xl" className="max-w-[16ch]">{hotTitle(copy.title)}</Title>
          <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{copy.lead}</p>
        </div>
        {mode === 'replay' ? <div className="mt-10" data-wipe><ReplayStage /></div> : null}
        {mode === 'replay' ? <Source>{copy.source}</Source> : null}
      </Band>
      {mode !== 'replay' ? (
        <>
          <section className="band live-band" aria-label={mode === 'map' ? 'The live map' : 'The cockpit'}>
            <div className="glass glass--stage"><Stage mode={mode} /></div>
          </section>
          <Band id="recap" label="What happened">
            <Takeaway>Everything the bench did, newest first</Takeaway>
            <Title className="max-w-[16ch]">{hotTitle(['What ', 'happened.', ''])}</Title>
            <div className="mt-8"><Recap><RecapTables /></Recap></div>
            <Source>{copy.source}</Source>
          </Band>
        </>
      ) : null}
      {mode === 'replay' ? (
        <Band id="live" label="Now for real, on the bench" lift={2} full>
          <div className="mx-auto max-w-[1200px]">
            <Takeaway>{LIVE.takeaway}</Takeaway>
            <Title className="max-w-[16ch]">{hotTitle(LIVE.title)}</Title>
            <div className="mt-10" data-wipe><LiveSheet onLive={() => choose('map')} /></div>
            <Source>{LIVE.source}</Source>
          </div>
        </Band>
      ) : null}
    </div>
  )
}

/** The replay's stage: scenes, device, panel, caption, controls. The player moves a cursor; everything else reads it. */
function ReplayStage() {
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const player = useRef<Player | null>(null)
  useEffect(() => {
    const holds = BEATS.map((x) => (x.last ? HOLD_LAST : HOLD))
    player.current = createDemoPlayer(holds, setCursor, setPlaying)
    return () => player.current?.destroy()
  }, [])

  const { si, bi, b } = BEATS[cursor]
  const scene = SCENES[si]
  const screen = SCREENS[b.screen]
  const sceneStart = (i: number) => BEATS.findIndex((x) => x.si === i)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); player.current?.next() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); player.current?.prev() }
    if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); player.current?.toggle() }
  }

  return (
    <section className="demo" aria-label="The replay" onKeyDown={onKey}>
      <div className="demo__grid">
        <ol className="demo__scenes" aria-label="Scenes">
          {SCENES.map((s, i) => {
            const state = i < si ? 'done' : i === si ? 'live' : 'ahead'
            return (
              <li key={s.id} data-state={state}>
                <button type="button" className="demo__scene" aria-current={i === si ? 'step' : undefined} onClick={() => player.current?.seek(sceneStart(i))}>
                  <span className="t-kicker demo__scene-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="t-title-md demo__scene-title">{s.title}</span>
                  <span className="t-kicker demo__scene-duration">{s.duration}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="demo__device">
          <p className="t-kicker m-0 mb-3 text-page-text-faint">The Flex, as it was captured</p>
          <div className={`device-frame ${b.screen === 'idle' ? '' : 'app-mirror--pending'}`}>
            <img key={`${cursor}-${b.screen}`} className="blink-in" src={screen.src} alt={screen.alt} width={480} height={600} decoding="async" />
          </div>
          <p className="t-caption m-0 mt-3 max-w-[32ch] text-page-text-faint">{b.screen === 'idle' ? 'Nothing goes to the Ledger while the rule holds.' : 'Read on the device, then hold to sign.'}</p>
        </div>

        <div className="demo__panel">
          <p className="t-kicker m-0 mb-3 text-page-text-faint">The account, scene {si + 1}: {scene.title}</p>
          <div className="panel panel--lift-2">
            <PanelView key={scene.id} panel={scene.panel} reveal={b.reveal} />
          </div>
        </div>
      </div>

      <div className="demo__caption" aria-live="polite">
        <Note key={`${cursor}`}>
          <span className="blink-in">{b.caption[0]}<Mark>{b.caption[1]}</Mark>{b.caption[2]}</span>
        </Note>
      </div>

      <div className="demo__controls">
        <button type="button" className="btn-ghost btn-ghost--hot btn-ghost--small t-button-cap" onClick={() => player.current?.toggle()} disabled={reduced} aria-pressed={playing}>
          {playing ? 'Pause' : cursor + 1 >= BEATS.length ? 'Play again' : 'Play'}
        </button>
        <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => player.current?.prev()} disabled={cursor === 0}>Previous</button>
        <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => player.current?.next()} disabled={cursor + 1 >= BEATS.length}>Next</button>
        <div className="demo__progress" role="progressbar" aria-valuemin={1} aria-valuemax={BEATS.length} aria-valuenow={cursor + 1} aria-label="Beat">
          {BEATS.map((x, i) => <span key={i} className={`demo__tick ${i <= cursor ? 'is-done' : ''} ${x.bi === 0 ? 'is-scene' : ''}`} />)}
        </div>
        <span className="t-kicker text-page-text-faint">{bi + 1} of {scene.beats.length} · {reduced ? 'step with the arrows' : 'arrows to step, space to play'}</span>
      </div>
    </section>
  )
}

/** The account's panel for a scene: items up to `reveal` are on, the rest wait. Each one comes on by blinking. */
function PanelView({ panel, reveal }: { panel: Panel; reveal: number }) {
  const on = (i: number, node: ReactNode) => (i < reveal ? <Fragment key={i}>{node}</Fragment> : null)
  if (panel.kind === 'mirror') {
    return (
      <div className="mirror t-mono-device" role="img" aria-label={`${panel.title}: ${panel.lines.slice(0, reveal).map(([k, v]) => `${k} ${v}`).join(', ')}`}>
        <div className="mirror__title">{panel.title}</div>
        <div className="mirror__lines">
          {panel.lines.map(([k, v], i) => on(i, (
            <>
              <span className="mirror__key blink-in">{k}</span>
              <span className={`mirror__value blink-in ${k === panel.hot ? 'mirror__hot' : ''}`}>{v}</span>
            </>
          )))}
        </div>
        {panel.report && reveal > panel.lines.length ? <p className="t-kicker m-0 mt-4 text-state-success blink-in">{panel.report}</p> : null}
      </div>
    )
  }
  if (panel.kind === 'journal') {
    return (
      <div className="data-scroll">
        <table className="data-table">
          <thead><tr><th>Round</th><th>Pool</th><th className="num">In</th><th className="num">Out</th><th>Decision</th></tr></thead>
          <tbody>
            {panel.rows.map((r, i) => on(i, (
              <tr className="blink-in">
                <td className="num">{r.round}</td>
                <td>{r.pool}</td>
                <td className="num">{r.entry}</td>
                <td className="num">{r.exit}</td>
                <td className={`label ${r.decision === 'bought' ? 'is-success' : 'is-error'}`}>{r.decision}{r.why ? <span className="is-mute">, {r.why}</span> : null}</td>
              </tr>
            )))}
          </tbody>
        </table>
        {reveal > 0 ? <p className="t-kicker m-0 mt-3 text-page-text-faint">bps. {Math.min(reveal, panel.rows.length)} of {panel.rows.length} rounds</p> : null}
      </div>
    )
  }
  if (panel.kind === 'request') {
    return (
      <div className="request">
        {on(0, (
          <div className="blink-in">
            <Kicker>Out-of-bounds request · bot “{panel.bot}”</Kicker>
            <p className="t-body-lg m-0 text-page-text">{panel.question}</p>
            <div className="exit-pair mt-5">
              <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">mandate allows</span><span className="t-mono-data-lg text-page-text">{panel.allows} <span className="t-kicker text-page-text-faint">bps</span></span></div>
              <span className="exit-pair__rule" aria-hidden />
              <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">measured on the way out</span><span className="t-mono-data-lg text-hot">{panel.seen} <span className="t-kicker text-page-text-faint">bps</span></span></div>
            </div>
          </div>
        ))}
        {on(1, (
          <div className="outcomes mt-6 blink-in">
            <div data-chosen={panel.chosen === 'sign' || undefined}><Badge tone="warning">read and sign</Badge><p className="t-body-md m-0 mt-3 text-pretty text-page-text-mute">{panel.sign}</p></div>
            <div data-chosen={panel.chosen === 'refuse' || undefined}><Badge tone="error">leave refused</Badge><p className="t-body-md m-0 mt-3 text-pretty text-page-text-mute">{panel.refuse}</p></div>
          </div>
        ))}
        {on(2, <p className="t-kicker m-0 mt-5 text-state-success blink-in">entered under exception · this position · this amount · once</p>)}
      </div>
    )
  }
  if (panel.kind === 'watch') {
    return (
      <div className="data-scroll">
        <table className="data-table">
          <thead><tr><th>Position</th><th className="num">At the purchase</th><th className="num">Now</th><th>Action</th></tr></thead>
          <tbody>
            {panel.rows.map((r, i) => on(i, (
              <tr className="blink-in">
                <td className="label">{r.position}</td>
                <td className="num">{r.atBuy}</td>
                <td className={`num is-${r.tone}`}>{r.now}</td>
                <td className="label is-success">{r.action}</td>
              </tr>
            )))}
          </tbody>
        </table>
        {reveal === 0 ? <p className="t-kicker m-0 mt-3 text-page-text-faint">probing…</p> : null}
      </div>
    )
  }
  return (
    <div className="thread">
      {on(0, <p className="thread__you t-body-md m-0 blink-in">{panel.question}</p>)}
      {on(1, (
        <div className="thread__them t-body-md blink-in">
          <span>{panel.line}</span>
          <span className="thread__trace t-kicker">MCP → {panel.tools.join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}

/** The live sheet: the bench's state if it answers, the Flex live if the account is open. Read only, nothing signs here. */
function LiveSheet({ onLive }: { onLive: () => void }) {
  const { state, offline } = useBench()
  if (offline || !state) {
    return (
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <p className="t-body-lg m-0 max-w-[52ch] text-pretty text-page-text-mute">{LIVE.offline}</p>
          <pre className="t-mono-data m-0 mt-6 is-info">{LIVE.commands}</pre>
        </div>
      </div>
    )
  }
  const signedIn = Boolean(state.address)
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <p className="t-body-lg m-0 max-w-[52ch] text-pretty text-page-text-mute">{signedIn ? LIVE.signedIn : LIVE.signedOut}</p>
        <dl className="kv mt-8">
          <div className="kv__row"><dt className="t-mono-data text-page-text">Flex</dt><dd className="t-body-md m-0 text-page-text-mute">{state.speculos ? 'emulated, powered on' : 'powered off'}</dd></div>
          <div className="kv__row"><dt className="t-mono-data text-page-text">Base fork</dt><dd className="t-body-md m-0 text-page-text-mute">{state.anvil ? `block ${state.fork_block}, online` : 'not started'}</dd></div>
          <div className="kv__row"><dt className="t-mono-data text-page-text">Account</dt><dd className="t-body-md m-0 text-page-text-mute">{state.address ?? 'none, sign in with the Ledger'}</dd></div>
          {signedIn ? <div className="kv__row"><dt className="t-mono-data text-page-text">Bots</dt><dd className="t-body-md m-0 text-page-text-mute">{state.bots.filter((x) => x.status === 'running').length} running · {state.positions.length} positions · {(state.escalation?.possible ? 1 : 0) + state.escalation_queue.length} requests waiting</dd></div> : null}
        </dl>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost btn-ghost--hot t-button-cap" onClick={onLive}>Run it live on the map</button>
          {signedIn ? null : <a {...linkProps('/connexion')} className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap">{LIVE.ctaOut}</a>}
        </div>
      </div>
      <div className="xl:col-span-5">
        {signedIn ? <LiveScreen live={state.speculos} signing={state.signing} real={false} /> : null}
      </div>
    </div>
  )
}

/** The journal and the analyst's last answer, under the live stage. */
function RecapTables() {
  const { state: s } = useBench()
  if (!s) return null
  return (
    <>
      {s.journal.length ? <div className="mt-8"><JournalStrip s={s} max={12} /></div> : null}
      {s.analyses.length ? <div className="mt-8"><Analyst s={s} /></div> : null}
    </>
  )
}
