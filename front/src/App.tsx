import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Intro } from './components/Intro'
import { Footer } from './components/Footer'
import { initSmoothScroll } from './motion/scroll'
import { initReveals } from './motion/reveal'
import { hasWebGL, motionEnabled, onMotionChange } from './motion/flags'

export default function App() {
  const root = useRef<HTMLDivElement>(null)
  const [sceneMode, setSceneMode] = useState(() => motionEnabled() && hasWebGL())

  useEffect(() => onMotionChange(() => setSceneMode(motionEnabled() && hasWebGL())), [])
  useEffect(() => initSmoothScroll(), [])

  // Reveals are created after the hero pin (child effects run first), so ScrollTrigger refresh order is page order.
  useGSAP(
    () => {
      if (root.current) initReveals(root.current)
    },
    { scope: root, dependencies: [sceneMode] },
  )

  return (
    <div ref={root}>
      <Nav hiddenUntilRelease={sceneMode} />
      <main>
        <Hero />
        <Intro />
      </main>
      <Footer />
    </div>
  )
}
