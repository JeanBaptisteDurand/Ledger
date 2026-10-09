import { useState } from 'react'
import { PROJECT_NAME } from './Hero'

const LINKS = [
  { href: '#portefeuille', label: 'Portefeuille' },
  { href: '#ordre', label: 'Ordre' },
  { href: '#appareil', label: 'Appareil' },
]

/** nav-bar-overlay: transparent, white caps. Hidden during the pinned hero, revealed by the timeline at release. */
export function Nav({ hiddenUntilRelease }: { hiddenUntilRelease: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <header
      id="site-nav"
      className="fixed inset-x-0 top-0 z-20"
      style={hiddenUntilRelease ? { visibility: 'hidden', opacity: 0 } : undefined}
    >
      <div className="flex h-[72px] items-center justify-between px-4 md:px-8">
        <a href="#hero" className="t-button-cap nav-link -ml-3">
          {PROJECT_NAME}
        </a>
        <nav aria-label="Principale" className="hidden md:block">
          <ul className="m-0 flex list-none gap-2 p-0">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="t-button-cap nav-link">{l.label}</a>
              </li>
            ))}
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
            <li key={l.href}>
              <a href={l.href} className="t-button-cap nav-link w-full" onClick={() => setOpen(false)}>{l.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
