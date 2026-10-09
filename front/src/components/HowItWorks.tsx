import { linkProps } from '../app/router'

const STEPS: { n: string; title: string; text: string }[] = [
  {
    n: '01',
    title: 'Vous signez une règle',
    text: 'Le budget, la perte de sortie tolérée, l’échéance : lus en clair sur votre Ledger, signés une fois. C’est le mandat. Un contrat à votre nom le garde.',
  },
  {
    n: '02',
    title: 'Vos agents agissent seuls',
    text: 'Vos agents de trading achètent dans votre coffre, sous votre mandat. À chaque entrée, le contrat simule la sortie dans la même transaction et refuse ce qui ne ressort pas.',
  },
  {
    n: '03',
    title: 'Ce qui déborde vous revient',
    text: 'Une position hors bornes devient une demande sur votre Ledger, avec le coût de sortie réel à l’écran. Vous signez une dérogation à usage unique, ou vous laissez refusé.',
  },
]

const SPACE: { label: string; text: string }[] = [
  { label: 'Votre compte', text: 'une adresse prouvée par votre Ledger : pas d’e-mail, pas de mot de passe' },
  { label: 'Vos agents de trading', text: 'nommés, lancés, arrêtés par vous ; pools Uniswap v4 ou coffres à rendement' },
  { label: 'Votre agent d’analyse', text: 'il lit vos décisions et vos positions, cite l’outil derrière chaque nombre, et ne peut rien faire' },
  { label: 'Votre clé MCP', text: 'votre propre Claude lit votre coffre, en lecture seule' },
]

/** After the pitch: how it works in three beats, what is in the account, and the door again. */
export function HowItWorks() {
  return (
    <section id="comment" className="hairline-top relative bg-canvas-night">
      <div className="mx-auto max-w-[1200px] px-6 py-section md:px-8">
        <p data-reveal="fade" className="t-micro-cap eyebrow m-0">Comment ça marche</p>
        <h2 data-reveal="mask" className="t-display-xl m-0 mt-4 max-w-[24ch] text-balance text-on-primary">
          L’agent propose, vous approuvez la règle, le contrat applique
        </h2>
        <ol className="m-0 mt-16 grid list-none gap-10 p-0 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} data-reveal="fade" className="hairline-top pt-6">
              <span className="t-mono-data is-faint">{s.n}</span>
              <h3 className="t-display-lg m-0 mt-3 text-on-primary">{s.title}</h3>
              <p className="t-body-md m-0 mt-4 text-pretty text-on-primary-mute">{s.text}</p>
            </li>
          ))}
        </ol>

        <p data-reveal="fade" className="t-micro-cap eyebrow m-0 mt-24">Dans votre espace</p>
        <dl data-reveal="fade" className="m-0 mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {SPACE.map((x) => (
            <div key={x.label} className="hairline-top pt-4">
              <dt className="t-button-cap text-on-primary">{x.label}</dt>
              <dd className="t-body-md m-0 mt-2 text-on-primary-mute">{x.text}</dd>
            </div>
          ))}
        </dl>

        <div data-reveal="fade" className="mt-16 flex flex-wrap items-center gap-4">
          <a {...linkProps('/connexion')} className="btn-ghost t-button-cap">Se connecter avec ma Ledger</a>
          <a {...linkProps('/schema')} className="t-button-cap nav-link">Voir tout le système</a>
        </div>
      </div>
    </section>
  )
}
