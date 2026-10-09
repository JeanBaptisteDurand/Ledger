import { linkProps } from '../app/router'

/** First product band after the pin releases: the pitch in one sentence, and the door to the dashboard. */
export function Intro() {
  return (
    <section id="ordre" className="hairline-top relative bg-canvas-night">
      <div className="mx-auto flex min-h-dvh max-w-[1200px] flex-col justify-center px-6 py-section md:px-8">
        <h2 data-reveal="mask" className="t-display-xxl m-0 max-w-[22ch] text-balance text-on-primary">
          Un agent n&rsquo;entre pas là d&rsquo;où il ne sait pas sortir
        </h2>
        <p data-reveal="fade" className="t-body-lg mt-8 max-w-[56ch] text-pretty text-on-primary-mute">
          Vous signez une fois, sur votre Ledger, le budget, la perte de sortie tolérée et l&rsquo;échéance. Un contrat
          mesure la sortie à chaque entrée et refuse ce qui ne ressort pas. Ce qui déborde vous revient sur l&rsquo;appareil,
          avec le nombre.
        </p>
        <div data-reveal="fade" data-reveal-delay="0.1" className="mt-12 flex flex-wrap items-center gap-4">
          <a {...linkProps('/app')} className="btn-ghost t-button-cap">
            Ouvrir le tableau de bord
          </a>
          <a {...linkProps('/schema')} className="t-button-cap nav-link">
            Qui fait quoi
          </a>
        </div>
      </div>
    </section>
  )
}
