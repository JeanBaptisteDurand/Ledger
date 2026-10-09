/**
 * /appareil — the device. Two decisions live here, and they are the ones a demo needs to flip quickly:
 *   1. WHICH Ledger: a real one plugged into this computer (WebHID), or the Flex emulated by the bench.
 *   2. WHERE the signature is made: in this browser (the client's path), or on the bench (Signer Kit / APDU client).
 * And the device's own screen, live, with a finger: click = tap, drag left = swipe, hold = « Hold to sign ».
 */
import { useEffect, useRef, useState } from 'react'
import { post, short, type Signer } from './api'
import { useBench } from './useBench'
import { useLogin } from './session'
import { connect, disconnect, errText, explain, getTransport, setTransport, webHidAvailable, type Transport } from './ledger'
import { AnchoredNote, Badge, Band, Ghost, Panel, Row, Segments, Skeleton } from './ui'

const PATHS: { value: Signer; label: string; what: string }[] = [
  { value: 'browser', label: 'Ma Ledger · ce navigateur', what: 'Le Signer Kit de Ledger tourne dans cette page. Le serveur ne voit jamais l’appareil : il reçoit une signature. C’est le chemin d’un client chez lui.' },
  { value: 'dmk', label: 'Signer Kit · banc', what: 'Le même Signer Kit, lancé par le serveur du banc contre la Flex émulée. Pour une démonstration sans appareil.' },
  { value: 'python', label: 'Client APDU · banc', what: 'Le client Python officiel d’app-ethereum, en APDU directes. Le chemin qui a trouvé le bug chainId.' },
]

/** The device choice, the signing path, the login, the live screen. Used by /appareil and by /connexion. */
export function DeviceBand({ index = '01' }: { index?: string }) {
  const { state, act, say, refresh } = useBench()
  const { login, logout, busy, step } = useLogin()
  const [transport, setT] = useState<Transport>(() => getTransport())
  const [connected, setConnected] = useState<string | null>(() => window.LedgerWeb?.address() ?? null)
  const [testing, setTesting] = useState(false)

  if (!state) return <div className="app-column pt-12"><Skeleton rows={6} /></div>
  const browser = state.signer === 'browser'
  const real = browser && transport === 'webhid'

  const choosePath = async (signer: Signer) => { await act('/signer', { signer }); if (signer !== 'browser') { await disconnect(); setConnected(null) } }
  const chooseTransport = async (t: Transport) => { await setTransport(t); setT(t); setConnected(null) }
  const test = async () => {
    setTesting(true)
    try { setConnected(await connect()) } catch (e) { say(explain(errText(e))); setConnected(null) }
    setTesting(false)
    refresh()
  }

  return (
      <Band
        index={index}
        eyebrow="L’appareil"
        title={real ? 'Votre Ledger, branchée ici' : browser ? 'La Flex émulée, dans ce navigateur' : 'La Flex émulée du banc'}
        lead="Une vraie Ledger ou la Flex émulée : le même code, les mêmes écrans, la même signature vérifiée par le contrat. Choisissez l’appareil, puis l’endroit où la signature se fait."
      >
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-7 flex flex-col gap-6">
            <Panel kicker="Quel appareil">
              <Segments
                label="Appareil"
                value={transport}
                onChange={chooseTransport}
                options={[{ value: 'speculos', label: 'Flex émulée (banc)' }, { value: 'webhid', label: 'Vraie Ledger (USB)' }]}
              />
              <p className="t-body-sm mt-3 mb-0 text-on-primary-mute">
                {transport === 'webhid'
                  ? 'Branchez votre Ledger, déverrouillez-la, ouvrez l’app Ethereum, fermez Ledger Wallet. Le navigateur vous demandera de la choisir.'
                  : 'La Flex du banc est un émulateur officiel de Ledger (Speculos) qui fait tourner la vraie app Ethereum. Son écran est à droite.'}
              </p>
              {transport === 'webhid' && !webHidAvailable() ? (
                <p className="t-body-sm mt-3 mb-0 is-error">Ce navigateur ne sait pas parler à un appareil USB. Utilisez Chrome, Edge ou Brave.</p>
              ) : null}
              {!browser ? (
                <p className="t-body-sm mt-3 mb-0 is-warning">Ce choix ne vaut que pour le chemin « Ma Ledger · ce navigateur ». Les chemins du banc signent toujours sur la Flex émulée.</p>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Ghost small onClick={test} disabled={!browser || testing}>{testing ? 'Connexion…' : 'Tester la connexion'}</Ghost>
                {connected ? <Badge tone="success">{short(connected, 8, 6)}</Badge> : null}
              </div>
            </Panel>

            <Panel kicker="Où se fait la signature">
              <div className="flex flex-col">
                {PATHS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="segment text-left"
                    style={{ minHeight: 0, padding: '14px 0' }}
                    aria-pressed={state.signer === p.value}
                    onClick={() => choosePath(p.value)}
                  >
                    <span className="t-button-cap">{p.label}</span>
                    <span className="t-body-sm mt-1 block is-mute" style={{ textTransform: 'none', letterSpacing: 0 }}>{p.what}</span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel kicker="Le compte">
              {state.address ? (
                <>
                  <Row label="Connecté" value={short(state.address, 10, 8)} />
                  <div className="mt-5"><Ghost small quiet onClick={logout}>Se déconnecter</Ghost></div>
                  <p className="t-caption m-0 mt-4 is-faint">Pour passer de la Flex émulée à votre vraie Ledger : déconnectez-vous, changez d’appareil ci-dessus, reconnectez-vous. Chaque adresse a son compte et son coffre.</p>
                </>
              ) : (
                <>
                  <Ghost onClick={login} disabled={busy}>{busy ? 'Connexion…' : 'Se connecter avec ma Ledger'}</Ghost>
                  <p className="t-caption m-0 mt-4 is-faint">{step ?? (browser ? 'Un message de connexion à lire et à signer sur l’appareil choisi.' : 'L’adresse est lue sur la Flex du banc.')}</p>
                </>
              )}
            </Panel>
          </div>

          <div className="xl:col-span-5">
            <LiveScreen live={state.speculos} signing={state.signing} real={real} />
          </div>
        </div>
      </Band>
  )
}

/** /appareil — my Ledger: the device band, then the Ledger bricks by name. */
export function AppareilPage() {
  const { state } = useBench()
  if (!state) return <div className="app-column pt-12"><Skeleton rows={6} /></div>
  return (
    <>
      <DeviceBand />
      <Band
        index="02"
        eyebrow="Ce qui tourne"
        title="Les briques de Ledger, par leur nom"
        lead="Trois briques du sujet, chacune avec un rôle : le Signer approuve, l’Agent Stack lit et comprend, le Key Ring garde un secret."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="Installées sur le banc">
            {Object.entries(state.ledger_stack ?? {}).map(([k, v]) => <Row key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
          </Panel>
          <Panel kicker="État">
            <Row label="App Ethereum" value="1.22.4 · clé de test" />
            <Row label="Dernière signature" value={state.last_report ? (state.last_report.isBlindSign ? <span className="is-error">à l’aveugle</span> : <span className="is-success">en clair · {state.last_report.clearSigningType}</span>) : '—'} />
            <Row label="Key Ring" value={state.ring ? 'initialisé' : 'non initialisé sur ce poste'} />
            <Row label="Fork de Base" value={state.anvil ? <span className="is-success">en ligne</span> : <span className="is-faint">arrêté</span>} />
          </Panel>
        </div>
        <AnchoredNote>
          Le mandat s’affiche <b>en clair</b> parce que nous avons compilé et signé nos propres descripteurs. En production,
          c’est Ledger qui les signe, comme pour n’importe quel partenaire.
        </AnchoredNote>
      </Band>
    </>
  )
}

/** The emulated Flex's screen, refreshed twice a second, and a finger on it. */
function LiveScreen({ live, signing, real }: { live: boolean; signing: string | null; real: boolean }) {
  const [stamp, setStamp] = useState(0)
  const down = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => setStamp(Date.now()), 450)
    return () => window.clearInterval(t)
  }, [live])

  const point = (e: React.PointerEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const r = img.getBoundingClientRect()
    return { x: Math.round(((e.clientX - r.left) / r.width) * img.naturalWidth), y: Math.round(((e.clientY - r.top) / r.height) * img.naturalHeight) }
  }
  const finger = (action: 'press' | 'release', p: { x: number; y: number }) => post('/finger', { action, ...p }).catch(() => undefined)

  const status = signing ? 'en attente de vous' : live ? 'sous tension' : 'hors tension'
  return (
    <div>
      <p className="t-micro-cap eyebrow m-0 mb-3">{real ? 'La Flex émulée du banc (votre vraie Ledger a son propre écran)' : 'L’écran de la Flex, en direct'} · {status}</p>
      <div className={`device-frame ${signing ? 'mirror--pending' : ''}`}>
        {live ? (
          <img
            src={`/api/screen?t=${stamp}`}
            alt="Écran de la Ledger Flex émulée"
            draggable={false}
            onPointerDown={(e) => { const p = point(e); down.current = { ...p, t: Date.now() }; e.currentTarget.setPointerCapture(e.pointerId); finger('press', p) }}
            onPointerUp={(e) => { if (!down.current) return; finger('release', point(e)); down.current = null }}
          />
        ) : (
          <p className="t-mono-device m-0 p-8 is-faint">ÉCRAN ÉTEINT</p>
        )}
      </div>
      <p className="t-caption m-0 mt-3 max-w-[40ch] is-faint">Un clic est un appui. Glisser vers la gauche tourne la page. Maintenir appuyé signe.</p>
    </div>
  )
}
