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

export const HOME_TITLE = 'MONOLITH'
export const HOME_CATCH = 'An agent cannot enter a position it does not know how to exit.'

export function HomeHero({ delay = 0 }: { delay?: number }) {
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
      <p data-home-title style={hidden} className="t-display-monolith home-hero__title m-0 text-page-text" aria-hidden>{HOME_TITLE}</p>
      <p data-home-catch style={hidden} className="home-hero__catch t-title-md m-0 text-page-text-mute">{HOME_CATCH}</p>
    </div>
  )
}
