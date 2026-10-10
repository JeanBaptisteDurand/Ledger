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
 * THE CORE IS BACK (2026-09-29). It had been taken out so the sky would be seen THROUGH the hole, bent. The
 * author then gave a reference — a total eclipse at the diamond: a black disc with body, a wide soft corona,
 * one blinding point on the limb with rays, a thin line of prominences — and asked for that. So a black disc
 * fills the horizon again, with a soft edge, and the lens now shows its work OUTSIDE the ring: stars drawn
 * into arcs that lengthen and go out as they reach it (src/scene/StarField.tsx). The inner, inverted images
 * the lens still computes are behind the core and no longer seen; that is the trade, and it is stated.
 *
 * WHAT MOVES IS UNCHANGED: the orbit, the in-fall, the shear, the beaming's sway, the ring's shimmer, the
 * ignition front. What is added moves too: the corona's rays drift, the diamond rides the bright side of the
 * ring and flickers. None of it touches the geometry, the framing or the rim light.
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
/** The horizon, as a fraction of the disc quad's half-extent: the corona reaches 2.4 horizon radii. */
const INNER_FRAC = 0.42
/** The black core, as a fraction of the horizon radius; the photon ring sits on its edge. */
const CORE_FRAC = 0.975
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
   * MEASURED: at 0 the pattern holds still and the same instrument reads the disc with and without the orbit.
   */
  uniform float uMotion;
  /**
   * How far the horizon has caught, 0 to 1, from the LEFT edge of the quad to the right. The front is a soft
   * edge with a brighter lip on it, because a rim that simply faded up everywhere would be a dimmer switch and
   * what is wanted is something catching.
   */
  uniform float uBurn;
  /**
   * The framing, 0 for the scene's arc (a radius of hundreds of pixels, only the bottom in frame) to 1 for
   * the home's whole ring. The corona and the diamond's halo are drawn in horizon radii, so on the arc they
   * would be hundreds of pixels wide and wash the scene; they are pulled in and dimmed there.
   */
  uniform float uCentred;

  /*
   * Radians a second the whole pattern turns about the horizon. 0.175 rad/s keeps the travel at about
   * 140 px/s on a radius of 800, the figure that was measured and accepted at the small size.
   */
  #define ORBIT_RATE 0.175
  /** How soft the ignition front is, and how wide its bright lip, in quad units. */
  #define BURN_SOFT 0.16
  #define BURN_LIP 0.055
  #define PI 3.14159265
  uniform vec3 uInnerColor;
  uniform vec3 uMidColor;
  uniform vec3 uOuterColor;
  uniform vec3 uHotColor;
  varying vec2 vUv;

  float wrapAngle(float x) { return mod(x + PI, 2.0 * PI) - PI; }

  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    /* In horizon radii: 1 is the photon ring; the core mesh is under everything inside it. */
    float rho = r / uInner;
    if (r > 1.0 || rho < 0.96) discard;
    float a0 = atan(d.y, d.x);

    /*
     * ── The disc body (1 → 1.45 radii): what moved before, unchanged ─────
     * ORBIT: the pattern turns. IN-FALL: features crawl toward the horizon. SHEAR: the inner edge turns faster.
     */
    float disc = pow(smoothstep(1.45, 1.0, rho), 1.8);
    float a = a0 + uTime * ORBIT_RATE * uMotion;
    float shear = mix(1.7, 0.45, smoothstep(1.0, 1.45, rho));
    float infall = uTime * 1.15 * uMotion;
    float swirl = 0.58
      + 0.30 * sin(a * 7.0 + uTime * 0.62 * shear + rho * 9.0 + infall)
      + 0.16 * sin(a * 13.0 - uTime * 0.37 * shear + rho * 17.0 + infall * 1.7);

    /* DOPPLER BEAMING: one side comes toward the eye and is brighter; the bright side sways slowly. */
    float beam = mix(1.0, 0.60 + 0.55 * cos(a0 - uBeam), uMotion);
    float beamN = clamp(beam / 1.15, 0.0, 1.0);

    /*
     * ── The photon ring ─────────────────────────────────────────────────
     * A thin bright line on the horizon, itself unquiet, with PROMINENCES: small bright licks along the limb
     * that turn with the disc. The reference's limb is not a clean circle, it is a line of fire.
     */
    float ringW = 0.016 + 0.003 * sin(uTime * 0.83) * uMotion;
    float ring = exp(-pow((rho - 1.0) / ringW, 2.0));
    float prom = 0.5 + 0.5 * sin(a * 19.0 - uTime * 0.7) * sin(a * 31.0 + uTime * 0.45);
    ring *= mix(1.0, 0.72 + 0.5 * prom, uMotion);
    /* The licks reach a little past the ring, unevenly. */
    float licks = exp(-max(rho - 1.0, 0.0) / (0.03 + 0.05 * prom)) * smoothstep(0.96, 1.0, rho) * (0.4 + 0.6 * prom);

    /*
     * ── The corona (1 → 2.4 radii) ──────────────────────────────────────
     * The wide soft light around the shadow, with faint RAYS that drift: a slow angular noise, so the glow is
     * not a flat gradient. It is what gives the reference its body; the disc alone was a line around a hole.
     */
    /* On the arc the corona is pulled in and cut sooner: the space around the Flex stays black. */
    float corW = mix(0.13, 0.30, uCentred);
    float cor = exp(-max(rho - 1.0, 0.0) / corW) * (1.0 - smoothstep(mix(1.25, 2.05, uCentred), mix(1.6, 2.38, uCentred), rho));
    float rays = 0.82 + 0.18 * (0.5 + 0.5 * sin(a0 * 23.0 + uTime * 0.21 * uMotion)) * (0.5 + 0.5 * sin(a0 * 41.0 - uTime * 0.13 * uMotion));
    cor *= rays;

    /*
     * ── The diamond ─────────────────────────────────────────────────────
     * One blinding point on the limb, where the beaming says matter comes at us fastest; it rides the bright
     * side as it sways, and it flickers. From it, a handful of narrow rays and a broad halo. This is the one
     * thing on the hole that is allowed to approach white, and it is the cream of the page, not white.
     */
    float da = wrapAngle(a0 - uBeam);
    float flicker = mix(1.0, 0.86 + 0.14 * sin(uTime * 3.1) * sin(uTime * 1.7 + 0.4), uMotion);
    float hot = exp(-pow(da / 0.11, 2.0)) * exp(-max(rho - 1.0, 0.0) / 0.16) * smoothstep(0.96, 1.0, rho);
    float halo = exp(-pow(da / 0.55, 2.0)) * exp(-max(rho - 1.0, 0.0) / mix(0.28, 0.55, uCentred));
    float raysD = 0.0;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float ang = uBeam + (fk - 3.0) * 0.62 + 0.18 * sin(uTime * 0.09 * uMotion + fk * 1.7);
      float w = 0.018 + 0.012 * fract(fk * 0.618);
      float len = (0.7 + 0.5 * fract(fk * 0.382)) * mix(0.3, 1.0, uCentred);
      raysD += exp(-pow(wrapAngle(a0 - ang) / w, 2.0)) * exp(-max(rho - 1.0, 0.0) / len);
    }
    raysD *= exp(-pow(da / 0.9, 2.0)) * flicker;

    /* ── Colours, from the ramp ───────────────────────────────────────── */
    vec3 bodyCol = mix(uOuterColor, uMidColor, pow(disc, 0.55));
    vec3 corCol = mix(uOuterColor, uMidColor, 0.45);
    vec3 diamondCol = mix(uInnerColor, uHotColor, clamp(hot * 1.4, 0.0, 1.0));

    /* ── Terms, additive: each with its light and its colour ──────────── */
    float tBody = disc * max(swirl, 0.0) * beam * 0.34;
    float tRing = ring * (0.45 + 0.55 * beamN) + licks * 0.35 * beamN;
    float tCor = cor * mix(0.08, 0.24, uCentred) * (0.6 + 0.4 * beamN);
    float tDia = (hot * 1.8 + raysD * 0.55 * mix(0.6, 1.0, uCentred) + halo * mix(0.22, 0.38, uCentred)) * flicker;
    float alpha = tBody + tRing + tCor + tDia;
    vec3 col = (bodyCol * tBody + uInnerColor * tRing + corCol * tCor + diamondCol * tDia) / max(alpha, 1e-4);
    alpha *= uOpacity;

    /* The ignition front, in quad coordinates: -1 is the left edge, +1 the right. */
    float front = mix(-1.08, 1.08, uBurn);
    float lit = 1.0 - smoothstep(front - BURN_SOFT, front + BURN_SOFT, d.x);
    /* A brighter lip riding the front, so the eye has something to follow along the arc. */
    float lip = exp(-pow((d.x - front) / BURN_LIP, 2.0)) * uBurn * (1.0 - uBurn) * 4.0;
    col = mix(col, uInnerColor, clamp(lip, 0.0, 1.0));
    alpha *= clamp(lit + lip, 0.0, 1.0);
    if (alpha < 0.003) discard;
    /*
     * Squared: the compositing pass used to multiply by alpha a second time and this look was approved under
     * it (2026-09-29). The pass is fixed; the square keeps the ring, the corona and the diamond as they were.
     */
    alpha *= clamp(alpha, 0.0, 1.0);
    // A 1/255 dither on the faint tails: squared and written to eight bits they banded.
    alpha += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    gl_FragColor = vec4(col * (0.85 + ring * 0.9 + hot * 1.1), alpha);
  }
`

/** The black core: the shadow, with a soft edge, under the ring. */
const CORE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length((vUv - 0.5) * 2.0);
    float a = uOpacity * smoothstep(1.0, 0.93, r);
    if (a < 0.003) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
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

/**
 * The hole's radius on the home, as a share of the viewport's short side. The arc framing puts the centre
 * above the frame; the home puts it in the middle, whole, behind the glass.
 */
const HOME_RADIUS_FRAC = 0.34

export function BlackHole({
  colors,
  amount,
  burn,
  rim,
  frozen,
  centred,
  emerge,
}: {
  colors: SceneColors
  amount: { value: number }
  burn: { value: number }
  rim: RimState
  /** Reduced motion: the hole is still there, the disc simply stops turning. */
  frozen: boolean
  /** 0: the arc framing of the scene. 1: whole and centred, the home's background. */
  centred: { value: number }
  /** How far the home's hole has emerged out of the black screen, 0 to 1. */
  emerge: { value: number }
}) {
  const disc = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
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
        /* The diamond's core: the page's cream, the brightest thing the ramp allows. */
        uHotColor: { value: colors.textCream.clone() },
        uCentred: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: CORE_FRAG,
      uniforms: { uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { discMat, coreMat, discGeom: new THREE.PlaneGeometry(2, 2) }
  }, [colors])

  useEffect(
    () => () => {
      built.discMat.dispose()
      built.coreMat.dispose()
      built.discGeom.dispose()
    },
    [built],
  )

  const scratch = useMemo(() => ({ fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() }), [])
  /*
   * The disc's own clock. It accumulates frame deltas rather than reading the wall clock, so a tab that was
   * hidden (frameloop 'never') resumes where it left off instead of jumping the pattern forward by the whole
   * absence; and the delta is clamped, so a stalled frame cannot do the same.
   */
  const holeTime = useRef(0)

  useFrame((_, delta) => {
    const g = group.current
    if (!g || !disc.current) return
    holeTime.current += Math.min(delta, 0.1)
    const { fwd, up, right } = scratch
    /*
     * Under reduced motion the hole is drawn, lit and lensing, and none of it moves: the clock is pinned, so
     * the orbit, the in-fall, the beaming sway, the ring's shimmer and the breathing of the lens all stop at
     * once, because every one of them is a function of this one number. In practice this path is only reached
     * through the dev `?scene=1` override — the reader who asks for less motion gets the poster — but the
     * rule should hold wherever the scene runs, not only where it usually runs.
     */
    let t = frozen ? 0 : holeTime.current
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
    /*
     * Two framings, blended by `centred`: the scene's arc (centre one radius above the middle, only the lower
     * arc in frame) and the home's whole ring (centred, a third of the short side). `emerge` grows the home's
     * ring out of the black screen and is 1 whenever the scene framing is in force.
     */
    const c = centred.value
    const em = c > 0 ? emerge.value : 1
    const rArc = arcRadiusPx(size.width, size.height) * perPixel
    const rHome = Math.min(size.width, size.height) * HOME_RADIUS_FRAC * perPixel
    const radius = rArc + (rHome - rArc) * c

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
      .addScaledVector(up, rArc * (1 + HOLE_FALL_LIFT * (1 - arrive)) * (1 - c))
    g.quaternion.copy(camera.quaternion)
    disc.current.scale.setScalar((radius / INNER_FRAC) * (0.22 + 0.78 * em))
    if (core.current) core.current.scale.setScalar(radius * CORE_FRAC * (0.22 + 0.78 * em))

    const beam = BEAM_CENTRE + BEAM_SWAY * Math.sin(t * BEAM_RATE) * built.discMat.uniforms.uMotion.value
    if (import.meta.env.DEV) (window as unknown as { __hole?: unknown }).__hole = built.discMat.uniforms
    built.discMat.uniforms.uTime.value = t
    built.discMat.uniforms.uBeam.value = beam
    built.discMat.uniforms.uOpacity.value = arrive * em
    built.discMat.uniforms.uCentred.value = c
    built.coreMat.uniforms.uOpacity.value = arrive * em
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
    rim.intensity = RIM_INTENSITY * arrive * em * (0.88 + 0.12 * Math.sin(t * 0.83))

  })

  return (
    <group ref={group}>
      {/* The shadow: a black disc with a soft edge, under the ring (see the note at the top of this file). */}
      <mesh ref={core} geometry={built.discGeom} material={built.coreMat} renderOrder={-2} />
      {/* The ring, the corona and the diamond, additive. The lensing is not here: it is applied to the star
          field, from the first frame, by the scene. */}
      <mesh ref={disc} geometry={built.discGeom} material={built.discMat} renderOrder={-1} />
    </group>
  )
}

export default BlackHole
