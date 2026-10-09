/**
 * The product components of DESIGN.md, as React. Nothing here decides a colour or a size: classes come from
 * tokens.css (Florent's tiers and .btn-ghost) and app.css (the component frontmatter).
 */
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useBench } from './useBench'

/** A band of the page: eyebrow, uppercase display title, lead, then its content. One idea per band. */
export function Band({
  id, index, eyebrow, title, lead, children,
}: { id?: string; index?: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section id={id} className="app-band">
      <div className="app-column">
        <p className="t-micro-cap eyebrow m-0">{index ? `${index} — ` : ''}{eyebrow}</p>
        <h2 className="t-display-xl m-0 mt-2 max-w-[24ch] text-balance text-text-050">{title}</h2>
        {lead ? <p className="t-body-lg mt-6 max-w-[58ch] text-pretty text-on-primary-mute">{lead}</p> : null}
        {children ? <div className="mt-12">{children}</div> : null}
      </div>
    </section>
  )
}

export function Panel({
  title, kicker, pending, raised, children, className = '',
}: { title?: ReactNode; kicker?: ReactNode; pending?: boolean; raised?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`panel ${raised ? 'panel--raised' : ''} ${pending ? 'panel--pending' : ''} ${className}`}>
      {kicker ? <p className="t-micro-cap eyebrow m-0">{kicker}</p> : null}
      {title ? <h3 className="t-display-lg m-0 text-text-050" style={{ fontSize: 32, lineHeight: 1.15 }}>{title}</h3> : null}
      <div className={title || kicker ? 'mt-5' : ''}>{children}</div>
    </div>
  )
}

/** device-screen-mirror: exactly the fields the device shows, in the device's order, one per line. */
export function Mirror({ lines, pending, caption }: { lines: [string, ReactNode][]; pending?: boolean; caption?: ReactNode }) {
  return (
    <div>
      <p className="t-micro-cap eyebrow m-0 mb-3">Ce que l’appareil affiche</p>
      <div className={`mirror t-mono-device ${pending ? 'mirror--pending' : ''}`}>
        {lines.map(([label, value], i) => (
          <div className="mirror__line" key={i}>
            <span className="mirror__label">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
      {caption ? <p className="t-micro-cap eyebrow m-0 mt-3">{caption}</p> : null}
    </div>
  )
}

export function Row({ label, value, keyFigure }: { label: ReactNode; value: ReactNode; keyFigure?: boolean }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className={`row__value ${keyFigure ? 'row__value--key' : ''}`}>{value}</span>
    </div>
  )
}

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'mute'
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge is-${tone}`}>{children}</span>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { quiet?: boolean; small?: boolean }

/** button-ghost-on-dark: the universal action. */
export function Ghost({ quiet, small, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn-ghost t-button-cap ${quiet ? 'btn-ghost--quiet' : ''} ${small ? 'btn-ghost--small' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** button-sign-on-device: the only filled button of the system, once per flow. */
export function SignOnDevice({ children = 'Signer sur Ledger', className = '', ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn-sign t-button-cap ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Field({
  label, hint, ...rest
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="t-micro-cap field-label">{label}</label>
      <input id={id} className="field" {...rest} />
      {hint ? <p className="t-caption m-0 mt-1 is-faint">{hint}</p> : null}
    </div>
  )
}

export function Select({
  label, children, ...rest
}: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="t-micro-cap field-label">{label}</label>
      <select id={id} className="field" {...rest}>{children}</select>
    </div>
  )
}

/** Two segments, the active one underlined in the accent (DESIGN.md › order-ticket). */
export function Segments<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="segment" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** anchored-note: a sentence attached to the thing above it by a one-turn accent hairline. */
export function AnchoredNote({ children }: { children: ReactNode }) {
  return (
    <div className="anchored mt-2">
      <span className="anchored__dot anchored__dot--from" aria-hidden />
      <span className="anchored__dot anchored__dot--to" aria-hidden />
      <p className="t-note m-0">{children}</p>
    </div>
  )
}

/** Empty state: a sentence plus one ghost action. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <p className="t-body-md m-0 max-w-[52ch] text-on-primary-mute">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div aria-busy="true">{Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}</div>
}

/** Messages from the bench and from the device. Text and a hairline; a click dismisses. */
export function Toasts() {
  const { toasts, dismiss, deviceHint } = useBench()
  return (
    <>
      {deviceHint ? <div className="device-hint t-mono-device blink-in" role="status">{deviceHint}</div> : null}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} type="button" className={`toast t-body-sm blink-in is-${t.tone}`} onClick={() => dismiss(t.id)}>
            <span className="text-text-050">{t.text}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export const time = (ts?: number | null) => (ts ? new Date(ts * 1000).toLocaleTimeString('fr-FR') : '—')
export const dateTime = (ts?: number | null) => (ts ? new Date(ts * 1000).toLocaleString('fr-FR') : '—')
export const duration = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`)
