/**
 * The site's paths, without a routing library. Two halves, like any SaaS:
 *
 * Before an account — the pitch and the idea, open to anyone:
 *   /                the hero and the pitch (Florent's page), how it works, the door to the account
 *   /demo            the journey on the bench, replayed with the real screens of the Flex
 *   /connexion       choose the Ledger, sign the login message
 *
 * Once signed in, the demo is the product: its live modes drive the bench with the holder's own vault.
 */
import { useEffect, useState } from 'react'

export type Route = '/' | '/demo' | '/connexion'
const ROUTES: Route[] = ['/', '/demo', '/connexion']

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
