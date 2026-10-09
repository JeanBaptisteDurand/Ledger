/**
 * The sequence's clock and geometry, shared by the 3D scene (useFrame), the heat-haze post pass, the DOM timeline
 * (sky layer) and the narrative timeline, so the CSS horizon, the 3D horizon and the fades never drift apart.
 *
 * The sequence is PLAYED, not scrubbed (motion/hero.ts): the first scroll launches it, it runs on its own at
 * nominal speed, further scrolling accelerates it up to a cap.
 *
 * TIME is the master unit here. A nominal second is worth SPEED_VH_PER_S "viewport heights" of travel, which is
 * what the camera and propeller maths are written in; every threshold below is a time budget converted once.
 *
 *   0 → PRE_TEXT_SECONDS      takeoff and launch: the key leaves the sand from rest, gathers momentum and settles
 *                             on the camera axis. The propeller starts on the takeoff pixel and its speed rises
 *                             linearly over the whole launch, reaching cruise exactly when the launch ends.
 *   PRE_TEXT_SECONDS          THE NARRATIVE ANCHOR: the launch is over, the key is centred and at cruise spin;
 *                             the first text starts here. The three texts then run back to back.
 *   … + 65% of the narrative  the sky has gone to night, the stars are out and the camera climb is over; the key
 *                             keeps spinning in front of a fixed starfield.
 *   last OUTRO_SECONDS        the finale, in four beats: the Nano X morphs into a Flex, the black hole comes
 *                             down behind her, its horizon catches from left to right, then the landing.
 *
 * ROLL_TURNS whole turns over the sequence, all of them finished when the morph ends, so the Flex lands upright
 * and no turn happens during the landing itself.
 */
import { DECEL_SECONDS, SCREEN_STEPS, SLOW_RATE, WORD_LEAD_SECONDS } from './screen-words'

export const HERO_CAM = {
  fovDeg: 35,
  z: 7,
  landDistance: 4.6, // the portrait Flex (2.4 units tall) fills ~83% of the frame height here
  yStart: 0.9,
  yEnd: 9,
  rotXStart: 0.1,
  rotXEnd: 0.34,
}

/* ───────────────────────────── Time budget (nominal seconds) ───────────────────────────── */

/**
 * Takeoff and launch, at full speed and with nothing on screen. The slow regime starts at the end of it, and the
 * word only lights up once that slow motion is established (screen-words.ts: WORD_DELAY_SECONDS).
 */
export const PRE_TEXT_SECONDS = 5
/**
 * The finale, in three beats and in this order: the Nano X becomes a Flex, THEN the hole comes down behind
 * her, THEN its horizon catches from left to right. It used to be one beat, with the hole's lensing tied to
 * the star field and therefore present from the second screen word onward, which read as the hole arriving
 * halfway through the story instead of at the end of it.
 */
export const MORPH_SECONDS = 1.2
/** The hole descends into place. */
export const HOLE_FALL_SECONDS = 1.5
/** The ring catches, left edge to right edge. */
export const HOLE_BURN_SECONDS = 1.2
export const LANDING_SECONDS = 1
export const OUTRO_SECONDS = MORPH_SECONDS + HOLE_FALL_SECONDS + HOLE_BURN_SECONDS + LANDING_SECONDS

/**
 * The sequence STOPS at each screen word and waits for a scroll, so the time a word stays up is the reader's.
 * `driftSeconds` is only how far the playhead may creep during that wait, so the sky keeps evolving.
 */
/*
 * The window was four nominal seconds wide and it is crept at a fifteenth of nominal speed, so filling it
 * would take the best part of a minute. Nobody waits that long, so every resume left a large unconsumed
 * remainder that the playhead then had to cross before the next segment could begin: measured at 3.9 seconds
 * of a completely frozen key after the scroll. It is now sized to be consumed by a realistic dwell, and what
 * is left over is absorbed by the segment itself rather than traversed first.
 */
export const DRIFT_SECONDS = 1
/** The slow regime never reaches zero: the playhead keeps advancing at this share of nominal speed. */
export const HOLD_DRIFT_RATE = SLOW_RATE

const flightSeconds = SCREEN_STEPS.reduce((n, st, i) => n + (i === 0 ? PRE_TEXT_SECONDS : st.seconds), 0)
/** Play time of the whole sequence if nothing ever stopped, in nominal seconds. */
export const SEQUENCE_SECONDS = flightSeconds + SCREEN_STEPS.length * DRIFT_SECONDS + OUTRO_SECONDS

/* ───────────────────────────── Distances (viewport heights) ───────────────────────────── */

/** One nominal second of travel. Only a scale: it keeps the camera/propeller maths in their original units. */
export const SPEED_VH_PER_S = 150
const vh = (seconds: number) => seconds * SPEED_VH_PER_S

/** The key is out of the sand almost at once; the launch then carries it to the camera axis. */
const TAKEOFF_VH = 20
const MORPH_START_VH = vh(SEQUENCE_SECONDS - OUTRO_SECONDS)
const ROLL_END_VH = MORPH_START_VH + vh(MORPH_SECONDS)
const HOLE_FALL_END_VH = ROLL_END_VH + vh(HOLE_FALL_SECONDS)
const HOLE_BURN_END_VH = HOLE_FALL_END_VH + vh(HOLE_BURN_SECONDS)
/** Virtual length of the whole sequence. */
export const SEQUENCE_VH = vh(SEQUENCE_SECONDS)
const VH = SEQUENCE_VH

/**
 * Propeller: ROLL_TURNS whole turns, all of them done when the morph ends. Angular speed rises linearly over the
 * launch (from zero, on the takeoff pixel) and is constant afterwards, so `vhPerTurn` is derived, not chosen:
 * a slow, ample rotation whose pace never changes once at cruise.
 */
export const ROLL_TURNS = 3
export const ROLL = { rampStart: TAKEOFF_VH, rampEnd: vh(PRE_TEXT_SECONDS) }
const RAMP_SPAN = ROLL.rampEnd - ROLL.rampStart
/** Cruise distance for one turn, derived so the count lands exactly on ROLL_TURNS at the end of the morph. */
export const VH_PER_TURN = (RAMP_SPAN / 2 + (ROLL_END_VH - ROLL.rampEnd)) / ROLL_TURNS
/** Turns completed over the launch ramp: speed rises linearly, so half the cruise share. */
const RAMP_TURNS = RAMP_SPAN / (2 * VH_PER_TURN)
/** How long one turn lasts at cruise, in nominal seconds. */
export const TURN_SECONDS = VH_PER_TURN / SPEED_VH_PER_S

/* ───────────────────────────── Stops ───────────────────────────── */

/** Progress at which the sequence has played `seconds` of nominal time. */
export const secondsToProgress = (seconds: number) => vh(seconds) / VH

/** How far before a stop the playhead starts easing down to the hold rate, in progress. */
export const DECEL_P = secondsToProgress(DECEL_SECONDS)


export type Stop = {
  id: string
  word: string
  /** Nominal seconds from the first scroll, if nothing stopped. */
  stopSeconds: number
  driftEndSeconds: number
  /** Progress at which the sequence stops here, and how far the drift may carry it. */
  at: number
  driftTo: number
  /** The axis the segment leading here turns about, and its whole-turn count. */
  axis: 'roll' | 'yaw' | 'pitch'
  turns: number
  /** Share of the frame height the device fills at this stop. */
  fill: number
  /** How far the key stands up from flat at this stop, in radians. */
  stand: number
  /** Progress at which the segment leading here begins. */
  from: number
}

export const STOPS: ReadonlyArray<Stop> = (() => {
  let cursor = 0
  return SCREEN_STEPS.map((st, i) => {
    const from = cursor
    const stopSeconds = cursor + (i === 0 ? PRE_TEXT_SECONDS : st.seconds)
    const driftEndSeconds = stopSeconds + DRIFT_SECONDS
    cursor = driftEndSeconds
    return {
      id: `s${i + 1}`,
      word: st.word,
      stopSeconds,
      driftEndSeconds,
      at: secondsToProgress(stopSeconds),
      driftTo: secondsToProgress(driftEndSeconds),
      axis: st.axis,
      turns: st.turns,
      fill: st.fill,
      stand: (st.standDeg * Math.PI) / 180,
      from: secondsToProgress(from),
    }
  })
})()

/** The animated segments between stops, in nominal seconds: the time budget applies to these. */
export const SEGMENTS: ReadonlyArray<{ to: string; seconds: number }> = [
  ...STOPS.map((st, i) => ({ to: st.id, seconds: st.stopSeconds - (i === 0 ? 0 : STOPS[i - 1].driftEndSeconds) })),
  { to: 'landing', seconds: SEQUENCE_SECONDS - STOPS[STOPS.length - 1].driftEndSeconds },
]

/* ───────────────────────────── Phases ───────────────────────────── */

/** Launch: the ground offset (all axes, one curve) is released from zero speed, over the whole pre-text phase. */
export const LAUNCH = { start: TAKEOFF_VH / VH, length: (vh(PRE_TEXT_SECONDS) - TAKEOFF_VH) / VH }

/** Night runs from the narrative anchor over the first 65% of the narrative. */
const NIGHT_START_VH = vh(PRE_TEXT_SECONDS)
const NIGHT_END_VH = vh(PRE_TEXT_SECONDS + (SEQUENCE_SECONDS - PRE_TEXT_SECONDS - OUTRO_SECONDS) * 0.65)
/*
 * The camera's climb has its own schedule, no longer tied to the night. Tied to the night it ended at 65% of
 * the sequence, and the ground — with the horizon title standing on it — was still in frame at the first stop.
 * The composition asks for the title GONE before the key slows down for its first word, and the title leaves
 * when the climb is about three quarters done.
 *
 * It is expressed against the FIRST STOP, not against the whole sequence. A share of the sequence looks
 * equivalent and is not: adding a narrative step lengthens the sequence, which pushes the climb later while
 * the first stop stays where it is, and the ordering silently breaks. Anchored here, the camera finishes
 * rising just as the sequence arrives at its first stop, whatever comes after it.
 */
const CLIMB_END_OF_FIRST_STOP = 0.98

export const PHASE = {
  flightStart: TAKEOFF_VH / VH,
  flightEnd: ROLL_END_VH / VH,
  /** Camera climb (rise + tilt): its own schedule, so the ground clears the frame before the first stop. */
  climbEnd: STOPS[0].at * CLIMB_END_OF_FIRST_STOP,
  morphStart: MORPH_START_VH / VH,
  morphEnd: ROLL_END_VH / VH,
  /** Night transition (ease-in), complete well before the morph. */
  night: [NIGHT_START_VH / VH, NIGHT_END_VH / VH] as const,
  /** Stars fade in over the last two thirds of the night transition, brightest first. */
  stars: [(NIGHT_START_VH + (NIGHT_END_VH - NIGHT_START_VH) * 0.35) / VH, NIGHT_END_VH / VH] as const,
  /** Sand grains thin out over the launch. */
  sandFade: [(TAKEOFF_VH + 10) / VH, (vh(PRE_TEXT_SECONDS) * 0.85) / VH] as const,
  nebula: [(NIGHT_START_VH + (NIGHT_END_VH - NIGHT_START_VH) * 0.6) / VH, (NIGHT_END_VH + vh(1.3)) / VH] as const,
  /**
   * The hole comes down, once the morph is over and not before. Everything about it hangs on this: the ring's
   * presence, its place in the frame, and the lensing of the star field, which is the thing that was giving it
   * away early.
   */
  holeFall: [ROLL_END_VH / VH, HOLE_FALL_END_VH / VH] as const,
  /** Then the horizon catches, left edge to right edge. */
  holeBurn: [HOLE_FALL_END_VH / VH, HOLE_BURN_END_VH / VH] as const,
  /** Landing: the wordmark comes up on the black panel, then the nav comes in. */
  screenOn: [(HOLE_BURN_END_VH + vh(0.15)) / VH, (HOLE_BURN_END_VH + vh(0.6)) / VH] as const,
  navIn: (HOLE_BURN_END_VH + vh(0.55)) / VH,
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Propeller turns done at progress p: nothing before the takeoff, linear speed ramp, then constant. */
export function rollTurns(p: number): number {
  const x = p * VH
  if (x <= ROLL.rampStart) return 0
  if (x <= ROLL.rampEnd) {
    const u = x - ROLL.rampStart
    return (u * u) / (2 * RAMP_SPAN * VH_PER_TURN)
  }
  return Math.min(ROLL_TURNS, RAMP_TURNS + (x - ROLL.rampEnd) / VH_PER_TURN)
}

/**
 * Launch impulse 0 → 1: zero speed at rest (no jump), gathers momentum, then settles onto the flight path.
 * f(u) = mix(u², 1 − (1 − u)², u): ease-in near the sand, ease-out toward the axis.
 */
export function launchEase(p: number): number {
  const u = clamp01((p - LAUNCH.start) / LAUNCH.length)
  const easeIn = u * u
  const easeOut = 1 - (1 - u) * (1 - u)
  return easeIn + (easeOut - easeIn) * u
}

/**
 * How far the key has laid down: 0 upright, 1 flat. It shares the launch's window but NOT its curve. The
 * launch eases out hard, so its last tenth covers barely two degrees: the key looks flat long before it has
 * stopped turning. The screen word is asked to wake a little BEFORE the pose is reached, and that is only
 * something the reader can see if the key is still visibly turning at that moment. This curve eases in and
 * then arrives at a steadier rate, and it still reaches exactly 1 at the stop, so the pose lands on time.
 */
export function layEase(p: number): number {
  const u = clamp01((p - LAUNCH.start) / LAUNCH.length)
  return Math.pow(u, 1.4)
}

export function heroPhase(p: number) {
  const t2 = smoothstep(PHASE.flightStart, PHASE.climbEnd, p)
  const t3 = smoothstep(PHASE.morphEnd, 1, p)
  const morph = smoothstep(PHASE.morphStart, PHASE.morphEnd, p)
  return {
    t2,
    t3,
    morph,
    /** Propeller turns done so far (0 → ROLL_TURNS). */
    turns: rollTurns(p),
    camY: lerp(HERO_CAM.yStart, HERO_CAM.yEnd, t2),
    rotX: lerp(HERO_CAM.rotXStart, HERO_CAM.rotXEnd, t2),
  }
}

/** Opacity of the CSS night layer: ease-in (power2.in in GSAP), so dusk lingers before the sky goes dark. */
export const nightLinear = (p: number) => {
  const t = clamp01((p - PHASE.night[0]) / (PHASE.night[1] - PHASE.night[0]))
  return t * t
}

/** Where the infinite ground plane's horizon sits on screen (0 = top, 1 = bottom) for a camera tilted up by rotX. */
export function horizonFraction(rotX: number, fovDeg = HERO_CAM.fovDeg) {
  return 0.5 + (0.5 * Math.tan(rotX)) / Math.tan((fovDeg / 2) * (Math.PI / 180))
}

/** The CSS sky's peach line is drawn at this fraction when the hero loads (rotX at start). */
export const SKY_HORIZON_AT_REST = horizonFraction(HERO_CAM.rotXStart)

/** How far (in viewport fractions) the sky layer is translated down for a given progress. */
export const skyShift = (p: number) => horizonFraction(heroPhase(p).rotX) - SKY_HORIZON_AT_REST


/* ───────────────────────────── Segments, axes and the readable pose ───────────────────────────── */

/**
 * Which flight segment the playhead is in, and how far through it.
 *
 * A whole number of turns about ANY axis is the identity rotation, so a segment that completes its turns lands
 * the device exactly back on the readable pose: screen to camera, text horizontal, no residual angle. That is
 * why every segment carries a whole `turns` count and why the axis may change between segments without ever
 * changing mid movement.
 */
/**
 * The segment the player says it is flying, measured from where the drift actually left the playhead.
 *
 * This is the difference between "the sequence has resumed" and "the key has started moving". `segmentAt`
 * places a segment between two fixed points of the timeline; if the playhead is anywhere inside the previous
 * stop's drift window when the reader scrolls, that function still reports the stop, parked, and the key does
 * not move until the window has been crossed. Measured from where the playhead IS, the turn begins on the
 * very next frame, and the leftover window is absorbed into the segment instead of preceding it.
 */
export function flyingSegment(index: number, from: number, p: number) {
  const last = STOPS[STOPS.length - 1]
  const stop = index < STOPS.length ? STOPS[index] : last
  const end = index < STOPS.length ? stop.at : 1
  const span = Math.max(1e-6, end - from)
  return { index, stop, u: clamp01((p - from) / span), parked: false }
}

export function segmentAt(p: number) {
  for (let i = 0; i < STOPS.length; i++) {
    const st = STOPS[i]
    if (p < st.at) return { index: i, stop: st, u: clamp01((p - st.from) / (st.at - st.from)), parked: false }
    if (p <= st.driftTo) return { index: i, stop: st, u: 1, parked: true }
  }
  const last = STOPS[STOPS.length - 1]
  return { index: STOPS.length, stop: last, u: clamp01((p - last.driftTo) / (1 - last.driftTo)), parked: false }
}

/**
 * How a segment's rotation is paced, from one stop to the next.
 *
 * It used to be a pure smootherstep. Its velocity at u = 0 is exactly zero and stays near zero for the first
 * tenth of the segment, which measured as 0.20 to 0.28 nominal seconds between a scroll and the first frame
 * whose device had moved by as much as two pixels. The player unlocked in 0 ms and the playhead advanced on
 * the very next frame, but what the playhead drives was multiplied by an ease still worth almost nothing, so
 * the scroll read as ignored.
 *
 * A third of an ease-out cubic is blended in. It leaves at a real speed, so the frame after the scroll
 * already moves, and BOTH terms still reach zero velocity at u = 1, so the device is not stopped dead on its
 * pose. Both are 0 at 0 and 1 at 1, so the whole-turn identity the segments rely on is untouched.
 */
const SEGMENT_LEAD = 0.35
export const segmentEase = (u: number) => {
  const smooth = u * u * u * (u * (u * 6 - 15) + 10)
  const out = 1 - (1 - u) * (1 - u) * (1 - u)
  return SEGMENT_LEAD * out + (1 - SEGMENT_LEAD) * smooth
}

/**
 * How "parked" the sequence is, 0 in full flight and 1 sitting at a stop. Drives the camera pull in, so the
 * screen word is readable while the sequence waits and the camera goes back to flight distance when it resumes.
 */
export function settleAt(p: number): number {
  const seg = segmentAt(p)
  if (seg.index >= STOPS.length) return 0
  if (seg.parked) return 1
  const span = seg.stop.at - seg.stop.from
  const inTail = clamp01((p - (seg.stop.at - span * 0.34)) / (span * 0.34))
  const prev = seg.index > 0 ? STOPS[seg.index - 1] : null
  const outHead = prev ? 1 - clamp01((p - prev.driftTo) / (span * 0.3)) : 0
  return Math.max(inTail * inTail * (3 - 2 * inTail), outHead)
}

/**
 * How far into the slow regime the word lights up, expressed in progress. The order is strict: the slow motion
 * has to be established first, then the screen wakes. During the slow regime real time maps to progress at
 * SLOW_RATE, so the delay converts once here.
 */
const WORD_LEAD_P = secondsToProgress(WORD_LEAD_SECONDS)

/**
 * The word the screen reads at progress p. It lights BEFORE the stop, not after it: the key is still turning
 * into its readable pose when the word wakes, so the reader sees the screen come on and the device settle,
 * rather than a device that has already arrived and then lights up. The lead sits inside the deceleration
 * ramp, so the slow motion is established first and the word follows.
 */
export function screenWordAt(p: number, rest: string, landed: string, target: number): string {
  if (p >= PHASE.morphStart) return landed
  /*
   * The word belongs to the stop the sequence is going TO, and to nothing else.
   *
   * It used to be looked up by position alone, which returned the word of the last stop reached. The moment
   * the reader scrolled on, the playhead was still inside that stop's drift window for a few hundred
   * milliseconds, so the panel lit the title they had just finished reading back up before going dark:
   * measured at five samples, about six tenths of a second, of the outgoing title reappearing. Asked which
   * stop it is flying to, there is no window in which the answer is the one behind it.
   */
  if (target < 0 || target >= STOPS.length) return ''
  if (p >= STOPS[target].at - WORD_LEAD_P) return STOPS[target].word
  /* Before the first title has ever been due, the screen carries its standing instruction. */
  return target === 0 ? rest : ''
}
