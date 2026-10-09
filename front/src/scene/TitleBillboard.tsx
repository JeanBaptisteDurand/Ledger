/**
 * The hero title as a ground-anchored billboard behind the device: it runs across almost the whole frame near the
 * horizon, the key passes in front of it, and it trembles with the heat shimmer like the rest of the horizon.
 * It belongs to the world, so it leaves the frame by the bottom with the ground when the camera rises. Revealed
 * once by an upward wipe (bottom-anchored growth + matching texture repeat, the 3D equivalent of a clip-path wipe).
 *
 * DISTANCE IS THE WHOLE POINT. Parallax falls off with depth: at 47 units the billboard drifted roughly five
 * times slower than the ground a few units ahead, so while the sand rushed out of frame the title barely crept
 * down and read as pinned to the screen. It now stands at Z, close enough to share the ground's motion and clear
 * the bottom of the frame on its own, which is also why it needs no opacity fade to get out of the way.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { makeTitleTexture } from './textures'
import type { SceneColors } from './tokens'
import { prefersReducedMotion } from '../motion/flags'
import type { Dawn } from '../motion/dawn'

/*
 * Depth, height and size are one decision. Moving the billboard back shrinks it by perspective, so its width is
 * raised to match: at this depth it reads taller than the first orange band of the sky and shorter than the
 * Ledger standing in front of it, which is the proportion the composition asks for. It still stands on the
 * ground at the horizon, so it keeps the ground's parallax and leaves the frame by the bottom with it.
 */
const Z = -24
/** Clearance between the lowest ink of the title and the ground, in world units. */
const GROUND_CLEARANCE = 0.12
const WIPE_DURATION = 1.1
/** The wipe starts at this point of the dawn (after the light has revealed the sand and the key). */
const DAWN_START = 0.72
/**
 * ── The line reads "BEGIN OUR JOURNEY" first ──────────────────────────────────
 * The Y of YOUR is meant to sit behind the Ledger, so the eye takes the line in twice: once as the sentence
 * the device leaves, and once whole when the device goes.
 *
 * The two numbers below are the whole mechanism and they were measured, not guessed. The key is a tilted slab
 * 172 px wide at every row, sliding right by 0.42 px for each row it descends. A letter that spans the full
 * height of the title can therefore only be hidden inside the INTERSECTION of the slab's spans over that
 * height, which is 172 minus the slide: at the title's old size that window was 54 px and the Y was 73, so it
 * poked out whatever the alignment. Shrinking the line shortens the letters, the slab slides less over them,
 * and the window opens faster than the letter narrows. At 0.79 of the frame the window is about 78 px for a
 * 60 px Y. The shift then centres the letter in it; the line stays optically centred because the device is
 * left of centre and the eye reads the pair together.
 */
const TITLE_WIDTH = 0.96
/** Sideways placement of the whole line, in world units, so the Y lands in the middle of that window. */
const TITLE_SHIFT_X = 0.58
export function TitleBillboard({ text, colors, dawn }: { text: string; colors: SceneColors; dawn: Dawn }) {
  const mesh = useRef<THREE.Mesh>(null)
  const aspect = useThree((s) => s.viewport.aspect)
  // The plane spans 94% of the frame width at its depth; two lines on portrait frames.
  /** One line, always: the title is a single band across the horizon. Portrait included. */
  const lines = 1 as const
  const viewWidth = 2 * Math.abs(Z - 7) * Math.tan((35 / 2) * (Math.PI / 180)) * aspect
  const WIDTH = viewWidth * TITLE_WIDTH
  const made = useMemo(() => {
    // The condensed display face: at a fixed line length it gives the tallest caps.
    const css = getComputedStyle(document.documentElement)
    const family = css.getPropertyValue('--font-title').trim() || css.getPropertyValue('--font-display').trim()
    const weight = css.getPropertyValue('--font-title-weight').trim() || '800'
    const stretch = css.getPropertyValue('--font-display-stretch').trim() || '100%'
    // Flat ink, no light of its own: see makeTitleTexture.
    return makeTitleTexture(text, family, colors.onPrimary.getStyle(), lines, weight, stretch)
  }, [text, colors, lines])
  const texture = made.texture
  const HEIGHT = WIDTH / made.aspect
  useEffect(() => () => texture.dispose(), [texture])

  /*
   * The two fractions are read every frame, not captured at render: the texture is drawn once before the face has
   * arrived and once again after, and the second draw moves both of them. The title stands ON the ground, which
   * means its LOWEST INK rests there, not its baseline. Reading a stale descender is what buries the descenders.
   */
  const placement = () => {
    const base = made.descenderFrac * HEIGHT + GROUND_CLEARANCE
    return base - made.baselineFrac * HEIGHT
  }
  const start = useRef<number | null>(null)
  const done = useRef(false)
  /** The descender the current placement was computed from; a redraw with a different one re-settles the plane. */
  const placedAt = useRef(-1)

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const settled = done.current && placedAt.current === made.descenderFrac
    if (settled) return
    if (prefersReducedMotion()) {
      done.current = true
      placedAt.current = made.descenderFrac
      mesh.current.scale.y = 1
      mesh.current.position.y = placement() + HEIGHT / 2
      texture.repeat.set(1, 1)
      return
    }
    if (done.current) {
      // Already revealed, but the face landed after the wipe: keep it whole and just re-seat it on the ground.
      placedAt.current = made.descenderFrac
      mesh.current.position.y = placement() + HEIGHT / 2
      return
    }
    if (dawn.t < DAWN_START) return
    if (start.current === null) start.current = clock.elapsedTime
    const raw = (clock.elapsedTime - start.current) / WIPE_DURATION
    const t = raw <= 0 ? 0 : raw >= 1 ? 1 : 1 - Math.pow(2, -10 * raw) // expo.out
    const shown = Math.max(t, 0.0001)
    mesh.current.scale.y = shown
    mesh.current.position.y = placement() + (HEIGHT * shown) / 2
    texture.repeat.set(1, shown)
    texture.offset.set(0, 0)
    if (raw >= 1) {
      done.current = true
      placedAt.current = made.descenderFrac
    }
  })

  return (
    <mesh ref={mesh} position={[TITLE_SHIFT_X, placement() + HEIGHT / 2, Z]} scale={[1, 0.0001, 1]}>
      <planeGeometry args={[WIDTH, HEIGHT]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} fog={false} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}
