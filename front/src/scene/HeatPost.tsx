/**
 * Heat shimmer at the horizon, as a single post pass with a depth mask, anchored to the WORLD: the band is centred
 * on the screen projection of the ground line where the key stands (the title's baseline), so when the camera
 * rises the shimmer leaves the frame by the bottom with the horizon and the title. The render target is
 * multisampled (MSAA ×4) so edges stay clean through the post pass without antialias on the canvas.
 * The gravitational lens used to live here too. It was moved into the star field itself (src/scene/StarField.tsx),
 * because a displacement of this target cannot bend the sky BEHIND an object that occludes it: the target holds one
 * composited image, so every sample reaching past the landed Flex returned the Flex, and the boundary between the
 * pixels whose source cleared her silhouette and those whose source did not traced a second, sheared copy of the
 * device across the arc. Measured on the composition. The star field is procedural, so bending it at the source
 * costs nothing, has no texture to run off the edge of, and no foreground to smear.
 *
 * The scene is rendered to a target (colour + depth); a fullscreen quad then displaces pixels vertically with slow
 * drifting noise inside a band above the horizon, but only where the scene is farther than the device: the key
 * and its shadow stay sharp, only the far ground and the low sky boil. Where the canvas is transparent (the CSS
 * sky shows through), the shader redraws a displaced copy of the same sky gradient (same tokens, same translation,
 * same night fade), so the sky ripples too. The band fades with height and disappears with the night.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { cssColor, SKY_STOPS } from './tokens'
import type { HeroProgress } from '../motion/hero'
import type { Dawn } from '../motion/dawn'
import { nightLinear, skyShift } from '../motion/hero-math'
import { GLASS_APPLY_GLSL, GLASS_UNIFORMS_GLSL, GlassSheets, makeGlassPass, makeGlassUniforms, STAR_LAYER } from './glass'
import { LIQUID_APPLY_GLSL, LIQUID_UNIFORMS_GLSL, LiquidFigures, makeLiquidUniforms } from './liquid'

/** World point the shimmer band is anchored to: the title's ground line, far behind the key. */
const BAND_ANCHOR = new THREE.Vector3(0, 0.55, -40)
const MSAA_SAMPLES = 4

/** Scene depth (world units from the camera) beyond which the shimmer applies. The device rests ~4.8 away. */
const NEAR_MASK = 9

/*
 * The shader's sky ramp is sized FROM the data, never written by hand.
 *
 * It used to declare uStops[8] against a SKY_STOPS of twelve, and loop to eight. The last four stops were
 * dropped on the floor: the sky redrawn inside the shimmer band ran out at sky-amber 0.64 and never reached
 * the peach, the second amber, the regolith or the black, so the band disagreed with the CSS sky it was
 * supposed to be continuing. Interpolating the length is what makes that class of drift impossible — add a
 * stop to the ramp and the shader grows with it.
 */
const STOP_COUNT = SKY_STOPS.length

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform float uNear;
  uniform float uFar;
  uniform float uNearMask;  // world distance under which nothing is displaced
  uniform float uTime;
  uniform float uHorizon;   // screen fraction from the top
  uniform float uSkyShift;  // sky layer translation, viewport fractions
  uniform float uNight;     // CSS night layer opacity
  uniform float uAmp;       // displacement amplitude, uv units
  uniform float uDawnA;     // dawn: visibility of the redrawn sky band
  uniform float uDawnBright; // dawn: sky exposure (matches the CSS layer)
  uniform vec3 uStops[${STOP_COUNT}];
  uniform float uPos[${STOP_COUNT}];
  uniform vec3 uNightColor;
  varying vec2 vUv;
  ${GLASS_UNIFORMS_GLSL}
  ${LIQUID_UNIFORMS_GLSL}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec3 skyAt(float s) {
    vec3 c = uStops[0];
    for (int i = 1; i < ${STOP_COUNT}; i++) {
      float t = clamp((s - uPos[i - 1]) / max(uPos[i] - uPos[i - 1], 1e-4), 0.0, 1.0);
      c = mix(c, uStops[i], t);
    }
    return c;
  }
  // Perspective depth buffer → distance from the camera. Cleared depth (1.0) reads as the far plane (sky).
  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  }

  void main() {
    float horizonY = 1.0 - uHorizon;
    float d = vUv.y - horizonY;
    // Strong just above the skyline, gone 20% of the height higher; a little below to catch the far dune tops.
    float band = smoothstep(-0.035, 0.0, d) * (1.0 - smoothstep(0.0, 0.2, d)) * (1.0 - uNight);
    // Desert shimmer: the noise drifts sideways along the horizon and its strength breathes over time,
    // with a slow spatial modulation so some stretches of horizon boil more than others.
    float drift = uTime * 0.3;
    float n = (vnoise(vec2(vUv.x * 64.0 + drift * 3.0, vUv.y * 96.0 + uTime * 0.6)) - 0.5)
            + 0.5 * (vnoise(vec2(vUv.x * 22.0 + drift, vUv.y * 34.0 + uTime * 1.0)) - 0.5);
    float breathe = 0.65 + 0.35 * sin(uTime * 0.7) * cos(uTime * 0.23 + 1.3);
    float pockets = 0.6 + 0.4 * vnoise(vec2(vUv.x * 4.0 - uTime * 0.05, 0.5));
    float offY = n * uAmp * band * breathe * pockets;
    vec2 uv2 = vec2(vUv.x, clamp(vUv.y + offY, 0.0, 1.0));

    // Depth mask: never displace a near pixel, never pull a near pixel into a far one.
    bool nearHere = linearDepth(vUv) < uNearMask;
    if (nearHere || linearDepth(uv2) < uNearMask) { uv2 = vUv; }
    vec4 sc = texture2D(tScene, uv2);
    float s = (1.0 - uv2.y) - uSkyShift;
    vec3 sky = mix(skyAt(s), uNightColor, uNight) * uDawnBright;
    float skyA = band * (1.0 - sc.a) * (nearHere ? 0.0 : 1.0) * uDawnA;
    /*
     * The target is ALREADY premultiplied: three's blending over a cleared, transparent target leaves
     * colour × alpha in it (normal and additive alike). This line used to multiply by alpha a second time,
     * which no one saw while everything drawn over the sky was opaque or at alpha 1 — and which erased any
     * soft, translucent thing over the transparent sky: a star at half alpha came out at a quarter, one at a
     * tenth at nothing. Found on 2026-09-29 by reading the target's pixels (the stars were in it) against the
     * frame (they were not). The hole and the nebula were tuned against the old line; they square their own
     * alpha now, so their approved look is unchanged.
     */
    vec3 col = sc.rgb + sky * skyA; // premultiplied
    float a = sc.a + skyA;
    // The home: the glass sheets, on the ring (src/scene/glass.ts).
    ${GLASS_APPLY_GLSL}
    // The liquid figures, over the glass (src/scene/liquid.ts).
    ${LIQUID_APPLY_GLSL}
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

type Props = { progress: HeroProgress; dawn: Dawn; amplitude?: number }

export function HeatPost({ progress, dawn, amplitude = 0.016 }: Props) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  const rt = useMemo(() => {
    const depthTexture = new THREE.DepthTexture(1, 1)
    depthTexture.format = THREE.DepthFormat
    depthTexture.type = THREE.UnsignedIntType
    return new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false, depthTexture, samples: MSAA_SAMPLES })
  }, [])
  const anchor = useMemo(() => new THREE.Vector3(), [])
  const glass = useMemo(() => makeGlassPass(), [])
  const sheets = useMemo(() => new GlassSheets(), [])
  const figures = useMemo(() => new LiquidFigures(), [])
  const post = useMemo(() => {
    const stops = SKY_STOPS.map(([token]) => cssColor(token))
    const pos = SKY_STOPS.map(([, p]) => p)
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: rt.texture },
        tDepth: { value: rt.depthTexture },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uNearMask: { value: NEAR_MASK },
        uTime: { value: 0 },
        uHorizon: { value: 0.66 },
        uSkyShift: { value: 0 },
        uNight: { value: 0 },
        uAmp: { value: amplitude },
        uDawnA: { value: 1 },
        uDawnBright: { value: 1 },
        uStops: { value: stops },
        uPos: { value: pos },
        uNightColor: { value: cssColor('--color-space-deep') },
        ...makeGlassUniforms(glass.rtB.texture),
        ...makeLiquidUniforms(figures.slots),
      },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { material, quad, scene, camera: cam }
  }, [rt, glass, figures, amplitude, camera.near, camera.far])

  useEffect(() => {
    rt.setSize(Math.floor(size.width * dpr), Math.floor(size.height * dpr))
    glass.setSize(Math.floor(size.width * dpr), Math.floor(size.height * dpr))
  }, [rt, glass, size, dpr])
  // The star field lives on its own layer (StarField.tsx), so the frosted copy can be rendered without it.
  useEffect(() => {
    camera.layers.enable(STAR_LAYER)
  }, [camera])

  useEffect(
    () => () => {
      rt.depthTexture?.dispose()
      rt.dispose()
      glass.dispose()
      figures.dispose()
      post.material.dispose()
      post.quad.geometry.dispose()
    },
    [rt, glass, figures, post],
  )

  // Priority 1: we own the render. Scene → target (colour + depth), then the shimmer quad → canvas.
  useFrame(({ gl: renderer, scene, camera: cam, clock }, delta) => {
    const p = progress.p
    const u = post.material.uniforms
    u.uTime.value = clock.elapsedTime
    // World anchoring: project the ground line the key stands on; the band follows it out of the frame.
    anchor.copy(BAND_ANCHOR).project(cam)
    u.uHorizon.value = 0.5 - anchor.y * 0.5
    u.uSkyShift.value = skyShift(p)
    u.uNight.value = nightLinear(p)
    if (import.meta.env.DEV) (window as unknown as { __post?: unknown }).__post = u
    // Keep the redrawn sky band in step with the CSS dawn (glow first, then exposure).
    const t = dawn.t
    const s3 = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c) }
    u.uDawnA.value = s3(t / 0.45)
    u.uDawnBright.value = 0.25 + 0.75 * s3((t - 0.1) / 0.55)

    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(scene, cam)
    renderer.setRenderTarget(null)
    /*
     * The home: the sheets are read off the DOM and the frosted copy is made, both only while the hole is the
     * background. The scene pays nothing for the glass until then.
     */
    if (progress.mode === 'background') {
      const n = sheets.write(u, size.width, size.height)
      ;(u.uGlassLight.value as THREE.Vector2).set(size.width / 2, size.height / 2)
      if (n > 0) glass.run(renderer, scene, cam)
      figures.write(u, size.width, size.height, dpr, delta, clock.elapsedTime)
    } else {
      u.uGlassN.value = 0
      u.uFigN.value = 0
    }
    renderer.render(post.scene, post.camera)
  }, 1)

  return null
}
