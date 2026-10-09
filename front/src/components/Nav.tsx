import { useState } from 'react'
import { linkProps, useRoute, type Route } from '../app/router'

/** The site's name. The device in the hero keeps its own wordmark; this is what the product is called. */
export const SITE_NAME = 'Porte de sortie'

const LINKS: { to: Route; label: string }[] = [
  { to: '/app', label: 'Tableau de bord' },
  { to: '/compte', label: 'Compte' },
  { to: '/appareil', label: 'Appareil' },
  { to: '/schema', label: 'Schéma' },
]

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * nav-bar-overlay: transparent, white caps. Hidden during the pinned hero, revealed by the timeline at release.
 * On the product pages it is there from the start, on the page's own black, with the account on the right.
 */
export function Nav({ hiddenUntilRelease, solid = false, account }: { hiddenUntilRelease: boolean; solid?: boolean; account?: string | null }) {
  const [open, setOpen] = useState(false)
  const route = useRoute()
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
        <nav aria-label="Principale" className="hidden md:block">
          <ul className="m-0 flex list-none items-center gap-2 p-0">
            {LINKS.map((l) => (
              <li key={l.to}>
                <a {...linkProps(l.to)} className="t-button-cap nav-link" aria-current={route === l.to ? 'page' : undefined}>{l.label}</a>
              </li>
            ))}
            {account !== undefined ? (
              <li>
                <a {...linkProps(account ? '/compte' : '/appareil')} className="t-mono-data nav-link" title={account ?? undefined}>
                  {account ? shortAddress(account) : 'Non connecté'}
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
        <button
          type="button"
          className="t-button-cap nav-link -mr-3 md:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Fermer' : 'Menu'}
        </button>
      </div>
      <nav id="site-menu" aria-label="Principale" className="md:hidden" hidden={!open}>
        <ul className="m-0 flex list-none flex-col border-t border-hairline-on-dark bg-canvas-night px-4 py-2">
          {LINKS.map((l) => (
            <li key={l.to}>
              <a
                {...linkProps(l.to)}
                className="t-button-cap nav-link w-full"
                aria-current={route === l.to ? 'page' : undefined}
                onClick={(e) => { linkProps(l.to).onClick(e); setOpen(false) }}
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
