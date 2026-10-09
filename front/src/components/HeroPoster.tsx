import { HERO_TITLE } from './Hero'
import { LANDED_WORD, SCREEN_STEPS } from '../motion/screen-words'
import { NOTE_SENTENCE } from './ScreenNotes'

/**
 * Poster, no canvas, no auto-play. `arrival` (below 768px): act 1 frozen, the Nano X planted, screen reading
 * SCROLL UP. `final` (prefers-reduced-motion): the finished scene, the Flex landed face-on in space.
 * All images are captures of the live scene (scripts/poster.mjs → public/poster-hero-*.jpg). Regenerate them
 * when the title or the scene changes. The CSS sky sits underneath so the section is never blank while the
 * image loads. The narrative texts follow, stacked, in reading order.
 */
export function HeroPoster({ variant }: { variant: 'arrival' | 'final' }) {
  const name = variant === 'final' ? 'poster-hero-final' : 'poster-hero'
  return (
    <>
    <section id="hero" className="relative min-h-dvh overflow-hidden bg-canvas-night" aria-label="Introduction">
      <div className={variant === 'final' ? 'hero-night-solid absolute inset-0' : 'hero-sky absolute inset-0'} aria-hidden />
      <picture>
        <source media="(orientation: landscape) and (min-width: 768px)" srcSet={`/${name}-landscape.jpg`} />
        <img
          src={`/${name}-portrait.jpg`}
          alt=""
          width={780}
          height={1688}
          className="absolute inset-0 h-full w-full object-cover object-center"
          decoding="async"
          fetchPriority="high"
        />
      </picture>
      <h1 className="sr-only">{HERO_TITLE}</h1>
    </section>
    {/*
      Poster and reduced motion: the words the device's screen carries in the animated hero, in order, each
      with the description that hangs off it. In the animated hero a description is revealed by pointing,
      tapping, focusing or waiting; here there is nothing to reveal it with, so it is simply printed.

      It is generated from the same table the hero reads, not transcribed: the first version of this block
      had one sentence copied into it by hand, and it still had one when the hero had grown to three.
    */}
    <section className="bg-canvas-night" aria-label="Séquence">
      <ol className="screen-word-list mx-auto max-w-[52ch] px-6 py-16 md:px-8">
        {SCREEN_STEPS.map((step, i) => (
          <li key={step.word}>
            {step.word}
            {NOTE_SENTENCE[i] ? <p className="poster-note">{NOTE_SENTENCE[i]}</p> : null}
          </li>
        ))}
        <li>{LANDED_WORD}</li>
      </ol>
    </section>
    </>
  )
}
