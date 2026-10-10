/**
 * The account's three working pages, in the order a person lives them:
 *   /app            session → strategy and mandate → the agents at a glance → out-of-bounds requests → positions
 *   /app/agents     the trading agents (bots) and the requests they raise
 *   /app/analyste   the analysis agent
 * The Ledger signs three things here: the mandate, once; and each exception, with the number on its screen.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fmtWei, short, type Bot, type BenchState, type JournalRow } from './api'
import { linkProps } from './router'
import { askToNotify, useBench } from './useBench'
import { AnchoredNote, Badge, Band, Empty, Field, Ghost, Mirror, Panel, Prose, Row, Segments, Select, SignOnDevice, Skeleton, duration, plain, time } from './ui'

const STRATEGY_IDEAS = [
  '0,5 WETH prudemment sur la longue traîne de Base, je ne veux pas rester coincé',
  '1 WETH, profil offensif, 10 tranches',
  '0,5 WETH sur des coffres à rendement, prudemment',
]
const ANALYST_IDEAS = [
  'Que font mes bots, et lequel a le plus de refus ?',
  'Pourquoi le dernier tour a été refusé, et que prenait le hook ?',
  'Quels coffres ont la porte fermée aujourd’hui, et de combien ?',
  'Que dit l’Earn de Ledger d’une position, et que ne dit-il pas ?',
]

const Loading = () => <div className="app-column pt-12"><Skeleton rows={6} /></div>

/** /app — the overview: the vault, the mandate, the agents at a glance, what waits for the Ledger, the positions. */
export function OverviewPage() {
  const { state } = useBench()
  if (!state) return <Loading />
  return (
    <>
      <SessionBand s={state} />
      {state.vault ? <MandateBand s={state} /> : null}
      {state.signed ? <GlanceBand s={state} /> : null}
      {state.signed ? <RequestsBand s={state} /> : null}
      {state.signed ? <PositionsBand s={state} /> : null}
      <LogBand s={state} />
    </>
  )
}

/** /app/agents — my trading agents: add, stop, restart, the history, the journal; and the requests they raise. */
export function AgentsPage() {
  const { state } = useBench()
  if (!state) return <Loading />
  if (!state.signed) {
    return (
      <NotYet
        eyebrow="Mes agents de trading"
        title="D’abord, le mandat"
        lead="Vos agents achètent dans votre coffre et sous votre mandat : rien ne part avant que vous l’ayez lu et signé sur votre Ledger."
      />
    )
  }
  return (
    <>
      <BotsBand s={state} />
      {state.escalation?.possible ? <RequestsBand s={state} index="02" /> : null}
    </>
  )
}

/** /app/analyste — my analysis agent: the conversation, and the MCP calls under each answer. */
export function AnalystePage() {
  const { state } = useBench()
  if (!state) return <Loading />
  if (!state.vault) {
    return (
      <NotYet
        eyebrow="Mon agent d’analyse"
        title="D’abord, une session"
        lead="L’analyste lit votre coffre, votre mandat, vos agents et leurs décisions. Ouvrez une session pour qu’il ait de quoi répondre."
      />
    )
  }
  return <AnalystBand s={state} />
}

function NotYet({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <Band eyebrow={eyebrow} title={title} lead={lead}>
      <a className="btn-ghost t-button-cap" {...linkProps('/app')}>Aller à la vue d’ensemble</a>
    </Band>
  )
}

/* ───────────────────────────── 03 · the agents at a glance ───────────────────────────── */

const clip = (t: string, n = 220) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t)

function GlanceBand({ s }: { s: BenchState }) {
  const live = s.bots.filter((b) => b.status === 'running')
  const executed = s.bots.reduce((n, b) => n + b.executed, 0)
  const refused = s.bots.reduce((n, b) => n + b.refused, 0)
  const last = s.analyses.length ? s.analyses[s.analyses.length - 1] : null
  const waiting = (s.escalation?.possible ? 1 : 0) + s.escalation_queue.length
  return (
    <Band
      index="03"
      eyebrow="Votre espace"
      title="Vos agents, d’un coup d’œil"
      lead="Les agents de trading achètent dans votre coffre, sous votre mandat. L’agent d’analyse lit tout et ne peut rien faire."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel kicker="Mes agents de trading">
          <Row label="En activité" value={live.length ? live.map((b) => b.name).join(' · ') : '—'} />
          <Row label="Arrêtés" value={s.bots.length - live.length} />
          <Row label="Entrées · refus" value={`${executed} · ${refused}`} />
          <div className="mt-6"><a className="btn-ghost btn-ghost--small t-button-cap" {...linkProps('/app/agents')}>Gérer mes agents</a></div>
        </Panel>
        <Panel kicker="Mon agent d’analyse">
          <p className="t-body-sm m-0 text-on-primary-mute">
            {last
              ? (last.pending ? 'Il interroge les outils…' : clip(plain(last.answer || `Pas de réponse : ${last.error ?? ''}`)))
              : 'Il répond par les données de votre compte, et nomme l’outil derrière chaque nombre.'}
          </p>
          <div className="mt-6"><a className="btn-ghost btn-ghost--small t-button-cap" {...linkProps('/app/analyste')}>{last ? 'Reprendre la conversation' : 'Lui poser une question'}</a></div>
        </Panel>
        <Panel kicker="Ce qui attend votre Ledger">
          <Row label="Demandes hors bornes" value={waiting} keyFigure={waiting > 0} />
          <Row label="Dérogations signées" value={s.exception_buys.length} />
          <Row label="Positions tenues" value={s.positions.length} />
          {waiting ? <div className="mt-6"><a className="nav-link t-button-cap -ml-3" href="#demandes">Voir la demande</a></div> : null}
        </Panel>
      </div>
    </Band>
  )
}

/* ───────────────────────────── 01 · session ───────────────────────────── */

function SessionBand({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [busy, setBusy] = useState(false)
  const [dep, setDep] = useState('0.5')
  const [wd, setWd] = useState('tout')
  const open = async () => { setBusy(true); await act('/boot'); setBusy(false) }
  const waiting = !!s.signing || !!s.pending
  const eth = (wei: string) => `${(Number(wei || '0') / 1e18).toFixed(4)} ETH`
  return (
    <Band
      index="01"
      eyebrow="Session"
      title={s.vault ? 'Un coffre à votre nom' : 'Ouvrez une session'}
      lead={s.vault
        ? 'Le coffre est un contrat dont vous êtes propriétaire. Ses fonds viennent de votre Ledger : un envoi d’ETH, gardé en WETH. Ils en ressortent sur une autorisation que vous lisez sur l’appareil. Vos bots ne peuvent appeler que lui, dans les bornes que vous signez.'
        : s.network === 'live'
          ? `Un coffre est déployé à l’adresse que votre Ledger a prouvée, sur le réseau réel (chaîne ${s.chain_id ?? '…'}). Rien n’est crédité : les fonds viennent de votre Ledger.`
          : 'Un coffre est déployé à l’adresse que votre Ledger a prouvée, sur un fork de Base au bloc 50 614 000.'}
    >
      {s.vault ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="Le coffre">
            <Row label="Propriétaire" value={short(s.owner, 10, 8)} />
            <Row label="Contrat" value={short(s.vault, 10, 8)} />
            <Row label="Disponible" value={fmtWei(s.weth)} />
            <Row label="Consommé sous mandat" value={fmtWei(s.spent)} />
          </Panel>
          <Panel kicker="Vos fonds · signés sur votre Ledger">
            <Row label="Votre adresse" value={eth(s.owner_eth)} />
            <form className="mt-5 flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); await act('/deposit', { amount_eth: dep }) }}>
              <Field label="Déposer (ETH)" type="number" step="any" min={0} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} disabled={waiting} />
              <div><SignOnDevice type="submit" disabled={waiting || s.signer !== 'browser'}>Déposer depuis ma Ledger</SignOnDevice></div>
              {s.signer !== 'browser' ? <p className="t-caption m-0 is-faint">Le dépôt se signe dans la page : choisissez « Ma Ledger · ce navigateur » sur la page Appareil.</p> : null}
            </form>
            <form className="mt-5 flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); await act('/withdraw', { amount: wd }) }}>
              <Field label="Retirer (WETH)" value={wd} onChange={(e) => setWd(e.target.value)} placeholder="tout" disabled={waiting} />
              <div><Ghost small quiet type="submit" disabled={waiting}>Retirer vers ma Ledger</Ghost></div>
            </form>
            <p className="t-caption m-0 mt-4 is-faint">Un envoi d’ETH : la seule transaction que votre Ledger signe, lisible par n’importe quelle app Ethereum. Le retrait est un message EIP-712 lu en clair ; le banc l’exécute et paie le gaz, sans pouvoir y changer un chiffre.</p>
          </Panel>
          <Panel kicker="L’appareil">
            <Row label="Chemin de signature" value={{ browser: 'ma Ledger · ce navigateur', dmk: 'Signer Kit · banc', python: 'client APDU · banc' }[s.signer]} />
            <Row label="Flex du banc" value={s.speculos ? <span className="is-success">sous tension</span> : <span className="is-faint">hors tension</span>} />
            <Row label={s.network === 'live' ? 'Réseau réel' : 'Fork de Base'} value={s.anvil ? <span className="is-success">{s.network === 'live' ? `chaîne ${s.chain_id ?? '…'}` : 'en ligne'}</span> : <span className="is-faint">arrêté</span>} />
            <div className="mt-5">
              <a className="nav-link t-button-cap -ml-3" {...linkProps('/appareil')}>Changer d’appareil</a>
            </div>
          </Panel>
        </div>
      ) : (
        <Ghost onClick={open} disabled={busy}>{busy ? 'Ouverture…' : 'Ouvrir une session'}</Ghost>
      )}
    </Band>
  )
}

/* ───────────────────────────── 02 · strategy and mandate ───────────────────────────── */

function MandateBand({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [prompt, setPrompt] = useState('')
  const [asking, setAsking] = useState(false)
  const p = s.proposal
  const m = s.mandate

  const ask = async (text: string) => {
    if (!text.trim() || asking) return
    setAsking(true)
    setPrompt('')
    await act('/chat', { prompt: text.trim() })
    setAsking(false)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(prompt) }

  const expiry = m ? new Date(m.mandate.expiry * 1000) : p ? new Date(Date.now() + p.days * 86400e3) : null
  const lines: [string, string][] = p || m ? [
    ['CONTRACT', 'EXIT MANDATE'],
    ['NETWORK', 'BASE'],
    ['AGENT', short(m?.mandate.agent ?? '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 8, 6)],
    ['BUDGET', `${m ? Number(m.mandate.budgetAmount) / 1e18 : p!.budget_weth} WETH`],
    ['MAX ROUND-TRIP LOSS (BPS)', String(m ? m.mandate.maxRoundTripLossBps : p!.max_round_trip_loss_bps)],
    ['EXPIRES', expiry ? expiry.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'],
  ] : []

  return (
    <Band
      id="mandat"
      index="02"
      eyebrow="Le mandat"
      title="Ce que vous signez est ce que vous lisez"
      lead="Dites ce que vous voulez en une phrase. Un stratège la traduit en bornes ; vous les lisez sur l’appareil et vous les signez une fois. Ensuite, c’est le contrat qui les tient."
    >
      <div className="grid gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5" kicker="Votre intention">
          {s.chat.length ? (
            <div className="thread mb-5">
              {s.chat.map((c, i) => c.role === 'user'
                ? <div key={i} className="thread__you t-body-sm">{c.text}</div>
                : (
                  <div key={i} className="thread__them t-body-sm">
                    {c.text}
                    {c.warning ? <span className="mt-2 block is-warning">Ce que ces bornes ne protègent pas : {c.warning}</span> : null}
                    {c.source && /repli/.test(c.source) ? <span className="t-caption mt-2 block is-faint">Proposé par une règle de repli, pas par le modèle : {c.source}</span> : null}
                  </div>
                ))}
            </div>
          ) : null}
          {!s.signed ? (
            <>
              <form onSubmit={submit} className="flex flex-col gap-3">
                <Field label="En une phrase" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="0,5 WETH prudemment, je ne veux pas rester coincé" autoComplete="off" disabled={asking} />
                <div><Ghost small type="submit" disabled={asking || !prompt.trim()}>{asking ? 'Le stratège réfléchit…' : 'Demander des bornes'}</Ghost></div>
              </form>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
                {STRATEGY_IDEAS.map((t) => (
                  <button key={t} type="button" className="segment t-caption text-left" onClick={() => ask(t)} disabled={asking}>{t}</button>
                ))}
              </div>
            </>
          ) : null}
          {p ? (
            <div className="mt-6">
              <Row label="Budget" value={`${p.budget_weth} WETH`} />
              <Row label="Perte de sortie tolérée" value={`${p.max_round_trip_loss_bps} BPS`} keyFigure />
              <Row label="Échéance" value={`${p.days} J`} />
              <Row label="Tranche · tranches" value={`${p.slice_weth} WETH · ${p.ticks}`} />
              <Row label="Profil" value={p.risk.toUpperCase()} />
            </div>
          ) : null}
          <div className="mt-6">
            {s.signed
              ? <Badge tone="success">Mandat signé</Badge>
              : <SignOnDevice onClick={() => act('/sign_mandate')} disabled={!p || !!s.signing} />}
          </div>
        </Panel>

        <div className="xl:col-span-7">
          {lines.length ? (
            <Mirror
              lines={lines}
              pending={s.signing === 'mandate'}
              caption={s.last_report
                ? `Dernière signature : ${s.last_report.isBlindSign ? 'à l’aveugle' : 'en clair'}${s.last_report.clearSigningType ? ' · ' + s.last_report.clearSigningType : ''}`
                : 'La tranche, le nombre de tranches et le profil ne sont pas affichés sur l’appareil : ils guident les bots sans les lier.'}
            />
          ) : (
            <Empty>Demandez des bornes : elles apparaîtront ici telles que l’appareil les affichera, champ par champ.</Empty>
          )}
          {lines.length ? (
            <AnchoredNote>
              Trois nombres vous lient : <b>le budget</b>, <b>la perte de sortie</b> et <b>l’échéance</b>. Le contrat mesure la sortie
              à chaque entrée, dans la transaction même, et refuse ce qui ne ressort pas.
            </AnchoredNote>
          ) : null}
        </div>
      </div>
    </Band>
  )
}

/* ───────────────────────────── 03 · bots ───────────────────────────── */

function BotsBand({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [name, setName] = useState('')
  const [universe, setUniverse] = useState(s.universe)
  const [ticks, setTicks] = useState(String(s.proposal?.ticks ? Math.min(s.proposal.ticks, 5) : 3))
  const [interval, setIntervalS] = useState('60')
  const [busy, setBusy] = useState(false)
  const live = s.bots.filter((b) => b.status === 'running')
  const old = s.bots.filter((b) => b.status !== 'running').slice().reverse()

  const add = async (e: FormEvent) => {
    e.preventDefault()
    askToNotify()
    setBusy(true)
    const r = await act('/bots', { name: name.trim(), universe, ticks: Number(ticks) || 3, interval_s: Number(interval) || 0 })
    if (r.ok) setName('')
    setBusy(false)
  }
  const oneRound = async () => { askToNotify(); await act('/universe', { universe }); await act('/run') }

  return (
    <Band
      id="bots"
      index="01"
      eyebrow="Mes agents de trading"
      title="Ils achètent, le contrat décide"
      lead="Un bot est un agent d’exécution sans modèle de langage. Il choisit sur ce qu’il voit — la profondeur, le rendement affiché — et ne voit jamais la sortie. Tous vos bots travaillent dans le même coffre, sous le même mandat."
    >
      <Panel kicker="Ajouter un bot">
        <form onSubmit={add} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1.3fr_0.7fr_1.3fr_auto] xl:items-end">
          <Field label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="DCA prudente" maxLength={40} autoComplete="off" />
          <Select label="Univers" value={universe} onChange={(e) => setUniverse(e.target.value as typeof universe)}>
            <option value="pools">Pools v4</option>
            <option value="vaults">Coffres 4626</option>
          </Select>
          <Field label="Tranches" type="number" min={1} max={12} value={ticks} onChange={(e) => setTicks(e.target.value)} />
          <Select label="Rythme" value={interval} onChange={(e) => setIntervalS(e.target.value)}>
            <option value="0">Un seul tour</option>
            <option value="30">Toutes les 30 s</option>
            <option value="60">Toutes les 60 s</option>
            <option value="300">Toutes les 5 min</option>
          </Select>
          <Ghost small type="submit" disabled={busy}>{busy ? 'Lancement…' : 'Ajouter et lancer'}</Ghost>
        </form>
        <p className="t-caption m-0 mt-4 is-faint">
          {universe === 'vaults'
            ? 'Dix coffres WETH réels de Base. Le plus gros a 27 % de sa porte fermée ; rien dans son API ne le dit.'
            : 'La longue traîne WETH de Base. Six pools coûtent 0 bps à l’entrée et 9 990 à la sortie : indiscernables avant d’acheter.'}
        </p>
        <p className="m-0 mt-1">
          <button type="button" className="segment t-caption" aria-pressed="true" onClick={oneRound}>Ou lancer un seul tour maintenant</button>
        </p>
      </Panel>

      <h3 className="t-micro-cap eyebrow m-0 mt-12 mb-3">En activité</h3>
      {live.length ? <BotsTable bots={live} running={s.bot_running} onStop={(id) => act('/bots/stop', { id })} /> : (
        <Empty>Aucun bot ne tourne. Ajoutez-en un, ou lancez un seul tour pour voir le contrat refuser.</Empty>
      )}

      {old.length ? (
        <>
          <h3 className="t-micro-cap eyebrow m-0 mt-12 mb-3">Arrêtés — l’historique</h3>
          <HistoryTable bots={old} onRestart={(id) => act('/bots/restart', { id })} />
        </>
      ) : null}

      {s.journal.length ? (
        <>
          <h3 className="t-micro-cap eyebrow m-0 mt-12 mb-3">Le journal, décision par décision</h3>
          <Journal rows={s.journal} />
        </>
      ) : null}
    </Band>
  )
}

const universeLabel = (u: Bot['universe']) => (u === 'vaults' ? 'Coffres 4626' : 'Pools v4')

function BotsTable({ bots, running, onStop }: { bots: Bot[]; running: string | null; onStop: (id: string) => void }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>Bot</th><th>Univers</th><th>État</th><th className="num">Tours</th><th className="num">Achats</th><th className="num">Refus</th><th className="num">Dérog.</th><th className="num">Positions</th><th className="num">Dépensé</th><th /></tr></thead>
        <tbody>
          {bots.map((b) => {
            const next = Math.max(0, Math.round((b.next_run || 0) - Date.now() / 1000))
            return (
              <tr key={b.id}>
                <td className="label"><span className="text-text-050">{b.name}</span><br /><span className="is-faint">{b.ticks} tranche{b.ticks > 1 ? 's' : ''} · {b.interval_s ? `toutes les ${duration(b.interval_s)}` : 'un tour'}</span></td>
                <td className="label">{universeLabel(b.universe)}</td>
                <td className="label">{running === b.id ? <Badge tone="warning">Tour en cours</Badge> : <><Badge tone="success">Actif</Badge>{b.interval_s ? <span className="is-faint"> · dans {duration(next)}</span> : null}</>}</td>
                <td className="num">{b.rounds}</td>
                <td className="num is-success">{b.executed}</td>
                <td className="num is-error">{b.refused}</td>
                <td className="num">{b.exceptions || 0}</td>
                <td className="num">{b.positions}</td>
                <td className="num">{fmtWei(b.spent_wei)}</td>
                <td><Ghost small quiet onClick={() => onStop(b.id)}>Arrêter</Ghost></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HistoryTable({ bots, onRestart }: { bots: Bot[]; onRestart: (id: string) => void }) {
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead><tr><th>Bot</th><th>Univers</th><th>Du</th><th>Au</th><th className="num">Tours</th><th className="num">Achats</th><th className="num">Refus</th><th className="num">Dérog.</th><th className="num">Dépensé</th><th>Fin</th><th /></tr></thead>
        <tbody>
          {bots.map((b) => (
            <tr key={b.id}>
              <td className="label text-text-050">{b.name}</td>
              <td className="label">{universeLabel(b.universe)}</td>
              <td>{time(b.started)}</td>
              <td>{time(b.stopped)}</td>
              <td className="num">{b.rounds}</td>
              <td className="num is-success">{b.executed}</td>
              <td className="num is-error">{b.refused}</td>
              <td className="num">{b.exceptions || 0}</td>
              <td className="num">{fmtWei(b.spent_wei)}</td>
              <td className="label"><Badge tone={b.status === 'done' ? 'info' : 'mute'}>{b.status === 'done' ? 'Terminé' : 'Arrêté'}</Badge> <span className="is-faint">{b.stop_reason}</span></td>
              <td><Ghost small quiet onClick={() => onRestart(b.id)}>Relancer</Ghost></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Journal({ rows }: { rows: JournalRow[] }) {
  const [onlyRefused, setOnlyRefused] = useState<'all' | 'refused' | 'bought'>('all')
  const shown = rows.filter((r) => onlyRefused === 'all' || (onlyRefused === 'refused') === (r.decision !== 'EXECUTED'))
  const bought = rows.filter((r) => r.decision === 'EXECUTED').length
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <p className="t-body-sm m-0 text-on-primary-mute">{bought} entrée{bought > 1 ? 's' : ''}, {rows.length - bought} refus. La colonne « vu par le bot » est tout ce qu’il savait ; « sortie » est ce que le contrat a mesuré.</p>
        <Segments label="Filtrer le journal" value={onlyRefused} onChange={setOnlyRefused} options={[{ value: 'all', label: 'Tout' }, { value: 'bought', label: 'Entrées' }, { value: 'refused', label: 'Refus' }]} />
      </div>
      <div className="data-scroll">
        <table className="data-table">
          <thead><tr><th>T</th><th>Bot</th><th>Position</th><th className="num">Vu par le bot</th><th className="num">Sortie mesurée</th><th>Décision</th></tr></thead>
          <tbody>
            {shown.map((r, i) => {
              const ok = r.decision === 'EXECUTED'
              const vault = r.kind === 'vault'
              const seen = r.under_exception ? 'décision humaine' : vault ? `${r.apy_pct ?? '—'} % affiché` : `${r.entry} bps à l’entrée`
              const exit = vault
                ? (r.deposit_refused ? 'dépôt refusé' : `porte ${r.stuck_bps ?? r.exit ?? '—'} bps`)
                : (r.exit != null && r.exit >= 10000 ? 'bloquée' : `${r.exit ?? '—'} bps`)
              return (
                <tr key={i} title={r.why}>
                  <td>{r.under_exception ? 'déro.' : r.tick}</td>
                  <td className="label is-mute">{r.bot ?? '—'}</td>
                  <td className={vault ? 'label' : ''}>{r.name ?? r.pool}</td>
                  <td className="num is-mute">{seen}</td>
                  <td className="num">{exit}</td>
                  <td className="label">
                    {r.under_exception ? <span className="is-warning">entré · dérogation</span> : ok ? <span className="is-success">{vault ? 'entré' : 'acheté'}</span> : <span className="is-error" title={r.error ?? ''}>refusé</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ───────────────────────────── 04 · out-of-bounds requests ───────────────────────────── */

function RequestsBand({ s, index = '04' }: { s: BenchState; index?: string }) {
  const { act } = useBench()
  const e = s.escalation
  const waiting = s.escalation_queue.length
  const signing = s.signing === 'exception'
  return (
    <Band
      id="demandes"
      index={index}
      eyebrow="Hors bornes"
      title="Hors bornes ne veut pas dire non"
      lead="Quand un bot veut entrer dans une position que votre mandat refuse, la demande revient à vous, sur l’appareil, avec le nombre réel. Une dérogation vaut pour cette position, ce montant et ce nombre — une fois."
    >
      {e && e.possible ? (
        <div className="grid gap-6 xl:grid-cols-12">
          <Panel className="xl:col-span-5 blink-in" pending={signing} kicker={e.bot ? `Demande du bot « ${e.bot.name} »` : 'Demande'}>
            <p className="t-body-md m-0 text-text-050">{e.question}</p>
            <div className="mt-5">
              <Row label="Position" value={e.name ?? short(e.pool_id, 10, 6)} />
              <Row label="Montant" value={fmtWei(e.amount_in)} />
              <Row label="Votre mandat tolère" value={`${e.mandate_allows_bps} BPS`} />
              <Row label="Sortie mesurée" value={`${e.seen_exit_bps} BPS`} keyFigure />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <SignOnDevice onClick={() => act('/escalate')} disabled={!!s.signing}>Lire et signer sur Ledger</SignOnDevice>
              <Ghost quiet onClick={() => act('/escalate_no')} disabled={!!s.signing}>Laisser refusé</Ghost>
            </div>
            {waiting ? <p className="t-caption m-0 mt-4 is-faint">{waiting} autre{waiting > 1 ? 's' : ''} demande{waiting > 1 ? 's' : ''} en attente.</p> : null}
          </Panel>
          <div className="xl:col-span-7">
            <Mirror
              pending={signing}
              lines={[
                ['CONTRACT', 'EXIT EXCEPTION'],
                ['NETWORK', 'BASE'],
                ['POSITION', short(e.pool_id, 10, 6)],
                ['AMOUNT', fmtWei(e.amount_in)],
                ['EXIT COST (BPS)', String(e.seen_exit_bps)],
                ['VALID UNTIL', '1 H'],
              ]}
              caption="Si la sortie empire entre votre lecture et l’achat, le contrat refuse la dérogation."
            />
          </div>
        </div>
      ) : (
        <Empty>Aucune demande. Elles apparaissent ici dès qu’un bot rencontre une position qui déborde de votre mandat.</Empty>
      )}
    </Band>
  )
}

/* ───────────────────────────── 05 · positions and watch ───────────────────────────── */

function PositionsBand({ s }: { s: BenchState }) {
  const { act } = useBench()
  const rows = s.watch?.rows ?? []
  const worse = rows.filter((r) => (r.delta_bps ?? 0) > 0 || r.blocked).length
  return (
    <Band
      id="positions"
      index="05"
      eyebrow="Positions"
      title="Une porte peut se refermer"
      lead="La sonde mesure la sortie au moment de l’achat, pas l’avenir. La seule parade est de resonder, et de sortir tant qu’on peut encore."
    >
      {s.positions.length ? (
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Position</th><th>Bot</th><th>Genre</th><th className="num">Solde</th><th className="num">Sortie à l’achat</th><th>Acquise</th></tr></thead>
            <tbody>
              {s.positions.map((p, i) => (
                <tr key={i}>
                  <td className={p.kind === 'vault' ? 'label' : ''}>{p.name ?? p.pool}</td>
                  <td className="label is-mute">{p.bot ?? '—'}</td>
                  <td className="label">{p.kind === 'vault' ? 'Coffre' : 'Pool'}</td>
                  <td className="num">{Number(p.balance).toExponential(3)}</td>
                  <td className="num">{p.exit_bps ?? '—'} bps</td>
                  <td className="label">{p.under_exception ? <span className="is-warning">sous dérogation</span> : <span className="is-mute">dans le mandat</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>Aucune position. Elles apparaîtront ici avec le coût de sortie mesuré au moment de l’achat.</Empty>}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Ghost onClick={() => act('/watch')} disabled={s.watching}>{s.watching ? 'Sondage…' : 'Resonder'}</Ghost>
        <Ghost quiet onClick={() => act('/watch_sell')} disabled={s.watching}>Resonder et sortir</Ghost>
      </div>

      {rows.length ? (
        <div className="data-scroll mt-8">
          <table className="data-table">
            <thead><tr><th>Position</th><th className="num">À l’achat</th><th className="num">Maintenant</th><th className="num">Écart</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const bad = (r.delta_bps ?? 0) > 0 || r.blocked
                return (
                  <tr key={i}>
                    <td className={r.kind === 'vault' ? 'label' : ''}>{r.name ?? short(r.pool_id, 10, 4)}</td>
                    <td className="num">{r.exit_bps_at_buy ?? '—'} bps</td>
                    <td className={`num ${bad ? 'is-error' : ''}`}>{r.blocked ? 'bloquée' : `${r.exit_bps_now ?? '—'} bps`}</td>
                    <td className={`num ${bad ? 'is-error' : 'is-success'}`}>{r.delta_bps == null ? '—' : `${r.delta_bps > 0 ? '+' : r.delta_bps < 0 ? '−' : ''}${Math.abs(r.delta_bps)} bps`}</td>
                    <td className="label">{r.action === 'SORTI' ? <Badge tone="success">Sortie</Badge> : r.action !== 'aucune' ? <Badge tone="error">{r.action}</Badge> : <span className="is-faint">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="t-caption m-0 mt-3 is-faint">{rows.length} position{rows.length > 1 ? 's' : ''}, {worse} dont la sortie s’est refermée. Ce n’est pas une garantie : entre deux passages, la porte peut se fermer.</p>
        </div>
      ) : null}
    </Band>
  )
}

/* ───────────────────────────── 06 · the account's analyst ───────────────────────────── */

function AnalystBand({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [q, setQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const pending = !!s.analysis?.pending
  const ask = async (text: string) => { if (!text.trim() || pending) return; setQ(''); await act('/analyze', { question: text.trim() }) }
  const count = s.analyses.length
  useEffect(() => { if (count) end.current?.scrollIntoView({ block: 'nearest' }) }, [count, pending])
  return (
    <Band
      id="analyste"
      index="01"
      eyebrow="Mon agent d’analyse"
      title="Il comprend, il ne peut rien faire"
      lead="Un agent branché sur votre compte, en lecture seule. Il ne parle pas de mémoire : il interroge vos bots, vos décisions, vos positions et les mesures, et nomme l’outil derrière chaque nombre."
    >
      {count ? (
        <div className="thread mb-8">
          {s.analyses.map((a, i) => (
            <div key={i} className="thread">
              <div className="thread__you t-body-sm">{a.question}</div>
              <div className="thread__them t-body-sm">
                {a.pending ? <span className="is-faint">Il interroge les outils…</span> : (a.answer ? <Prose text={a.answer} /> : <span className="is-error">Pas de réponse : {a.error}</span>)}
                {!a.pending ? (
                  <span className="thread__trace t-mono-data">
                    {a.tools_used.length
                      ? a.tools_used.map((t) => `${t.tool}(${Object.entries(t.args ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')})`).join(' · ')
                      : 'aucun outil appelé'}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : null}
      <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1"><Field label="Votre question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pourquoi le tour 2 a été refusé ?" autoComplete="off" disabled={pending} /></div>
        <Ghost small type="submit" disabled={pending || !q.trim()}>{pending ? 'Il cherche…' : 'Demander'}</Ghost>
      </form>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
        {ANALYST_IDEAS.map((t) => <button key={t} type="button" className="segment t-caption text-left" onClick={() => ask(t)} disabled={pending}>{t}</button>)}
      </div>
    </Band>
  )
}

/* ───────────────────────────── the bench's log ───────────────────────────── */

function LogBand({ s }: { s: BenchState }) {
  if (!s.log.length) return null
  return (
    <section className="app-band" style={{ paddingBlock: 'var(--spacing-huge)' }}>
      <div className="app-column">
        <details>
          <summary className="t-micro-cap eyebrow cursor-pointer">Journal du banc — {s.log.length} lignes</summary>
          <pre className="log t-mono-data mt-4 m-0">{s.log.slice(-80).join('\n')}</pre>
        </details>
      </div>
    </section>
  )
}
