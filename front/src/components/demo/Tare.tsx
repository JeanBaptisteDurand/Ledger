/**
 * TARE, the module that measures. It opens beside the map while a round runs and for a few seconds after the
 * decision lands: the four steps of the counterfactual, lit one after the other (a timed sequence while the
 * bench works, since the server does not report its progress; the result when it lands), the exit figure
 * counting up to what was measured, the verdict against the mandate in the stage's colour code.
 */
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { short, type BenchState, type JournalRow } from '../../app/api'
import { prefersReducedMotion } from '../../motion/flags'
import { Badge } from '../landing/primitives'

type Step = { n: number; title: string; line: string; detail?: string }

/** The four steps, written from the decision when it exists, from the bench's universe before. */
function stepsOf(s: BenchState, r: JournalRow | null): Step[] {
  const vault = r ? r.kind === 'vault' : s.universe === 'vaults'
  if (vault) {
    return [
      { n: 1, title: 'The bot picks a vault', line: r ? `${r.name ?? short(r.pool, 10, 4)} · ${r.apy_pct ?? '·'} % advertised` : 'ten real Morpho WETH vaults, ranked on advertised yield', detail: 'what the bot sees: the yield, the size, the listing' },
      { n: 2, title: 'Real deposit, real redeem', line: 'enterVault(): deposit, then redeem, both reverted', detail: 'the round trip, measured in the transaction, written nowhere' },
      { n: 3, title: 'The door', line: r ? (r.deposit_refused ? 'deposit refused by the vault' : `maxWithdraw against convertToAssets · ${r.stuck_bps ?? r.exit ?? '·'} bps`) : 'maxWithdraw against convertToAssets, for the largest depositor', detail: 'previewRedeem must ignore the limits: the door is read from maxWithdraw' },
      { n: 4, title: 'Verdict', line: r ? verdictLine(s, r) : 'exit against the mandate', detail: r ? r.why : undefined },
    ]
  }
  return [
    { n: 1, title: 'The bot picks a pool', line: r ? `${short(r.pool, 10, 4)} · ${r.entry} bps on entry` : 'the WETH long tail of Base, ranked on depth, entry cost, registry', detail: 'what the bot sees: depth, entry cost, the Uniswap registry' },
    { n: 2, title: 'Hook swapped for 89 inert bytes', line: 'anvil_setCode on the hook, PoolKey unchanged', detail: 'the same pool, the same liquidity, a hook that does nothing' },
    { n: 3, title: 'Quoted twice', line: r ? `hook in ${r.hook_in ?? r.entry} bps · hook out ${r.hook_out ?? r.exit ?? '·'} bps` : 'with the hook, without: the gap is what the hook takes', detail: 'at entry, and at exit: the full resale, simulated in the same transaction' },
    { n: 4, title: 'Verdict', line: r ? verdictLine(s, r) : 'exit against the mandate', detail: r ? r.why : undefined },
  ]
}

const allows = (s: BenchState) => s.mandate?.mandate.maxRoundTripLossBps ?? s.proposal?.max_round_trip_loss_bps ?? null
const exitOf = (r: JournalRow) => (r.kind === 'vault' ? (r.deposit_refused ? 10000 : (r.stuck_bps ?? r.exit)) : r.exit)
function verdictLine(s: BenchState, r: JournalRow): string {
  const e = exitOf(r)
  const a = allows(s)
  const x = e == null ? '·' : e >= 10000 ? (r.deposit_refused ? 'deposit refused' : 'blocked') : `${e} bps`
  return `exit ${x}${a != null ? ` against ${a} allowed` : ''} → ${r.under_exception ? 'entered under exception' : r.decision === 'EXECUTED' ? 'entered' : 'refused'}`
}

/** While the bench works the steps light on a clock; once the row is there they are all lit and the figure counts up. */
export function TarePanel({ s, row, running }: { s: BenchState; row: JournalRow | null; running: boolean }) {
  const r = running ? null : row
  const steps = stepsOf(s, r)
  const [lit, setLit] = useState(r ? 4 : 1)
  useEffect(() => {
    if (r) { setLit(4); return }
    setLit(1)
    const t = [window.setTimeout(() => setLit(2), 1800), window.setTimeout(() => setLit(3), 4200)]
    return () => t.forEach(window.clearTimeout)
  }, [r, running])
  const exit = r ? exitOf(r) : null
  const verdict = r ? (r.under_exception ? 'exception' : r.decision === 'EXECUTED' ? 'ok' : 'refused') : 'running'
  const vault = r ? r.kind === 'vault' : s.universe === 'vaults'
  return (
    <aside className="tare" data-verdict={verdict} aria-label="TARE, the measure">
      <p className="t-kicker tare__kicker">TARE · counterfactual · the security level</p>
      <p className="tare__title">{vault ? 'The door, measured in the transaction' : 'What the hook takes, in and out'}</p>
      <div className="tare__figure">
        <div className="exit-pair">
          <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">{vault ? 'advertised' : 'to enter'}</span><span className="t-mono-data-lg text-page-text">{r ? (vault ? `${r.apy_pct ?? '·'} %` : `${r.hook_in ?? r.entry} bps`) : '·'}</span></div>
          <span className="exit-pair__rule" aria-hidden />
          <div className="exit-pair__side"><span className="t-kicker text-page-text-mute">{vault ? 'door' : 'to leave'}</span><span className="tare__exit t-numeral-hero"><Count value={exit} word={r?.deposit_refused ? 'refused' : 'blocked'} /> <span className="t-kicker text-page-text-faint">{exit != null && exit < 10000 ? 'bps' : ''}</span></span></div>
        </div>
        <div className="tare__verdict">
          {allows(s) != null ? <span className="t-kicker text-page-text-mute">mandate allows {allows(s)} bps</span> : null}
          {verdict === 'ok' ? <Badge tone="success">entered</Badge> : verdict === 'refused' ? <Badge tone="error">refused by the vault</Badge> : verdict === 'exception' ? <Badge tone="warning">entered under exception</Badge> : <span className="now__wait text-hot"><span className="now__pulse" aria-hidden />measuring</span>}
        </div>
      </div>
      <ol className="tare__steps">
        {steps.map((st) => {
          const state = st.n < lit ? 'done' : st.n === lit ? (r && st.n === 4 ? 'verdict' : 'live') : 'ahead'
          return (
            <li key={st.n} className="tare__step" data-state={state}>
              <span className="tare__n">{st.n}</span>
              <span className="tare__body">
                <span className="tare__step-title">{st.title}</span>
                <span className="t-mono-data tare__line">{st.line}</span>
                {st.detail && state !== 'ahead' ? <span className="t-caption tare__detail">{st.detail}</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

/** The figure counts up to its value once, 0.9 s, power3.out; blocked stays a word. Under reduced motion it is simply there. */
function Count({ value, word }: { value: number | null; word: string }) {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node) return
    if (value == null) { node.textContent = '·'; return }
    if (value >= 10000) { node.textContent = word; return }
    if (prefersReducedMotion()) { node.textContent = String(value); return }
    const box = { v: 0 }
    const tw = gsap.to(box, { v: value, duration: 0.9, ease: 'power3.out', onUpdate: () => { node.textContent = String(Math.round(box.v)) } })
    return () => { tw.kill() }
  }, [value, word])
  return <span ref={el}>·</span>
}
