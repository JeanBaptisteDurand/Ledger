/**
 * The notes that hang off the words on the key's screen.
 *
 * A description that only exists on hover is a trap: no hover on touch, nothing for a keyboard, and nothing
 * at all for a reader who does not think to point at a word on a 3D object. So every note has FOUR doors, and
 * the sequence is held at its stop until one of them has been opened:
 *
 *   pointer   the hotspot over the word is hovered
 *   touch     the hotspot is tapped (it is a real <button>, so this is a click)
 *   keyboard  the hotspot is focused (it is in the tab order, and focus alone reveals)
 *   patience  nothing happened for IDLE_REVEAL_SECONDS, and it opens on its own
 *
 * WHAT HAPPENS AFTER a note opens is the important part. The scroll unlocks at that instant, with no timer,
 * and the word on the screen changes to the resting word. The change of word IS the signal that the sequence
 * can move on: the screen says what to do, rather than a delay that reads as a bug.
 *
 * The state is a plain object, not React state: the scene reads it from useFrame and the player reads it from
 * its ticker, and neither may cause a render.
 */

export type NoteDoor = 'pointer' | 'touch' | 'keyboard' | 'idle'

/** How a note is laid out, which also decides how its hairline is routed to the key. */
export type NotePlacement = 'under-key' | 'top-left' | 'right'

export type NoteSpec = {
  /** The stop this note hangs off. */
  stop: number
  placement: NotePlacement
}

/** Which stop carries which note. Stops absent from this list never hold the sequence. */
export const NOTES: ReadonlyArray<NoteSpec> = [
  { stop: 0, placement: 'under-key' },
  { stop: 1, placement: 'top-left' },
  { stop: 2, placement: 'right' },
]

/**
 * Where the second note's hairline ENDS, as a fraction of the hero. The scene needs it to compute the
 * bearing, CSS needs it to place the text, and CSS has no atan2, so the one number lives here and both
 * sides read it. It sits up and to the LEFT of where the key parks at that stop, which is the one direction
 * from the device's top-left corner that cannot cross the device whatever pose it is in.
 */
export const NOTE1_END = { x: 0.14, y: 0.22 }

/**
 * And where the third note's hairline ends. Same reasoning, mirrored: it leaves the device's RIGHTMOST
 * corner, runs out to the side clear of the body, then drops to the block of text that sits on the right.
 */
export const NOTE2_END = { x: 0.88, y: 0.74 }

/** How long the reader may do nothing before a note opens by itself. */
export const IDLE_REVEAL_SECONDS = 4.5
/** How long a connector takes to draw itself, in seconds. */
export const LINE_DRAW_SECONDS = 0.55
/** The counters roll for this long, decelerating onto their value. */
export const COUNT_SECONDS = 0.9

export type NotesState = {
  /** The stop the sequence is parked at with its word up and its note openable; -1 when none. */
  armed: number
  /** Opened, per stop index: a door was used and the line has started drawing. */
  revealed: boolean[]
  /**
   * PRESENTED, per stop index: the description is actually on screen, draw finished. This, not `revealed`,
   * is what swaps the word back to the resting instruction and unlocks the scroll, because the two must
   * happen at the moment the reader has something to read rather than at the moment they pointed at it.
   */
  presented: boolean[]
  /** Which door opened each one, for the report. */
  by: (NoteDoor | null)[]
  /**
   * The pointer or the keyboard focus is on the armed hotspot. The screen lifts as soon as this is true,
   * before the description exists: that lift is the affordance, the thing that says something is here.
   */
  hover: boolean
}

export function makeNotesState(stops: number): NotesState {
  return {
    armed: -1,
    revealed: Array(stops).fill(false),
    presented: Array(stops).fill(false),
    by: Array(stops).fill(null),
    hover: false,
  }
}

/** Does this stop hold the sequence until its note is read? */
export const stopHasNote = (stop: number) => NOTES.some((n) => n.stop === stop)
