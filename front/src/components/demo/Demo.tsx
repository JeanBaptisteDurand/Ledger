/**
 * /demo — the system live on the map, on the home's surface (the finished scene under glass sheets). One stage
 * that fits the screen (Stage.tsx), then the recap under it for whoever scrolls. Everything is read off the bench.
 */
import { useEffect, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { BenchNav } from '../Nav'
import { Hero } from '../Hero'
import { Footer } from '../Footer'
import { initSmoothScroll, setPageLocked } from '../../motion/scroll'
import { blurFade, focusSheets, treatTitle } from '../../motion/landing'
import { Band, hotTitle, Source, Takeaway, Title } from '../landing/primitives'
import { BenchProvider, useBench } from '../../app/useBench'
import { Toasts } from '../../app/ui'
import { HERO, INTRO } from './content'
import { Recap, Stage } from './Stage'
import { Analyst, JournalStrip } from './live'

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
        <a href="#stage" className="skip-link t-kicker">Skip to content</a>
        <BenchNav />
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

function DemoSections() {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const scope = root.current!
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s))
      const splits = q('[data-split]').map((el) => treatTitle(el, { trigger: el.closest('.band') ?? el }))
      q('[data-takeaway]').forEach((el) => blurFade([el], 0, el.closest('.band') ?? el))
      q('[data-lead]').forEach((el) => blurFade([el], 0, el))
      const unfocus = focusSheets(scope)
      return () => { unfocus(); splits.forEach((s) => s?.revert()) }
    },
    { scope: root },
  )
  return (
    <div ref={root} data-demo>
      <Band id="intro" label="The demo">
        <Takeaway>{INTRO.takeaway}</Takeaway>
        <Title size="xl" className="max-w-[16ch]">{hotTitle(INTRO.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{INTRO.lead}</p>
      </Band>
      <section id="stage" className="band live-band" aria-label="The live map">
        <div className="glass glass--stage"><Stage /></div>
      </section>
      <Band id="recap" label="What happened">
        <Takeaway>Everything the bench did, newest first</Takeaway>
        <Title className="max-w-[16ch]">{hotTitle(['What ', 'happened.', ''])}</Title>
        <div className="mt-8"><Recap><RecapTables /></Recap></div>
        <Source>{INTRO.source}</Source>
      </Band>
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
