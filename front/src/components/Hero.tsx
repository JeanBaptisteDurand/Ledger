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
import { HomeHero } from './home/HomeHero'
import { HomePoster } from './home/HomePoster'
import { SoundToggle } from './SoundToggle'
import { createSoundtrack, type Soundtrack } from '../motion/sound'
import { DESCENT } from '../motion/hero'

/** The home's path. The scene is the landing at `/`; the descent ends here, and a direct load of it starts here. */
export const HOME_PATH = '/home'
export const isHomePath = () => window.location.pathname.replace(/\/+$/, '') === HOME_PATH

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
  // No canvas: the home is a still of the hole; the landing is the scene's poster.
  if (isHomePath()) return <HomePoster />
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
  const progress = useRef<HeroProgress>({ p: 0, pointerX: 0, pointerY: 0, segFrom: 0, segIndex: -1, nudgeSeq: 0, nudgeStrength: 0, descent: 0, mode: 'scene' })
  // The home's hero mounts when the hole starts out of the screen, not before: its name ignites with the ring.
  const [home, setHome] = useState(false)
  const inView = useRef(true)
  /*
   * The scene's sound: created once, armed at the dawn, driven by the player (motion/sound.ts). Never
   * destroyed on the effect's cleanup: StrictMode runs mount → cleanup → mount in development, and a
   * soundtrack destroyed and nulled on the first cleanup left the second mount with nothing to arm.
   */
  const sound = useRef<Soundtrack | null>(null)
  if (!sound.current) sound.current = createSoundtrack()
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
        // On the home the canvas is fixed under the whole page, so it is in view for as long as the tab is.
        (visible) => {
          inView.current = visible
          if (!document.hidden) canvas.current.setFrameloop(visible || progress.current.mode === 'background' ? 'always' : 'demand')
        },
        // A stop that carries a note holds the sequence until that note has been opened. There is no timer
        // after that: the unlock and the change of word on the screen happen in the same instant.
        (stopIndex) => !stopHasNote(stopIndex) || notes.current.presented[stopIndex] === true,
        () => setShowBlackHole(true),
        (phase) => {
          const el = section.current!
          if (phase === 'start') {
            el.setAttribute('data-mode', 'descending')
            // The burst goes on a while under the home and fades; the home is silent after that.
            sound.current?.descend(DESCENT.s)
          }
          // 'end' does not stop the sound: the burst goes on under the home and descend() stops it after its fade.
          if (phase === 'emerge') {
            el.setAttribute('data-mode', 'background')
            document.documentElement.setAttribute('data-home', '')
            // The sheets are drawn in the canvas from here (scene/glass.ts); the CSS blur stands down.
            document.documentElement.setAttribute('data-glass', 'webgl')
            setHome(true)
          }
          if (phase === 'end') {
            if (!isHomePath()) window.history.replaceState(null, '', HOME_PATH + window.location.search)
            canvas.current.setFrameloop('always')
          }
        },
        // A segment released: its phrase; the launch also sends the wind away.
        (index) => {
          sound.current?.cue(index)
          if (index === 0) sound.current?.wind(false)
        },
      )
      /*
       * A hidden tab renders nothing: the frame loop stops and the hole's own clock (BlackHole) stops with it,
       * so it resumes where it was. Back in view, the loop comes back in the state the observer last saw.
       */
      const onVisibility = () => {
        if (document.hidden) canvas.current.setFrameloop('never')
        else canvas.current.setFrameloop(inView.current || progress.current.mode === 'background' ? 'always' : 'demand')
      }
      document.addEventListener('visibilitychange', onVisibility)

      // Dawn. URL overrides freeze it / jump the sequence (captures, posters); otherwise black + locked scroll
      // until the scene is ready, then the rise, then the player waits for the first scroll.
      const el = section.current
      const override = dawnOverride()
      const jump = progressOverride()
      if (import.meta.env.DEV) (window as unknown as { __dawn?: unknown }).__dawn = { dawn: dawn.current, firstRender: gate.current!.promise }
      if (override !== null || isHomePath()) {
        // A direct load of the home is the finished scene with the descent over: the hole, and the page.
        applyDawnCss(el, override ?? 1)
        if (isHomePath()) player.jumpTo(1)
        else if (jump !== null && new URLSearchParams(window.location.search).get('land') === '1') player.land()
        else if (jump !== null) player.jumpTo(jump)
        else player.arm()
      } else {
        applyDawnCss(el, 0)
        lockScroll()
        // The real path only: the captures and the home load silent.
        const arm = contextSafe?.(() => { player.arm(); sound.current?.arm(); sound.current?.wind(true) }) ?? (() => { player.arm(); sound.current?.arm(); sound.current?.wind(true) })
        const start = contextSafe?.(() => runDawn(dawn.current, el, prefersReducedMotion(), arm)) ?? (() => runDawn(dawn.current, el, prefersReducedMotion(), arm))
        Promise.all([loadHeroFonts(), gate.current!.promise]).then(() => start())
      }

      return () => {
        document.removeEventListener('visibilitychange', onVisibility)
        player.destroy()
        sound.current?.stop()
      }
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

      {/*
        The canvas. Absolute inside the section during the scene; fixed under the whole page once the hole has
        come out of the screen (tokens.css: `#hero[data-mode='background'] .hero-canvas`), so the sections
        scroll over it and it never moves.
      */}
      <div className="hero-canvas absolute inset-0">
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

      {/* Cinema edge: over the canvas, framing the scene without darkening the middle of it. It belongs to the scene and leaves with it. */}
      <div className="hero-vignette pointer-events-none absolute inset-0" aria-hidden />

      {/* The home's hero: the name and the thesis, over the hole, from the moment the hole is out. */}
      {home ? <HomeHero delay={0.5} /> : null}

      {/* The reader's switch for the scene's sound; gone on the home. */}
      {sound.current && !home ? <SoundToggle sound={sound.current} /> : null}

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
