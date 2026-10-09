/**
 * /compte — the account. An address proven by the Ledger, its bots, its MCP key (derived, never stored), the
 * configuration to paste into one's own Claude, and the log of what was done.
 */
import { useCallback, useEffect, useState } from 'react'
import { EVENT_LABELS, getAccount, short, type Account } from './api'
import { linkProps } from './router'
import { useBench } from './useBench'
import { useLogin } from './session'
import { Badge, Band, Empty, Ghost, Panel, Row, Skeleton, dateTime, time } from './ui'

export function ComptePage() {
  const { state, act } = useBench()
  const { login, logout, busy, step } = useLogin()
  const [account, setAccount] = useState<Account | null>(null)
  const [reveal, setReveal] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState(false)
  const address = state?.address

  const load = useCallback(async () => {
    if (!address) { setAccount(null); return }
    try { setAccount(await getAccount(reveal)) } catch { /* the bench is down: the page says so elsewhere */ }
  }, [address, reveal])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!address) return
    const t = window.setInterval(load, 6000)
    return () => window.clearInterval(t)
  }, [address, load])

  if (!state) return <div className="app-column pt-12"><Skeleton rows={6} /></div>

  if (!address) {
    return (
      <Band
        eyebrow="Mon compte"
        title="Aucun compte ouvert"
        lead="Un compte, ici, c’est une adresse que votre Ledger a prouvée en signant un message. Rien d’autre à retenir, rien à nous confier."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Ghost onClick={login} disabled={busy}>{busy ? 'Connexion…' : 'Se connecter avec ma Ledger'}</Ghost>
          <a className="nav-link t-button-cap" {...linkProps('/appareil')}>Choisir l’appareil</a>
        </div>
        {step ? <p className="t-caption mt-6 is-faint">{step}</p> : null}
      </Band>
    )
  }

  const live = state.bots.filter((b) => b.status === 'running')
  const old = state.bots.filter((b) => b.status !== 'running')
  const config = account ? JSON.stringify(account.mcp_config, null, 2) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(config); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { /* no clipboard */ }
  }
  const reset = async () => {
    if (window.confirm('Remettre ce compte à zéro ? Le mandat et les bots sont supprimés ; le coffre reste sur la chaîne.')) await act('/reset')
  }

  return (
    <>
      <Band
        index="01"
        eyebrow="Mon compte"
        title="Prouvé par votre Ledger"
        lead="Tout ce qui vous appartient ici est rangé sous cette adresse : votre mandat, vos bots, leur journal, ce dont on vous a prévenu, ce que vous avez fait."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="L’adresse">
            <p className="t-mono-data-lg m-0 break-all text-text-050">{address}</p>
            <div className="mt-5">
              <Row label="Depuis" value={dateTime(account?.profile.created)} />
              <Row label="Connexions" value={account?.profile.logins ?? '—'} />
              <Row label="Dernier chemin" value={account?.profile.last_via ?? '—'} />
              <Row label="Coffre" value={short(state.vault, 10, 8)} />
              <Row label="Mandat" value={state.signed ? <span className="is-success">signé</span> : <span className="is-faint">à signer</span>} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Ghost small quiet onClick={logout}>Se déconnecter</Ghost>
              <Ghost small quiet onClick={reset}>Remettre à zéro</Ghost>
            </div>
          </Panel>

          <Panel kicker="Mes bots">
            <Row label="En activité" value={live.length ? live.map((b) => b.name).join(' · ') : '—'} />
            <Row label="Arrêtés" value={old.length} />
            <Row label="Positions tenues" value={state.positions.length} />
            <Row label="Demandes en attente" value={(state.escalation ? 1 : 0) + state.escalation_queue.length} />
            <div className="mt-6 flex flex-wrap gap-3">
              <a className="btn-ghost btn-ghost--small t-button-cap" {...linkProps('/app')}>Gérer mes bots</a>
              <a className="nav-link t-button-cap" {...linkProps('/app')}>Parler à l’analyste</a>
            </div>
          </Panel>
        </div>
      </Band>

      <Band
        index="02"
        eyebrow="La clé MCP"
        title="Votre Claude lit votre coffre"
        lead="Cette clé est dérivée d’un secret maître et de votre adresse ; elle n’est écrite nulle part. Collée dans votre Claude, elle ouvre vos données en lecture seule — vos bots, vos décisions, vos positions — et rien d’autre."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="La clé">
            <p className="t-mono-data-lg m-0 break-all text-text-050">{account?.mcp_key ?? '—'}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Ghost small onClick={() => setReveal((v) => !v)}>{reveal ? 'Masquer' : 'Révéler'}</Ghost>
              <Ghost small quiet onClick={() => setShowConfig((v) => !v)}>{showConfig ? 'Fermer la configuration' : 'Configuration Claude'}</Ghost>
            </div>
            <p className="t-caption m-0 mt-5 is-faint">
              Le secret maître dont elle dérive peut être scellé dans le Ledger Key Ring de l’opérateur : une seule clé à protéger pour tous les comptes.
            </p>
          </Panel>
          {showConfig ? (
            <Panel raised kicker="À coller dans la configuration MCP de Claude">
              <pre className="t-mono-data m-0 overflow-auto whitespace-pre-wrap break-all is-info">{config}</pre>
              <div className="mt-5"><Ghost small onClick={copy} disabled={!reveal}>{copied ? 'Copié' : reveal ? 'Copier' : 'Révélez la clé pour copier'}</Ghost></div>
            </Panel>
          ) : (
            <Empty>
              Dix outils, tous en lecture : <span className="t-mono-data is-info">bots · operations · decision · positions · mandate · hook_analysis · vault_openness · …</span>.
              Aucun ne signe, n’envoie ni n’arrête un bot.
            </Empty>
          )}
        </div>
      </Band>

      <Band index="03" eyebrow="Historique" title="Ce que vous avez fait" lead="Chaque geste, du plus récent au plus ancien.">
        {account?.events.length ? (
          <div className="data-scroll">
            <table className="data-table">
              <thead><tr><th>Heure</th><th>Geste</th><th>Détail</th></tr></thead>
              <tbody>
                {account.events.slice().reverse().map((e, i) => {
                  const { ts, kind, ...rest } = e
                  const detail = Object.entries(rest)
                    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                    .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                    .join(' · ')
                  const tone = kind === 'exception_signed' ? 'warning' : kind === 'exception_refused' ? 'mute' : kind === 'mandate_signed' ? 'success' : null
                  return (
                    <tr key={i}>
                      <td>{time(ts)}</td>
                      <td className="label">{tone ? <Badge tone={tone}>{EVENT_LABELS[kind] ?? kind}</Badge> : <span className="text-text-050">{EVENT_LABELS[kind] ?? kind}</span>}</td>
                      <td className="label is-mute" style={{ overflowWrap: 'anywhere' }}>{detail || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : account ? <Empty>Rien encore.</Empty> : <Skeleton rows={5} />}
      </Band>
    </>
  )
}
