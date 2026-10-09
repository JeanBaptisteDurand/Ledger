/**
 * The site's paths, without a routing library. Two halves, like any SaaS:
 *
 * Before an account — the pitch and the idea, open to anyone:
 *   /                the hero and the pitch (Florent's page), how it works, the door to the account
 *   /schema          who does what, as complete as we can make it
 *   /connexion       choose the Ledger, sign the login message
 *
 * In the account — an address proven by the Ledger (without it, these send you to /connexion):
 *   /app             overview: session and vault, mandate, out-of-bounds requests, positions
 *   /app/agents      my trading agents (the bots): add, stop, restart, history, the journal
 *   /app/analyste    my analysis agent: the conversation, and the MCP calls under each answer
 *   /compte          my account: proven address, MCP key, Claude configuration, what I did
 *   /appareil        my Ledger: which device, where the signature is made, the live screen
 */
import { useEffect, useState } from 'react'

export type Route = '/' | '/schema' | '/connexion' | '/app' | '/app/agents' | '/app/analyste' | '/compte' | '/appareil'
const ROUTES: Route[] = ['/', '/schema', '/connexion', '/app', '/app/agents', '/app/analyste', '/compte', '/appareil']
export const PUBLIC_ROUTES: Route[] = ['/', '/schema', '/connexion']
export const isAccountRoute = (r: Route) => !PUBLIC_ROUTES.includes(r)

const normalise = (p: string): Route => {
  const clean = (p.replace(/\/+$/, '') || '/') as Route
  return ROUTES.includes(clean) ? clean : '/'
}

const listeners = new Set<() => void>()

export function navigate(to: Route, hash = '', replace = false): void {
  if (normalise(location.pathname) === to && !hash) return
  if (replace) history.replaceState(null, '', to + hash)
  else history.pushState(null, '', to + hash)
  listeners.forEach((l) => l())
  if (!hash) window.scrollTo(0, 0)
}

/** Where to go once logged in: the account page that sent you to /connexion, or the overview. */
const NEXT_KEY = 'pdsNext'
export function rememberNext(r: Route): void {
  try { sessionStorage.setItem(NEXT_KEY, r) } catch { /* private mode */ }
}
export function takeNext(): Route {
  let r: string | null = null
  try { r = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY) } catch { /* private mode */ }
  const n = normalise(r ?? '/app')
  return isAccountRoute(n) ? n : '/app'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => normalise(location.pathname))
  useEffect(() => {
    const update = () => setRoute(normalise(location.pathname))
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return route
}

/** An in-app link: a real <a href> (middle-click, copy link) that does not reload the page. */
export function linkProps(to: Route) {
  return {
    href: to,
    onClick: (e: { preventDefault(): void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; button?: number }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || (e.button ?? 0) !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
