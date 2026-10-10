/**
 * The home without WebGL: below 768px and under reduced motion. The hole is a still of the live scene
 * (scripts: design-shots/pass40 → public/poster-home-*.jpg), fixed under the whole page like the canvas is, so
 * the glass sheets have the same thing behind them. Regenerate the stills when the hole changes.
 */
import { useEffect } from 'react'
import { HomeHero } from './HomeHero'

export function HomePoster() {
  useEffect(() => {
    document.documentElement.setAttribute('data-home', '')
    return () => document.documentElement.removeAttribute('data-home')
  }, [])
  return (
    <section id="hero" data-mode="background" className="relative min-h-dvh overflow-hidden bg-canvas-night" aria-label="Introduction">
      <div className="hero-canvas absolute inset-0" aria-hidden>
        <picture>
          <source media="(orientation: landscape) and (min-width: 768px)" srcSet="/poster-home-landscape.jpg" />
          <img src="/poster-home-portrait.jpg" alt="" width={780} height={1688} className="absolute inset-0 h-full w-full object-cover object-center" decoding="async" fetchPriority="high" />
        </picture>
      </div>
      <h1 className="sr-only">Monolith</h1>
      <HomeHero />
    </section>
  )
}
