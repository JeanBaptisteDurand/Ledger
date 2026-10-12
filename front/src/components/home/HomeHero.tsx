/**
 * The home's hero: the name and the thesis, over the hole that has just emerged from the Flex's screen. It is
 * rendered inside the hero section, over the now-fixed canvas, and comes on with the emergence. On the
 * posters (no motion) it is simply there.
 *
 * The thesis is UPDATE.md § 0, in English like everything on this surface.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { blurFade, treatTitle } from '../../motion/landing'
import { motionEnabled } from '../../motion/flags'
import { Wordmark } from '../Wordmark'
import { Hot } from '../landing/primitives'
import type { ReactNode } from 'react'

export const HOME_TITLE = 'NET·OUT'
/** NET and OUT carry the heat the titles catch with: the two halves of the name, said in the sentence. */
export const HOME_CATCH: ReactNode = <>The <Hot>NET</Hot> value before you enter. The way <Hot>OUT</Hot>, yours to sign.</>

/** `title` and `catchLine` let another page of the same surface (the demo, the door) write its own name in the ring. */
export function HomeHero({ delay = 0, title = HOME_TITLE, catchLine = HOME_CATCH, brackets = true }: { delay?: number; title?: string; catchLine?: ReactNode; brackets?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const animated = motionEnabled()
  useGSAP(
    () => {
      if (!animated) return
      const title = root.current!.querySelector<HTMLElement>('[data-home-title]')!
      const catchEl = root.current!.querySelector<HTMLElement>('[data-home-catch]')!
      // The name ignites as the ring does, and not a frame before; the sentence follows once the name has cooled.
      gsap.delayedCall(delay, () => {
        gsap.set(title, { autoAlpha: 1 })
        treatTitle(title, { immediate: true })
      })
      gsap.delayedCall(delay + 0.9, () => blurFade([catchEl], 0, undefined, true))
    },
    { scope: root, dependencies: [delay] },
  )
  const hidden = animated ? { visibility: 'hidden' as const } : undefined
  return (
    <div ref={root} className="home-hero" data-home-hero>
      {brackets ? (
        <Wordmark size="title"><p data-home-title style={hidden} className="t-display-monolith home-hero__title m-0 text-page-text" aria-hidden>{title}</p></Wordmark>
      ) : (
        <p data-home-title style={hidden} className="t-display-monolith home-hero__title m-0 text-page-text" aria-hidden>{title}</p>
      )}
      <p data-home-catch style={hidden} className="home-hero__catch t-title-md m-0 text-page-text-mute">{catchLine}</p>
    </div>
  )
}
