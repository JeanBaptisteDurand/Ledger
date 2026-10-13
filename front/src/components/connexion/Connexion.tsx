/**
 * /connexion — the door, on the home's surface. An address proven by the Ledger is the account: no e-mail, no
 * password. The choices a demo needs to flip quickly stay here (which device, where the signature is made), the
 * live Flex beside them, and once the bench says we are in, the page hands over to the account page that sent us.
 */
import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from '../Nav'
import { Hero } from '../Hero'
import { Footer } from '../Footer'
import { initSmoothScroll, setPageLocked } from '../../motion/scroll'
import { blurFade, focusSheets, treatTitle } from '../../motion/landing'
import { Badge, Band, hotTitle, Kicker, Mark, Note, Panel, Source, Stats, Takeaway, Title } from '../landing/primitives'
import { BenchProvider, useBench } from '../../app/useBench'
import { BenchOffline } from '../demo/live'
import { useLogin } from '../../app/session'
import { LiveScreen, PATHS } from '../../app/device'
import { Segments, Skeleton, Toasts } from '../../app/ui'
import { short, type Signer } from '../../app/api'
import { connect, disconnect, errText, explain, getTransport, setTransport, webHidAvailable, type Transport } from '../../app/ledger'
import { linkProps, navigate, takeNext } from '../../app/router'
import type { HotTitle } from '../landing/content'

const HERO = { title: 'SIGN IN', catch: 'No e-mail, no password. Your Ledger is your account.', heading: 'Sign in with your Ledger' }
const DOOR = {
  title: ['Your Ledger ', 'is your account.', ''] as HotTitle,
  takeaway: 'A real Ledger over USB, or the emulated Flex · one message to sign · nothing else authorised',
  lead: 'You sign a message on your device. The address it proves becomes your account, with your vault, your agents and your data.',
  note: ['The sign-in proves ', 'an address', ', not a device: any wallet can sign that message. The Ledger makes the difference at the mandate, read in clear on its screen.'] as const,
  source: 'FRONT.md § 2.3. README.md, “The bench, in the browser”, step 0.',
}
const YOURS = {
  title: ['Behind the door, ', 'what is yours.', ''] as HotTitle,
  takeaway: 'A vault in your name · your bots · your analyst · a key derived from your address',
  rows: [['Your vault', 'a contract in your name, funded from your Ledger', ''], ['Your trading agents', 'under your mandate, one round at a time', ''], ['Your analyst agent', 'read only, citing its tools', ''], ['Your MCP key', 'derived from your address, written nowhere', 'hot']] as const,
  source: 'front/APP.md, “The product pages”.',
}

export function ConnexionPage() {
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
        <a href="#the-door" className="skip-link t-kicker">Skip to content</a>
        <Nav hiddenUntilRelease={false} />
        <main>
          <Hero finished title={HERO.title} catchLine={HERO.catch} heading={HERO.heading} />
          <Sections />
        </main>
        <Footer product />
        <Toasts />
      </div>
    </BenchProvider>
  )
}

function Sections() {
  const root = useRef<HTMLDivElement>(null)
  const { state } = useBench()
  const address = state?.address
  // Signed in HERE (the page saw you signed out first): back to the account page that sent you, or to the demo's live
  // map. Already signed in on arrival, the door stays: it is where the device and the signing path are changed.
  const wasOut = useRef(false)
  useEffect(() => {
    if (state && !address) wasOut.current = true
    if (address && wasOut.current) { wasOut.current = false; const next = takeNext(); if (next) navigate(next, '', true); else navigate('/demo', '#map', true) }
  }, [state, address])
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
    { scope: root },
  )
  return (
    <div ref={root} data-connexion>
      <Band id="the-door" label="The door">
        <Takeaway>{DOOR.takeaway}</Takeaway>
        <Title size="xl" className="max-w-[14ch]">{hotTitle(DOOR.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{DOOR.lead}</p>
        <div className="mt-10" data-wipe><Door /></div>
        <div className="mt-8"><Note>{DOOR.note[0]}<Mark>{DOOR.note[1]}</Mark>{DOOR.note[2]}</Note></div>
        <Source>{DOOR.source}</Source>
      </Band>
      <Band id="yours" label="What is yours" lift={2} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{YOURS.takeaway}</Takeaway>
          <Title className="max-w-[16ch]">{hotTitle(YOURS.title)}</Title>
          <div className="mt-10 max-w-[720px]" data-wipe><Stats rows={YOURS.rows} /></div>
          <Source>{YOURS.source}</Source>
        </div>
      </Band>
    </div>
  )
}

/** The door itself: which device, where the signature is made, the sign-in. The live Flex beside it. */
function Door() {
  const { state, offline, act, say, refresh } = useBench()
  const { login, logout, busy, step } = useLogin()
  const [transport, setT] = useState<Transport>(() => getTransport())
  const [connected, setConnected] = useState<string | null>(() => window.LedgerWeb?.address() ?? null)
  const [testing, setTesting] = useState(false)
  if (offline) return <BenchOffline />
  if (!state) return <Skeleton rows={5} />
  const browser = state.signer === 'browser'
  const real = browser && transport === 'webhid'
  const choosePath = async (signer: Signer) => { await act('/signer', { signer }); if (signer !== 'browser') { await disconnect(); setConnected(null) } }
  const chooseTransport = async (t: Transport) => { await setTransport(t); setT(t); setConnected(null) }
  const test = async () => {
    setTesting(true)
    try { setConnected(await connect()) } catch (e) { say(explain(errText(e))); setConnected(null) }
    setTesting(false)
    refresh()
  }
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      <div className="xl:col-span-7 flex flex-col gap-6">
        <Panel lift={2}>
          <Kicker>1 · Which device</Kicker>
          <Segments label="Device" value={transport} onChange={chooseTransport} options={[{ value: 'speculos', label: 'Emulated Flex (bench)' }, { value: 'webhid', label: 'Real Ledger (USB)' }]} />
          <p className="t-body-md mt-3 mb-0 max-w-[60ch] text-pretty text-page-text-mute">
            {transport === 'webhid'
              ? 'Plug in your Ledger, unlock it, open the Ethereum app, close Ledger Wallet. The browser will ask you to pick it.'
              : 'The bench Flex is an official Ledger emulator (Speculos) running the real Ethereum app. Its screen is on the right.'}
          </p>
          {transport === 'webhid' && !webHidAvailable() ? <p className="t-body-md mt-3 mb-0 is-error">This browser cannot talk to a USB device. Use Chrome, Edge or Brave.</p> : null}
          {!browser ? <p className="t-body-md mt-3 mb-0 is-warning">This choice only applies to the “My Ledger · this browser” path. The bench paths always sign on the emulated Flex.</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={test} disabled={!browser || testing}>{testing ? 'Connecting…' : 'Test the connection'}</button>
            {connected ? <Badge tone="success">{short(connected, 8, 6)}</Badge> : null}
          </div>
        </Panel>
        <Panel lift={2}>
          <Kicker>2 · Where the signature is made</Kicker>
          <div className="flex flex-col">
            {PATHS.map((p) => (
              <button key={p.value} type="button" className="segment text-left" style={{ minHeight: 0, padding: '14px 0' }} aria-pressed={state.signer === p.value} onClick={() => choosePath(p.value)}>
                <span className="t-button-cap">{p.label}</span>
                <span className="t-body-md mt-1 block text-page-text-mute" style={{ textTransform: 'none', letterSpacing: 0 }}>{p.what}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel lift={3}>
          <Kicker>3 · Sign in</Kicker>
          {state.address ? (
            <>
              <p className="t-body-md m-0 text-page-text">Signed in as <span className="t-mono-data">{short(state.address, 10, 8)}</span>. The device and the signing path above apply to your next signatures.</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a {...linkProps('/demo', '#map')} className="btn-ghost btn-ghost--hot btn-ghost--small t-button-cap">The live map</a>
                <a {...linkProps('/account')} className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap">My account</a>
                <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={logout}>Sign out</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn-ghost btn-ghost--hot t-button-cap" onClick={login} disabled={busy}>{busy ? 'Connecting…' : 'Sign in with my Ledger'}</button>
              <p className="t-body-md m-0 mt-4 max-w-[52ch] text-pretty text-page-text-mute" aria-live="polite">{step ?? (browser ? 'A sign-in message to read and sign on the chosen device.' : 'The address is read on the bench Flex.')}</p>
            </>
          )}
        </Panel>
      </div>
      <div className="xl:col-span-5">
        <LiveScreen live={state.speculos} signing={state.signing} real={real} />
      </div>
    </div>
  )
}
