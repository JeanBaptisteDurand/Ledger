/**
 * bg/r3f-scroll-scene — dunes, wind-borne sand, the two Ledgers, stars and nebula, heat shimmer post pass.
 * One useFrame for the scene state, zero setState. The sky gradient is a CSS layer under the canvas (Hero.tsx).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { readSceneColors, smoothstep, type SceneColors } from './tokens'
import { fbm, makeChevronTexture, makeGrainNormalMap, makeNebulaTexture, makeOledScreen, makeWordmarkTexture } from './textures'
import { makeSand, Sand } from './Sand'
import { NANO, FLEX, type DeviceMaterials } from './devices'
import { NanoXModel, StaxModel } from './fbx-devices'
import { HeatPost } from './HeatPost'
import { StarField } from './StarField'
import { TitleBillboard } from './TitleBillboard'
import type { HeroProgress } from '../motion/hero'
import type { Dawn } from '../motion/dawn'
import { HERO_CAM, heroPhase, flyingSegment, launchEase, layEase, PHASE, STOPS, screenWordAt, segmentAt, segmentEase, settleAt } from '../motion/hero-math'
import { ACTIVE_BLINK, ACTIVE_BLINK_END, LANDED_WORD, REST_WORD, WORD_BLINK, WORD_BLINK_END, WORD_BLINK_OUT, WORD_BLINK_OUT_END } from '../motion/screen-words'
import { NOTE1_END, NOTE2_END, NOTES, type NotesState } from '../motion/context-note'
import { POINTER_DAMP, POINTER_SHIFT, POINTER_TILT_DEG } from '../motion/hero'
import { prefersReducedMotion } from '../motion/flags'
import { arcRadiusPx, EINSTEIN_K, HOLE_FALL_LIFT } from './black-hole-frame'

const CAM_Z = HERO_CAM.z
const LAND_DISTANCE = HERO_CAM.landDistance
/** Act 1: the Nano X is planted in the sand (base sunk a little), slightly left of centre. */
const SINK = 0.12
const ACT1_POS = { x: -0.6, y: NANO.h / 2 - SINK, z: 2.2 }
/** Resting pose: a few degrees of yaw, screen turned toward the right of the frame. */
const REST_YAW = 0.26
/** Resting tilt: the slab is planted a little askew, its top leaning to the left of the frame (front-back axis).
 *  It is a roll about the same axis as the propeller, in the propeller's direction, so the takeoff simply carries
 *  it on: no visible straightening. */
const REST_TILT = THREE.MathUtils.degToRad(4.5)
/*
 * The refusals. A scroll that is not yet the launch shakes the key where it stands: a short, fast, damped
 * rock about its buried foot, not a wobble of the whole body. It is driven off the wall clock rather than
 * off progress, because the sequence has not started moving yet and there is no progress to hang it on.
 */
/**
 * How much brighter the screen goes while its word is hovered, and how fast it gets there.
 *
 * It was 0.55, which took the panel from 0.62 to 0.96 of emissive: a third brighter, and on a display that is
 * already the brightest thing in a night frame that is close to invisible. At 1.6 the hovered word is two and
 * a half times the resting intensity, which is a state change rather than a nuance.
 */
/**
 * The panel's emissive at rest, before any lift.
 *
 * It was 0.62, chosen when the glass front was still drawn OVER the lit panel and taking about a quarter of
 * it back. With the glass now drawn underneath, 0.62 would render the resting word considerably brighter than
 * it has been all along, so the base comes down to keep rest where the author has been reading it — and the
 * headroom that buys goes to the lift, which can now actually reach white instead of clipping at 223.
 */
const SCREEN_EMISSIVE = 0.46
const HOVER_LIFT = 2
const HOVER_DAMP = 7
/**
 * And the same again while the description it opened is being drawn.
 *
 * Both lifts stop at two, and that is not modesty: measured on the render the panel's brightest pixel is 164
 * at rest and 223 under the lift, and it was still 223 with the lift at more than half again as much. The
 * material is at its ceiling and asking it for more buys nothing.
 *
 * So the lift is all the light there is, and the only other emphasis is the rule under the word. A pass did
 * try dilating the glyphs to buy what the emissive could not give; the author read the thickened letterform
 * as glow and it came out. What that costs is stated where it lands: the hover has no lit pixels to gain any
 * more, so it is now a brightness change alone, on a panel that was already near saturation.
 */
const ACTIVE_LIFT = 2
const ACTIVE_DAMP = 9
const SHUDDER_SECONDS = 0.75
const SHUDDER_ROT = THREE.MathUtils.degToRad(6.2)
const SHUDDER_LIFT = 0.018
/** Whole turns the key makes on a SECOND axis as it tears free. A whole turn is the identity, so the pose it
 *  arrives on at the first stop is untouched: only the way it gets there changes. */
const TEAR_TURNS = 1
/**
 * Low raking light from the right, horizon side, slightly in front of the device: with the resting yaw it is the
 * light whose reflection on the glass and the button reaches the camera.
 */
const GLINT_DIR = new THREE.Vector3(0.39, 0.05, 0.94).normalize()
/**
 * Shadow sun: low (8° elevation), 35° to the right of straight-behind. The shadow leaves the whole width of the
 * base toward the camera and the left, opposite the horizon light.
 */
const SUN_AZIMUTH = 0.61
const SUN_ELEVATION = 0.14
const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
).normalize()

/** Resting light levels; the dawn timeline scales them from 0. */
const LIGHT = { sun: 3.8, glint: 2.0, hemi: 0.45, ambient: 0.06, fill: 0.5 }

/** The three axes of the device's box, as bit flips between its eight corner indices. */
const EDGE_BITS = [1, 2, 4] as const

const { lerp } = THREE.MathUtils
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const X_AXIS = new THREE.Vector3(1, 0, 0)

/*
 * ── Writing the note's geometry to CSS without churning ───────────────────────
 * The note's anchors are handed to CSS as custom properties on the section, recomputed every frame so the
 * hairlines follow the key as it drifts. Measured at a stop: eight writes a frame, of which only three
 * carried a new value, plus ten freshly formatted strings and two closures rebuilt each time. None of that is
 * large on its own; together it is a steady stream of short-lived garbage on the one screen the reader is
 * sitting still and looking at, which is exactly where a collection pause is felt.
 *
 * So: the formatters are module-level, and every write goes through a cache that compares the formatted
 * string with what was last written and returns early when they match. Four of the properties never change at
 * all — they are the fixed ends of the elbows — and are now written once instead of eighty times a second.
 */
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`
const px1 = (v: number) => `${Math.max(0, v).toFixed(1)}px`
const px0 = (v: number) => `${Math.max(44, v).toFixed(0)}px`

/**
 * Write a custom property only when its value has actually moved.
 *
 * The cache holds the NUMBER, not the formatted string, and that is the point: comparing strings still means
 * building one every frame, and the string is the allocation. A quarter of a pixel is the threshold — below
 * it nothing on screen can move — so a key that drifts slowly is formatted and written a few times a second
 * instead of sixty, and one that never changes is written once.
 */
function writeVar(
  style: CSSStyleDeclaration,
  cache: Map<string, number>,
  key: string,
  value: number,
  fmt: (v: number) => string,
  epsilon = 0.25,
) {
  const last = cache.get(key)
  if (last !== undefined && Math.abs(last - value) <= epsilon) return
  cache.set(key, value)
  style.setProperty(key, fmt(value))
}

/* ───────────────────────── Ground: wide soft dunes, sand micro-grain ───────────────────────── */

function dune(x: number, y: number): number {
  const d = Math.hypot(x, y)
  const far = smoothstep(6, 70, d)
  // A little more relief than the first pass: the dunes read as a landscape rather than a swell, and the extra
  // mid-scale term breaks the long ridges into separate crests without touching the flat pad under the monolith.
  const big = Math.sin(x * 0.075 + 0.8 * Math.sin(y * 0.041)) * Math.sin(y * 0.06 + 0.4) * (0.82 + 2.15 * far)
  const mid =
    Math.sin(x * 0.19 + y * 0.11 + 1.7) * 0.58 + Math.sin(x * 0.115 - y * 0.163 + 0.3) * Math.sin(y * 0.087 + 2.4) * 0.46
  const fine = (fbm(x * 0.22, y * 0.22, 3) - 0.5) * 0.66
  return big + mid + fine
}

/** Sand at the foot of the leaning slab: a small heap on the side it leans toward, a shallow dip on the other. */
function footSand(x: number, y: number): number {
  const dx = x - ACT1_POS.x
  const dz = y + ACT1_POS.z
  const heap = 0.07 * Math.exp(-((dx + 0.22) ** 2 / 0.05 + dz ** 2 / 0.12))
  const dip = -0.035 * Math.exp(-((dx - 0.28) ** 2 / 0.08 + dz ** 2 / 0.12))
  return heap + dip
}

export type GroundUniforms = {
  uTime: { value: number }
  uSunDir: { value: THREE.Vector3 }
  uGlint: { value: number }
  uGlintColor: { value: THREE.Color }
}

/**
 * Micro-glints on the sand, injected into MeshPhysicalMaterial: a very high-frequency procedural facet normal
 * (per ~2.5 cm cell, stable, drifting slowly) flashes where it aligns with the half vector between the horizon
 * light and the camera (Blinn lobe, exponent 80). Only on lit, exposed slopes (crests facing the light); off in
 * the hollows; faded to zero with distance and by the screen footprint of a cell (procedural anti-aliasing), so
 * the far dunes never crawl.
 */
const GLINT_GLSL = /* glsl */ `
  varying vec3 vGlintPos;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform float uGlint;
  uniform vec3 uGlintColor;
  float glintHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  vec3 sandGlint(vec3 wp, vec3 nView) {
    vec3 nW = normalize(inverseTransformDirection(nView, viewMatrix));
    vec3 toCam = cameraPosition - wp;
    float dist = length(toCam);
    toCam /= dist;
    vec3 hv = normalize(uSunDir + toCam);
    float freq = 40.0;
    vec3 cell = floor(wp * freq);
    float r1 = glintHash(cell);
    float r2 = glintHash(cell + 17.0);
    float r3 = glintHash(cell + 43.0);
    float ang = r1 * 6.2832 + uTime * (0.2 + 0.4 * r3);
    float tilt = 0.25 + 0.45 * r2;
    vec3 facet = normalize(nW + tilt * vec3(cos(ang), 0.0, sin(ang)));
    float lobe = pow(max(dot(facet, hv), 0.0), 80.0);
    float lit = smoothstep(0.0, 0.35, dot(nW, uSunDir) + 0.15);
    float crest = smoothstep(-0.3, 0.9, wp.y);
    float far = 1.0 - smoothstep(14.0, 34.0, dist);
    float aa = 1.0 - smoothstep(0.35, 1.2, fwidth(wp.x + wp.z) * freq);
    return uGlintColor * lobe * lit * crest * far * aa * uGlint * 0.9;
  }
`

function Ground({ colors, uniforms }: { colors: SceneColors; uniforms: GroundUniforms }) {
  const gl = useThree((s) => s.gl)
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(240, 240, 200, 200)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i) // plane y → world -z after the -90° rotation
      const dDevice = Math.hypot(x - ACT1_POS.x, y + ACT1_POS.z)
      // Level pad under the monolith. With the taller dunes the blend has to be wider: over the old short range
      // the surface normal turned too fast at the join and drew a visible crease around the base.
      const flat = smoothstep(1.2, 9, dDevice)
      pos.setZ(i, dune(x, y) * flat + footSand(x, y))
    }
    g.computeVertexNormals()
    return g
  }, [])
  const grain = useMemo(() => {
    const t = makeGrainNormalMap(256, 0.9)
    t.repeat.set(90, 90)
    // Grazing view of a tiled micro-normal map: without anisotropic filtering the far dunes speckle and crawl.
    t.anisotropy = gl.capabilities.getMaxAnisotropy()
    return t
  }, [gl])
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: colors.regolith,
      roughness: 0.62,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.45,
      sheenColor: colors.peach,
      normalMap: grain,
      normalScale: new THREE.Vector2(0.3, 0.3),
    })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlintPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLINT_GLSL}`)
        // Micro-grain relief fades out with distance (the far dunes keep their smooth geometric normal), then glints.
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(nonPerturbedNormal, normal, 1.0 - smoothstep(10.0, 30.0, length(cameraPosition - vGlintPos))));')
        .replace('#include <opaque_fragment>', 'outgoingLight += sandGlint(vGlintPos, normal);\n#include <opaque_fragment>')
    }
    m.customProgramCacheKey = () => 'sand-glint'
    return m
  }, [colors, grain, uniforms])
  useEffect(
    () => () => {
      geometry.dispose()
      grain.dispose()
      material.dispose()
    },
    [geometry, grain, material],
  )
  return <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} receiveShadow />
}

/* ───────────────────────── Scene ───────────────────────── */

type Props = {
  progress: HeroProgress
  dawn: Dawn
  title: string
  projectName: string
  /** The notes hanging off the screen words: the scene arms them and publishes where to pin each one. */
  notes: NotesState
  /**
   * Whether the black hole may be mounted. It is a separate chunk and it is only ever wanted for the last
   * sequence, so the page never fetches, parses or compiles it before the sequence is nearly there.
   */
  showBlackHole: boolean
  /** Called once, after the scene has actually rendered a couple of frames and nothing is still loading. */
  onFirstRender: () => void
}

/*
 * Loaded on demand: this import is what makes the black hole its own chunk, and nothing of it reaches the
 * browser until `showBlackHole` first turns true.
 */
const BlackHole = lazy(() => import('./BlackHole'))

export function HeroScene({ progress, dawn, title, projectName, notes, showBlackHole, onFirstRender }: Props) {
  const colors = useMemo(readSceneColors, [])
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const devCamera = useThree((s) => s.camera)
  const dpr = useThree((s) => s.viewport.dpr)
  /** Canvas size in CSS pixels: the note's hit target is sized in pixels, not in normalised units. */
  const size = useThree((s) => s.size)

  const group = useRef<THREE.Group>(null)
  const nanoGroup = useRef<THREE.Group>(null)
  const flexGroup = useRef<THREE.Group>(null)
  const nanoMats = useRef<DeviceMaterials | null>(null)
  const flexMats = useRef<DeviceMaterials | null>(null)
  const nebulaMat = useRef<THREE.MeshBasicMaterial>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const glint = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const fog = useRef<THREE.Fog | null>(null)
  const frames = useRef(0)
  const signaled = useRef(false)
  /** The hero section, so the scene can publish the key's screen position to CSS (composition 3). */
  const sectionEl = useRef<HTMLElement | null>(null)
  const reducedMotion = useRef(prefersReducedMotion())
  /** Frames already rendered with everything visible, so nothing compiles at takeoff (see the warm-up below). */
  const warmed = useRef(0)
  const keySide = useRef<'start' | 'end' | null>(null)
  /** The last shake the player asked for: its sequence number, when the scene saw it, and how hard. */
  const nudgeSeen = useRef(0)
  const nudgeStart = useRef(0)
  const nudgeAmp = useRef(0)
  const armedStop = useRef<number | null>(null)
  /** When the key tore free, so the resting word can blink OUT instead of simply vanishing. */
  const launchedAt = useRef(0)
  /** Whether the sequence was parked last frame, when it left, and whether SCROLL UP was up when it did. */
  const wasParked = useRef(false)
  const leftStopAt = useRef(0)
  const leftFromRest = useRef(false)
  /** True once any title has been on the screen: the exit blink belongs to the takeoff and happens once. */
  const titleSeen = useRef(false)
  /** The hover lift on the screen, damped toward the pointer's presence. */
  const hoverLift = useRef(0)
  /** The active lift, held while the description this title opened is on screen, and when it was asked for. */
  const activeLift = useRef(0)
  const activatedStop = useRef(-1)
  const activatedAt = useRef(0)
  /** How far the black hole has come down, 0 to 1. A plain object so useFrame can write it without a render. */
  const blackHoleAmount = useRef({ value: 0 })
  /** How far the ring has caught, left edge to right edge. Its own beat, after the fall. */
  const blackHoleBurn = useRef({ value: 0 })
  /**
   * The hole as the star field bends around it. It is written HERE and not by the hole, because the bending
   * is established from the first frame the stars exist and the hole is a chunk that arrives near the end.
   * See src/scene/black-hole-frame.ts for why the map must not ramp.
   */
  const lens = useRef({ x: 0.5, y: 0.5, radius: 0, amount: 0, strength: EINSTEIN_K })
  /** How present the star field is, 0 to 1. Same shape as the two above, for the same reason. */
  const starAmount = useRef({ value: 0 })
  /**
   * The light the hole's rim casts on the scene. The hole is a lazily-loaded chunk, but its LIGHT is declared
   * here and mounted from the first frame at zero intensity, because adding a light to a scene invalidates
   * every material's program: doing it at the moment the hole appears would recompile the ground, the sand and
   * both devices a few tenths of a second before the morph. So the hole only writes numbers into this object,
   * and the frame loop applies them to a light that was always there.
   */
  const rim = useRef({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: -1, intensity: 0 })
  const rimLight = useRef<THREE.DirectionalLight | null>(null)
  const rimTarget = useMemo(() => new THREE.Object3D(), [])
  /** Development read-out, allocated once (see the note where it is written). */
  const screenProbe = useMemo(() => ({ word: '', wake: 0, hoverLift: 0, intensity: 0, outTrace: '' }), [])

  const onNanoMaterials = useCallback((m: DeviceMaterials) => {
    nanoMats.current = m
  }, [])
  const onFlexMaterials = useCallback((m: DeviceMaterials) => {
    flexMats.current = m
  }, [])

  // Scratch objects: no allocation in the frame loop.
  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      offset0: new THREE.Vector3(),
      roll: new THREE.Quaternion(),
      yaw: new THREE.Quaternion(),
      quat: new THREE.Quaternion(),
      boxMat4: new THREE.Matrix4(),
      screen: new THREE.Vector3(),
      spinQ: new THREE.Quaternion(),
      tiltQ: new THREE.Quaternion(),
      driftQ: new THREE.Quaternion(),
      tiltTarget: new THREE.Vector3(),
      tiltNow: new THREE.Vector3(),
      euler: new THREE.Euler(),
      tumbleQ: new THREE.Quaternion(),
      shakeQ: new THREE.Quaternion(),
      ctxA: new THREE.Vector3(),
      /** Last value written for each note custom property, so an unchanged one is not written again. */
      cssCache: new Map<string, number>(),
      /** The device's eight corners, projected to screen pixels: the note anchors walk them. */
      cornerX: new Float64Array(8),
      cornerY: new Float64Array(8),
    }),
    [],
  )

  useEffect(() => {
    if (import.meta.env.DEV) {
      // Dev-only inspection hook for the capture scripts (never in production builds).
      ;(window as unknown as { __hero?: unknown }).__hero = { scene, gl, camera: devCamera }
    }
  }, [scene, gl, devCamera])

  // Sand glints (ground) read the same light direction and level as the grains.
  const groundUniforms = useMemo<GroundUniforms>(
    () => ({ uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, uGlint: { value: 0 }, uGlintColor: { value: colors.peach.clone().lerp(colors.orange, 0.4) } }),
    [colors],
  )

  // Sun target for the shadow frustum: the planted Nano X.
  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(ACT1_POS.x, ACT1_POS.y * 0.5, ACT1_POS.z)
    return o
  }, [])
  const sunPosition = useMemo(() => sunTarget.position.clone().addScaledVector(SUN_DIR, 22), [sunTarget])
  const glintPosition = useMemo(() => sunTarget.position.clone().addScaledVector(GLINT_DIR, 20), [sunTarget])

  const displayFamily = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(), [])

  // Screens: 128×64 OLED bitmap for the Nano X; E Ink paper and paper+label for the Flex.
  // The device's screen carries the narrative: one word per step, redrawn when the step changes.
  const oled = useMemo(() => makeOledScreen(displayFamily, REST_WORD), [displayFamily])
  const oledTex = oled.texture
  const shownWord = useRef(REST_WORD)
  const wordSince = useRef(0)
  const chevronTex = useMemo(() => makeChevronTexture(), [])
  /*
   * The landed screen: the model's own panel painted black, and the project name on it in the site's white.
   * The E Ink paper sheet that used to sit behind the name is gone (src/scene/fbx-devices.tsx).
   */
  /** The wordmark's face, read from the tokens like every other colour and family in this file. */
  const deviceFamily = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--font-device').trim(), [])
  const einkLabel = useMemo(
    /* 600 and a little tracking: Ledger's interface tops out at 600, and a wordmark is never set solid. */
    () => makeWordmarkTexture(projectName.toUpperCase(), deviceFamily, colors.onPrimary.getStyle(), '600', '0.16em'),
    [deviceFamily, colors, projectName],
  )

  // Wind-borne sand grains (shader-animated point cloud).
  const sand = useMemo(() => makeSand(colors), [colors])


  const nebulaTex = useMemo(
    /* Warm, like everything else in this sky: the azure stops went with the blue night. */
    () => makeNebulaTexture(512, [colors.ember.getStyle(), colors.regolith.getStyle(), colors.regolithDeep.getStyle()]),
    [colors],
  )

  useEffect(() => {
    const f = new THREE.Fog(colors.amber.clone(), 26, 130)
    fog.current = f
    scene.fog = f
    return () => {
      scene.fog = null
      fog.current = null
    }
  }, [scene, colors])

  useEffect(
    () => () => {
      oledTex.dispose()
      chevronTex.dispose()
      einkLabel.dispose()
      nebulaTex.dispose()
    },
    [oledTex, chevronTex, einkLabel, nebulaTex],
  )

  useFrame(({ camera, clock }, delta) => {
    const p = progress.p
    const { t3, morph, camY, rotX } = heroPhase(p)
    const cam = camera as THREE.PerspectiveCamera

    /*
     * Warm-up, inside the dawn. Both devices are shown for a few frames with their flight materials so every
     * shader is compiled and every texture uploaded while the screen is still black, and the renderer is asked to
     * compile the whole graph explicitly. By the time the key leaves the sand there is nothing left to build.
     */
    if (warmed.current < 3 && !useProgress.getState().active) {
      if (nanoGroup.current) nanoGroup.current.visible = true
      if (flexGroup.current) flexGroup.current.visible = true
      if (warmed.current === 0) gl.compile(scene, camera)
      warmed.current++
    }

    // Loading gate: two real frames rendered, the warm-up done and no loader active → the dawn may start.
    if (!signaled.current) {
      frames.current++
      if (frames.current >= 2 && warmed.current >= 3 && !useProgress.getState().active) {
        signaled.current = true
        onFirstRender()
      }
    }
    const d = dawn.t
    // Dawn phases: horizon glow (CSS, 0→0.3) → sky (CSS, 0.15→0.65) → raking light reveals sand, shadow and key
    // (0.35→0.85) → title wipe (0.72, TitleBillboard) → OLED (0.82→1).
    const dawnLight = smoothstep(0.35, 0.85, d)
    const dawnAmbient = smoothstep(0.2, 0.7, d)
    const dawnScreen = smoothstep(0.82, 1, d)

    // Portrait frames: the camera steps back and the device sits closer to centre so it stays in view.
    const aspect = cam.aspect || 1.6
    const portrait = 1 - THREE.MathUtils.clamp((aspect - 0.5) / 0.9, 0, 1)
    // Portrait: the key lies ACROSS the frame once it is flying, so it needs the frame's width, which a tall
    // viewport does not have. The extra step back belongs to the flight only; the landing has its own distance
    // and the portrait device is upright again there, so it would otherwise be pushed far too far away.
    const camZ = CAM_Z + portrait * lerp(4.6, 1.8, morph)
    const x1 = ACT1_POS.x * THREE.MathUtils.clamp(aspect / 1.4, 0.45, 1)

    // Camera: low, like the film frame; we rise with the device and the ground leaves by the bottom.
    camera.position.set(0, camY, camZ)
    camera.rotation.set(rotX, 0, 0)

    const { pos, anchor, fwd, offset0, roll, yaw, quat, boxMat4, screen, spinQ, tiltQ, driftQ, tiltTarget, tiltNow, euler, tumbleQ, shakeQ, ctxA, cornerX, cornerY, cssCache } = scratch

    /*
     * While the sequence is flying, the segment is measured from where the playhead actually was when the
     * reader scrolled. `segmentAt` is the fallback for a parked sequence and for the capture overrides.
     */
    const seg = progress.segIndex >= 0 ? flyingSegment(progress.segIndex, progress.segFrom, p) : segmentAt(p)

    /*
     * The refusals. The player bumps a sequence number rather than handing over a timestamp, because the two
     * run on different clocks; the scene stamps its own the frame it notices. The rock is damped and fast, and
     * it only means anything while the key is still in the sand.
     */
    if (progress.nudgeSeq !== nudgeSeen.current) {
      nudgeSeen.current = progress.nudgeSeq
      nudgeStart.current = clock.elapsedTime
      nudgeAmp.current = progress.nudgeStrength
      // Dev-only: the capture scripts read the peak of each refusal off this.
      if (import.meta.env.DEV) (window as unknown as { __shake?: { peakDeg: number; amp: number; frames: number } }).__shake = { peakDeg: 0, amp: nudgeAmp.current, frames: 0 }
    }
    let shake = 0
    if (nudgeStart.current > 0) {
      const since = clock.elapsedTime - nudgeStart.current
      if (since < SHUDDER_SECONDS) shake = Math.exp(-since * 5.6) * Math.sin(since * 40) * nudgeAmp.current
      else nudgeStart.current = 0
    }
    if (import.meta.env.DEV && shake !== 0) {
      const h = (window as unknown as { __shake?: { peakDeg: number; frames: number } }).__shake
      if (h) {
        h.frames += 1
        h.peakDeg = Math.max(h.peakDeg, (Math.abs(shake) * SHUDDER_ROT * 180) / Math.PI)
      }
    }

    // The device is anchored to the camera's line of sight from the first scroll pixel, so it is never cut:
    //   anchor  = point in front of the camera at the current distance (rest distance → landing distance)
    //   offset0 = where the slab stands in the sand relative to that anchor at rest; released over p 0.02→0.35
    //   drift   = a small lateral sway for the throw, gone by the landing
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
    const restDistance = camZ - ACT1_POS.z
    // At a stop the camera comes in so the screen word is readable: the key lies across the frame there, so its
    // length must fit `fill` of the frame WIDTH. Clamped, and released back to flight distance when it resumes.
    // The camera holds its flight framing: the word lights up where the key already is, with no move toward it.
    const settle = settleAt(p)
    const dist = lerp(restDistance, LAND_DISTANCE, morph)
    anchor.copy(camera.position).addScaledVector(fwd, dist)
    offset0.set(
      x1,
      ACT1_POS.y - (HERO_CAM.yStart + Math.sin(HERO_CAM.rotXStart) * restDistance),
      ACT1_POS.z - (camZ - Math.cos(HERO_CAM.rotXStart) * restDistance),
    )
    // Launch: the ground offset (x, y and z together, one curve) is released from zero speed; the propeller starts
    // on the same scroll pixel (see rollTurns), so the recentring reads as part of the throw, not a translation.
    const launch = launchEase(p)
    const release = 1 - launch
    /*
     * The lateral throw is tied to the FIRST segment, not to the whole flight: it swings out and comes back
     * within the takeoff, reaching zero exactly where the slow climb begins. The key is therefore centred by the
     * time it shows its word, and it gets there by continuing the same curve rather than being repositioned.
     */
    const throwArc = seg.index === 0 ? Math.sin(Math.PI * segmentEase(seg.u)) * (1 - t3) : 0
    pos.copy(anchor).addScaledVector(offset0, release)
    pos.x += 0.25 * throwArc
    // Resting tilt pivots about the contact point, not the centre: shift the centre so the base stays put.
    pos.x -= Math.sin(REST_TILT) * (NANO.h / 2) * release

    // Publish where the key is on screen, so a narrative composition can be placed from the image rather than
    // from the centre of the viewport. Two style writes per frame, no React state.
    if (!sectionEl.current) sectionEl.current = document.getElementById('hero')
    if (sectionEl.current) {
      screen.copy(pos).project(cam)
      const sx = (screen.x * 0.5 + 0.5) * 100
      const sy = (1 - (screen.y * 0.5 + 0.5)) * 100
      sectionEl.current.style.setProperty('--key-x', `${sx.toFixed(2)}%`)
      sectionEl.current.style.setProperty('--key-y', `${sy.toFixed(2)}%`)
      const side = sx < 50 ? 'start' : 'end'
      if (side !== keySide.current) {
        keySide.current = side
        sectionEl.current.querySelectorAll('[data-narrative]').forEach((el) => el.setAttribute('data-key-side', side))
      }
    }

    // ── Rotation ──────────────────────────────────────────────────────────────────────────────────────────
    // Every flight segment turns about ONE axis and completes a WHOLE number of turns on it. A whole turn about
    // any axis is the identity, so a segment that finishes lands the device exactly back on the readable pose:
    // screen to the camera, word horizontal, no residual angle. The axis therefore changes at a stop and never
    // mid movement, and the eased segment progress decelerates onto the pose instead of stopping a spin dead.
    const spinU = segmentEase(seg.parked ? 1 : seg.u)
    const spin = seg.index >= STOPS.length ? 0 : seg.stop.turns * Math.PI * 2 * spinU
    const axisVec = seg.stop.axis === 'roll' ? Z_AXIS : seg.stop.axis === 'yaw' ? Y_AXIS : X_AXIS
    if (import.meta.env.DEV) {
      /*
       * The honest end of the scroll measurement: the SEGMENT's own turn.
       *
       * A sampler that watched the device's projected corners used to live here and it was worse than
       * useless: the key carries a continuous clock-driven drift of a couple of pixels, so that sampler
       * reported movement a frame or two after any scroll and hid a stall of nearly four seconds behind it.
       * The spin is the only thing the scroll actually starts, so the spin is what is measured.
       */
      const w = window as unknown as { __lag?: Record<string, number | string | undefined> }
      const l = w.__lag
      if (l && l.resumedAt !== undefined) {
        if (l.spinBase === undefined) l.spinBase = spin
        else if (l.spinMovedAt === undefined && Math.abs(spin - Number(l.spinBase)) > 0.0175) {
          l.spinMovedAt = performance.now() // 0.0175 rad = one degree
        }
      }
    }
    // The readable pose lays the key's long axis across the frame, because its screen runs along that axis: the
    // word only reads horizontally when the key does. It stands upright while planted, and comes back upright for
    // the landing, where the device is portrait and its screen already reads the right way round.
    /*
     * How far the key stands up from flat at the stop it is heading for. Flat is where its screen reads dead
     * level, and the first stop keeps it there; a later stop may stand the key up, and the word tilts with it,
     * which is why the value is bounded by what stays readable without turning your head.
     */
    const standFrom = seg.index === 0 ? 0 : (STOPS[seg.index - 1]?.stand ?? 0)
    const standTo = seg.index < STOPS.length ? seg.stop.stand : 0
    const stand = lerp(standFrom, standTo, spinU)
    const lay = (-Math.PI / 2 * layEase(p) + stand) * (1 - morph)
    roll.setFromAxisAngle(Z_AXIS, lay)
    spinQ.setFromAxisAngle(axisVec, spin)
    /*
     * The tear-off turns on a SECOND axis, so the key leaves the sand tumbling rather than pivoting in one
     * plane. It is a whole number of turns, eased to arrive with zero speed, and a whole turn about any axis is
     * the identity: the pose it settles into at the first stop is exactly the one it settled into before. The
     * exponent front-loads it, so the tumble belongs to the moment it tears free rather than to the whole climb.
     */
    const tumble = seg.index === 0 ? TEAR_TURNS * Math.PI * 2 * Math.pow(spinU, 0.7) : 0
    tumbleQ.setFromAxisAngle(Y_AXIS, tumble)
    yaw.setFromAxisAngle(Y_AXIS, REST_YAW * release)
    quat.copy(camera.quaternion).multiply(roll).multiply(spinQ).multiply(tumbleQ).multiply(yaw)
    // The resting tilt: a few degrees of lean while the key is still planted in the sand.
    if (release > 0.001) {
      tiltQ.setFromAxisAngle(Z_AXIS, REST_TILT * release)
      quat.multiply(tiltQ)
      // The refusal rocks the key about its buried foot, so the base stays where it is driven in.
      if (shake !== 0) {
        const angle = shake * SHUDDER_ROT * release
        shakeQ.setFromAxisAngle(Z_AXIS, angle)
        quat.multiply(shakeQ)
        pos.x -= Math.sin(angle) * (NANO.h / 2)
        pos.y += Math.abs(shake) * SHUDDER_LIFT * release
      }
    }
    /*
     * ── Organic drift ────────────────────────────────────────────────────────────────────────────────────
     * A body in free fall is never still and never starts or stops moving. This is a single continuous function
     * of the wall clock, three non-harmonic frequencies per axis, that knows nothing about the sequence's phases:
     * being clock-driven rather than keyed, it cannot produce a discontinuity of position or of velocity where
     * two phases meet, and it never reaches a dead stop. Amplitudes are small, they scale in with the launch, and
     * translation and rotation drift at different rates so the two never read as one keyed move.
     */
    const dt2 = clock.elapsedTime
    const air = launch * (1 - t3)
    pos.x += air * (Math.sin(dt2 * 0.211) * 0.052 + Math.sin(dt2 * 0.367 + 2.1) * 0.03)
    pos.y += air * (Math.sin(dt2 * 0.173 + 1.3) * 0.06 + Math.sin(dt2 * 0.289 + 0.4) * 0.026)
    pos.z += air * (Math.sin(dt2 * 0.149 + 3.1) * 0.04)
    driftQ.setFromEuler(
      euler.set(
        air * Math.sin(dt2 * 0.127 + 0.7) * 0.05,
        air * Math.sin(dt2 * 0.193 + 2.6) * 0.06,
        air * Math.sin(dt2 * 0.101 + 1.9) * 0.042,
        'XYZ',
      ),
    )
    quat.multiply(driftQ)

    // ── Pointer ───────────────────────────────────────────────────────────────────────────────────────────
    // While the sequence waits, the pointer leans the device a few degrees, damped. It never turns it: the cap is
    // small enough that the word stays level and legible wherever the cursor is. Off in flight, off on touch,
    // off under reduced motion (the animated hero is not mounted there at all).
    /*
     * The landed Flex answers the pointer on the same terms as the Nano X at a stop: same amplitude, same
     * damping, and the same cap, which is what keeps its word level and legible wherever the cursor goes.
     * The lean is only ever a perspective tilt on X and Y, never a roll about the view axis, so no amount of
     * pointer travel can turn the text off the horizontal.
     */
    const wantTilt = (settle > 0.99 || t3 > 0.98) && !reducedMotion.current
    tiltTarget.set(wantTilt ? progress.pointerY : 0, wantTilt ? progress.pointerX : 0, 0)
    tiltNow.lerp(tiltTarget, 1 - Math.exp(-POINTER_DAMP * Math.min(delta, 0.1)))
    const tiltRad = (POINTER_TILT_DEG * Math.PI) / 180
    if (tiltNow.lengthSq() > 1e-8) {
      tiltQ.setFromEuler(euler.set(tiltNow.x * tiltRad, tiltNow.y * tiltRad, 0, 'XYZ'))
      quat.multiply(tiltQ)
      // It gives ground as well as leaning, which is what makes the reaction read as weight rather than a hinge.
      pos.x += tiltNow.y * POINTER_SHIFT
      pos.y -= tiltNow.x * POINTER_SHIFT * 0.7
    }

    if (group.current) {
      group.current.position.copy(pos)
      group.current.quaternion.copy(quat)
    }

    // Morph Nano X → Flex: both groups converge to the same box, cross-faded in the middle of the morph so they
    // overlap for as short as possible. A fully faded device is hidden: at opacity 0 it would still write depth.
    const fade = smoothstep(0.35, 0.65, morph)
    /*
     * The hole comes down AFTER the morph, on a beat of its own, and its ring catches on a third. Tying it to
     * the morph put it on screen while the device was still turning into a Flex; tying its lensing to the star
     * field put it there four screen words earlier still.
     */
    const fall = smoothstep(PHASE.holeFall[0], PHASE.holeFall[1], p)
    blackHoleAmount.current.value = fall
    blackHoleBurn.current.value = smoothstep(PHASE.holeBurn[0], PHASE.holeBurn[1], p)
    if (nanoGroup.current) {
      nanoGroup.current.visible = fade < 1
      nanoGroup.current.scale.set(lerp(1, FLEX.w / NANO.w, morph), lerp(1, FLEX.h / NANO.h, morph), lerp(1, FLEX.d / NANO.d, morph))
    }
    if (flexGroup.current) {
      flexGroup.current.visible = fade > 0
      flexGroup.current.scale.set(lerp(NANO.w / FLEX.w, 1, morph), lerp(NANO.h / FLEX.h, 1, morph), lerp(NANO.d / FLEX.d, 1, morph))
    }
    /*
     * ── The word on the screen ─────────────────────────────────────────────
     * It never fades: the panel wakes like a device powering its display, with two short irregular pulses and
     * a longer one, then steady. The pattern runs on the wall clock from the moment the word becomes due,
     * which is inside the deceleration ramp, so the key is still turning into its readable pose when the
     * screen comes on.
     *
     * Once the note at a stop has been read, the word goes back to the resting instruction. That change IS
     * the unlock: the reader is told to scroll at the exact instant scrolling starts working again, instead
     * of being made to guess whether a delay is deliberate or broken.
     */
    const dueWord = screenWordAt(p, REST_WORD, LANDED_WORD, seg.index)
    /*
     * ── Leaving a stop ──────────────────────────────────────────────────
     * The panel asks for a scroll, gets one, and then has nothing to say until the next title is due. It used
     * to put the title the reader had just read back up, which read as the sequence going backwards. So the
     * instruction goes out the way every other word on this screen goes out — a couple of survivals and one
     * last flicker — and the screen then stays dark.
     */
    if (seg.parked !== wasParked.current) {
      if (!seg.parked && wasParked.current) {
        leftStopAt.current = clock.elapsedTime
        leftFromRest.current = shownWord.current === REST_WORD
      }
      wasParked.current = seg.parked
    }
    const sinceLeft = leftStopAt.current > 0 ? clock.elapsedTime - leftStopAt.current : Infinity
    const blinkingOut = !seg.parked && leftFromRest.current && sinceLeft < WORD_BLINK_OUT_END
    const word = (seg.parked && notes.presented[seg.index] === true) || blinkingOut ? REST_WORD : dueWord
    if (word !== shownWord.current) {
      shownWord.current = word
      wordSince.current = clock.elapsedTime
      oled.setWord(word)
    }
    if (word !== REST_WORD) titleSeen.current = true
    /*
     * The resting screen wakes exactly like a narrative word: it is a device powering its display, and there
     * is no reason for the first word to arrive differently from the others. Its pulse starts when the dawn
     * is over, which is the moment the scene becomes visible at all.
     */
    if (wordSince.current === 0 && d >= 0.995) wordSince.current = clock.elapsedTime
    /*
     * And it goes out the same way. When the key finally tears free the instruction has been obeyed, so the
     * panel loses its driver rather than dimming: a couple of survivals, one last flicker, then dark until
     * the first title. Only at the takeoff, and only once, which is what `titleSeen` guards.
     */
    if (launchedAt.current === 0 && p > 0) launchedAt.current = clock.elapsedTime
    /*
     * When the reader asked for this stop's description, and whether its title is still the thing on screen.
     * `revealed` is set by whichever door was used — pointer, tap, focus or the idle offer — so all four get
     * the same acknowledgement.
     */
    const askedHere = seg.parked && notes.revealed[seg.index] === true
    if (askedHere && activatedStop.current !== seg.index) {
      activatedStop.current = seg.index
      activatedAt.current = clock.elapsedTime
    }
    if (!seg.parked && activatedStop.current !== -1) activatedStop.current = -1
    const sinceAsked = activatedStop.current === seg.index ? clock.elapsedTime - activatedAt.current : Infinity
    const acknowledging = sinceAsked < ACTIVE_BLINK_END
    /* The lift and the rule belong to the TITLE; once the panel has gone back to asking for a scroll, neither does. */
    const activeHere = askedHere && word === seg.stop.word
    let wake = 0
    if (launchedAt.current > 0 && !titleSeen.current) {
      const out = clock.elapsedTime - launchedAt.current
      wake = out < WORD_BLINK_OUT_END && WORD_BLINK_OUT.some(([a, b]) => out >= a && out < b) ? 1 : 0
    } else if (acknowledging && activeHere) {
      wake = ACTIVE_BLINK.some(([a, b]) => sinceAsked >= a && sinceAsked < b) ? 1 : 0
    } else if (blinkingOut) {
      // The same going-out pattern as the takeoff, now on every resume.
      wake = WORD_BLINK_OUT.some(([a, b]) => sinceLeft >= a && sinceLeft < b) ? 1 : 0
    } else if (word === '') {
      // Nothing to say: the panel is off, not showing an empty lit rectangle.
      wake = 0
    } else if (wordSince.current > 0) {
      const since = clock.elapsedTime - wordSince.current
      wake = since < WORD_BLINK_END ? (WORD_BLINK.some(([a, b]) => since >= a && since < b) ? 1 : 0) : 1
    }
    /*
     * The affordance. Pointing at the word lifts the screen a little, before any description exists: that
     * lift is what says something can be done here. Damped, so it eases in and out rather than snapping, and
     * fully reversible because it is only ever a function of where the pointer is.
     */
    hoverLift.current += ((notes.hover ? 1 : 0) - hoverLift.current) * Math.min(1, delta * HOVER_DAMP)
    /*
     * ── The acknowledgement ─────────────────────────────────────────────
     * A door was used and the description is being drawn. The panel flickers, the way it flickers for
     * everything else it does, and then drives the title to full white for as long as it is the one being
     * read. It is the answer to the click: something was asked of the device and the device says so before
     * the sentence arrives.
     *
     * It ends when the word does. Once the description has finished presenting, the screen asks for a scroll
     * instead, and there is no title left to drive.
     */
    activeLift.current += ((activeHere && !acknowledging ? 1 : 0) - activeLift.current) * Math.min(1, delta * ACTIVE_DAMP)
    const scrollHint = dawnScreen * wake * (1 + HOVER_LIFT * hoverLift.current + ACTIVE_LIFT * activeLift.current)
    if (import.meta.env.DEV) {
      // Dev-only: the capture scripts read the panel's state off this.
      /*
       * One object, mutated. It used to be rebuilt every frame, with two `toFixed` strings and a string
       * concatenation inside it — dev-only, but the development build is what the author is watching, so its
       * garbage is felt exactly like the product's would be.
       */
      const w = window as unknown as { __screen?: typeof screenProbe; __notes?: unknown }
      const inOut = launchedAt.current > 0 && !titleSeen.current
      screenProbe.word = word
      screenProbe.wake = wake
      screenProbe.hoverLift = hoverLift.current
      screenProbe.intensity = SCREEN_EMISSIVE * scrollHint
      if (inOut && screenProbe.outTrace.length < 80) screenProbe.outTrace += wake ? '#' : '.'
      w.__screen = screenProbe
      w.__notes = notes
    }

    /*
     * ── Where to pin a note, and whether it may be opened yet ──────────────────────────
     * The word has to be UP and its wake pulse over: offering a description of a word that is still blinking
     * on would be offering it before it is there. A handful of custom properties and one attribute per frame,
     * no React state; the DOM reads them in CSS, so the hairlines and the text follow the key as it drifts
     * without any per-frame JavaScript of their own.
     */
    const noteHere = NOTES.find((n) => n.stop === seg.index)
    /*
     * A note becomes openable once its title is UP and done blinking: offering a description of a word that
     * is still coming on would be offering it before it is there. It then stays up until the sequence LEAVES
     * the stop, and not until the word changes — because reading the note is exactly what changes the word,
     * and a note that vanished at the instant it was opened would be a note nobody could read.
     */
    const wordIsUp =
      word === seg.stop.word && wordSince.current > 0 && clock.elapsedTime - wordSince.current >= WORD_BLINK_END
    const armed =
      seg.parked && noteHere !== undefined && (notes.revealed[seg.index] === true || wordIsUp) ? seg.index : -1
    if (armed >= 0 && noteHere && sectionEl.current) {
      /*
       * The device's own rectangle on screen, from its eight corners rather than from a guessed half-extent:
       * the key is tumbling in perspective, and a single offset under-measures it, which starts the hairline
       * inside the word instead of on the body.
       */
      let minX = 1e9
      let maxX = -1e9
      let minY = 1e9
      let maxY = -1e9
      /*
       * The hotspot covers the SCREEN, not the whole body. What the reader is invited to point at is the word,
       * and a control the size of the device puts a focus ring around the entire key, which says less about
       * where the interaction is than a ring around the panel does.
       */
      let sMinX = 1e9
      let sMaxX = -1e9
      let sMinY = 1e9
      let sMaxY = -1e9
      const endX = NOTE1_END.x * size.width
      const endY = NOTE1_END.y * size.height
      for (let c = 0; c < 8; c++) {
        ctxA.set((c & 1 ? 0.5 : -0.5) * NANO.w, (c & 2 ? 0.5 : -0.5) * NANO.h, (c & 4 ? 0.5 : -0.5) * NANO.d)
          .applyQuaternion(quat)
          .add(pos)
          .project(cam)
        const px = (ctxA.x * 0.5 + 0.5) * size.width
        const py = (1 - (ctxA.y * 0.5 + 0.5)) * size.height
        cornerX[c] = px
        cornerY[c] = py
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        // the same corner, pulled in to the panel's share of the long axis
        ctxA.set((c & 1 ? 0.5 : -0.5) * NANO.w, (c & 2 ? 0.24 : -0.24) * NANO.h, (c & 4 ? 0.5 : -0.5) * NANO.d)
          .applyQuaternion(quat)
          .add(pos)
          .project(cam)
        const spx = (ctxA.x * 0.5 + 0.5) * size.width
        const spy = (1 - (ctxA.y * 0.5 + 0.5)) * size.height
        if (spx < sMinX) sMinX = spx
        if (spx > sMaxX) sMaxX = spx
        if (spy < sMinY) sMinY = spy
        if (spy > sMaxY) sMaxY = spy
      }
      /*
       * ── Where a note's line leaves the device ─────────────────────────
       * The top centre or the bottom centre of the Ledger, as the EYE reads them: the horizontal middle of the
       * silhouette, and the point where the silhouette's upper or lower edge actually is at that middle.
       *
       * Two readings were tried and thrown away on the way to this one. Taking the centres of the two ends of
       * the body, in the object's own frame, gives the wrong point for most of this sequence: the key spends
       * it tumbling, and when it lies flat its two ends are at the left and right of the screen, so the line
       * left from the SIDE of the device. Taking the bounding box's bottom edge gives a point that floats
       * below the body wherever the key is tilted. Here the twelve edges of the box are walked and the
       * lowest, then the highest, crossing of the middle column is kept — which is a point ON the silhouette,
       * horizontally centred, at any pose. The CONTEXT note already read this way; now all three do.
       */
      const midX = (minX + maxX) / 2
      let downY = -Infinity
      let upY = Infinity
      for (let a = 0; a < 8; a++) {
        // indexed, not `for…of`: an iterator object per corner per frame is an allocation in the frame loop
        for (let e = 0; e < EDGE_BITS.length; e++) {
          const b = a ^ EDGE_BITS[e]
          if (b < a) continue // each edge once
          const x0 = cornerX[a]
          const x1 = cornerX[b]
          if (midX < Math.min(x0, x1) || midX > Math.max(x0, x1)) continue
          const span = x1 - x0
          const y = Math.abs(span) < 1e-6 ? Math.max(cornerY[a], cornerY[b]) : cornerY[a] + ((cornerY[b] - cornerY[a]) * (midX - x0)) / span
          if (y > downY) downY = y
          if (y < upY) upY = y
        }
      }
      // A pose exactly edge-on to the camera can leave the middle column uncrossed; the box then stands in.
      if (!Number.isFinite(downY)) downY = maxY
      if (!Number.isFinite(upY)) upY = minY
      const downX = midX
      const upX = midX

      const st = sectionEl.current.style
      const W = size.width
      const H = size.height
      // The hotspot covers the device and is never smaller than the 44 px the guidelines ask for.
      writeVar(st, cssCache, '--n-hot-x', (sMinX + sMaxX) / 2, (v) => pct(v, W))
      writeVar(st, cssCache, '--n-hot-y', (sMinY + sMaxY) / 2, (v) => pct(v, H))
      writeVar(st, cssCache, '--n-hot-w', sMaxX - sMinX, px0)
      writeVar(st, cssCache, '--n-hot-h', sMaxY - sMinY, px0)
      /*
       * All three elbows now have the same shape: one leg straight out of the end of the device, one leg
       * sideways to the text. The legs are handed over in pixels so neither can collapse from a percentage
       * resolved against the wrong box.
       */
      if (noteHere.placement === 'under-key') {
        writeVar(st, cssCache, '--n0-x', downX, (v) => pct(v, W))
        writeVar(st, cssCache, '--n0-y', downY, (v) => pct(v, H))
      } else if (noteHere.placement === 'top-left') {
        writeVar(st, cssCache, '--n1-x', upX, (v) => pct(v, W))
        writeVar(st, cssCache, '--n1-y', upY, (v) => pct(v, H))
        writeVar(st, cssCache, '--n1-end-x', NOTE1_END.x * 100, (v) => `${v.toFixed(2)}%`, 0)
        writeVar(st, cssCache, '--n1-end-y', NOTE1_END.y * 100, (v) => `${v.toFixed(2)}%`, 0)
        writeVar(st, cssCache, '--n1-rise', upY - endY, px1)
        writeVar(st, cssCache, '--n1-run', upX - endX, px1)
      } else {
        const e2x = NOTE2_END.x * size.width
        const e2y = NOTE2_END.y * size.height
        writeVar(st, cssCache, '--n2-x', downX, (v) => pct(v, W))
        writeVar(st, cssCache, '--n2-y', downY, (v) => pct(v, H))
        writeVar(st, cssCache, '--n2-end-x', NOTE2_END.x * 100, (v) => `${v.toFixed(2)}%`, 0)
        writeVar(st, cssCache, '--n2-end-y', NOTE2_END.y * 100, (v) => `${v.toFixed(2)}%`, 0)
        writeVar(st, cssCache, '--n2-run', e2x - downX, px1)
        writeVar(st, cssCache, '--n2-drop', e2y - downY, px1)
      }
    }
    if (armed !== armedStop.current) {
      armedStop.current = armed
      notes.armed = armed
      if (armed < 0) notes.hover = false
      sectionEl.current?.setAttribute('data-note-armed', armed >= 0 ? String(armed) : 'none')
    }
    if (nanoMats.current) {
      for (const f of nanoMats.current.all) f.material.opacity = f.opacity * (1 - fade)
      nanoMats.current.screen.emissiveIntensity = SCREEN_EMISSIVE * scrollHint
    }
    if (flexMats.current) {
      for (const f of flexMats.current.all) f.material.opacity = f.opacity * fade
      // The wordmark comes up on the black panel at landing; the panel itself arrived with the device.
      flexMats.current.screen.opacity = fade * smoothstep(PHASE.screenOn[0], PHASE.screenOn[1], p)
    }

    // Atmosphere: dusk lingers through the first turn, then night; stars brightest-first; nebula last.
    if (nebulaMat.current) nebulaMat.current.opacity = 0.45 * smoothstep(PHASE.nebula[0], PHASE.nebula[1], p)
    // Fog follows the dawn exposure too: unlit far dunes must stay black while the day is still down.
    if (fog.current) fog.current.color.lerpColors(colors.amber, colors.spaceDeep, smoothstep(PHASE.night[0], PHASE.night[1], p)).multiplyScalar(smoothstep(0.15, 0.65, d))

    // Sand: drifts at rest, thins out during the climb; revealed by the dawn light. Grains collide with the key's
    // box while it stands (the box pose is passed to the shader; collisions stop once the key is released).
    const su = sand.material.uniforms
    su.uTime.value = clock.elapsedTime
    su.uPixelRatio.value = dpr
    su.uOpacity.value = 0.46 * (1 - smoothstep(PHASE.sandFade[0], PHASE.sandFade[1], p)) * smoothstep(0.5, 0.85, d)
    su.uBoxCenter.value.copy(pos)
    // Collision volume: the key's own oriented box. Exact half extents and the device's full orientation (the
    // resting lean included), so the grains meet the surface instead of an invisible sleeve around it.
    su.uBoxHalf.value.set(NANO.w / 2, NANO.h / 2, NANO.d / 2)
    boxMat4.makeRotationFromQuaternion(quat).transpose() // orthonormal: the transpose is the world → box rotation
    su.uBoxRotInv.value.setFromMatrix4(boxMat4)
    su.uBoxActive.value = release > 0.98 ? 1 : 0
    // The sand only answers a shake while the key is still in it.
    su.uKick.value.set(nudgeStart.current > 0 ? clock.elapsedTime - nudgeStart.current : 99, nudgeStart.current > 0 ? nudgeAmp.current * release : 0)
    // Glints (grains and ground) follow the sun's level: they come with the dawn and go with the light.
    su.uSunDir.value.copy(SUN_DIR)
    su.uGlint.value = dawnLight
    groundUniforms.uTime.value = clock.elapsedTime
    groundUniforms.uGlint.value = dawnLight

    // Lights, all scaled by the dawn.
    if (sun.current) sun.current.intensity = LIGHT.sun * dawnLight
    if (glint.current) glint.current.intensity = LIGHT.glint * release * smoothstep(0.45, 0.9, d)
    if (hemi.current) hemi.current.intensity = LIGHT.hemi * dawnAmbient
    if (ambient.current) ambient.current.intensity = LIGHT.ambient * dawnAmbient
    // The front-left light becomes the Flex's key light from the morph on, so the E Ink reads against the black sky.
    if (fill.current) fill.current.intensity = lerp(LIGHT.fill, 1.6, Math.max(morph, t3)) * dawnLight

    /*
     * The star field, on the same schedule the CSS layer used to run on (PHASE.stars: the last two thirds of
     * the night transition). It is in the canvas now, which is the whole point: the lens in the post pass can
     * only bend what went through the render target.
     */
    starAmount.current.value = smoothstep(PHASE.stars[0], PHASE.stars[1], p)
    /*
     * The lens, on the field's own schedule. Its centre is one arc radius above the middle of the screen, so
     * the circle passes through both top corners and its lowest point lands mid-screen; the ring the hole
     * draws later sits on exactly that circle. Expressed in viewport fractions, y counted up, which is what
     * the shader wants.
     */
    const arcPx = arcRadiusPx(size.width, size.height)
    lens.current.x = 0.5
    /* The centre rides down with the fall, so the bending arrives with the mass rather than before it. */
    lens.current.y = 0.5 + (arcPx / size.height) * (1 + HOLE_FALL_LIFT * (1 - fall))
    lens.current.radius = arcPx / size.height
    lens.current.amount = fall

    /*
     * The hole's rim, as a light. Position, aim and intensity are computed by the hole itself, from its own
     * geometry; here they are only handed to a light that has existed since the first frame.
     */
    if (rimLight.current) {
      const r = rim.current
      rimLight.current.position.set(r.x, r.y, r.z)
      rimLight.current.intensity = r.intensity
      rimTarget.position.set(r.tx, r.ty, r.tz)
      rimTarget.updateMatrixWorld()
    }
  })

  // R3F sets the shadow frustum props but does not refresh the projection matrix.
  const sunRef = useCallback((light: THREE.DirectionalLight | null) => {
    sun.current = light
    light?.shadow.camera.updateProjectionMatrix()
  }, [])

  return (
    <>
      {/* The sun: raking amber light from behind the horizon, casts the long shadow of the planted slab.
          Tiny biases: at grazing incidence a large normalBias detaches the shadow from the base. */}
      <directionalLight
        ref={sunRef}
        position={sunPosition}
        target={sunTarget}
        intensity={0}
        color={colors.amber}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.001}
        shadow-radius={2.4}
        shadow-camera-near={4}
        shadow-camera-far={50}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <primitive object={sunTarget} />
      {/* Raking horizon light from the right: its reflection on the glass and the button reaches the camera. */}
      <directionalLight ref={glint} position={glintPosition} target={sunTarget} intensity={0} color={colors.amber} />
      <hemisphereLight ref={hemi} args={[colors.ember, colors.regolithDeep, 0]} />
      {/* Low warm-white light from the left, grazing the dunes; becomes the key light of the Flex. */}
      <directionalLight ref={fill} position={[-12, 2, 6]} intensity={0} color={colors.screenOn} />
      <ambientLight ref={ambient} color={colors.regolithLight} intensity={0} />
      {/*
        The black hole's rim, as a light on the scene. It is mounted from the first frame at zero intensity so
        the light count never changes (see `rim` above); the hole drives it once it exists. It sits at the
        bright low point of the arc, sixteen units behind the device, so what it gives is a back light: an
        orange edge down the Flex, which is what being in front of that thing should look like.
      */}
      <directionalLight ref={rimLight} target={rimTarget} intensity={0} color={colors.peach} />
      <primitive object={rimTarget} />

      <Ground colors={colors} uniforms={groundUniforms} />
      <TitleBillboard text={title} colors={colors} dawn={dawn} />
      <Sand sand={sand} />

      {/*
        The star field. Back in the canvas, where the lens can reach it (src/scene/StarField.tsx); the CSS layer
        underneath is now the night backdrop and nothing else.
      */}
      <StarField amount={starAmount.current} frozen={reducedMotion.current} lens={lens.current} />
      <mesh position={[8, 74, -120]} rotation={[0.42, 0.05, 0]}>
        <planeGeometry args={[260, 130]} />
        <meshBasicMaterial ref={nebulaMat} map={nebulaTex} transparent opacity={0} depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {showBlackHole && (
        <Suspense fallback={null}>
          <BlackHole colors={colors} amount={blackHoleAmount.current} burn={blackHoleBurn.current} rim={rim.current} frozen={reducedMotion.current} />
        </Suspense>
      )}

      <group ref={group}>
        {/* The author's own models, loaded from public/ as they are (src/scene/fbx-devices.tsx). */}
        <group ref={nanoGroup} name="device-nano">
          <Suspense fallback={null}>
            <NanoXModel colors={colors} oledTexture={oledTex} onMaterials={onNanoMaterials} />
          </Suspense>
        </group>
        <group ref={flexGroup} name="device-flex" visible={false}>
          {/*
            Fetched, parsed and merged during the dawn, which is the loading time: requesting it at takeoff put a
            39 MB fetch, an FBX parse and a 1273-mesh merge on the main thread in the first second of flight.
          */}
          <Suspense fallback={null}>
            <StaxModel colors={colors} labelTexture={einkLabel} onMaterials={onFlexMaterials} />
          </Suspense>
        </group>
      </group>

      <HeatPost progress={progress} dawn={dawn} />
    </>
  )
}
