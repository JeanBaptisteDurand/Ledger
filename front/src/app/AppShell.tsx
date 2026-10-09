/**
 * The chrome of every page but the landing: the bench provider, the page under the fixed nav, the messages.
 * Public pages (/schema, /connexion) open to anyone; the account's pages need an address proven by the Ledger and
 * send you to /connexion without one — then back to where you were going.
 */
import { useEffect, type ReactNode } from 'react'
import { BenchProvider, useBench } from './useBench'
import { navigate, rememberNext, type Route } from './router'
import { AgentsPage, AnalystePage, OverviewPage } from './DashboardPage'
import { ComptePage } from './ComptePage'
import { AppareilPage } from './AppareilPage'
import { ConnexionPage } from './ConnexionPage'
import { SchemaPage } from './SchemaPage'
import { Band, Skeleton, Toasts } from './ui'

function Offline() {
  return (
    <Band
      eyebrow="Le banc ne répond pas"
      title="Le serveur est arrêté"
      lead="Ces écrans parlent au banc de Porte de sortie, sur le port 8099. Lancez-le à la racine du dépôt, la page reprendra seule."
    >
      <pre className="t-mono-data m-0 is-info">. .venv/bin/activate{'\n'}ledger/speculos.sh up && python3 web/server.py</pre>
    </Band>
  )
}

/** An account page without an account: remember it, and go and log in. */
function LoginRequired({ route }: { route: Route }) {
  useEffect(() => { rememberNext(route); navigate('/connexion', '', true) }, [route])
  return <div className="app-column pt-12"><Skeleton rows={3} /></div>
}

function Page({ route }: { route: Route }) {
  const { offline, state } = useBench()
  if (route === '/schema') return <SchemaPage />
  if (offline && !state) return <Offline />
  if (!state) return <div className="app-column pt-12"><Skeleton rows={6} /></div>
  if (route === '/connexion') return <ConnexionPage />
  if (!state.address) return <LoginRequired route={route} />
  if (route === '/app/agents') return <AgentsPage />
  if (route === '/app/analyste') return <AnalystePage />
  if (route === '/compte') return <ComptePage />
  if (route === '/appareil') return <AppareilPage />
  return <OverviewPage />
}

export function AppShell({ route, nav }: { route: Route; nav: (account: string | null) => ReactNode }) {
  return (
    <BenchProvider>
      <WithNav nav={nav} />
      <main className="app-page">
        <Page route={route} />
      </main>
      <Toasts />
    </BenchProvider>
  )
}

function WithNav({ nav }: { nav: (account: string | null) => ReactNode }) {
  const { state } = useBench()
  return <>{nav(state?.address ?? null)}</>
}
