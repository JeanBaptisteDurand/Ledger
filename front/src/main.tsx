import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { registerGsap } from './motion/scroll'
import { prefersReducedMotion } from './motion/flags'


registerGsap()
if (!prefersReducedMotion()) document.documentElement.classList.add('has-motion')

if (import.meta.env.DEV && new URLSearchParams(location.search).get('fbx') === '1') {
  import('./dev/fbx-probe').then(async (m) => {
    const r = await m.probeFbx()
    ;(window as unknown as { __fbx?: unknown }).__fbx = r
    console.info('[fbx]', JSON.stringify(r))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
