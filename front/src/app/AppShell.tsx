/** The chrome of the product pages: the bench provider, the page under the fixed nav, the messages. */
import type { ReactNode } from 'react'
import { BenchProvider, useBench } from './useBench'
import type { Route } from './router'
import { DashboardPage } from './DashboardPage'
import { ComptePage } from './ComptePage'
import { AppareilPage } from './AppareilPage'
import { SchemaPage } from './SchemaPage'
import { Band, Toasts } from './ui'

function Offline() {
  return (
    <Band
      eyebrow="Le banc ne répond pas"
      title="Le serveur est arrêté"
      lead="Ces écrans parlent au banc de Porte de sortie, sur le port 8099. Lancez-le, la page reprendra seule."
    >
      <pre className="t-mono-data m-0 is-info">cd porte-de-sortie && . .venv/bin/activate{'\n'}ledger/speculos.sh up && python3 web/server.py</pre>
    </Band>
  )
}

function Page({ route }: { route: Route }) {
  const { offline, state } = useBench()
  if (offline && !state) return <Offline />
  if (route === '/compte') return <ComptePage />
  if (route === '/appareil') return <AppareilPage />
  if (route === '/schema') return <SchemaPage />
  return <DashboardPage />
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
