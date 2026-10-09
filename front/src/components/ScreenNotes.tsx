/**
 * The descriptions that hang off the words on the key's screen, and the hairlines that tie them together.
 *
 * Shape, after igloo.inc's annotations: a thin line leaves the device, runs to a block of text, and carries a
 * tick at each end so a bare hairline does not read as a stray artefact. It is never there all at once. It
 * draws itself from the key toward the text, and the text follows it.
 *
 * Two routes, because the two notes sit in different places:
 *   under-key   a right angle. Straight down from the bottom of the device, then a short run sideways.
 *   top-left    a single diagonal. It leaves the device's TOP-LEFT corner heading up and to the left, which
 *               is the one direction from that corner that cannot cross the device whatever pose it is in.
 *
 * The hotspot over the word is a real <button>. That is the whole accessibility strategy in one decision: a
 * button is hoverable, tappable, focusable and in the tab order for free, so pointer, touch and keyboard are
 * the same code path rather than three special cases. The fourth door is a timer, so nobody is ever stuck.
 *
 * Everything follows the key through CSS custom properties written by the scene from useFrame. This component
 * renders once per reveal, never once per frame.
 */
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { COUNT_SECONDS, IDLE_REVEAL_SECONDS, LINE_DRAW_SECONDS, NOTES, type NotePlacement, type NotesState } from '../motion/context-note'
import { prefersReducedMotion } from '../motion/flags'

/**
 * A sentence, as a list of pieces. A piece is either plain text or a highlight, and a highlight may carry a
 * figure that rolls up to its value on arrival. Highlights never break across a line.
 */
type Piece =
  | { t: string }
  | { mark: string; roll?: { from: string; to: number; decimals: number; pad: number } }

/*
 * One register for every highlight, and it is the accent: `--color-sky-orange`, the single chromatic accent
 * DESIGN.md names. The second register (the incandescent stop, for announcements and positive values) was
 * used by the third note and is gone at the author's request. Whatever the argument for two registers, one
 * accent per page is the rule the rest of the project follows, and three descriptions that answer each other
 * should answer in the same colour.
 */
type NoteCopy = { pieces: Piece[] }

export const NOTE_COPY: Record<number, NoteCopy> = {
  0: {
    pieces: [
      { t: 'In ' },
      { mark: 'July', roll: { from: '0000', to: 2026, decimals: 0, pad: 4 } },
      { t: ', LEDGER ships its ' },
      { mark: 'Agent Stack' },
      { t: ': AI agents now act with your funds.' },
    ],
  },
  1: {
    pieces: [
      { t: 'Its policies cap what an agent spends. Nothing caps what it can get back out: some positions cost nothing to enter and everything to leave.' },
    ],
  },
  2: {
    pieces: [
      { t: 'Sign ' },
      { mark: 'one exit rule' },
      { t: ' on your Ledger. A contract ' },
      { mark: 'enforces it on every position' },
      { t: ' your agents take.' },
    ],
  },
}

/** The plain sentences, for each hotspot's accessible name. */
export const NOTE_SENTENCE: Record<number, string> = {
  0: 'In July 2026, LEDGER ships its Agent Stack: AI agents now act with your funds.',
  1: 'Its policies cap what an agent spends. Nothing caps what it can get back out: some positions cost nothing to enter and everything to leave.',
  2: 'Sign one exit rule on your Ledger. A contract enforces it on every position your agents take.',
}

export function ScreenNotes({ notes }: { notes: NotesState }) {
  return (
    <>
      {NOTES.map((n) => (
        <Note key={n.stop} notes={notes} stop={n.stop} placement={n.placement} />
      ))}
    </>
  )
}

function Note({ notes, stop, placement }: { notes: NotesState; stop: number; placement: NotePlacement }) {
  const [shown, setShown] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<number | null>(null)
  const done = useRef(false)

  const reveal = (by: NotesState['by'][number]) => {
    if (done.current) return
    done.current = true
    notes.revealed[stop] = true
    notes.by[stop] = by
    setShown(true)
  }

  /*
   * The patience door. It only arms while the sequence is parked at THIS stop, and it is cleared as soon as
   * the note opens by any other door, so it can never fire over an already-open note.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (done.current || notes.armed !== stop || idleTimer.current !== null) return
      idleTimer.current = window.setTimeout(() => reveal('idle'), IDLE_REVEAL_SECONDS * 1000)
    }, 250)
    return () => {
      window.clearInterval(id)
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    }
  }, [notes, stop])

  // The draw and the counters, once, on reveal.
  useEffect(() => {
    if (!shown || !root.current) return
    const el = root.current
    const reduced = prefersReducedMotion()
    const line = el.querySelector<HTMLElement>('[data-note-line]')
    const run = el.querySelector<HTMLElement>('[data-note-run]')
    const text = el.querySelector<HTMLElement>('[data-note-text]')
    const ticks = el.querySelectorAll<HTMLElement>('[data-note-tick]')
    const tweens: gsap.core.Tween[] = []

    /*
     * The draw tweens a single custom property, not `transform`. GSAP rebuilds the whole transform from its
     * own cache, which would drop the bearing CSS puts on the diagonal and leave it lying flat; handing it a
     * scalar keeps the geometry in the stylesheet where the key's position already lives.
     */
    // The word on the key swaps and the scroll unlocks the moment the text is THERE, not the moment a door
    // was used: what the reader is told to do next has to arrive with something to read, not before it.
    const present = () => {
      notes.presented[stop] = true
    }
    if (reduced) {
      for (const n of [line, run]) if (n) gsap.set(n, { '--n-draw': 1, '--n-draw-run': 1, opacity: 1 })
      for (const n of [text, ...Array.from(ticks)]) if (n) gsap.set(n, { opacity: 1 })
      present()
    } else {
      const firstLeg = run ? LINE_DRAW_SECONDS * 0.62 : LINE_DRAW_SECONDS
      // The elbow draws down then across; the diagonal is one stroke, so it gets the whole budget.
      if (line) tweens.push(gsap.fromTo(line, { '--n-draw': 0 }, { '--n-draw': 1, duration: firstLeg, ease: 'power2.inOut' }))
      if (run) tweens.push(gsap.fromTo(run, { '--n-draw-run': 0 }, { '--n-draw-run': 1, duration: LINE_DRAW_SECONDS * 0.38, ease: 'power2.out', delay: firstLeg }))
      if (ticks.length) tweens.push(gsap.fromTo(ticks, { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: firstLeg }))
      if (text) {
        tweens.push(
          gsap.fromTo(
            text,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', delay: LINE_DRAW_SECONDS * 0.8, onComplete: present },
          ),
        )
      } else {
        present()
      }
    }

    el.querySelectorAll<HTMLElement>('[data-count]').forEach((node) => {
      const to = Number(node.dataset.to)
      const decimals = Number(node.dataset.decimals ?? 0)
      const pad = Number(node.dataset.pad ?? 0)
      const write = (v: number) => {
        const t = v.toFixed(decimals)
        node.textContent = pad > 0 ? t.padStart(pad, '0') : t
      }
      if (reduced) {
        write(to)
        return
      }
      const box = { v: 0 }
      write(0)
      tweens.push(
        gsap.to(box, {
          v: to,
          duration: COUNT_SECONDS,
          ease: 'power3.out',
          delay: LINE_DRAW_SECONDS * 0.8,
          onUpdate: () => write(box.v),
          onComplete: () => write(to),
        }),
      )
    })
    return () => tweens.forEach((t) => t.kill())
  }, [shown])

  const copy = NOTE_COPY[stop]
  const id = `screen-note-${stop}`

  return (
    <div
      ref={root}
      className="screen-note-layer"
      data-note-stop={stop}
      data-placement={placement}
      data-shown={shown ? 'true' : 'false'}
    >
      {/*
        The hotspot sits over the word on the device's screen. Its accessible name carries the whole sentence,
        so assistive tech gets the content from the control itself and never depends on the reveal having run.
        Hovering it also lifts the screen's own brightness, which is the affordance: the signal, before any
        description exists, that something can be done here.
      */}
      <button
        type="button"
        className="screen-note__hotspot"
        data-note-hotspot
        aria-expanded={shown}
        aria-controls={id}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          notes.hover = true
          reveal('pointer')
        }}
        onPointerLeave={() => {
          notes.hover = false
        }}
        onFocus={() => {
          notes.hover = true
          reveal('keyboard')
        }}
        onBlur={() => {
          notes.hover = false
        }}
        onClick={() => reveal('touch')}
      >
        <span className="sr-only">{NOTE_SENTENCE[stop]}</span>
      </button>

      <span className="screen-note__tick screen-note__tick--start" data-note-tick aria-hidden />
      <span className="screen-note__line" data-note-line aria-hidden />
      {/* Both notes are elbows now: a first leg off the device, then a second one to the text. */}
      <span className="screen-note__run" data-note-run aria-hidden />
      <span className="screen-note__tick screen-note__tick--end" data-note-tick aria-hidden />

      <p className="screen-note__text" id={id} data-note-text>
        {copy.pieces.map((piece, i) =>
          't' in piece ? (
            <span key={i}>{piece.t}</span>
          ) : (
            <span key={i} className="screen-note__mark">
              {piece.mark}
              {piece.roll ? (
                <>
                  &nbsp;
                  <span
                    data-count
                    data-to={piece.roll.to}
                    data-decimals={piece.roll.decimals}
                    data-pad={piece.roll.pad}
                    className="screen-note__value"
                  >
                    {piece.roll.from}
                  </span>
                </>
              ) : null}
            </span>
          ),
        )}
      </p>
    </div>
  )
}
