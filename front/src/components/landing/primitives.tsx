/**
 * The pieces the three landing directions share. Every one maps to an entry in DESIGN.md's `components:`.
 * No hex anywhere: colours and type come from the classes in src/styles/tokens.css.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { HotTitle } from './content'
import { prefersReducedMotion } from '../../motion/flags'

/** A landing band on a rung of the surface ladder. `lift` 0 is the bare canvas; 1, 2, 3 climb the ladder. */
export function Band({ id, label, lift = 0, children, className = '', full = false }: { id: string; label: string; lift?: 0 | 1 | 2 | 3; children: ReactNode; className?: string; full?: boolean }) {
  return (
    <section id={id} aria-label={label} className={`band band--lift-${lift} ${className}`}>
      <div className={`glass ${full ? 'glass--wide' : 'mx-auto max-w-[1200px]'}`}>{children}</div>
    </section>
  )
}

/** A lifted panel inside a band, Linear's way: one rung up, a hairline, 16 px corners, no shadow. */
export function Panel({ lift = 1, children, className = '' }: { lift?: 1 | 2 | 3; children: ReactNode; className?: string }) {
  return <div className={`panel panel--lift-${lift} ${className}`}>{children}</div>
}

/** Section title, sentence case, negative tracking. `data-split` marks it for the word reveal. */
export function Title({ children, size = 'lg', className = '' }: { children: ReactNode; size?: 'xl' | 'lg' | 'md'; className?: string }) {
  return <h2 data-split className={`t-title-${size} m-0 text-page-text ${className}`}>{children}</h2>
}

/** The part of a title that stays incandescent once the rest has cooled: where the eye lands. */
export function Hot({ children }: { children: ReactNode }) {
  return <span data-hot className="hot">{children}</span>
}
/** A title in three parts, the middle one hot (content.ts HotTitle). */
export function hotTitle([before, hot, after]: HotTitle): ReactNode {
  return (
    <>
      {before}
      <Hot>{hot}</Hot>
      {after}
    </>
  )
}

/**
 * The section in one line, read before anything else: mono, incandescent, an ember before it. Its figures are
 * UPDATE.md's. For a jury with a minute per section, this is the minute.
 */
export function Takeaway({ children }: { children: ReactNode }) {
  return (
    <p className="takeaway t-kicker" data-takeaway>
      <span className="takeaway__ember" aria-hidden />
      {children}
    </p>
  )
}

/** The small mono label above a block. Rationed: at most one per three sections. */
export function Kicker({ children }: { children: ReactNode }) {
  return <p className="t-kicker m-0 mb-4 text-page-text-faint">{children}</p>
}

/** Where a figure comes from. Every number on the landing is quoted from UPDATE.md by section, and says so. */
export function Source({ children }: { children: ReactNode }) {
  return <p className="t-caption mt-8 text-page-text-faint">{children}</p>
}

/**
 * exit-pair — THE figure. The entry on the left, the exit on the right, one baseline, a 1px accent rule between
 * them; the exit carries the weight. `data-figure` on the exit lets the motion write it.
 */
export function ExitPair({ entry, exit, unit, entryUnit = unit, entryLabel, exitLabel, figureRef }: { entry: string; exit: string; unit: string; entryUnit?: string; entryLabel: string; exitLabel: string; figureRef?: React.Ref<HTMLSpanElement> }) {
  return (
    <div className="exit-pair">
      <div className="exit-pair__side">
        <span className="t-kicker text-page-text-mute">{entryLabel}</span>
        <span className="exit-pair__entry t-mono-data-lg text-page-text">
          {entry}{entryUnit ? <> <span className="t-kicker text-page-text-faint">{entryUnit}</span></> : null}
        </span>
      </div>
      <span className="exit-pair__rule" aria-hidden />
      <div className="exit-pair__side">
        <span className="t-kicker text-page-text-mute">{exitLabel}</span>
        <span className="exit-pair__exit t-numeral-hero text-page-text">
          <Figure value={exit} attr="data-figure" figureRef={figureRef} /> <span className="exit-pair__unit t-kicker text-page-text-faint">{unit}</span>
        </span>
      </div>
    </div>
  )
}

/** device-screen-mirror — exactly the fields the device shows, in the device order. Values keep their case. */
export function DeviceMirror({ title, lines, caption, className = '', hot }: { title: string; lines: ReadonlyArray<readonly [string, string]>; caption?: ReactNode; className?: string; hot?: string }) {
  return (
    <figure className={`m-0 ${className}`}>
      <div className="mirror t-mono-device" role="img" aria-label={`${title}: ${lines.map(([k, v]) => `${k} ${v}`).join(', ')}`}>
        <div className="mirror__title">{title}</div>
        <div className="mirror__lines">
          {lines.map(([k, v]) => (
            <Fragment key={k}>
              <span className="mirror__key" data-mirror-line>{k}</span>
              <span className={`mirror__value${v === 'not returned' ? ' mirror__missing' : ''}${k === hot ? ' mirror__hot' : ''}`} data-mirror-line>{v}</span>
            </Fragment>
          ))}
        </div>
      </div>
      {caption ? <figcaption className="t-kicker mt-3 text-page-text-faint">{caption}</figcaption> : null}
    </figure>
  )
}

/** badge-state — text and a 1px border in the state colour, no fill. */
export function Badge({ tone, children }: { tone: 'success' | 'warning' | 'error' | 'info'; children: ReactNode }) {
  return <span className={`badge badge--${tone} t-kicker`}>{children}</span>
}

/** The highlight inside a note: weight 500, the accent, never broken across a line. */
export function Mark({ children }: { children: ReactNode }) {
  return <b className="screen-note__mark">{children}</b>
}

/** A note: the humanist face, a left accent rule. The hairline elbow belongs to the hero; here the rule suffices. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="note t-note">{children}</p>
}

/** timeline-run — the sequence as evidence: a vertical hairline, a dot per step, label + duration + outcome. */
/**
 * A figure that fills. Two copies of the number: the base in the page's cream, and over it the same number in the
 * incandescent, masked from the bottom up to `--fill` with a wave at the surface (public/wave-mask.svg). The
 * motion writes both copies, the fill and the slosh (motion/landing.ts writeFigure). Without motion, it is full.
 */
export function Figure({ value, attr, figureRef }: { value: string; attr: 'data-figure' | 'data-clock'; figureRef?: React.Ref<HTMLSpanElement> }) {
  const marker = { [attr]: '' }
  return (
    <span ref={figureRef} className="liquid" {...marker}>
      <span data-text>{value}</span>
      <span className="liquid__fill" data-text aria-hidden>{value}</span>
    </span>
  )
}

/** A definition list of figures: label left, value right, tabular, hairlines. */
export function Stats({ rows }: { rows: ReadonlyArray<readonly [string, string, string]> }) {
  return (
    <dl className="stats">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="stats__row" data-row>
          <dt>{k}</dt>
          <dd className={tone === 'hot' ? 'text-hot' : tone ? `text-state-${tone}` : ''}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The three bricks with four doors each: pointer, tap, keyboard focus, and patience (the first opens on its own
 * after 4.5 s in view). The detail is never hover-only.
 */
export function Bricks({ items }: { items: ReadonlyArray<{ name: string; version: string; role: string; line: string; without: string }> }) {
  const [open, setOpen] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || prefersReducedMotion()) return
    let timer: number | null = null
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && timer === null) timer = window.setTimeout(() => setOpen((v) => (v === null ? 0 : v)), 4500)
        if (!e.isIntersecting && timer !== null) { window.clearTimeout(timer); timer = null }
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); if (timer !== null) window.clearTimeout(timer) }
  }, [])
  return (
    <div ref={root} className="bricks">
      {items.map((b, i) => {
        const isOpen = open === i
        return (
          <div key={b.name} className="bricks__row" data-row>
            <button
              type="button"
              className="bricks__head"
              aria-expanded={isOpen}
              aria-controls={`brick-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(i) }}
              onFocus={() => setOpen(i)}
            >
              <span className="t-title-md text-page-text">{b.name}</span>
              <span className="t-kicker text-page-text-mute">{b.version}</span>
              <span className="t-kicker text-page-text">{b.role}</span>
            </button>
            <div id={`brick-${i}`} className="bricks__body" hidden={!isOpen}>
              <p className="t-body-md m-0 max-w-[62ch] text-pretty text-page-text">{b.line}</p>
              <p className="t-body-md m-0 mt-2 max-w-[62ch] text-pretty text-page-text-mute">{b.without}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
