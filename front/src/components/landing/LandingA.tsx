/**
 * Direction A — the pinned chronicle (Vercel Ship + GSAP scrollytelling).
 *
 * Three stages hold the viewport and are scrubbed by the scrollbar: the trap (0 rolls to 9 990 as you scroll,
 * then Moonwell's five figures enter one by one), the rule (the mandate's lines light in device order, then the
 * text), the proof (a clock counts to 124 s while the nine steps come on in sequence). The short sections run
 * free with the editorial reveals. Below 768 px and under reduced motion every stage is ordinary flow.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { blurFade, focusSheets, frieze, maskWipe, pinStage, scrubFigure, treatTitle } from '../../motion/landing'
import { Frieze, FriezeClock, PLAYHEAD, PX_PER_S, TRACK_PAD } from './Frieze'
import { Badge, Band, Bricks, DeviceMirror, ExitPair, hotTitle, Kicker, Mark, Note, Panel, Source, Stats, Takeaway, Title } from './primitives'
import { ACCOUNT, AGENT, AGENTS, BRICKS, CALL, CLAIM, FINDINGS, MAP, MEASURED, OVERFLOW, PRINCIPLE, PROOFS, RULE, SERVICE, SIGNATURE, TRAP } from './content'
import { KV, Rows, Steps } from './lists'
import { SchemaMap } from './SchemaMap'

export function LandingA() {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const scope = root.current!
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s))
      // Every title arrives hot and cools to cream (motion/landing.ts, ignition).
      const splits = q('[data-split]').map((el) => treatTitle(el, { trigger: el.closest('[data-stage]') ?? el }))
      q('[data-lead]:not([data-stage] [data-lead])').forEach((el) => blurFade([el], 0, el))
      // The takeaway is read first, so it is there first: on the section's entry, before the title ignites.
      q('[data-takeaway]').forEach((el) => blurFade([el], 0, el.closest('[data-stage]') ?? el))
      q('[data-list]:not([data-stage] [data-list])').forEach((l) => blurFade(l.querySelectorAll('[data-row], [data-step]'), 0.06, l))
      q('[data-wipe]:not([data-stage] [data-wipe])').forEach((el) => maskWipe(el))

      // Stage 1 · the trap: title, then the figure rolls, then the five vault rows.
      const trap = scope.querySelector<HTMLElement>('[data-stage="trap"]')!
      pinStage(trap, (tl) => {
        tl.from(trap.querySelector('[data-pair]'), { autoAlpha: 0, duration: 0.4 }, 0.3)
        scrubFigure(tl, trap.querySelector<HTMLElement>('[data-figure]')!, TRAP.exit, 0.5, 1.6)
        tl.from(trap.querySelector('[data-note]'), { autoAlpha: 0, y: 16, duration: 0.5 }, 1.4)
        tl.from(trap.querySelectorAll('[data-row]'), { autoAlpha: 0, x: 24, duration: 0.4, stagger: 0.25 }, 1.8)
        tl.from(trap.querySelector('[data-standard]'), { autoAlpha: 0, duration: 0.5 }, 3.1)
      }, '+=220%')

      // Stage 2 · the rule: the device's lines, one by one, then the reasoning.
      const rule = scope.querySelector<HTMLElement>('[data-stage="rule"]')!
      pinStage(rule, (tl) => {
        tl.from(rule.querySelector('[data-mirror]'), { autoAlpha: 0, scale: 0.96, duration: 0.6 }, 0.3)
        tl.from(rule.querySelectorAll('[data-mirror-line]'), { autoAlpha: 0, x: -8, duration: 0.3, stagger: 0.12 }, 0.7)
        tl.from(rule.querySelectorAll('[data-lead]'), { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.3 }, 1.9)
      }, '+=180%')

      /*
       * Stage 3 · the proof as a frieze. The duration is the axis: the vertical scroll slides the run under a
       * fixed playhead, one second's width per second, and the clock counts to 124. The reader's scroll is the run.
       */
      const run = scope.querySelector<HTMLElement>('[data-frieze]')!
      frieze(run, run.querySelector<HTMLElement>('[data-track]')!, run.querySelector<HTMLElement>('[data-clock]'), MEASURED.total, PX_PER_S, PLAYHEAD, TRACK_PAD)

      const unfocus = focusSheets(scope)
      return () => {
        unfocus()
        splits.forEach((s) => s?.revert())
      }
    },
    { scope: root },
  )

  return (
    <div ref={root} data-landing="a">
      <Band id="the-claim" label="The claim">
        <Takeaway>{CLAIM.takeaway}</Takeaway>
        <Title size="xl" className="max-w-[22ch]">{hotTitle(CLAIM.title)}</Title>
        <Source>{CLAIM.source}</Source>
      </Band>

      {/* Stage 1 */}
      <section id="the-trap" aria-label="The trap, two instances" className="stage band band--lift-1" data-stage="trap">
        <div className="stage__inner glass mx-auto max-w-[1200px]">
          <Takeaway>{TRAP.takeaway}</Takeaway>
          <Title className="max-w-[18ch]">{hotTitle(TRAP.title)}</Title>
          <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-10">
            <div className="xl:col-span-7" data-pair>
              <ExitPair entry={String(TRAP.entry)} exit="0" unit={TRAP.unit} entryLabel="to enter" exitLabel="to leave" />
              <div className="mt-6" data-note><Note>{TRAP.note[0]}<Mark>{TRAP.note[1]}</Mark>{TRAP.note[2]}</Note></div>
            </div>
            <div className="xl:col-span-5">
              <Panel lift={2}>
                <Kicker>{TRAP.vaultsTitle}</Kicker>
                <Stats rows={TRAP.vaults} />
                <p data-standard className="t-body-md mt-5 max-w-[46ch] text-pretty text-page-text-mute">
                  {TRAP.standard[0]}<span className="t-mono-data text-page-text">{TRAP.standard[1]}</span>{TRAP.standard[2]}<span className="t-mono-data text-page-text">{TRAP.standard[3]}</span>{TRAP.standard[4]}
                </p>
              </Panel>
            </div>
          </div>
          <Source>{TRAP.source}</Source>
        </div>
      </section>

      <Band id="the-principle" label="The principle">
        <Takeaway>{PRINCIPLE.takeaway}</Takeaway>
        <Title className="max-w-[22ch]">{hotTitle(PRINCIPLE.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{PRINCIPLE.lead}</p>
        <Rows rows={PRINCIPLE.rows} />
        <Source>{PRINCIPLE.source}</Source>
      </Band>

      <Band id="the-agent" label="And the agent goes in anyway">
        <div className="grid grid-cols-1 gap-12 xl:grid-cols-12 xl:gap-10">
          <div className="xl:col-span-6">
            <Takeaway>{AGENT.takeaway}</Takeaway>
            <Title className="max-w-[18ch]">{hotTitle(AGENT.title)}</Title>
            <p data-lead className="t-body-lg mt-8 max-w-[52ch] text-pretty text-page-text-mute">{AGENT.lead}</p>
            <p data-lead className="t-body-md mt-4 max-w-[52ch] text-pretty text-page-text-mute">
              {AGENT.body[0]}<span className="t-mono-data text-page-text">{AGENT.body[1]}</span>{AGENT.body[2]}
            </p>
            <Source>{AGENT.source}</Source>
          </div>
          <div className="xl:col-span-5 xl:col-start-8" data-wipe>
            <DeviceMirror title={AGENT.mirrorTitle} lines={AGENT.mirror} caption={AGENT.caption} hot={AGENT.mirrorHot} />
          </div>
        </div>
      </Band>

      {/* Stage 2 */}
      <section id="the-rule" aria-label="One signature" className="stage band band--lift-1" data-stage="rule">
        <div className="stage__inner glass mx-auto grid max-w-[1200px] grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-10">
          <div className="xl:col-span-5" data-mirror>
            <Panel lift={2}><DeviceMirror title={RULE.mirrorTitle} lines={RULE.mirror} caption={RULE.caption} hot={RULE.mirrorHot} /></Panel>
          </div>
          <div className="xl:col-span-6 xl:col-start-7">
            <Takeaway>{RULE.takeaway}</Takeaway>
            <Title className="max-w-[18ch]">{hotTitle(RULE.title)}</Title>
            <p data-lead className="t-body-lg mt-8 max-w-[52ch] text-pretty text-page-text-mute">{RULE.lead}</p>
            <p data-lead className="t-body-md mt-4 max-w-[52ch] text-pretty text-page-text-mute">{RULE.body}</p>
            <Source>{RULE.source}</Source>
          </div>
        </div>
      </section>

      <Band id="the-map" label="The whole system on one sheet" lift={1} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{MAP.takeaway}</Takeaway>
          <Title className="max-w-[18ch]">{hotTitle(MAP.title)}</Title>
          <div className="mt-10" data-wipe><SchemaMap /></div>
          <div className="mt-8"><Note>{MAP.note[0]}<Mark>{MAP.note[1]}</Mark>{MAP.note[2]}</Note></div>
          <Source>{MAP.source}</Source>
        </div>
      </Band>

      <Band id="the-agents" label="Two kinds of agents, one boundary">
        <Takeaway>{AGENTS.takeaway}</Takeaway>
        <Title className="max-w-[18ch]">{hotTitle(AGENTS.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{AGENTS.lead}</p>
        <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-12" data-list>
          <div className="xl:col-span-7" data-row>
            <Panel lift={2}>
              <Kicker>{AGENTS.bots.kicker}</Kicker>
              <h3 className="t-title-md m-0 text-page-text">{AGENTS.bots.title}</h3>
              <p className="t-body-md m-0 mt-3 max-w-[60ch] text-pretty text-page-text-mute">{AGENTS.bots.text}</p>
              <div className="mt-5"><Stats rows={AGENTS.bots.facts} /></div>
            </Panel>
          </div>
          <div className="xl:col-span-5" data-row>
            <Panel lift={2}>
              <Kicker>{AGENTS.analyst.kicker}</Kicker>
              <h3 className="t-title-md m-0 text-page-text">{AGENTS.analyst.title}</h3>
              <p className="t-body-md m-0 mt-3 max-w-[60ch] text-pretty text-page-text-mute">{AGENTS.analyst.text}</p>
              <div className="mt-5"><Stats rows={AGENTS.analyst.facts} /></div>
            </Panel>
          </div>
        </div>
        <div className="mt-10"><Kicker>The analyst’s ten tools, all read only</Kicker><KV rows={AGENTS.tools} /></div>
        <div className="mt-8"><Note>{AGENTS.note[0]}<Mark>{AGENTS.note[1]}</Mark>{AGENTS.note[2]}</Note></div>
        <Source>{AGENTS.source}</Source>
      </Band>

      <Band id="the-overflow" label="When it overflows" lift={3} full>
        <div className="mx-auto max-w-[62ch] text-center">
          <Takeaway>{OVERFLOW.takeaway}</Takeaway>
          <Title className="text-balance">{hotTitle(OVERFLOW.title)}</Title>
          <p data-lead className="t-body-lg mt-8 text-pretty text-page-text-mute">{OVERFLOW.lead}</p>
        </div>
        <div className="mx-auto mt-12 max-w-[520px]" data-wipe><DeviceMirror title={OVERFLOW.mirrorTitle} lines={OVERFLOW.mirror} hot={OVERFLOW.mirrorHot} /></div>
        <div className="outcomes mx-auto mt-10 max-w-[620px]" data-list>
          <div data-row><Badge tone="warning">{OVERFLOW.sign[0]}</Badge><p className="t-body-md m-0 mt-3 text-pretty text-page-text-mute">{OVERFLOW.sign[1]}</p></div>
          <div data-row><Badge tone="error">{OVERFLOW.refuse[0]}</Badge><p className="t-body-md m-0 mt-3 text-pretty text-page-text-mute">{OVERFLOW.refuse[1]}</p></div>
        </div>
        <div className="mx-auto mt-14 max-w-[1200px]">
          <Takeaway>{SIGNATURE.takeaway}</Takeaway>
          <Title className="max-w-[22ch]">{hotTitle(SIGNATURE.title)}</Title>
          <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{SIGNATURE.lead}</p>
          <div className="mt-10"><Steps steps={SIGNATURE.steps} /></div>
          <div className="mt-8"><Note>{SIGNATURE.note[0]}<Mark><span className="t-mono-data">{SIGNATURE.note[1]}</span></Mark>{SIGNATURE.note[2]}</Note></div>
          <Source>{OVERFLOW.source} {SIGNATURE.source}</Source>
        </div>
      </Band>

      {/* Stage 3 · the run as a frieze: the one section about time reads along a time axis. */}
      <section id="measured" aria-label="Measured, end to end" className="frieze band" data-frieze>
        <div className="frieze__head glass mx-auto max-w-[1200px]">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <Takeaway>{MEASURED.takeaway}</Takeaway>
              <Title className="max-w-[16ch]">{hotTitle(MEASURED.title)}</Title>
              <p data-lead className="t-body-lg mt-6 max-w-[44ch] text-pretty text-page-text-mute">{MEASURED.lead}</p>
            </div>
            <div className="md:col-span-5 md:text-right"><FriezeClock alerts={MEASURED.alerts} /></div>
          </div>
        </div>
        <Frieze steps={MEASURED.steps} total={MEASURED.total} />
        <div className="frieze__foot glass mx-auto max-w-[1200px]">
          <Note>{MEASURED.note[0]}<Mark>{MEASURED.note[1]}</Mark>{MEASURED.note[2]}</Note>
          <Source>{MEASURED.source}</Source>
        </div>
      </section>

      <Band id="the-account" label="The account">
        <Takeaway>{ACCOUNT.takeaway}</Takeaway>
        <Title className="max-w-[22ch]">{hotTitle(ACCOUNT.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{ACCOUNT.lead}</p>
        <Rows rows={ACCOUNT.rows} />
        <div className="mt-8"><Note>{ACCOUNT.note[0]}<Mark>{ACCOUNT.note[1]}</Mark>{ACCOUNT.note[2]}</Note></div>
        <Source>{ACCOUNT.source}</Source>
      </Band>

      <Band id="findings" label="What we found in their stack" lift={1} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{FINDINGS.takeaway}</Takeaway>
          <Title className="max-w-[20ch]">{hotTitle(FINDINGS.title)}</Title>
          <ul className="findings mt-10" data-list>
            {FINDINGS.rows.map((r) => (
              <li key={r.what} className="findings__row" data-row>
                <div>
                  <p className="t-body-lg m-0 text-page-text">{r.what}</p>
                  <p className="t-body-md m-0 mt-1 max-w-[62ch] text-pretty text-page-text-mute">{r.detail}</p>
                </div>
                <Badge tone={r.tone}>{r.status}</Badge>
              </li>
            ))}
          </ul>
          <Source>{FINDINGS.source}</Source>
        </div>
      </Band>

      <Band id="bricks" label="Three bricks, three roles">
        <Takeaway>{BRICKS.takeaway}</Takeaway>
        <Title className="max-w-[18ch]">{hotTitle(BRICKS.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[52ch] text-pretty text-page-text-mute">{BRICKS.lead}</p>
        <div className="mt-10" data-list><Bricks items={BRICKS.items} /></div>
        <div className="mt-10 max-w-[720px]" data-wipe><Kicker>{PROOFS.kicker}</Kicker><Stats rows={PROOFS.rows} /></div>
        <Source>{BRICKS.source}</Source>
      </Band>


      <Band id="the-call" label="The call" lift={2} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{CALL.takeaway}</Takeaway>
          <Title size="xl" className="max-w-[14ch]">{hotTitle(CALL.title)}</Title>
          <p data-lead className="t-body-lg mt-8 max-w-[48ch] text-pretty text-page-text-mute">{CALL.lead}</p>
          <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-12" data-list>
            <div className="xl:col-span-7" data-row><Kicker>{SERVICE.keeps.kicker}</Kicker><KV rows={SERVICE.keeps.rows} code={false} /></div>
            <div className="xl:col-span-5" data-row><Kicker>{SERVICE.holds.kicker}</Kicker><KV rows={SERVICE.holds.rows} code={false} /><p className="t-caption mt-5 max-w-[52ch] text-pretty text-page-text-faint">{SERVICE.caption}</p></div>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <a href={CALL.href} className="btn-ghost btn-ghost--hot t-button-cap">{CALL.cta}</a>
            <a href={SERVICE.demoHref} className="btn-ghost btn-ghost--quiet t-button-cap">{SERVICE.demo}</a>
          </div>
          <Source>{CALL.source}</Source>
        </div>
      </Band>
    </div>
  )
}
