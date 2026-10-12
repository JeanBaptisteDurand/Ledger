/**
 * The site's paths, without a routing library. Two halves, like any SaaS:
 *
 * Before an account — the pitch and the idea, open to anyone:
 *   /                the hero and the pitch (Florent's page), the principle, the map, the door to the account
 *   /demo            the journey on the bench: replayed with the real screens of the Flex, or live on the map, or the cockpit
 *   /connexion       choose the Ledger, sign the login message
 *
 * Once signed in (an address proven by the Ledger; without it, these send you to /connexion):
 *   /trades          my trading agents, the requests they raise, the positions, the journal decision by decision
 *   /account         my funds signed on the Ledger, my analyst, my MCP key and Claude configuration, what I did
 */
import { useEffect, useState } from 'react'

export type Route = '/' | '/demo' | '/connexion' | '/trades' | '/account'
const ROUTES: Route[] = ['/', '/demo', '/connexion', '/trades', '/account']
export const PUBLIC_ROUTES: Route[] = ['/', '/demo', '/connexion']
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

/** Where to go once logged in: the account page that sent you to /connexion, or the demo's live map. */
const NEXT_KEY = 'pdsNext'
export function rememberNext(r: Route): void {
  try { sessionStorage.setItem(NEXT_KEY, r) } catch { /* private mode */ }
}
export function takeNext(): Route | null {
  let r: string | null = null
  try { r = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY) } catch { /* private mode */ }
  if (!r) return null
  const n = normalise(r)
  return isAccountRoute(n) ? n : null
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
export function linkProps(to: Route, hash = '') {
  return {
    href: to + hash,
    onClick: (e: { preventDefault(): void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; button?: number }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || (e.button ?? 0) !== 0) return
      e.preventDefault()
      navigate(to, hash)
      if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
    },
  }
}
