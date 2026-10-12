/**
 * The name between the Flex's lock-screen brackets: four right angles around the mark, the motif the device
 * lands with (scene/textures.ts makeWordmarkTexture). `size` sets the arm length and the gap, in em, so the
 * same lockup serves the nav and the ring's title. The brackets are drawn, never typed: assistive tech reads
 * only the name.
 */
import type { ReactNode } from 'react'

export function Wordmark({ children, size = 'nav', className = '' }: { children: ReactNode; size?: 'nav' | 'title'; className?: string }) {
  return (
    <span className={`wordmark wordmark--${size} ${className}`}>
      <i className="wordmark__tr" aria-hidden />
      <i className="wordmark__bl" aria-hidden />
      {children}
    </span>
  )
}
