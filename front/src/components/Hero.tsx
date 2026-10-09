import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { HeroCanvas, type CanvasControls } from '../scene/HeroCanvas'
import { HeroPoster } from './HeroPoster'
import { createHeroPlayer, type HeroProgress } from '../motion/hero'
import { STOPS } from '../motion/hero-math'
import { makeNotesState, stopHasNote, type NotesState } from '../motion/context-note'
import { ScreenNotes } from './ScreenNotes'
import { applyDawnCss, dawnOverride, loadHeroFonts, lockScroll, progressOverride, runDawn, type Dawn } from '../motion/dawn'
import { forceScene, hasWebGL, motionEnabled, onMotionChange, prefersReducedMotion } from '../motion/flags'
import { REST_WORD } from '../motion/screen-words'

export const HERO_TITLE = 'Begin Your Journey'
export const PROJECT_NAME = 'Monolith' // provisional working name

/** Scene on desktop; under reduced motion the finished scene as a poster (no auto-play); below 768px the arrival poster. */
type Mode = 'scene' | 'poster-final' | 'poster-arrival'
const pickMode = (): Mode => {
  if (forceScene() || (motionEnabled() && hasWebGL())) return 'scene'
  return prefersReducedMotion() ? 'poster-final' : 'poster-arrival'
}

export function Hero() {
  const [mode, setMode] = useState<Mode>(pickMode)
  useEffect(() => onMotionChange(() => setMode(pickMode())), [])
  if (mode === 'scene') return <HeroStage />
  return <HeroPoster variant={mode === 'poster-final' ? 'final' : 'arrival'} />
}

/**
 * Three acts, played once (motion/hero.ts). Layers: sky (+ breathing glow) → night → canvas (ground, title
 * billboard, device, stars). The title lives in the 3D scene (anchored to the ground); the h1 stays in the DOM
 * for assistive tech. The page opens black; once the scene has rendered and the fonts are in, the day rises
 * (motion/dawn.ts), then the scene waits for the first scroll.
 */
function HeroStage() {
  const section = useRef<HTMLElement>(null)
  const sky = useRef<HTMLDivElement>(null)
  const night = useRef<HTMLDivElement>(null)
  const stars = useRef<HTMLDivElement>(null)
  // The black hole is a separate chunk; this is what lets it be asked for, once, near the end.
  const [showBlackHole, setShowBlackHole] = useState(false)
  const progress = useRef<HeroProgress>({ p: 0, pointerX: 0, pointerY: 0, segFrom: 0, segIndex: -1, nudgeSeq: 0, nudgeStrength: 0 })
  // The notes that hang off the screen words. The player will not leave a stop that carries one until it is
  // open, and the moment it opens the screen asks for a scroll again.
  const notes = useRef<NotesState>(makeNotesState(STOPS.length))
  const dawn = useRef<Dawn>({ t: dawnOverride() ?? 0 })
  const canvas = useRef<CanvasControls>({ invalidate: () => {}, setFrameloop: () => {} })
  // Loading gate, created exactly once (a `useRef(new Promise(...))` would re-run its executor on every render).
  const gate = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  if (!gate.current) {
    let resolve: () => void = () => {}
    const promise = new Promise<void>((r) => (resolve = r))
    gate.current = { promise, resolve }
  }

  useGSAP(
    (_, contextSafe) => {
      if (!section.current || !sky.current || !night.current) return
      const player = createHeroPlayer(
        {
          section: section.current,
          sky: sky.current,
          night: night.current,
          stars: stars.current,
          nav: document.getElementById('site-nav'),
          word: section.current.querySelector<HTMLElement>('[data-screen-word]'),
        },
        progress.current,
        () => canvas.current.invalidate(),
        // Render continuously while the hero is on screen (the resting scene moves); on demand once scrolled away.
        (visible) => canvas.current.setFrameloop(visible ? 'always' : 'demand'),
        // A stop that carries a note holds the sequence until that note has been opened. There is no timer
        // after that: the unlock and the change of word on the screen happen in the same instant.
        (stopIndex) => !stopHasNote(stopIndex) || notes.current.presented[stopIndex] === true,
        () => setShowBlackHole(true),
      )

      // Dawn. URL overrides freeze it / jump the sequence (captures, posters); otherwise black + locked scroll
      // until the scene is ready, then the rise, then the player waits for the first scroll.
      const el = section.current
      const override = dawnOverride()
      const jump = progressOverride()
      if (import.meta.env.DEV) (window as unknown as { __dawn?: unknown }).__dawn = { dawn: dawn.current, firstRender: gate.current!.promise }
      if (override !== null) {
        applyDawnCss(el, override)
        if (jump !== null) player.jumpTo(jump)
        else player.arm()
      } else {
        applyDawnCss(el, 0)
        lockScroll()
        const arm = contextSafe?.(() => player.arm()) ?? (() => player.arm())
        const start = contextSafe?.(() => runDawn(dawn.current, el, prefersReducedMotion(), arm)) ?? (() => runDawn(dawn.current, el, prefersReducedMotion(), arm))
        Promise.all([loadHeroFonts(), gate.current!.promise]).then(() => start())
      }

      return () => player.destroy()
    },
    { scope: section },
  )

  return (
    <section ref={section} id="hero" className="relative h-dvh overflow-hidden bg-canvas-night" aria-label="Introduction">
      <div ref={sky} className="hero-sky hero-sky--tall absolute inset-x-0" aria-hidden>
        <div className="hero-breathe" />
      </div>
      <div ref={night} className="hero-night absolute inset-0" aria-hidden />

      {/*
        The darkness space is seen against. The stars are no longer here: they are drawn in the canvas
        (src/scene/StarField.tsx), because the lens in the post pass can only bend what it renders.
      */}
      <div ref={stars} className="hero-stars" aria-hidden />

      <h1 className="sr-only">{HERO_TITLE}</h1>

      <div className="absolute inset-0">
        <HeroCanvas
          progress={progress.current}
          dawn={dawn.current}
          title={HERO_TITLE}
          projectName={PROJECT_NAME}
          notes={notes.current}
          showBlackHole={showBlackHole}
          onReady={(controls) => {
            canvas.current = controls
          }}
          onFirstRender={() => gate.current?.resolve()}
        />
      </div>

      {/* Cinema edge: over the canvas, framing the scene without darkening the middle of it. */}
      <div className="hero-vignette pointer-events-none absolute inset-0" aria-hidden />

      {/* The descriptions hanging off the screen words, and the hairlines that tie them to the key. */}
      <ScreenNotes notes={notes.current} />

      {/*
        The narrative is carried by the device's own screen, which is a 3D texture and therefore invisible to
        assistive tech. The same word is mirrored here as real text, updated at every step. Under reduced motion
        the animated hero is never mounted and the poster prints the whole sequence instead.
      */}
      <p data-screen-word className="sr-only" role="status" aria-live="polite">
        {REST_WORD}
      </p>

    </section>
  )
}
