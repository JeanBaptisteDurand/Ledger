/**
 * The account's analyst: the one real agent, Claude on a read-only MCP of ten tools, with a key derived from the
 * holder's address. The conversation, a question, the tool cited under every answer. Full on /account, compact in
 * the demo's drawers and cockpit (the last two exchanges, two example questions).
 */
import { useEffect, useRef, useState } from 'react'
import { useBench } from '../../app/useBench'
import { Field, Prose, plain } from '../../app/ui'
import type { BenchState } from '../../app/api'

export const ANALYST_IDEAS = [
  'What are my bots doing, and which one has the most refusals?',
  'Why was the last round refused, and what did the hook take?',
  'Which vaults have their door closed today, and by how much?',
  'What does Ledger’s Earn say about a position, and what does it not say?',
]

export function AnalystThread({ s, compact = false }: { s: BenchState; compact?: boolean }) {
  const { act } = useBench()
  const [q, setQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const pending = !!s.analysis?.pending
  const count = s.analyses.length
  const ask = async (text: string) => { if (!text.trim() || pending) return; setQ(''); await act('/analyze', { question: text.trim() }) }
  const shown = compact ? s.analyses.slice(-2) : s.analyses
  useEffect(() => { if (!compact && count) end.current?.scrollIntoView({ block: 'nearest' }) }, [count, pending, compact])
  return (
    <div className="analyst">
      {shown.length ? (
        <div className={`thread ${compact ? 'mb-4' : 'mb-8'}`}>
          {shown.map((a, i) => (
            <div key={`${a.ts}-${i}`} className="thread">
              <p className="thread__you t-body-md m-0">{a.question}</p>
              <div className="thread__them t-body-md">
                {a.pending
                  ? <span className="text-page-text-faint">It is querying the tools…</span>
                  : a.answer
                    ? (compact ? <span>{plain(a.answer).slice(0, 360)}{a.answer.length > 360 ? '…' : ''}</span> : <Prose text={a.answer} />)
                    : <span className="is-error">No answer: {a.error}</span>}
                {!a.pending ? (
                  <span className="thread__trace t-kicker">
                    MCP → {a.tools_used.length ? a.tools_used.map((t) => `${t.tool}(${Object.entries(t.args ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')})`).join(' · ') : 'no tool called'}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : null}
      {!s.vault ? (
        <p className="t-body-md m-0 text-page-text-mute">Open a session first: the analyst reads your vault, your mandate, your agents and their decisions.</p>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className={`flex flex-col gap-3 ${compact ? '' : 'md:flex-row md:items-end'}`}>
            <div className="flex-1"><Field label="Your question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Why was round 2 refused?" autoComplete="off" disabled={pending} /></div>
            <div><button type="submit" className="btn-ghost btn-ghost--small t-button-cap" disabled={pending || !q.trim()}>{pending ? 'It is searching…' : 'Ask'}</button></div>
          </form>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {(compact ? ANALYST_IDEAS.slice(0, 2) : ANALYST_IDEAS).map((t) => (
              <button key={t} type="button" className="segment t-caption text-left" onClick={() => ask(t)} disabled={pending}>{t}</button>
            ))}
          </div>
          {!compact && !count ? <p className="t-caption m-0 mt-4 text-page-text-faint">It answers in 20 to 35 s: the tools are called for real, on your account’s data.</p> : null}
        </>
      )}
    </div>
  )
}
