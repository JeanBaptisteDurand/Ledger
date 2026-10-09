/**
 * A four-page site needs four paths, not a routing library.
 *   /            the hero and the pitch (Florent's page, untouched)
 *   /app         the dashboard: session, mandate, bots, out-of-bounds requests, positions, analyst
 *   /compte      the account: proven address, bots summary, MCP key, what you did
 *   /appareil    the device: emulated Flex or a real Ledger, live screen, signing path
 *   /schema      who does what
 */
import { useEffect, useState } from 'react'

export type Route = '/' | '/app' | '/compte' | '/appareil' | '/schema'
const ROUTES: Route[] = ['/', '/app', '/compte', '/appareil', '/schema']

const normalise = (p: string): Route => {
  const clean = (p.replace(/\/+$/, '') || '/') as Route
  return ROUTES.includes(clean) ? clean : '/'
}

const listeners = new Set<() => void>()

export function navigate(to: Route, hash = ''): void {
  if (normalise(location.pathname) === to && !hash) return
  history.pushState(null, '', to + hash)
  listeners.forEach((l) => l())
  if (!hash) window.scrollTo(0, 0)
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
