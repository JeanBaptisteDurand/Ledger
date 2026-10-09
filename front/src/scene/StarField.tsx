/**
 * The space background, now INSIDE the canvas.
 *
 * WHY IT MOVED. It was a DOM layer under the canvas (src/styles/stars.sass, deleted in this pass): three divs whose box-shadow lists
 * drew the stars and whose CSS animations scrolled them. A shader cannot reach a DOM layer, so the
 * gravitational lens in the post pass bent the disc and the nebula and left the star field perfectly flat —
 * which is the one place the bending is supposed to be legible. Here the field is drawn into the same render
 * target as the rest of the scene, so the lens bends it for free, at no extra target and no extra pass.
 *
 * WHAT IS KEPT. The look of the imposed pen, measured off it rather than eyeballed: three layers, hard white
 * square dots of 1, 2 and 3 CSS pixels, at the pen's own densities (700, 200 and 100 dots per 2000 × 2000 area,
 * which is one dot per 75.6, 141.4 and 200.0 px cell), scrolling upward at the pen's own speeds (2000 px in 50,
 * 100 and 150 s, so 40, 20 and 13.3 px/s). Smallest and most numerous is fastest, as in the pen: that inversion
 * is what makes the parallax read.
 *
 * WHAT CHANGES. The positions are a hashed jittered grid instead of a list of 1000 random box-shadows baked at
 * build time. Same density, same crispness, but it never repeats, it costs no memory, it survives any viewport,
 * and it no longer needs the SASS `random()` and `unquote()` that were flagged for removal in Dart Sass 3.
 *
 * COST. One screen-space quad at the far plane, no texture, no allocation per frame. It is depth-tested, so the
 * ground and the devices occlude it exactly as they occlude anything else, and it writes alpha 0 everywhere
 * there is no star, so the canvas stays transparent and the CSS sky still shows through during the Mars act.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { LENS_TWIST, type LensState } from './black-hole-frame'

/** Cell side and dot side, in CSS pixels, and drift in CSS pixels per second, per layer. */
const LAYERS: ReadonlyArray<{ cell: number; dot: number; speed: number }> = [
  { cell: 75.6, dot: 1, speed: 2000 / 50 },
  { cell: 141.4, dot: 2, speed: 2000 / 100 },
  { cell: 200.0, dot: 3, speed: 2000 / 150 },
]

const VERT = /* glsl */ `
  void main() {
    /* Screen-space, pinned to the FAR plane (z = w): whatever wrote depth before it hides it. */
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAmount;
  uniform float uDpr;
  uniform vec3 uColor;
  uniform vec3 uCell;   /* cell side per layer, CSS px */
  uniform vec3 uDot;    /* dot side per layer, CSS px  */
  uniform vec3 uSpeed;  /* upward drift per layer, CSS px/s */
  /* The black hole, in the same CSS pixels: centre, Einstein radius, presence, and a gate for measurement. */
  uniform vec2 uLensCentre;
  uniform float uLensEinstein;
  uniform float uLensAmount;
  uniform float uLensTwist;
  uniform float uLensGain;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  /*
   * One dot per cell, placed by a hash of the cell index. The placement is constrained to
   * [0, cell - dot] so a dot never straddles a cell boundary: that is what lets a single cell lookup draw an
   * exact, unclipped square, with no neighbour sampling and no antialiasing to soften it. A box-shadow dot is a
   * hard square of whole pixels, so this one is too.
   */
  float layer(vec2 px, float cell, float dot_, float speed) {
    /*
     * The field travels DOWN the screen, which is the one thing here that can say the camera is rising.
     *
     * The pen it is measured off scrolls its stars upward, and so did this until now. But the camera's own
     * climb is finished by the first stop, and from there on the sky is drawn in screen space: a camera move
     * would not shift a single star. So the only thing left that can carry "we are going up" is the drift,
     * and upward drift says the opposite. The sign is the whole change; the three layers, their densities and
     * their speeds are the pen's, untouched. Flip it back here to restore the pen's own direction.
     */
    vec2 p = px + vec2(0.0, speed * uTime);
    vec2 id = floor(p / cell);
    vec2 f = p - id * cell;
    vec2 r = vec2(hash21(id), hash21(id + 19.19)) * (cell - dot_);
    vec2 d = f - r;
    vec2 m = step(vec2(0.0), d) * step(d, vec2(dot_));
    return m.x * m.y;
  }

  /*
   * ── Gravitational lensing, applied at the source ─────────────────────
   * The thin-lens map, and the sign of it matters: an object truly at radius b from the mass is SEEN pushed
   * out to r, with b = r - rE² / r. So to draw the pixel at r we ask the field what is at b. Outside the
   * Einstein radius b is positive and smaller than r, and the sample moves toward the hole; inside it b turns
   * negative, which is the SECOND image of the same sky, inverted through the centre. Both are read (see
   * below); the map therefore FOLDS at the ring, which is what an Einstein ring is.
   *
   * Doing it here rather than on the finished frame is what makes it workable. The field is procedural, so
   * there is no texture to run off the edge of and nothing ever needs clamping; the fold costs nothing
   * because each pixel asks its own question of the field rather than resampling a picture of it; and nothing
   * in front of the stars is touched, so the landed Flex is not smeared into the sky, which is what happened
   * when this lived in the post pass.
   *
   * The twist is frame dragging: a static swirl, strongest near the mass, dying as 1/r². Static because the
   * stars supply the motion themselves — they drift past at a known speed, and a fixed twist is what turns
   * that straight drift into a spiral. It is measured against the EINSTEIN radius, not the horizon, which
   * makes it scale-free: the tangential displacement then follows the same rE²/r law as the radial one.
   */
  vec2 lensed(vec2 px) {
    float amt = uLensAmount * uLensGain;
    if (amt < 0.002 || uLensEinstein <= 0.0) return px;
    vec2 toC = px - uLensCentre;
    float rl = max(length(toC), 1e-3);
    float rE = uLensEinstein;
    /*
     * ── Inside the ring: the SECOND image, not a hole ────────────────────
     * b = r - rE²/r goes negative inside the Einstein radius, and that sign is not an error to be clamped
     * away: it is the other solution of the same lens. A mass bends light past both sides of itself, so a
     * source behind it arrives twice — once outside the ring, once inside it, inverted through the centre.
     * The magnitude is the source's distance and the sign is which way round the image is.
     *
     * Clamping it at zero is what made the hole look painted. Every point inside the ring then asked the sky
     * for the SAME single place — the one exactly behind the mass — and got the same answer back: measured on
     * the frame, a hundred and twenty-seven thousand pixels whose brightest value was 13 out of 255. Not an
     * opaque object, one sample stretched over a sixth of the screen.
     *
     * Carried through, the interior shows the sky again, mirrored and wrung tighter the closer to the centre
     * it is read. The two images meet AT the ring, where b is zero on both sides, so the join is seamless and
     * the ring is exactly where the sky doubles back on itself. That is what an Einstein ring is.
     */
    float raw = rl - (rE * rE / rl) * amt;
    float beta = abs(raw);
    /* Negative b is the inverted image: the same direction turned through half a turn. */
    float side = raw < 0.0 ? -1.0 : 1.0;
    float k = rE / max(rl, rE);
    float phi = uLensTwist * amt * k * k;
    float c = cos(phi);
    float sn = sin(phi);
    vec2 dir = toC / rl;
    return uLensCentre + vec2(dir.x * c - dir.y * sn, dir.x * sn + dir.y * c) * (beta * side);
  }

  void main() {
    if (uAmount < 0.002) discard;
    /* gl_FragCoord is in drawing-buffer pixels; the pen's numbers are CSS pixels. */
    vec2 px = lensed(gl_FragCoord.xy / uDpr);
    float a = layer(px, uCell.x, uDot.x, uSpeed.x);
    a = max(a, layer(px, uCell.y, uDot.y, uSpeed.y));
    a = max(a, layer(px, uCell.z, uDot.z, uSpeed.z));
    if (a < 0.5) discard;
    gl_FragColor = vec4(uColor, uAmount);
  }
`

/**
 * @param amount  how present the field is, 0 to 1. A plain object, written from the scene's useFrame.
 * @param frozen  reduced motion: the field is still drawn, it simply does not drift.
 * @param lens    the black hole, written by it and read here. Zero until it exists.
 */
export function StarField({ amount, frozen, lens }: { amount: { value: number }; frozen: boolean; lens: LensState }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const size = useThree((s) => s.size)
  const mesh = useRef<THREE.Mesh>(null)

  const built = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        /** Development only: a non-negative value pins the drift, so a measurement can isolate the lens. */
        uHold: { value: -1 },
        uAmount: { value: 0 },
        uDpr: { value: 1 },
        /* Plain white, as in the pen. It is the one thing on screen that is not on the sunset ramp. */
        uColor: { value: new THREE.Color(1, 1, 1) },
        uCell: { value: new THREE.Vector3(LAYERS[0].cell, LAYERS[1].cell, LAYERS[2].cell) },
        uDot: { value: new THREE.Vector3(LAYERS[0].dot, LAYERS[1].dot, LAYERS[2].dot) },
        uSpeed: { value: new THREE.Vector3(LAYERS[0].speed, LAYERS[1].speed, LAYERS[2].speed) },
        uLensCentre: { value: new THREE.Vector2(0, 0) },
        uLensEinstein: { value: 0 },
        uLensAmount: { value: 0 },
        /** Frame dragging. Zero at this framing, and src/scene/black-hole-frame.ts says why. */
        uLensTwist: { value: LENS_TWIST },
        /** A gate for measurement, and 1 in the product: the scene writes the three above every frame. */
        uLensGain: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      /* Depth test ON: the far plane is behind the ground and the devices, so they occlude it. */
      depthTest: true,
      toneMapped: false,
      fog: false,
    })
    return { material, geometry: new THREE.PlaneGeometry(2, 2) }
  }, [])

  useEffect(
    () => () => {
      built.material.dispose()
      built.geometry.dispose()
    },
    [built],
  )

  useFrame(({ clock }) => {
    const u = built.material.uniforms
    /*
     * Development only, and it earns its place: the field drifts at up to 40 px a second, so any measurement
     * that compares two captures a second apart reads the DRIFT and not what is being measured. Pinning
     * `uHold` holds the field still between the two frames. (A number that was reported for the lens one
     * pass ago was measured without this and was mostly drift.)
     */
    if (import.meta.env.DEV) (window as unknown as { __stars?: unknown }).__stars = u
    u.uAmount.value = amount.value
    u.uDpr.value = dpr
    /* The hole, converted from viewport fractions into the CSS pixels this shader thinks in. */
    u.uLensCentre.value.set(lens.x * size.width, lens.y * size.height)
    u.uLensEinstein.value = lens.radius * lens.strength * size.height
    u.uLensAmount.value = lens.amount
    if (!frozen) u.uTime.value = clock.elapsedTime
    // The hold is a measurement device and belongs to development only; the branch is stripped from the build.
    if (import.meta.env.DEV && u.uHold.value >= 0) u.uTime.value = u.uHold.value
  })

  /* renderOrder: first of the transparent pass, so the nebula and the black hole lie over it, not under. */
  return <mesh ref={mesh} geometry={built.geometry} material={built.material} renderOrder={-3000} frustumCulled={false} />
}

export default StarField
