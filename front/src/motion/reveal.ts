/**
 * reveal/masked — data-attribute reveal API.
 *   data-reveal="mask"  → clip-path wipe, upward only (DESIGN.md: one direction per page)
 *   data-reveal="fade"  → body text fades as a block
 * Reduced motion → everything visible instantly.
 */
import { gsap } from 'gsap'
import { prefersReducedMotion } from './flags'

const MASK_HIDDEN = 'inset(100% 0 0 0)'
const MASK_SHOWN = 'inset(0% 0 0 0)'

export function initReveals(scope: HTMLElement): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]', scope)

  if (prefersReducedMotion()) {
    gsap.set(targets, { autoAlpha: 1, clearProps: 'clipPath,transform' })
    return
  }

  targets.forEach((el) => {
    const kind = el.dataset.reveal
    if (kind === 'mask') {
      gsap.fromTo(
        el,
        { autoAlpha: 1, clipPath: MASK_HIDDEN },
        {
          clipPath: MASK_SHOWN,
          duration: 1.1,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 82%', once: true },
        },
      )
    } else {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          delay: Number(el.dataset.revealDelay ?? 0),
          scrollTrigger: { trigger: el, start: 'top 84%', once: true },
        },
      )
    }
  })
}

/** Single upward wipe on load, for the monolith title (act 1). */
export function revealOnLoad(el: HTMLElement): gsap.core.Tween {
  if (prefersReducedMotion()) {
    return gsap.set(el, { autoAlpha: 1, clearProps: 'clipPath' }) as unknown as gsap.core.Tween
  }
  return gsap.fromTo(
    el,
    { autoAlpha: 1, clipPath: MASK_HIDDEN },
    { clipPath: MASK_SHOWN, duration: 1.1, ease: 'expo.out', delay: 0.2 },
  )
}
