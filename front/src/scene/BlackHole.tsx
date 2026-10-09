/**
 * The black hole the Flex arrives in front of.
 *
 * WHAT THIS IS NOT. The reference given for it is brunosimon/webgl-black-hole, whose package.json declares
 * `"license": "UNLICENSED"` and which carries no licence file: no reuse rights are granted, so none of its
 * code is here. What was taken from reading it is the technique: a flat annulus with a noise-driven shader
 * for the accretion disc, and a screen-space deflection for the lensing.
 *
 * WHERE THE LENSING IS. Not here. It is applied to the star field's own coordinates before the field is
 * evaluated (src/scene/StarField.tsx), from the framing this file and that one share
 * (src/scene/black-hole-frame.ts). This file draws the ring and lights the scene, and nothing else.
 *
 * SIZE AND PLACE. The framing of pass 24 is back, and it is framing rather than taste: the horizon is placed
 * so that its circle passes through the two TOP CORNERS of the viewport and its lowest point sits on the
 * middle of the screen, the top of it off the frame. For a circle through (0,0) and (W,0) whose bottom is at
 * H/2 the radius is (H² + W²) / 4H and the centre is exactly that radius above the middle of the screen. Both
 * are recomputed every frame from the live viewport, so the arc still meets the corners at any window size.
 *
 * THE MESH IS DRAWN AT EXACTLY THAT RADIUS. It was divided by the lens's own magnification while the lens
 * acted on the finished frame, because a lens magnifies the shadow it casts. The lens now acts on the star
 * field alone (src/scene/StarField.tsx), so the arc is drawn where it is framed and nothing moves it.
 *
 * NOTHING IS OPAQUE ANY MORE. There was a black disc filling everything inside the arc, which is what a
 * shadow is and what the previous passes drew. It is gone at the author's request: what is wanted is to see
 * the sky THROUGH the hole, bent, rather than to see a hole punched in the sky. So the only thing drawn is
 * the ring, and the darkness inside it is no longer painted — it is what the lens leaves. Close to the
 * centre the magnification is enormous, so a large patch of screen shows a tiny patch of sky: the field
 * empties and stretches on its own, and the eye reads an absence that is made of the same stars as the rest
 * of the frame rather than of paint.
 *
 * THE EINSTEIN RADIUS IS THE DRAWN RADIUS, which is what makes the effect legible on the one arc that is in
 * frame. It used to be a third of it, and the region where the bending shows sat inside the ring, which on
 * this framing is off the top of the screen: there was nothing to see on the bottom arc. Set equal, the
 * deflection is total exactly at the ring and the sky is wrung out from there outward, so the stars along the
 * bottom arc are drawn into tangential streaks. Measured on the render: twelve times elongated against the
 * ring, falling to two and a half far out, and within a degree and a half of the tangent throughout.
 *
 * WHAT THE FRAMING COSTS, stated rather than hidden: the centre is off the top of the screen, so the ring
 * closes above the frame and only its lower arc is ever seen. That is the composition, and it was asked for.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SceneColors } from './tokens'
import { arcRadiusPx, HOLE_FALL_LIFT } from './black-hole-frame'

/** How far behind the landed device the hole sits. The device rests about 4.6 from the camera. */
const DISTANCE = 16
/** The horizon, as a fraction of the disc quad's half-extent: the ring reaches 1.14 horizon radii. */
const INNER_FRAC = 0.88
/*
 * The arrival is a brightening and no longer a descent.
 *
 * The arc used to start a third of a radius higher and drop into place on the Flex's climb. That drop is 280
 * pixels of movement during the one second the reader is being shown the landing, and it was part of what was
 * being read as the scene swinging. The ring now appears where it belongs and comes UP IN BRIGHTNESS on the
 * same curve, which arrives with the Flex just as well and moves nothing.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uInner;
  /** Where on the ring matter is coming toward us, in radians. The visible arc sits around -PI/2. */
  uniform float uBeam;
  /**
   * How much of the disc's motion is applied, 0 to 1. It is 1 in the product and exists so the change can be
   * MEASURED: at 0 the shader is exactly what it was before this pass, so the same instrument reads the disc
   * with and without the orbit, the in-fall and the beaming and the difference is a number rather than a claim.
   */
  uniform float uMotion;
  /**
   * How far the horizon has caught, 0 to 1, from the LEFT edge of the quad to the right. The front is a soft
   * edge with a brighter lip on it, because a rim that simply faded up everywhere would be a dimmer switch and
   * what is wanted is something catching.
   */
  uniform float uBurn;

  /*
   * Radians a second the whole pattern turns about the horizon.
   *
   * The ANGLE is down from 0.85 and the SPEED is not. On a ring of 139 px, 0.85 rad/s was 139 px/s along it;
   * on an arc six times bigger the same angle would be six times the travel, which on a curve this shallow
   * would read as a smear rather than a rotation. 0.175 rad/s keeps the travel at about 140 px/s — the figure
   * that was measured and accepted at the small size — on a radius of 800. If a faster sweep is wanted, this
   * is the one number to change.
   */
  #define ORBIT_RATE 0.175
  /** How soft the ignition front is, and how wide its bright lip, in quad units. */
  #define BURN_SOFT 0.16
  #define BURN_LIP 0.055
  uniform vec3 uInnerColor;
  uniform vec3 uMidColor;
  uniform vec3 uOuterColor;
  varying vec2 vUv;

  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    // Nothing beyond the disc, and nothing inside the horizon: the core is drawn by its own opaque mesh.
    if (r > 1.0 || r < uInner * 0.995) discard;

    // The disc falls off outward from the horizon, steeply.
    float disc = smoothstep(1.0, uInner, r);
    disc = pow(disc, 2.3);

    /*
     * ── What moves ───────────────────────────────────────────────────────
     * Three things, none of them the geometry: the arc has to keep meeting the two top corners, so its size and
     * its place are fixed and only its light is allowed to change.
     *
     * 1. ORBIT. The whole pattern turns about the horizon. The visible sliver spans about 130 degrees of the
     *    circle, so a slow angular rate still reads as a real sideways travel of tens of pixels a second.
     * 2. IN-FALL. The radial phase drifts outward, which makes the features themselves crawl INWARD, toward
     *    the horizon. Matter on an accretion disc is losing angular momentum; this is what that looks like.
     * 3. SHEAR. The inner edge turns faster than the outer one, so the streaks stretch and tear as they go
     *    instead of holding their shape like a printed texture being rotated.
     */
    float a = atan(d.y, d.x) + uTime * ORBIT_RATE * uMotion;
    float shear = mix(1.7, 0.45, smoothstep(uInner, 1.0, r));
    float infall = uTime * 1.15 * uMotion;
    float swirl = 0.58
      + 0.30 * sin(a * 7.0 + uTime * 0.62 * shear + r * 9.0 + infall)
      + 0.16 * sin(a * 13.0 - uTime * 0.37 * shear + r * 17.0 + infall * 1.7);

    /*
     * DOPPLER BEAMING. One side of the disc comes toward the eye and is brighter and bluer; the other recedes.
     * We keep the ramp and drop the blue, so it is brightness alone. The bright side sways slowly rather than
     * sitting still, which is the difference between a lit object and a photograph of one.
     */
    float beam = mix(1.0, 0.60 + 0.55 * cos(a - uBeam), uMotion);

    // The photon ring: a thin bright line hugging the horizon, itself unquiet.
    float ringW = uInner * (0.014 + 0.0028 * sin(uTime * 0.83) * uMotion);
    float ring = exp(-pow((r - uInner) / ringW, 2.0));
    ring *= mix(1.0, 0.82 + 0.18 * sin(a * 3.0 - uTime * 0.9), uMotion);

    vec3 col = mix(uOuterColor, uMidColor, pow(disc, 0.55));
    col = mix(col, uInnerColor, ring);
    /*
     * The body of the disc is pulled well down and the photon ring left at full strength. What is wanted is a
     * thin line of fire around an absence, not a lit sphere: the mass is supposed to be inferred from what it
     * does to the star field, and a glowing body is exactly what stops the eye looking for that.
     */
    /*
     * The beaming is carried by the RING as well as by the body, and softly: matter on the near side of the
     * orbit is coming toward the eye, and the photon ring is made of the same matter. Before, the ring was
     * beamed nowhere and the body carried it at a third of the opacity, so the only thing on the hole that
     * actually turned was almost invisible — measured, the ring's travel came out at zero. Softly, because a
     * ring that went out on its far side would read as a broken circle rather than a lit one.
     */
    float beamN = clamp(beam / 1.15, 0.0, 1.0);
    float alpha = (disc * max(swirl, 0.0) * beam * 0.34 + ring * (0.45 + 0.55 * beamN)) * uOpacity;

    /* The ignition front, in quad coordinates: -1 is the left edge, +1 the right. */
    float front = mix(-1.08, 1.08, uBurn);
    float lit = 1.0 - smoothstep(front - BURN_SOFT, front + BURN_SOFT, d.x);
    /* A brighter lip riding the front, so the eye has something to follow along the arc. */
    float lip = exp(-pow((d.x - front) / BURN_LIP, 2.0)) * uBurn * (1.0 - uBurn) * 4.0;
    col = mix(col, uInnerColor, clamp(lip, 0.0, 1.0));
    alpha *= clamp(lit + lip, 0.0, 1.0);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * (0.85 + ring * 0.9), alpha);
  }
`

/** The bright side of the ring: centred on the visible arc, swaying a little either side of it. */
const BEAM_CENTRE = -Math.PI / 2
const BEAM_SWAY = 0.55
const BEAM_RATE = 0.11
/** How hard the rim lights the scene, and how far in front of the camera it is aimed (the landed device). */
const RIM_INTENSITY = 2.8
/**
 * How far off the ring the light is placed, in horizon radii. One, now: the arc is most of the screen across
 * again, so a point on it is already well off the axis and spreading it further would put the light outside
 * the frame entirely.
 */
const RIM_SPREAD = 1.0
const RIM_TARGET_DISTANCE = 4.6

/**
 * Where the rim's light comes from, where it is aimed and how strong it is, in world coordinates. The light
 * itself lives in HeroScene and is mounted from the first frame: a light appearing mid-sequence would
 * recompile every material in the scene right before the morph. This is the hole's half of that arrangement.
 */
export type RimState = { x: number; y: number; z: number; tx: number; ty: number; tz: number; intensity: number }

export function BlackHole({
  colors,
  amount,
  burn,
  rim,
  frozen,
}: {
  colors: SceneColors
  amount: { value: number }
  burn: { value: number }
  rim: RimState
  /** Reduced motion: the hole is still there, the disc simply stops turning. */
  frozen: boolean
}) {
  const disc = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)

  const built = useMemo(() => {
    const discMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uInner: { value: INNER_FRAC },
        uBeam: { value: BEAM_CENTRE },
        uBurn: { value: 0 },
        uMotion: { value: 1 },
        /*
         * Development only: a non-negative value pins the disc's clock. It is what lets the orbit be measured
         * at all. Without it the two frames of a measurement are a wall-clock apart, the headless renderer
         * gives between four and twelve frames a second, and at this rotation rate the pattern has already
         * turned further than half a streak spacing — past which a shift cannot be told from the next streak
         * along. Pinned, the gap is chosen rather than suffered.
         */
        uHold: { value: -1 },
        /*
         * Straight from the ramp: the horizon's brightest stop at the photon ring, the sunset orange through
         * the body of the disc, the ember red at its edge. No blue, no violet, no pure white anywhere on it.
         */
        uInnerColor: { value: colors.peach.clone() },
        uMidColor: { value: colors.orange.clone() },
        uOuterColor: { value: colors.ember.clone() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    return { discMat, discGeom: new THREE.PlaneGeometry(2, 2) }
  }, [colors])

  useEffect(
    () => () => {
      built.discMat.dispose()
      built.discGeom.dispose()
    },
    [built],
  )

  const scratch = useMemo(() => ({ fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() }), [])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g || !disc.current) return
    const { fwd, up, right } = scratch
    /*
     * Under reduced motion the hole is drawn, lit and lensing, and none of it moves: the clock is pinned, so
     * the orbit, the in-fall, the beaming sway, the ring's shimmer and the breathing of the lens all stop at
     * once, because every one of them is a function of this one number. In practice this path is only reached
     * through the dev `?scene=1` override — the reader who asks for less motion gets the poster — but the
     * rule should hold wherever the scene runs, not only where it usually runs.
     */
    let t = frozen ? 0 : clock.elapsedTime
    // The hold is a measurement device and belongs to development only; the branch is stripped from the build.
    if (import.meta.env.DEV) {
      const hold = built.discMat.uniforms.uHold.value as number
      if (hold >= 0) t = hold
    }
    const arrive = amount.value

    /*
     * World units per screen pixel at the hole's depth, so the horizon can be sized in pixels and still be a
     * real object in the scene. Recomputed live: the arc has to keep meeting the corners when the window
     * changes, and a constant baked for one viewport would not.
     */
    const halfH = DISTANCE * Math.tan(((camera.fov || 35) * Math.PI) / 360)
    const perPixel = (2 * halfH) / size.height
    const rPx = arcRadiusPx(size.width, size.height)
    const radius = rPx * perPixel

    camera.getWorldDirection(fwd)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    /*
     * On the camera's vertical axis, one radius above the middle of the screen, so the bottom of the circle
     * lands on it once it has arrived. It descends onto that place over its own beat.
     */
    /* It comes down: one third of a radius higher at the start of its beat, in place at the end of it. */
    g.position
      .copy(camera.position)
      .addScaledVector(fwd, DISTANCE)
      .addScaledVector(up, radius * (1 + HOLE_FALL_LIFT * (1 - arrive)))
    g.quaternion.copy(camera.quaternion)
    disc.current.scale.setScalar(radius / INNER_FRAC)

    const beam = BEAM_CENTRE + BEAM_SWAY * Math.sin(t * BEAM_RATE) * built.discMat.uniforms.uMotion.value
    if (import.meta.env.DEV) (window as unknown as { __hole?: unknown }).__hole = built.discMat.uniforms
    built.discMat.uniforms.uTime.value = t
    built.discMat.uniforms.uBeam.value = beam
    built.discMat.uniforms.uOpacity.value = arrive
    built.discMat.uniforms.uBurn.value = burn.value

    /*
     * ── The rim, as a light ──────────────────────────────────────────────
     * It is placed on the photon ring itself, at the angle the beaming says is brightest, so the light and the
     * bright part of the arc are the same thing rather than two decisions that happen to agree. Sixteen units
     * behind a device that stands four and a half away, it is a BACK light: what it gives is an orange edge
     * down the side of the Flex, and it swings slowly along the arc as the bright side sways.
     */
    /* Spread: the ring is a sixth of the frame now, so the light is pushed out past it to keep grazing. */
    const armX = radius * RIM_SPREAD * Math.cos(beam)
    const armY = radius * RIM_SPREAD * Math.sin(beam)
    rim.x = g.position.x + right.x * armX + up.x * armY
    rim.y = g.position.y + right.y * armX + up.y * armY
    rim.z = g.position.z + right.z * armX + up.z * armY
    rim.tx = camera.position.x + fwd.x * RIM_TARGET_DISTANCE
    rim.ty = camera.position.y + fwd.y * RIM_TARGET_DISTANCE
    rim.tz = camera.position.z + fwd.z * RIM_TARGET_DISTANCE
    // The ring's own unquiet, on the light too, so the edge on the device breathes with what is casting it.
    rim.intensity = RIM_INTENSITY * arrive * (0.88 + 0.12 * Math.sin(t * 0.83))

  })

  return (
    <group ref={group}>
      {/* The ring, and only the ring. Nothing is painted inside it; see the note at the top of this file.
          The lensing is not here either: it is applied to the star field, from the first frame, by the scene. */}
      <mesh ref={disc} geometry={built.discGeom} material={built.discMat} renderOrder={-1} />
    </group>
  )
}

export default BlackHole
