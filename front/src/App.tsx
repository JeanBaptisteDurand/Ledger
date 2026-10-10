import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Landing as Home } from './components/landing/Landing'
import { Footer } from './components/Footer'
import { initSmoothScroll, setPageLocked } from './motion/scroll'
import { initReveals } from './motion/reveal'
import { hasWebGL, motionEnabled, onMotionChange } from './motion/flags'
import { useRoute } from './app/router'
import { AppShell } from './app/AppShell'

export default function App() {
  const route = useRoute()
  return route === '/' ? <Landing /> : <Product route={route} />
}

/** Before an account: the hero and the pitch, how it works, the door. The scene, the player, the reveals. */
function Landing() {
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
        <Home />
      </main>
      <Footer />
    </div>
  )
}

/** The product pages: calm, dense, no scene and no locked scroll. They inherit the ramp, the type and the grammar. */
function Product({ route }: { route: Exclude<ReturnType<typeof useRoute>, '/'> }) {
  // Leaving the hero mid-sequence must not leave the page locked.
  useEffect(() => {
    setPageLocked(false)
    document.documentElement.style.removeProperty('overflow')
    document.body.style.removeProperty('overflow')
    window.scrollTo(0, 0)
  }, [route])
  useEffect(() => initSmoothScroll(), [])

  return (
    <div>
      <AppShell route={route} nav={(account) => <Nav hiddenUntilRelease={false} solid account={account} />} />
      <Footer />
    </div>
  )
}
