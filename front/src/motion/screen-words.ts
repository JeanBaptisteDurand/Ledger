/**
 * The narrative now lives on the device's own screen: one word of command per step, rendered into the screen
 * texture (bitmap pixels on the Nano X OLED, matte ink on the landed device). This module is the single source
 * of that sequence, and the stop structure of the player is derived from it.
 *
 * The word changes ON RESUME, never during a stop: a stop shows one word, still, until the reader scrolls.
 */
export type ScreenStep = {
  /**
   * Working scope. Only enabled steps are played; the others stay here, fully described, and come back by
   * flipping this flag. Nothing about them is deleted.
   */
  enabled: boolean
  /** What the screen reads while the sequence waits here. */
  word: string
  /**
   * The rotation axis the flight segment LEADING to this stop turns about, in camera space.
   * Each segment keeps one axis and completes a whole number of turns on it, so the change of axis happens at a
   * stop and never mid-movement.
   */
  axis: 'roll' | 'yaw' | 'pitch'
  /** Whole turns that segment completes about its axis. */
  turns: number
  /** Nominal seconds of that flight segment. */
  seconds: number
  /**
   * How much of the frame height the device fills at this stop. The Nano X screen is 31.8 x 13.9 mm: a word only
   * reads if the device is brought close, so each stop pulls the camera in and the flight puts it back. Two
   * consecutive stops that share a value mean no camera move between them.
   */
  fill: number
  /**
   * How far the key stands up from flat at this stop, in degrees. 0 lays it across the frame, which is where
   * its screen reads dead level. Above that the device stands more upright and its word tilts with it, so the
   * value is bounded by what stays readable without turning your head: past about 25 degrees it stops being a
   * pose and becomes a demand on the reader.
   */
  standDeg: number
}

/** At rest, before the first scroll. */
export const REST_WORD = 'SCROLL UP'
/** On the landed device, after the morph. */
export const LANDED_WORD = 'MONOLITH'

/*
 * The arc is context, problem, response, and the words come from UPDATE.md: what is bounded today, what nobody
 * bounds, what we add.
 *
 * ALL THREE MUST RENDER AT ONE SIZE, and that is a measurement, not a hope. The OLED fits each word on its own,
 * from 26 px down, so length decides size. The previous set broke this: OUR SOLUTION fell to 21 px against 26
 * for the other two. Measured with the panel's own fitter (Barlow Condensed 700, 112 px available):
 *   SPENDING 92.2 px · THE EXIT 83.0 px · THE RULE 88.3 px — all at 26 px.
 * Any replacement word is measured the same way before it is adopted. THE MANDATE (22 px) was rejected for it.
 */
const ALL_STEPS: ReadonlyArray<ScreenStep> = [
  { enabled: true, word: 'SPENDING', axis: 'roll', turns: 1, seconds: 1.9, fill: 0.72, standDeg: 0 },
  // Same fill as the first stop, so the camera does not move between them: only the key does.
  { enabled: true, word: 'THE EXIT', axis: 'yaw', turns: 1, seconds: 1.9, fill: 0.72, standDeg: 18 },
  { enabled: false, word: 'SOLUTION', axis: 'pitch', turns: 1, seconds: 1.5, fill: 0.78, standDeg: 0 },
  /*
   * The third stop. Same fill again, so the camera still does not move between stops. The key comes back
   * toward level here: flat at SPENDING, standing 18 degrees at THE EXIT where the narrative is at its most
   * uncomfortable, and settling to 9 at the response.
   */
  { enabled: true, word: 'THE RULE', axis: 'pitch', turns: 1, seconds: 1.9, fill: 0.72, standDeg: 9 },
]

/** The steps actually played in this scope. */
export const SCREEN_STEPS: ReadonlyArray<ScreenStep> = ALL_STEPS.filter((s) => s.enabled)
/** Every step, enabled or not, for the documentation and the poster. */
export const ALL_SCREEN_STEPS = ALL_STEPS

/** The words in order, for the DOM mirror that assistive tech reads. */
export const SCREEN_WORD_SEQUENCE: ReadonlyArray<string> = [REST_WORD, ...SCREEN_STEPS.map((s) => s.word), LANDED_WORD]

/**
 * The slow regime that replaces the old hard stop. When the takeoff is over the sequence does NOT freeze: the
 * key keeps climbing at a fraction of nominal speed so the reader is never caught by an abrupt halt, and the
 * screen word only lights up once that slow motion is established.
 */
export const SLOW_RATE = 0.075
/**
 * The deceleration ramp: how long before a stop the playhead starts easing from nominal speed down to the hold
 * rate. This is the slow motion the key goes into. It begins only once the horizon title has left the frame,
 * which is what fixes the length of the takeoff phase (hero-math.ts: PRE_TEXT_SECONDS, CLIMB_END_SHARE).
 */
export const DECEL_SECONDS = 1.0
/**
 * How far BEFORE the stop the word lights up, in nominal seconds. It is a lead, not a delay: the key must
 * still be turning into its readable pose when the screen wakes, not already arrived. The lead sits inside
 * the deceleration ramp above, so the order is strict: slow motion first, word second, pose last.
 *
 * The value is not free. The launch curve is a smootherstep, so its last tenth covers almost no rotation: a
 * 0.45 s lead left the key 2.2 degrees short of horizontal when the word lit, which reads as already arrived.
 * At 0.69 s it is 5 degrees short, which is a visible tilt still closing.
 */
export const WORD_LEAD_SECONDS = 0.69
/**
 * The word comes on like a device screen waking: short irregular pulses, then steady. No fade. Pairs are
 * [start, end] in seconds from the moment the word is due.
 */
export const WORD_BLINK: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.05],
  [0.13, 0.17],
  [0.31, 0.42],
]
/** Steady from here on. */
export const WORD_BLINK_END = 0.52

/**
 * And how it goes OUT, when the key finally tears free and the resting instruction has been obeyed. Same
 * idea in reverse: a panel losing its driver, not a fade. Two short survivals and one last flicker, then
 * nothing until the first title.
 */
export const WORD_BLINK_OUT: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.07],
  [0.12, 0.16],
  [0.26, 0.29],
]
/** Dark from here on. */
export const WORD_BLINK_OUT_END = 0.4

/**
 * The acknowledgement, when the reader asks for a description.
 *
 * Same grammar as the other two patterns on this panel and for the same reason: a device does not fade, it
 * survives or it does not. Three short survivals, then steady — and the panel then holds the title at full
 * white for as long as it is the one being read.
 */
export const ACTIVE_BLINK: ReadonlyArray<readonly [number, number]> = [
  [0, 0.05],
  [0.11, 0.17],
  [0.25, 0.34],
]
export const ACTIVE_BLINK_END = 0.44
