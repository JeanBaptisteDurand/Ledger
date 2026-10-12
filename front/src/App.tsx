import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Landing as Home } from './components/landing/Landing'
import { Footer } from './components/Footer'
import { initSmoothScroll } from './motion/scroll'
import { initReveals } from './motion/reveal'
import { hasWebGL, motionEnabled, onMotionChange } from './motion/flags'
import { useRoute } from './app/router'
import { DemoPage } from './components/demo/Demo'
import { ConnexionPage } from './components/connexion/Connexion'
import { TradesPage } from './components/trades/Trades'
import { AccountPage } from './components/account/Account'

export default function App() {
  const route = useRoute()
  if (route === '/') return <Landing />
  // The public pages stand on the home's surface: the finished scene under their sheets. So do the account's.
  if (route === '/demo') return <DemoPage />
  if (route === '/trades') return <TradesPage />
  if (route === '/account') return <AccountPage />
  return <ConnexionPage />
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
