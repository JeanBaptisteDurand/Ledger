/** Motion capability flags. Read once per decision; listen with `onMotionChange` for live flips. */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export const DESKTOP_QUERY = '(min-width: 768px)'

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function isDesktop(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Lenis, pinned hero, WebGL: only on desktop widths without reduced motion. */
export function motionEnabled(): boolean {
  return isDesktop() && !prefersReducedMotion()
}

/** `?scene=1` forces the WebGL scene (used to shoot the poster at portrait sizes). */
export function forceScene(): boolean {
  return new URLSearchParams(window.location.search).get('scene') === '1'
}

export function onMotionChange(callback: () => void): () => void {
  const queries = [window.matchMedia(REDUCED_MOTION_QUERY), window.matchMedia(DESKTOP_QUERY)]
  queries.forEach((q) => q.addEventListener('change', callback))
  return () => queries.forEach((q) => q.removeEventListener('change', callback))
}
