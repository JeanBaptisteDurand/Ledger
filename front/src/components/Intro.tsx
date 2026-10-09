/** First product band after the pin releases. Placeholder scope: opener + lead + one ghost CTA. */
export function Intro() {
  return (
    <section id="ordre" className="hairline-top relative bg-canvas-night">
      <div className="mx-auto flex min-h-dvh max-w-[1200px] flex-col justify-center px-6 py-section md:px-8">
        <h2 data-reveal="mask" className="t-display-xxl m-0 max-w-[22ch] text-balance text-on-primary">
          Le Ledger devient le tableau de bord
        </h2>
        <p data-reveal="fade" className="t-body-lg mt-8 max-w-[52ch] text-pretty text-on-primary-mute">
          Chaque ordre se lit champ par champ sur l&rsquo;appareil, au prix réel, et se signe là.
        </p>
        <div data-reveal="fade" data-reveal-delay="0.1" className="mt-12">
          <a href="#appareil" className="btn-ghost t-button-cap">
            Voir la démo
          </a>
        </div>
      </div>
    </section>
  )
}
