/**
 * motion/lenis-gsap-system — Lenis synced to the GSAP ticker, ScrollTrigger kept in sync.
 * One engine, one place. Disabled below 768px and under prefers-reduced-motion.
 */
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import { motionEnabled } from './flags'

let registered = false
let current: Lenis | null = null
let locked = false

/** The live Lenis instance (null below 768px / reduced motion). */
export const getLenis = () => current

/**
 * Page lock (dawn, then the hero player until the landing). Remembered, so a Lenis created after the lock
 * (App's effect runs after the hero's) starts stopped instead of scrolling the page on the launching wheel.
 */
export function setPageLocked(value: boolean): void {
  locked = value
  if (value) current?.stop()
  else current?.start()
}
export const isPageLocked = () => locked

export function registerGsap(): void {
  // Dev / capture: `?slow=4` runs every GSAP timeline at a quarter speed, so a capture can catch a reveal mid-flight.
  if (import.meta.env.DEV) {
    const slow = Number(new URLSearchParams(window.location.search).get('slow'))
    if (slow > 1) gsap.globalTimeline.timeScale(1 / slow)
  }
  if (registered) return
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)
  gsap.defaults({ ease: 'power3.out', duration: 0.85 })
  registered = true
}

export function initSmoothScroll(): () => void {
  registerGsap()
  if (!motionEnabled()) return () => {}

  const lenis = new Lenis({
    lerp: 0.08,
    smoothWheel: true,
    wheelMultiplier: 0.9,
    anchors: true,
  })

  current = lenis
  if (locked) lenis.stop()
  const onScroll = () => ScrollTrigger.update()
  lenis.on('scroll', onScroll)

  const tick = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const refresh = () => ScrollTrigger.refresh()
  document.fonts?.ready.then(refresh)
  window.addEventListener('load', refresh)

  return () => {
    window.removeEventListener('load', refresh)
    gsap.ticker.remove(tick)
    lenis.off('scroll', onScroll)
    lenis.destroy()
    current = null
  }
}
