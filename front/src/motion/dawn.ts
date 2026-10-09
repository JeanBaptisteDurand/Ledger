/**
 * "Le jour se lève": the loading screen. Pure black until the scene has really rendered, then one continuous
 * rise (2.5–4 s, ease-in-out) that the 3D scene and the CSS sky read from a shared `dawn.t` (0 → 1):
 *
 *   0    → 0.30  horizon glow (CSS radial mask grows from the horizon line)
 *   0.15 → 0.65  sky gradient climbs and brightens
 *   0.35 → 0.85  raking light reveals sand, shadow and the key (3D light intensities)
 *   0.72         title wipe starts (TitleBillboard)
 *   0.82 → 1     OLED "SCROLL UP" lights up
 *
 * Scroll is locked for the whole rise and stays locked afterwards: the hero player (motion/hero.ts) releases it
 * at the end of the sequence. Under prefers-reduced-motion the poster is shown instead (components/Hero.tsx).
 */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { setPageLocked } from './scroll'

export type Dawn = { t: number }

export const DAWN_DURATION = 3.2
const HOLD_CLASS = 'hero-dawn-hold'

/** Dev / capture override: `?dawn=0.5` freezes the rise at that value. */
export function dawnOverride(): number | null {
  const raw = new URLSearchParams(window.location.search).get('dawn')
  if (raw === null) return null
  const v = Number(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null
}

/** Writes the CSS side of the rise on the hero section. */
export function applyDawnCss(section: HTMLElement, t: number) {
  // Radial mask centred on the horizon line: glow first, then the gradient above (and the ground band below).
  section.style.setProperty('--dawn-reach', `${(t * 150).toFixed(2)}%`)
  // Overall sky exposure: dim at first, full by two thirds of the rise.
  const bright = 0.25 + 0.75 * smooth((t - 0.1) / 0.55)
  section.style.setProperty('--dawn-bright', bright.toFixed(3))
  // Once risen, the sky drops its mask: a masked 200vh composited layer can checkerboard (black tiles at the
  // top of the frame) while the follower force-scrolls the page after a wheel flick.
  section.classList.toggle('hero--lit', t >= 1)
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

export function lockScroll() {
  setPageLocked(true)
  document.documentElement.classList.add(HOLD_CLASS)
}

export function unlockScroll() {
  document.documentElement.classList.remove(HOLD_CLASS)
  setPageLocked(false)
  ScrollTrigger.refresh()
}

/** Starts the rise; `onDone` runs when it is over (the page stays locked: the player takes over). `reduced` cuts straight to the finished scene. */
export function runDawn(dawn: Dawn, section: HTMLElement, reduced: boolean, onDone: () => void): gsap.core.Tween | null {
  if (reduced) {
    dawn.t = 1
    applyDawnCss(section, 1)
    onDone()
    return null
  }
  return gsap.to(dawn, {
    t: 1,
    duration: DAWN_DURATION,
    ease: 'power2.inOut',
    onUpdate: () => applyDawnCss(section, dawn.t),
    onComplete: onDone,
  })
}

/**
 * The faces the first frame depends on. The hero title is baked into a 3D texture, so if its face arrives after
 * the dawn has lifted the screen the title is briefly shown in the fallback and then swaps under the reader's
 * eye. `document.fonts.ready` alone does not cover it: it resolves against whatever is already in the load
 * queue, and the texture asks for its face from inside the scene, which may be later. So the faces are
 * requested here, explicitly, before the gate is allowed to open.
 */
export async function loadHeroFonts(): Promise<void> {
  const css = getComputedStyle(document.documentElement)
  const title = css.getPropertyValue('--font-title').trim()
  const weight = css.getPropertyValue('--font-title-weight').trim() || '400'
  const display = css.getPropertyValue('--font-display').trim()
  const first = (list: string) => list.split(',')[0].trim()
  const wanted = [`${weight} 200px ${first(title)}`, `700 200px ${first(display)}`]
  await Promise.all(wanted.map((f) => document.fonts?.load(f).catch(() => undefined) ?? Promise.resolve()))
  await (document.fonts?.ready ?? Promise.resolve())
}

/** Dev / capture override: `?p=0.5` jumps the sequence to that progress (and releases the page). */
export function progressOverride(): number | null {
  const raw = new URLSearchParams(window.location.search).get('p')
  if (raw === null) return null
  const v = Number(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null
}
