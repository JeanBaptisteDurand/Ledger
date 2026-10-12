/**
 * The list shapes the explanation needs and the stages do not: a principle per row with its facts, a key beside
 * what it names, a step with its actor, a brick with its role. Hairlines only, nothing moves once there. The
 * classes live in tokens.css (rows, kv, steps, bricks-list).
 */
import { Kicker, Stats } from './primitives'
import type { Fact, Pair, Principle } from './content'

export function Rows({ rows }: { rows: readonly Principle[] }) {
  return (
    <ol className="rows mt-10" data-list>
      {rows.map((r, i) => (
        <li key={r.title} className="rows__row" data-row>
          <span className="t-kicker text-page-text-faint">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <Kicker>{r.kicker}</Kicker>
            <h3 className="t-title-md m-0 text-page-text">{r.title}</h3>
            <p className="t-body-md m-0 mt-3 max-w-[62ch] text-pretty text-page-text-mute">{r.text}</p>
          </div>
          <Stats rows={r.facts as readonly Fact[]} />
        </li>
      ))}
    </ol>
  )
}

export function KV({ rows, code = true }: { rows: readonly Pair[]; code?: boolean }) {
  return (
    <dl className="kv" data-list>
      {rows.map(([k, v]) => (
        <div key={k} className="kv__row" data-row>
          <dt className="t-mono-data text-page-text" translate={code ? 'no' : undefined}>{k}</dt>
          <dd className="t-body-md m-0 text-pretty text-page-text-mute">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Steps({ steps }: { steps: readonly Pair[] }) {
  return (
    <ol className="steps" data-list>
      {steps.map(([who, what], i) => (
        <li key={who} className="steps__row" data-row>
          <span className="t-kicker text-page-text-faint">{String(i + 1).padStart(2, '0')}</span>
          <span className="t-title-md text-page-text">{who}</span>
          <span className="t-body-md text-pretty text-page-text-mute">{what}</span>
        </li>
      ))}
    </ol>
  )
}

export function Triples({ rows, code = false }: { rows: ReadonlyArray<readonly [string, string, string]>; code?: boolean }) {
  return (
    <ul className="bricks-list" data-list>
      {rows.map(([name, role, line]) => (
        <li key={name} className="bricks-list__row" data-row>
          <span className={code ? 't-mono-data text-page-text' : 't-title-md text-page-text'} translate={code ? 'no' : undefined}>{name}</span>
          <span className="t-kicker text-page-text-mute">{role}</span>
          <span className="t-body-md text-pretty text-page-text-mute">{line}</span>
        </li>
      ))}
    </ul>
  )
}
