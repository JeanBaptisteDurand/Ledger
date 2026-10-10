/**
 * The hero's time model: the sequence is PLAYED in steps, and it stops at every text.
 *
 *   idle      the scene waits at rest (shimmer, grains, key planted); the page is scroll-locked.
 *   running   an animated SEGMENT plays on its own at nominal speed, from one stop to the next. Scrolling during
 *             a segment does nothing at all: no queue, no skipped title, no acceleration.
 *   waiting   the playhead has reached a stop. The device holds its readable pose, screen to camera, and the
 *             screen shows this step's word. The scene is not frozen: the sand blows, the shimmer breathes, and
 *             the playhead creeps at HOLD_DRIFT_RATE up to the stop's ceiling so the sky keeps evolving. The
 *             pointer may tilt the device. The only invitation to scroll is the one the device's own screen
 *             carries. The next scroll down starts the next segment; scrolling up does nothing.
 *   done      the landing is reached: the page is released and scrolls normally. Once per visit.
 *
 * Everything reads `progress.p` and `progress.idleTurns`: the 3D scene (useFrame), the CSS sky shift, the DOM
 * timeline (night layer, nav), the narrative texts. No React state anywhere.
 */
import { gsap } from 'gsap'
import { DECEL_P, HOLD_DRIFT_RATE, PHASE, SEGMENTS, SEQUENCE_SECONDS, SEQUENCE_VH, STOPS, screenWordAt, segmentAt, skyShift } from './hero-math'
import { LANDED_WORD, REST_WORD } from './screen-words'
import { lockScroll, unlockScroll } from './dawn'

export type HeroProgress = {
  p: number
  /** Normalised pointer over the canvas, -1..1 on each axis; (0,0) when the pointer is away or the key is flying. */
  pointerX: number
  pointerY: number
  /**
   * Where the flight segment currently being played began, and which stop it heads for (-1 when parked).
   * The scene measures the segment from here rather than from a fixed point of the timeline, so a turn
   * begins on the frame the reader scrolls, wherever the drift had left the playhead.
   */
  segFrom: number
  segIndex: number
  /**
   * Bumped by every scroll that shakes the planted key without launching it. The scene watches the sequence
   * number rather than a timestamp, because the two run on different clocks: it stamps its own the frame it
   * sees a new one.
   */
  nudgeSeq: number
  /** How hard that shake was, 0..1. The key resists more each time before it finally tears free. */
  nudgeStrength: number
  /**
   * The descent, 0 to 1. The landed reader scrolls once more: the name on the Flex goes out, the camera goes
   * into its black screen, and the hole comes out of that screen, whole and centred. The player writes it on
   * its own clock (DESCENT.s); the scene reads it the way it reads `p`.
   */
  descent: number
  /** 'scene' until the screen has swallowed the frame; 'background' from then on, when the hole is all that is drawn. */
  mode: 'scene' | 'background'
}
export type PlayerState = 'armed-later' | 'idle' | 'running' | 'waiting' | 'landed' | 'descending' | 'done'

/**
 * The descent's schedule, in seconds and in fractions of it. The name blinks out on the device's own going-out
 * pattern (screen-words: WORD_BLINK_OUT), the dolly starts under the last flicker, the screen has the whole
 * frame at `black`, and the hole grows out of it from `emergeFrom` to the end.
 */
export const DESCENT = { s: 3.4, dollyFrom: 0.1, dollyTo: 0.64, black: 0.64, emergeFrom: 0.68 } as const

/** A scroll input counts as one intent for this long, so one flick cannot start two segments. */
export const INPUT_WINDOW_MS = 220
/**
 * How many scrolls it takes to leave the sand. The first two only shake the key: it is driven into the ground
 * like a marker, and it resists. Each refusal is stronger than the last, and the sand answers at its foot. The
 * third is the one that tears it free.
 */
export const SCROLLS_TO_LAUNCH = 3
/**
 * How far before the morph the late-phase pieces are asked for, in progress. Enough for a chunk to be
 * fetched and compiled over a slow link, and late enough that a reader who never gets there never pays.
 */
/**
 * How far ahead of the morph the black hole's chunk is fetched. It has to clear the whole outro now that the
 * finale is three beats long: the fall starts the instant the morph ends, and a chunk that arrived during the
 * fall would pop in mid-beat.
 */
const LATE_LEAD = 0.14
/** How hard each refusal shakes, in order. The last entry is the one just before it tears free. */
export const NUDGE_STRENGTHS = [0.42, 1] as const
/**
 * The lean the pointer induces while the sequence waits, in degrees on each axis. Both are perspective tilts, X
 * and Y, never a roll about the view axis, so the word on the screen stays horizontal however far the cursor is
 * pushed; only the angle it is read at changes.
 */
export const POINTER_TILT_DEG = 11
/** The lateral and vertical drift the pointer induces, in world units: the device leans and also gives ground. */
export const POINTER_SHIFT = 0.17
/** How fast the tilt follows the pointer; the scene damps toward the target every frame. */
export const POINTER_DAMP = 6

export type HeroPlayerTargets = {
  section: HTMLElement
  sky: HTMLElement
  night: HTMLElement
  /** The CSS star field under the canvas; it fades in with the night and is absent at rest. */
  stars: HTMLElement | null
  nav: HTMLElement | null
  /** The visually hidden element that mirrors the screen word for assistive tech. */
  word: HTMLElement | null
}

export type HeroPlayer = {
  arm: () => void
  jumpTo: (p: number) => void
  /** Dev / capture: the landed scene, locked, the descent still to come (`?p=1&land=1`). */
  land: () => void
  state: () => PlayerState
  destroy: () => void
}

export function createHeroPlayer(
  t: HeroPlayerTargets,
  progress: HeroProgress,
  onProgress: (p: number) => void,
  onVisible?: (visible: boolean) => void,
  /**
   * Whether the sequence may leave the stop it is parked at. A stop that carries a note holds the sequence
   * until that note has been read, so the reader cannot scroll past something they never saw.
   */
  canResume?: (stopIndex: number) => boolean,
  /**
   * Fired ONCE, a little before the morph, so the last sequence's heavy pieces can be fetched then and not
   * at page load. It must never fire per frame: it crosses into React.
   */
  onLatePhase?: () => void,
  /**
   * The descent's three moments, for the DOM: 'start' when the landed reader scrolls, 'emerge' when the screen
   * has the frame and the hole starts out of it (the home's hero may mount), 'end' when the page is released.
   */
  onDescent?: (phase: 'start' | 'emerge' | 'end') => void,
  /**
   * Fired when the reader releases a segment: 0 at the launch, then the index of the stop being flown to,
   * STOPS.length for the finale. The soundtrack hangs its phrases on it (motion/sound.ts).
   */
  onSegment?: (index: number) => void,
): HeroPlayer {
  // DOM tweens, paused: their playhead is set from the player.
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const [nightA, nightB] = PHASE.night
  tl.to(t.night, { opacity: 1, duration: nightB - nightA, ease: 'power2.in' }, nightA)
  /*
   * The star field crosses over the dusk on the same window, a little behind the night so the two read as one
   * sky going out rather than as a layer being switched on. It carries its own black, so once it is up there
   * is nothing of the gradient left underneath to hide it.
   */
  if (t.stars) tl.to(t.stars, { opacity: 1, duration: (nightB - nightA) * 0.9, ease: 'power2.inOut' }, nightA + (nightB - nightA) * 0.1)
  if (t.nav) tl.to(t.nav, { autoAlpha: 1, duration: 0.02 }, PHASE.navIn)
  tl.to({}, { duration: 0.001 }, 1) // make sure the timeline spans exactly 0 → 1

  let shownWord = ''
  /** Whether the sequence is in the space phase; the star field only animates while it is. */
  let inSpace: boolean | null = null
  /** The late-phase callback is a one-shot; this is the latch. */
  let lateFired = false
  const apply = (p: number) => {
    t.section.style.setProperty('--hero-p', p.toFixed(4))
    t.sky.style.transform = `translate3d(0, ${(skyShift(p) * 100).toFixed(3)}vh, 0)`
    tl.progress(p)
    // One attribute write when it changes, not per frame: it gates the star field's three animations.
    if (!lateFired && p >= PHASE.morphStart - LATE_LEAD && onLatePhase) {
      lateFired = true
      onLatePhase()
    }
    const space = p >= PHASE.night[0]
    if (space !== inSpace) {
      inSpace = space
      t.section.setAttribute('data-space', space ? 'true' : 'false')
    }
    /*
     * The screen word, mirrored as real text so a screen reader gets the narrative the 3D texture cannot
     * carry. It follows the same rule as the panel: once the note at this stop has been read, the word goes
     * back to the resting instruction, because that change is what says the sequence can move on.
     */
    const readHere = state === 'waiting' && canResume !== undefined && canResume(target - 1)
    /* Which stop the word belongs to: the one being waited at, or the one being flown to. */
    const wordStop = state === 'waiting' ? target - 1 : target
    const word = readHere ? REST_WORD : screenWordAt(p, REST_WORD, LANDED_WORD, wordStop)
    if (t.word && word !== shownWord) {
      shownWord = word
      t.word.textContent = word
    }
    onProgress(p)
  }

  let state: PlayerState = 'armed-later'
  /** Index of the next stop to reach; STOPS.length means the last segment (morph and landing). */
  let target = 0
  let lastInput = -Infinity
  /** Scrolls received while still planted. The launch happens on the SCROLLS_TO_LAUNCH-th. */
  let idleScrolls = 0


  /** A scroll down: only ever starts the next segment, and only from a stop. */
  const resume = () => {
    if (state !== 'waiting') return
    if (canResume && !canResume(target - 1)) return
    // The segment starts HERE, not at the far side of this stop's leftover drift.
    progress.segFrom = progress.p
    progress.segIndex = target
    if (import.meta.env.DEV) {
      const w = window as unknown as { __lag?: Record<string, number | string | undefined> }
      if (w.__lag && w.__lag.resumedAt === undefined) {
        w.__lag.resumedAt = performance.now()
        w.__lag.pAtResume = progress.p
        w.__lag.ceiling = STOPS[target - 1]?.driftTo
        w.__lag.segAtResume = segmentAt(progress.p).index
      }
    }
    state = 'running'
    // The lean belongs to the stop: it releases as soon as the sequence moves again.
    progress.pointerX = 0
    progress.pointerY = 0
    onSegment?.(target)
  }

  const tick = (_time: number, deltaMs: number) => {
    if (state !== 'running' && state !== 'waiting') return
    const dt = Math.min(deltaMs / 1000, 0.1)
    const nominal = dt / SEQUENCE_SECONDS

    if (state === 'waiting') {
      // The scene keeps living, but the key itself holds its readable pose: the sand blows, the shimmer breathes
      // and the playhead creeps to its ceiling so the sky keeps evolving.
      const ceiling = STOPS[target - 1]?.driftTo ?? 1
      if (progress.p < ceiling) {
        progress.p = Math.min(ceiling, progress.p + nominal * HOLD_DRIFT_RATE)
        apply(progress.p)
      } else {
        onProgress(progress.p) // the idle rotation still needs a frame
      }
      return
    }

    if (import.meta.env.DEV) {
      const w = window as unknown as { __lag?: Record<string, number | string | undefined> }
      const l = w.__lag
      if (l && l.resumedAt !== undefined && l.segChangedAt === undefined && segmentAt(progress.p).index !== l.segAtResume) {
        l.segChangedAt = performance.now()
      }
    }
    const stop = target < STOPS.length ? STOPS[target].at : 1
    /*
     * The key EASES into its stop instead of hitting it. Over the last DECEL_P of progress the playhead's rate
     * falls from nominal toward the hold rate, which is the slow motion the device visibly goes into. The
     * screen word wakes inside this ramp (hero-math: WORD_LEAD_P), so the order the reader sees is: the key
     * slows, the screen comes on, the pose settles. The rate is floored at three times the hold rate, or the
     * last sliver of the ramp would take longer than the whole approach.
     */
    const remaining = stop - progress.p
    const u = remaining >= DECEL_P ? 1 : remaining / DECEL_P
    const rate = Math.max(HOLD_DRIFT_RATE * 3, HOLD_DRIFT_RATE + (1 - HOLD_DRIFT_RATE) * u)
    progress.p = Math.min(stop, progress.p + nominal * rate)
    apply(progress.p)
    if (progress.p >= stop - 1e-6) {
      if (target < STOPS.length) {
        state = 'waiting'
        progress.segIndex = -1
        target += 1
      } else {
        // Landed: the scene holds, still locked. The next scroll is the descent, not the page.
        state = 'landed'
      }
    }
  }

  /**
   * The descent. One tween on the player's own clock, never the scrollbar's: the reader asked for it with one
   * scroll and it plays through, like every other segment. The page unlocks at the very end, so the first real
   * scroll of the home lands on a page that is already there.
   */
  const descend = () => {
    state = 'descending'
    progress.pointerX = 0
    progress.pointerY = 0
    onDescent?.('start')
    let emerged = false
    gsap.to(progress, {
      descent: 1,
      duration: DESCENT.s,
      ease: 'none',
      onUpdate: () => {
        t.section.style.setProperty('--hero-descent', progress.descent.toFixed(4))
        if (!emerged && progress.descent >= DESCENT.emergeFrom) {
          emerged = true
          progress.mode = 'background'
          onDescent?.('emerge')
        }
        onProgress(progress.p)
      },
      onComplete: () => {
        state = 'done'
        onDescent?.('end')
        unlockScroll()
      },
    })
  }

  // Inputs: direction only, never amplitude, and one intent per window.
  const input = (dir: 1 | -1) => {
    if (dir < 0) return // scrolling up never rewinds and never resumes
    const now = performance.now()
    if (import.meta.env.DEV) {
      const w = window as unknown as { __lag?: Record<string, number | string> }
      if (!w.__lag || w.__lag.done) w.__lag = { firstEvent: now, events: 0, accepted: 0, state }
      ;(w.__lag.events as number) += 1
    }
    if (now - lastInput < INPUT_WINDOW_MS) return
    lastInput = now
    if (import.meta.env.DEV) {
      const w = window as unknown as { __lag?: Record<string, number | string> }
      if (w.__lag) (w.__lag.accepted as number) += 1
    }
    if (state === 'idle') {
      idleScrolls += 1
      if (idleScrolls < SCROLLS_TO_LAUNCH) {
        // Not yet: the key only shakes. It stays planted and its screen keeps asking for another scroll.
        progress.nudgeSeq += 1
        // The key resists harder each time: the last refusal before it gives is the one that shows.
        progress.nudgeStrength = NUDGE_STRENGTHS[Math.min(idleScrolls - 1, NUDGE_STRENGTHS.length - 1)]
        return
      }
      state = 'running'
      progress.segFrom = progress.p
      progress.segIndex = 0
      onSegment?.(0)
      return
    }
    if (state === 'landed') {
      descend()
      return
    }
    resume()
  }

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY !== 0) input(e.deltaY > 0 ? 1 : -1)
  }
  const onKey = (e: KeyboardEvent) => {
    if (state === 'armed-later' || state === 'descending' || state === 'done') return
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'End' || (e.key === ' ' && !e.shiftKey) || e.key === 'Enter') {
      e.preventDefault()
      input(1)
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') {
      e.preventDefault()
    }
  }
  let touchY: number | null = null
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY
    if (touchY === null || y === undefined) return
    const d = touchY - y
    if (Math.abs(d) > 8) {
      input(d > 0 ? 1 : -1)
      touchY = y
    }
  }
  /**
   * Pointer: only meaningful while the sequence waits. Normalised to -1..1 over the viewport and handed to the
   * scene, which damps it into a few degrees of lean. Nothing is registered for touch: a coarse pointer has no
   * hover, and the tilt would fight the scroll gesture.
   */
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
  const onPointerMove = (e: PointerEvent) => {
    // The landed device is as answerable to the pointer as the key is at a stop.
    if (e.pointerType !== 'mouse' || (state !== 'waiting' && state !== 'landed')) return
    progress.pointerX = (e.clientX / window.innerWidth) * 2 - 1
    progress.pointerY = (e.clientY / window.innerHeight) * 2 - 1
  }
  const onPointerLeave = () => {
    progress.pointerX = 0
    progress.pointerY = 0
  }
  if (fine.matches) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
  }

  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('keydown', onKey)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })

  // Render continuously while the hero is on screen (the resting scene moves), on demand once scrolled away.
  const io = new IntersectionObserver(
    ([entry]) => {
      const visible = entry.isIntersecting
      t.section.classList.toggle('hero--inactive', !visible)
      onVisible?.(visible)
    },
    { threshold: 0.01 },
  )
  io.observe(t.section)

  gsap.ticker.add(tick)
  apply(progress.p)

  const player: HeroPlayer = {
    arm: () => {
      if (state !== 'armed-later') return
      state = 'idle'
      lockScroll()
    },
    jumpTo: (p) => {
      progress.p = Math.min(1, Math.max(0, p))
      state = 'done'
      apply(progress.p)
      // At 1 the descent is over too: this is the home, with the hole already out of the screen.
      if (progress.p >= 1) {
        progress.descent = 1
        progress.mode = 'background'
        t.section.style.setProperty('--hero-descent', '1')
        onDescent?.('emerge')
        onDescent?.('end')
      }
      unlockScroll()
    },
    land: () => {
      progress.p = 1
      progress.descent = 0
      progress.mode = 'scene'
      state = 'landed'
      apply(1)
      lockScroll()
    },
    state: () => state,
    destroy: () => {
      gsap.ticker.remove(tick)
      io.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      tl.kill()
    },
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as { __heroPlayer?: unknown }).__heroPlayer = {
      state: () => state,
      p: () => progress.p,
      word: () => shownWord,
      target: () => target,
      input: () => input(1),
      idleScrolls: () => idleScrolls,
      timing: { SEQUENCE_SECONDS, sequenceVh: SEQUENCE_VH, stops: STOPS, segments: SEGMENTS, driftRate: HOLD_DRIFT_RATE, scrollsToLaunch: SCROLLS_TO_LAUNCH },
    }
  }
  return player
}
