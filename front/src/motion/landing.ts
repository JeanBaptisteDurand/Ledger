/**
 * The landing's motion, in one place. NEW file: nothing else in src/motion/ is touched.
 *
 * Every helper is a no-op that jumps to the end state when motion is off (below 768 px or under
 * prefers-reduced-motion), and every ScrollTrigger it creates lives in the caller's gsap.context, so a
 * component unmounting reverts everything it asked for.
 *
 * Vocabulary (spectacle catalogue): reveal/split-text-scroll, reveal/blur-fade, reveal/number-ticker,
 * reveal/masked, motion/scroll-story (pinned, scrubbed stages), and the horizontal pan.
 */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { motionEnabled } from './flags'

const EASE_OUT = 'expo.out'
const NBSP_THIN = ' '

/** 9990 → "9 990", the way the rest of the site writes numbers. */
export function formatFigure(v: number, decimals = 0): string {
  const t = v.toFixed(decimals)
  const [int, frac] = t.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP_THIN)
  return frac !== undefined ? `${grouped}.${frac}` : grouped
}

const once = (trigger: Element, start = 'top 82%'): ScrollTrigger.Vars => ({ trigger, start, once: true })

/** A token's colour, read once from the root so the tweens carry the site's own values and no hex of their own. */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()



/** A title: words rise out of a line mask, staggered. Returns the split so the caller can revert it. */
export function splitTitle(el: HTMLElement, trigger: Element = el): SplitText | null {
  if (!motionEnabled()) return null
  const split = SplitText.create(el, { type: 'lines,words', mask: 'lines', linesClass: 'split-line', autoSplit: true })
  gsap.from(split.words, {
    yPercent: 110,
    duration: 0.9,
    ease: EASE_OUT,
    stagger: 0.035,
    scrollTrigger: once(trigger),
  })
  return split
}

/** Lists, rows, cells: blur to sharp with a small rise, staggered, once. `immediate` plays now, without a trigger. */
export function blurFade(items: Element[] | NodeListOf<Element>, stagger = 0.06, trigger?: Element, immediate = false): void {
  const list = Array.from(items)
  if (!list.length) return
  if (!motionEnabled()) return
  gsap.from(list, {
    autoAlpha: 0,
    y: 18,
    filter: 'blur(8px)',
    duration: 0.8,
    ease: EASE_OUT,
    stagger,
    clearProps: 'filter',
    ...(immediate ? {} : { scrollTrigger: once(trigger ?? list[0]) }),
  })
}

/*
 * ── The incandescence ────────────────────────────────────────────────────────
 * What the sections lost when they left the scene is the ring: its heat, its dusk. A title gets one moment
 * of that heat as it arrives, then cools to the page's cream. It is not continuous, and it is not a halo that
 * stays. Chosen by the author over a heat haze and a horizon sweep (DESIGN.md, Adaptations, 2026-09-26).
 */

/** Ignition. The letters catch left to right, incandescent, and cool to cream — the way the ring caught. */
function ignite(el: HTMLElement, trig?: ScrollTrigger.Vars): SplitText {
  const hot = token('--color-accent-incandescent')
  const ember = token('--color-sky-orange')
  const cream = token('--color-text-050')
  /*
   * Built inside `onSplit`, and returned from it: with `autoSplit` the text is split again once the fonts are
   * in (and on resize), and only an animation built there is rebuilt on the new characters. Built outside, it
   * would have targeted the first split's characters, which the second split throws away.
   */
  return SplitText.create(el, {
    type: 'lines,chars',
    mask: 'lines',
    linesClass: 'split-line',
    autoSplit: true,
    onSplit: (self) => {
      const chars = self.chars as HTMLElement[]
      // The hot fragment (primitives Hot) cools back to incandescent, not to cream, and keeps the CSS heat.
      const cool = chars.filter((c) => !c.closest('[data-hot]'))
      const hotChars = chars.filter((c) => !!c.closest('[data-hot]'))
      const tl = gsap.timeline({ scrollTrigger: trig })
      tl.fromTo(chars, { yPercent: 105, color: hot, textShadow: `0 0 22px ${ember}` }, { yPercent: 0, duration: 0.7, ease: EASE_OUT, stagger: 0.022 }, 0)
      tl.to(chars, { color: ember, duration: 0.35, stagger: 0.022, ease: 'none' }, 0.25)
      // A title can be all hot ("One signature."): an empty list would make GSAP warn "target not found".
      if (cool.length) tl.to(cool, { color: cream, textShadow: `0 0 0px ${ember}`, duration: 1.2, stagger: 0.022, ease: 'power2.out', clearProps: 'textShadow' }, 0.6)
      if (hotChars.length) tl.to(hotChars, { color: hot, duration: 1.2, stagger: 0.022, ease: 'power2.out', clearProps: 'color,textShadow' }, 0.6)
      return tl
    },
  })
}

/** A title, ignited. `immediate` plays now (the home's hero); otherwise once on entering the viewport. */
export function treatTitle(el: HTMLElement, opts: { immediate?: boolean; trigger?: Element } = {}): SplitText | null {
  if (!motionEnabled()) return null
  return ignite(el, opts.immediate ? undefined : once(opts.trigger ?? el))
}

/** A figure counts up to its value once it is on screen. The element's text IS the target. */
export function ticker(el: HTMLElement, to: number, decimals = 0, trigger: Element = el): void {
  const write = (v: number) => { el.textContent = formatFigure(v, decimals) }
  if (!motionEnabled()) { write(to); return }
  const box = { v: 0 }
  write(0)
  gsap.to(box, {
    v: to,
    duration: 1.2,
    ease: EASE_OUT,
    onUpdate: () => write(box.v),
    onComplete: () => write(to),
    scrollTrigger: once(trigger, 'top 75%'),
  })
}

/** A clip-path wipe, one direction for the whole page: upward. */
export function maskWipe(el: HTMLElement, trigger: Element = el): void {
  if (!motionEnabled()) return
  gsap.fromTo(
    el,
    { clipPath: 'inset(100% 0 0 0)' },
    { clipPath: 'inset(0% 0 0 0)', duration: 1.1, ease: EASE_OUT, scrollTrigger: once(trigger) },
  )
}

/**
 * A pinned stage: the section holds the viewport for `length` of scroll while `build` fills a timeline that
 * the scrollbar scrubs. Without motion the section is ordinary flow and every tween's end state is applied.
 */
export function pinStage(section: HTMLElement, build: (tl: gsap.core.Timeline) => void, length = '+=160%'): void {
  const tl = gsap.timeline({ paused: !motionEnabled() })
  build(tl)
  if (!motionEnabled()) { tl.progress(1); return }
  ScrollTrigger.create({ trigger: section, start: 'top top', end: length, pin: true, scrub: 0.6, animation: tl, anticipatePin: 1 })
}

/** A number the scrubbed timeline writes as it goes: add it to a stage's timeline at `at`. */
export function scrubFigure(tl: gsap.core.Timeline, el: HTMLElement, to: number, at: gsap.Position, duration = 1, decimals = 0): void {
  const box = { v: 0 }
  writeFigure(el, 0, to, decimals)
  tl.to(box, { v: to, duration, ease: 'none', onUpdate: () => writeFigure(el, box.v, to, decimals) }, at)
}

/**
 * Writes a liquid figure (primitives: Figure): both copies of the number, the fill as a share of the target, and
 * the slosh — the wave at the surface moves with the count, never on its own, so a still page has no animation.
 */
export function writeFigure(el: HTMLElement, v: number, to: number, decimals = 0): void {
  const text = formatFigure(v, decimals)
  for (const t of el.querySelectorAll<HTMLElement>('[data-text]')) t.textContent = text
  const share = to > 0 ? Math.min(1, Math.max(0, v / to)) : 1
  el.dataset.fill = share.toFixed(4) // read by the WebGL liquid (scene/liquid.ts)
  el.style.setProperty('--fill', `${(share * 100).toFixed(2)}%`)
  el.style.setProperty('--slosh', `${(share * 260).toFixed(1)}px`)
}

/**
 * A sheet is in focus while it crosses the middle band of the viewport: it then carries an incandescent
 * outline (tokens.css .glass[data-focus]). An observer, not the scroll position: pins move the sheets with
 * transforms and the observer follows them. Never for the frieze's cards, whose state is the playhead's.
 */
export function focusSheets(scope: HTMLElement): () => void {
  const sheets = Array.from(scope.querySelectorAll<HTMLElement>('.glass')).filter((el) => !el.closest('.frieze__track'))
  if (!sheets.length) return () => {}
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.toggleAttribute('data-focus', e.isIntersecting)
    },
    { rootMargin: '-32% 0px -32% 0px', threshold: 0 },
  )
  sheets.forEach((el) => io.observe(el))
  return () => io.disconnect()
}

/**
 * The frieze (components/landing/Frieze.tsx). The wrapper pins; the track slides under a fixed playhead by one
 * second's width per second of the run; the clock counts the seconds; each step is ahead, live or done as the
 * playhead passes it, and a timed span fills with the incandescent while it is live. The scrub is the run.
 */
export function frieze(wrap: HTMLElement, track: HTMLElement, clock: HTMLElement | null, total: number, pxPerS: number, playhead: number, pad: number): void {
  const steps = Array.from(track.querySelectorAll<HTMLElement>('[data-step]'))
  const spans = Array.from(track.querySelectorAll<HTMLElement>('[data-span]'))
  const bounds = (el: HTMLElement) => ({ el, start: Number(el.dataset.start), end: Number(el.dataset.end) })
  const S = steps.map(bounds)
  const P = spans.map(bounds)
  // Everything that belongs to a step — its span, its label — takes the step's state with it.
  const linked = (i: string) => Array.from(track.querySelectorAll<HTMLElement>(`[data-for="${i}"]`))
  const setState = (s: HTMLElement, state: string) => {
    if (s.dataset.state === state) return
    s.dataset.state = state
    for (const l of linked(s.dataset.i ?? '')) l.dataset.state = state
  }
  const stage = track.parentElement as HTMLElement
  if (!motionEnabled()) {
    if (clock) writeFigure(clock, total, total)
    for (const s of S) setState(s.el, 'done')
    for (const p of P) p.el.style.setProperty('--done', '1')
    return
  }
  const box = { t: 0 }
  const apply = () => {
    const t = box.t
    gsap.set(track, { x: stage.clientWidth * playhead - pad - t * pxPerS })
    if (clock) writeFigure(clock, t, total)
    for (const s of S) setState(s.el, t < s.start ? 'ahead' : t < s.end ? 'live' : 'done')
    for (const p of P) p.el.style.setProperty('--done', Math.min(1, Math.max(0, (t - p.start) / (p.end - p.start))).toFixed(3))
  }
  apply()
  gsap.to(box, {
    t: total,
    ease: 'none',
    onUpdate: apply,
    scrollTrigger: { trigger: wrap, start: 'top top', end: () => `+=${total * pxPerS + 360}`, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1, onRefresh: apply },
  })
}


/**
 * Bento cells arrive from misaligned positions and settle into the grid: each one from its own offset and a
 * degree or two of tilt, staggered, once. The offsets are deterministic (by index), not random, so two loads
 * look the same.
 */
export function settleCells(cells: Element[] | NodeListOf<Element>, trigger?: Element): void {
  const list = Array.from(cells)
  if (!list.length || !motionEnabled()) return
  gsap.from(list, {
    autoAlpha: 0,
    x: (i) => (i % 3 - 1) * 36,
    y: (i) => 24 + (i % 2) * 20,
    rotate: (i) => (i % 2 ? 1.5 : -1.5),
    duration: 1,
    ease: EASE_OUT,
    stagger: 0.07,
    scrollTrigger: once(trigger ?? list[0], 'top 78%'),
  })
}

export { ScrollTrigger }
