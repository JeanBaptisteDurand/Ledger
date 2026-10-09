import * as THREE from 'three'

/** Read a DESIGN.md color token from CSS. No hex in scene files. */
export function cssColor(token: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return new THREE.Color(value || '#000000')
}

export type SceneColors = ReturnType<typeof readSceneColors>

export function readSceneColors() {
  return {
    ember: cssColor('--color-sky-ember'),
    orange: cssColor('--color-sky-orange'),
    amber: cssColor('--color-sky-amber'),
    peach: cssColor('--color-sky-peach'),
    rose: cssColor('--color-sky-rose'),
    night: cssColor('--color-sky-night'),
    violet: cssColor('--color-sky-violet'),
    spaceDeep: cssColor('--color-space-deep'),
    azure: cssColor('--color-space-azure'),
    azureSoft: cssColor('--color-space-azure-soft'),
    regolith: cssColor('--color-regolith'),
    regolithDeep: cssColor('--color-regolith-deep'),
    regolithLight: cssColor('--color-regolith-light'),
    body: cssColor('--color-device-body'),
    edge: cssColor('--color-device-edge'),
    screenOff: cssColor('--color-device-screen-off'),
    screenOn: cssColor('--color-device-screen-on'),
    eink: cssColor('--color-device-eink'),
    ink: cssColor('--color-device-ink'),
    alu: cssColor('--color-device-alu'),
    onPrimary: cssColor('--color-on-primary'),
    /** The ramp's brightest stop: the horizon's own glow, and the warm white the night field is drawn in. */
    textCream: cssColor('--color-text-050'),
  }
}

/**
 * The CSS `.hero-sky` gradient, as [token, viewport fraction] stops. These are the KEY stops of the ramp in
 * tokens.css and must match it. The stylesheet inserts smoothstep intermediates between the wide ones so the
 * junctions have no kink; sampling the key stops linearly is close enough for the fog and the haze bands,
 * which are never read against the sky edge to edge.
 */
export const SKY_STOPS: ReadonlyArray<readonly [string, number]> = [
  ['--color-canvas-night', 0.0],
  ['--color-canvas-night', 0.06],
  ['--color-space-deep', 0.24],
  ['--color-sky-violet', 0.38],
  ['--color-sky-rose', 0.5],
  ['--color-sky-ember', 0.565],
  ['--color-sky-orange', 0.608],
  ['--color-sky-amber', 0.64],
  ['--color-sky-peach', 0.66],
  ['--color-sky-amber', 0.69],
  ['--color-regolith-deep', 0.76],
  ['--color-canvas-night', 1.0],
]

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
