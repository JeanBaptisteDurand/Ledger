import { useEffect, useState } from 'react'
import { linkProps, useRoute, type Route } from '../app/router'

/** The site's name. The device in the hero keeps its own wordmark; this is what the product is called. */
export const SITE_NAME = 'Porte de sortie'

/**
 * Before an account: the pitch, the demo, the door. "The product" is the home, the explanation under the finished scene,
 * and it is a full load (`href`, no in-app navigation): the scene decides its finished state from the path at mount,
 * so an in-page push to /home would leave a running sequence where it is.
 */
const PUBLIC_LINKS: { to: Route; label: string; href?: string }[] = [
  { to: '/', label: 'The product', href: '/home' },
  { to: '/demo', label: 'Demo' },
]

/** In the account: the same two, then what is mine. */
const ACCOUNT_LINKS: { to: Route; label: string; href?: string }[] = [
  ...PUBLIC_LINKS,
  { to: '/trades', label: 'Trades' },
  { to: '/account', label: 'Account' },
]

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** On the landing there is no bench provider: one quiet look at the session, to offer the account instead of the sign-in door. */
function usePeek(enabled: boolean): string | null {
  const [address, setAddress] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch('/api/state', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live) setAddress(s?.address ?? null) })
      .catch(() => { /* the bench is down: we stay public */ })
    return () => { live = false }
  }, [enabled])
  return address
}

/**
 * nav-bar-overlay: transparent, white caps. Hidden during the pinned hero, revealed by the timeline at release.
 * On the other pages it is there from the start, on the page's own black. Logged out it shows the public site and the
 * door; logged in, the account's pages and the address.
 */
export function Nav({ hiddenUntilRelease, solid = false, account }: { hiddenUntilRelease: boolean; solid?: boolean; account?: string | null }) {
  const [open, setOpen] = useState(false)
  const route = useRoute()
  const peek = usePeek(account === undefined)
  const address = account === undefined ? peek : account
  const links = address ? ACCOUNT_LINKS : PUBLIC_LINKS
  const door = address
    ? { to: '/account' as Route, label: shortAddress(address), title: `${address}: signed in with the Ledger`, mono: true }
    : { to: '/connexion' as Route, label: 'Sign in', title: 'Sign in with my Ledger', mono: false }
  const doorClass = door.mono ? 't-mono-data nav-link' : 'btn-ghost btn-ghost--small t-button-cap'
  return (
    <header
      id="site-nav"
      className={`fixed inset-x-0 top-0 z-20 ${solid ? 'hairline-bottom bg-canvas-night' : ''}`}
      style={hiddenUntilRelease ? { visibility: 'hidden', opacity: 0 } : undefined}
    >
      <div className="flex h-[72px] items-center justify-between px-4 md:px-8">
        <a {...linkProps('/')} className="t-button-cap nav-link -ml-3">
          {SITE_NAME}
        </a>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="m-0 flex list-none items-center gap-2 p-0">
            {links.map((l) => (
              <li key={l.to}>
                <a {...(l.href ? { href: l.href } : linkProps(l.to))} className="t-button-cap nav-link" aria-current={route === l.to ? 'page' : undefined}>{l.label}</a>
              </li>
            ))}
            <li className="ml-2">
              <a {...linkProps(door.to)} className={doorClass} title={door.title} aria-current={route === door.to ? 'page' : undefined}>
                {door.label}
              </a>
            </li>
          </ul>
        </nav>
        <button
          type="button"
          className="t-button-cap nav-link -mr-3 md:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <nav id="site-menu" aria-label="Main" className="md:hidden" hidden={!open}>
        <ul className="m-0 flex list-none flex-col border-t border-hairline-on-dark bg-canvas-night px-4 py-2">
          {[...links, ...(address ? [] : [{ to: door.to, label: door.label }])].map((l) => (
            <li key={l.to + l.label}>
              <a
                {...(l.href ? { href: l.href } : linkProps(l.to))}
                className="t-button-cap nav-link w-full"
                aria-current={route === l.to ? 'page' : undefined}
                onClick={(e) => { if (!l.href) linkProps(l.to).onClick(e); setOpen(false) }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
