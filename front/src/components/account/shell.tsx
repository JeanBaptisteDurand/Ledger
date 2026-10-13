/**
 * The account's pages stand on the home's surface, like the demo and the door: the finished scene under glass
 * sheets, Florent's grammar (takeaway, title, lead, panels, note, source). This file is the shell they share: the
 * nav, the hero in its finished state, the gate (no proven address: to the door, and back here afterwards), the
 * footer, the toasts, and the sheet motion.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from '../Nav'
import { Hero } from '../Hero'
import { Footer } from '../Footer'
import { initSmoothScroll, setPageLocked } from '../../motion/scroll'
import { blurFade, focusSheets, treatTitle } from '../../motion/landing'
import { BenchProvider, useBench } from '../../app/useBench'
import { Skeleton, Toasts } from '../../app/ui'
import { LiveScreen } from '../../app/device'
import { getTransport } from '../../app/ledger'
import { navigate, rememberNext, type Route } from '../../app/router'
import { Band } from '../landing/primitives'

export type HeroCopy = { title: string; catch: string; heading: string }

export function ProductPage({ route, hero, skip, children }: { route: Route; hero: HeroCopy; skip: string; children: ReactNode }) {
  useEffect(() => {
    setPageLocked(false)
    document.documentElement.style.removeProperty('overflow')
    document.body.style.removeProperty('overflow')
    window.scrollTo(0, 0)
  }, [])
  useEffect(() => initSmoothScroll(), [])
  return (
    <BenchProvider>
      <Shell route={route} hero={hero} skip={skip}>{children}</Shell>
    </BenchProvider>
  )
}

function Shell({ route, hero, skip, children }: { route: Route; hero: HeroCopy; skip: string; children: ReactNode }) {
  const { state, offline } = useBench()
  const address = state?.address ?? null
  // The gate: an account page without a proven address sends you to the door, which brings you back here.
  useEffect(() => {
    if (state && !address) { rememberNext(route); navigate('/connexion', '', true) }
  }, [state, address, route])
  return (
    <div>
      <a href={`#${skip}`} className="skip-link t-kicker">Skip to content</a>
      <Nav hiddenUntilRelease={false} account={state ? address : undefined} />
      <main>
        <Hero finished title={hero.title} catchLine={hero.catch} heading={hero.heading} />
        {offline ? (
          <Band id={skip} label="The bench">
            <p className="t-body-lg m-0 max-w-[52ch] text-pretty text-page-text-mute">The bench is not running behind this page. On a machine with the bench, one command at the root of the repository starts it; the page resumes on its own.</p>
            <pre className="t-mono-data m-0 mt-6 is-info">{'scripts/site.sh'}</pre>
          </Band>
        ) : !state || !address ? (
          <div className="mx-auto max-w-[1200px] px-6 py-16"><Skeleton rows={6} /></div>
        ) : children}
      </main>
      <Footer product />
      {state && address && !offline ? <DeviceDock /> : null}
      <Toasts />
    </div>
  )
}

/** The account's pages sign too (the deposit, the withdrawal, an exception). While a signature waits on the emulated
 *  Flex, its live screen comes beside the page, as on the demo and the door: a click is a tap, a drag to the left turns
 *  the page, a hold signs. A real Ledger has its own screen: nothing shows then. */
function DeviceDock() {
  const { state } = useBench()
  if (!state?.speculos) return null
  const waiting = state.signing ?? state.pending?.kind ?? null
  const emulated = state.signer !== 'browser' || getTransport() === 'speculos'
  if (!waiting || !emulated) return null
  return (
    <aside className="device-dock blink-in" aria-label="The emulated Flex, waiting for your signature">
      <LiveScreen live signing={waiting} real={false} />
    </aside>
  )
}

/** The sheets' motion, as the demo and the door do it: split titles, blur-fades, the focused sheet. */
export function useSheets(root: RefObject<HTMLDivElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      const scope = root.current
      if (!scope) return
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s))
      const splits = q('[data-split]').map((el) => treatTitle(el, { trigger: el.closest('.band') ?? el }))
      q('[data-takeaway]').forEach((el) => blurFade([el], 0, el.closest('.band') ?? el))
      q('[data-lead]').forEach((el) => blurFade([el], 0, el))
      q('[data-wipe]').forEach((el) => blurFade([el], 0, el))
      const unfocus = focusSheets(scope)
      return () => { unfocus(); splits.forEach((s) => s?.revert()) }
    },
    { scope: root, dependencies: deps },
  )
}

/** A root for a page's sections, with the sheet motion attached. */
export function Sheets({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useSheets(root)
  return <div ref={root} className={className}>{children}</div>
}
