/**
 * The run as a frieze. Time is the axis: one hairline across the stage, a tick every second and a label every
 * ten, a playhead that does not move while the whole track slides under it, and the steps hung from the axis
 * where they happen, each timed one spanning its own seconds on the line, with the seconds written on the
 * line. The clock over the playhead reads the seconds as the reader scrolls; a span fills with the
 * incandescent as the playhead crosses it, and the card it belongs to lights with it.
 *
 * Every second on a card is UPDATE.md's. The steps that were not timed there (the rounds, the reconnect) take
 * the run's unmeasured remainder between them for their WIDTH ONLY — a layout, not a figure: no number is
 * printed for them, no span is drawn, and their card is dashed. Below 768 px and without motion the track is
 * a column and the ticks are gone.
 *
 * The card is tied to its span by the seconds written on the axis and, while it is live, by its outline and
 * its stem lighting up together with the span's fill. A frame down to the axis and cards standing on the axis
 * with the width of their seconds were tried beside this; the author kept this one (2026-09-28).
 */
import { formatFigure } from '../../motion/landing'
import type { Step } from './content'
import { Figure } from './primitives'

/** How wide a second is on the axis. */
export const PX_PER_S = 26
/** Where the playhead stands across the stage. */
export const PLAYHEAD = 0.36
/** The track's lead-in before second 0, css px. */
export const TRACK_PAD = 40

export type LaidStep = Step & { start: number; end: number; seconds?: number }

const secondsOf = (s: Step): number | undefined => {
  const m = s.duration?.match(/^(\d+(?:\.\d+)?)\s*s$/)
  return m ? Number(m[1]) : undefined
}

export function layoutSteps(steps: Step[], total: number): LaidStep[] {
  const timed = steps.map(secondsOf)
  const measured = timed.reduce<number>((acc, s) => acc + (s ?? 0), 0)
  const untimed = timed.filter((s) => s === undefined).length
  const share = untimed ? Math.max(0, total - measured) / untimed : 0
  let t = 0
  return steps.map((s, i) => {
    const seconds = timed[i]
    const width = seconds ?? share
    const laid = { ...s, start: t, end: t + width, seconds }
    t += width
    return laid
  })
}

export function Frieze({ steps, total }: { steps: Step[]; total: number }) {
  const laid = layoutSteps(steps, total)
  const trackW = TRACK_PAD * 2 + total * PX_PER_S
  const ticks: number[] = []
  for (let s = 0; s <= total; s++) ticks.push(s)
  return (
    <div className="frieze__stage" data-stage-frieze>
      <div className="frieze__playhead" aria-hidden />
      <div className="frieze__track" data-track style={{ width: trackW }}>
        <div className="frieze__axis" aria-hidden />
        {ticks.map((s) => (
          <span key={s} className={s % 10 === 0 ? 'frieze__tick frieze__tick--major' : 'frieze__tick'} style={{ left: TRACK_PAD + s * PX_PER_S }} aria-hidden>
            {s % 10 === 0 && s > 0 ? <span className="frieze__tick-label t-kicker">{s} s</span> : null}
          </span>
        ))}
        {laid.map((s, i) => {
          const spanPx = (s.end - s.start) * PX_PER_S
          return (
            <article
              key={i}
              className={`frieze__step glass ${i % 2 ? 'frieze__step--down' : 'frieze__step--up'} ${s.seconds ? 'frieze__step--timed' : 'frieze__step--untimed'}`}
              style={{ left: TRACK_PAD + s.start * PX_PER_S, ['--span' as string]: `${spanPx}px` }}
              data-step
              data-i={i}
              data-start={s.start}
              data-end={s.end}
              data-state="ahead"
            >
              <p className="t-kicker m-0 text-page-text-faint">{String(i + 1).padStart(2, '0')}</p>
              <p className="t-title-md m-0 mt-2 text-page-text">{s.label}</p>
              {s.duration ? <p className="t-mono-data-lg m-0 mt-3 text-page-text">{s.duration}</p> : null}
              {s.outcome ? <p className={`t-mono-data m-0 mt-2 ${s.tone ? `text-state-${s.tone}` : 'text-page-text-mute'}`}>{s.outcome}</p> : null}
            </article>
          )
        })}
        {laid.map((s, i) =>
          s.seconds ? (
            <span key={`span-${i}`} className="frieze__span" style={{ left: TRACK_PAD + s.start * PX_PER_S, width: s.seconds * PX_PER_S }} data-span data-for={i} data-start={s.start} data-end={s.end} aria-hidden />
          ) : null,
        )}
        {laid.map((s, i) =>
          s.seconds ? (
            <span key={`label-${i}`} className={`frieze__label t-kicker ${i % 2 ? 'frieze__label--down' : 'frieze__label--up'}`} style={{ left: TRACK_PAD + s.start * PX_PER_S, width: s.seconds * PX_PER_S }} data-for={i} aria-hidden>
              {s.duration}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}

/** The clock over the playhead: the seconds, liquid, and the unit. */
export function FriezeClock({ alerts }: { alerts: number }) {
  return (
    <div className="frieze__clock">
      <p className="t-kicker m-0 text-page-text-faint">end to end, real browser</p>
      <p className="t-numeral-hero m-0 text-page-text">
        <Figure value={formatFigure(0)} attr="data-clock" /> <span className="t-title-md text-page-text-faint">s</span>
      </p>
      <p className="t-mono-data m-0 mt-1 text-page-text-mute">{alerts} alerts</p>
    </div>
  )
}
