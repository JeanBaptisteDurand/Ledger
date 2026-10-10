/**
 * The space background, inside the canvas, with depth.
 *
 * WHAT IT WAS. Three flat layers of hard square dots on a jittered grid, the look of an imposed CodePen, each
 * layer drifting at its own speed. The parallax was three speeds, and the grid showed as a pattern. The lens
 * bent the layers' coordinates, which is what made the bending legible, but a bent grid is still a grid.
 *
 * WHAT IT IS. A field of stars with a DEPTH each, projected in perspective, the idea of starfield.js
 * (github.com/AnnikaV9/starfield.js, MIT: 3D positions, size and brightness falling with distance). Nothing
 * of its code is here — it is a Canvas 2D warp toward the viewer, and this is a WebGL field that drifts the
 * other way — only the model: a star's screen speed, its size and its brightness all follow 1/z, so the near
 * ones sweep and the far ones crawl, and the eye reads a volume rather than a wallpaper. The drift is the
 * same as before, DOWN the screen, because it is the one thing left that says the camera is rising once the
 * sky is drawn in screen space; the speeds at the nearest and farthest depth bracket the three the pen had.
 *
 * THE LENS, PER STAR. Each star is placed twice: where the lens shows its outer image, and where it shows the
 * inner, inverted one. The thin-lens map is inverted in closed form (r = (b ± sqrt(b² + 4rE²)) / 2), and its
 * Jacobian gives the stretch: tangential r/b, radial dr/db. A star drifting toward the ring is drawn as an
 * arc that lengthens and dims until it is gone — that dimming is the absorption the author asked to keep; it
 * is not physics (a lens conserves surface brightness) and is said so here. Inside the ring the second image
 * fades toward the centre for the same reason. With no lens the map is the identity.
 *
 * THE SCROLL. The field answers the reader (2026-09-29): the scene's progress and the home's scroll are
 * handed in as a travel in pixels and a speed, and every star moves by that travel over its own depth — the
 * near ones by all of it, the far ones by a seventh — and streaks along the travel by the speed, again over
 * its depth. A stop holds the sky still; a flight sweeps it; on the home the page's scroll slides the sky
 * under the sheets at a fraction of their speed, which is what a parallax is.
 *
 * THE LIGHT. A star is not a disc: a hot core brighter than white (additive, so it blooms into what is
 * around it), a soft halo, and on the nearest and brightest a pair of diffraction spikes; a slow twinkle on
 * the near ones; a faint temperature — most white, some the page's cream, a few the night's azure.
 *
 * COST. One instanced draw, two instances per star, no allocation per frame; the geometry sits on the far
 * plane and is depth-tested, so the ground and the devices occlude it as they occlude anything else.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { LensState } from './black-hole-frame'
import { STAR_LAYER } from './glass'
import { cssColor } from './tokens'

/** How many stars, over a field 40 % wider and taller than the viewport so the edges never run dry. */
const COUNT = 4800
/** Depth range, in units where 1 is the nearest plane; speed, size and brightness all go as 1/z. */
const Z_NEAR = 1
const Z_FAR = 7
/** Screen drift of the nearest plane, CSS px per second, downward. The pen's fastest layer was 40. */
const SPEED_NEAR = 44
/** Dot diameter of the nearest plane, CSS px; the far plane is this over Z_FAR. */
const SIZE_NEAR = 4.4
/** Over-scan of the source field around the viewport, as a share of its size. */
const OVERSCAN = 0.4
/** How far the nearest plane streaks per px/s of travel speed, as a multiple of its size. */
const STREAK = 0.0075

/** What the scene hands the field each frame: the reader's travel and speed, in css px and px/s. */
export type StarMotion = { travel: number; speed: number }

const VERT = /* glsl */ `
  precision highp float;
  attribute vec4 aStar;      // x0, y0 in [0,1] of the over-scanned field; z in [Z_NEAR, Z_FAR]; a random 0..1
  attribute float aImage;    // 0: the outer image; 1: the inner, inverted one
  uniform float uTime;
  uniform vec2 uRes;         // css px
  uniform float uDpr;
  uniform float uSpeedNear, uSizeNear, uOverscan, uStreak;
  uniform float uTravel;     // the reader's travel, css px, signed (down is positive)
  uniform float uSpeed;      // the reader's speed, css px/s, signed
  uniform vec3 uCream, uAzure;
  uniform vec2 uLensCentre;  // css px
  uniform float uLensEinstein, uLensAmount, uLensGain;
  varying float vBright;
  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vSpike;

  void main() {
    float z = aStar.z;
    float inv = 1.0 / z;
    // The source position: a slab wider than the screen, drifting down at 1/z, wrapped.
    vec2 field = uRes * (1.0 + 2.0 * uOverscan);
    vec2 s = vec2(aStar.x * field.x, aStar.y * field.y + (uTime * uSpeedNear + uTravel) * inv);
    s.y = mod(s.y, field.y);
    s -= uRes * uOverscan;
    // Size and light fall with depth, but not to nothing: the far sky is a dust of points, not a void.
    float size = uSizeNear * (0.36 + 0.64 * inv) * (0.75 + 0.5 * aStar.w);
    float bright = (0.55 + 0.45 * pow(inv, 0.8)) * (0.65 + 0.35 * aStar.w);
    // The twinkle, on the near ones, each at its own rate; the far sky is steady.
    float tw = 0.86 + 0.14 * sin(uTime * (1.3 + 2.6 * aStar.w) + aStar.w * 37.0);
    bright *= mix(1.0, tw, smoothstep(0.25, 0.8, inv));
    // The streak: along the travel, by the speed, over the depth.
    float streak = 1.0 + abs(uSpeed) * uStreak * inv;
    // Temperature: a hash off the star's own random, so it never changes.
    float temp = fract(aStar.w * 7.31 + aStar.x * 3.7);
    vColor = temp < 0.12 ? uAzure : (temp < 0.4 ? uCream : vec3(1.0));
    // Spikes on the near, bright ones only.
    vSpike = step(0.82, aStar.w) * smoothstep(0.3, 0.8, inv);

    // The lens: the observed position of this image, and its stretch.
    vec2 pos = s;
    vec2 axisT = vec2(1.0, 0.0);
    vec2 axisR = vec2(0.0, 1.0);
    float stretchT = 1.0;
    float stretchR = 1.0;
    float amt = uLensAmount * uLensGain;
    if (amt > 0.002 && uLensEinstein > 0.0) {
      float rE = uLensEinstein * sqrt(amt);
      vec2 toC = s - uLensCentre;
      float b = max(length(toC), 1e-3);
      vec2 dir = toC / b;
      float root = sqrt(b * b + 4.0 * rE * rE);
      float r = aImage < 0.5 ? 0.5 * (b + root) : 0.5 * (root - b);
      // The inner image sits on the far side of the centre.
      vec2 rdir = aImage < 0.5 ? dir : -dir;
      pos = uLensCentre + rdir * r;
      stretchT = r / b;
      stretchR = 0.5 * (1.0 + (aImage < 0.5 ? b : -b) / root);
      stretchR = abs(stretchR);
      axisR = rdir;
      axisT = vec2(-rdir.y, rdir.x);
      /*
       * The absorption. An arc that lengthens without limit and never dims would be a bright ring of smeared
       * stars; what is wanted is stars that go INTO the hole. So the stretch is capped and the light goes down
       * with it, and the inner image fades as it nears the centre.
       */
      float cap = 14.0;
      float t = min(stretchT, cap);
      // Linear, not a square root: with the compositing fixed, the long arcs' halos piled into a mottled glow.
      bright *= 1.0 / max(t / 1.4, 1.0);
      stretchT = t;
      if (aImage > 0.5) bright *= 0.55 * smoothstep(0.0, 0.85, r / rE);
      else bright *= smoothstep(1.0, 1.06, r / rE);
    }
    vBright = bright / sqrt(streak);
    vLocal = position.xy;
    // The quad, in css px: room for the halo and the spikes, stretched along the tangent and the radius of the
    // lens, and along the travel by the streak (the lens's axes are the identity when there is no lens).
    float room = 1.0 + 1.4 * vSpike;
    vec2 half_ = vec2(size * stretchT, size * stretchR * streak) * (0.5 * room) + 1.5 + 1.5 * vSpike;
    vec2 off = axisT * (position.x * half_.x) + axisR * (position.y * half_.y);
    vec2 px = pos + off;
    // css px → clip, on the far plane: whatever wrote depth before it hides it.
    vec2 clip = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
    gl_Position = vec4(clip, 1.0, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uAmount;
  varying float vBright;
  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vSpike;
  void main() {
    if (uAmount < 0.002) discard;
    vec2 q = vLocal;
    float d = length(q);
    // The core, hotter than white; the halo, soft; the spikes, two thin crossed lines on the chosen few.
    float core = exp(-d * d * 14.0) * 1.6;
    float halo = exp(-d * 3.2) * 0.34;
    float spikes = (exp(-abs(q.x) * 22.0) * exp(-abs(q.y) * 2.4) + exp(-abs(q.y) * 22.0) * exp(-abs(q.x) * 2.4)) * 0.55 * vSpike;
    float a = (core + halo + spikes) * vBright * uAmount;
    if (a < 0.012) discard;
    /*
     * NOT premultiplied. The stars are the first thing drawn, over a cleared, transparent target, and the
     * compositing pass (HeatPost) multiplies colour by alpha itself; a colour premultiplied here went through
     * that twice — a star at half alpha came out at a quarter, the far ones at nothing, which is why the field
     * vanished on the night's transition and only showed once the nebula had lifted the alpha under it.
     */
    vec3 col = vColor + vec3(max(a - 1.0, 0.0)) * 0.5;
    gl_FragColor = vec4(col, min(a, 1.0));
  }
`

/**
 * @param amount  how present the field is, 0 to 1. A plain object, written from the scene's useFrame.
 * @param frozen  reduced motion: the field is still drawn, it simply does not drift.
 * @param lens    the black hole, written by it and read here. Zero until it exists.
 */
export function StarField({ amount, frozen, lens, motion }: { amount: { value: number }; frozen: boolean; lens: LensState; motion: StarMotion }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const size = useThree((s) => s.size)
  const mesh = useRef<THREE.Mesh>(null)
  // Its own layer: the home's glass renders its frosted copy without the stars (scene/glass.ts STAR_LAYER).
  useEffect(() => {
    mesh.current?.layers.set(STAR_LAYER)
  }, [])

  const built = useMemo(() => {
    const geometry = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(2, 2)
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setIndex(quad.getIndex())
    // A fixed seed, so the field is the same sky on every load and in every capture.
    let seed = 1337
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const stars = new Float32Array(COUNT * 2 * 4)
    const image = new Float32Array(COUNT * 2)
    for (let i = 0; i < COUNT; i++) {
      const x = rnd()
      const y = rnd()
      // More far stars than near: the volume is a slab, and a slab has more of it far away.
      const z = Z_NEAR + (Z_FAR - Z_NEAR) * Math.pow(rnd(), 0.6)
      const w = rnd()
      for (let k = 0; k < 2; k++) {
        const j = (i * 2 + k) * 4
        stars[j] = x
        stars[j + 1] = y
        stars[j + 2] = z
        stars[j + 3] = w
        image[i * 2 + k] = k
      }
    }
    geometry.setAttribute('aStar', new THREE.InstancedBufferAttribute(stars, 4))
    geometry.setAttribute('aImage', new THREE.InstancedBufferAttribute(image, 1))
    geometry.instanceCount = COUNT * 2
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        /** Development only: a non-negative value pins the drift, so a measurement can isolate the lens. */
        uHold: { value: -1 },
        uAmount: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uSpeedNear: { value: SPEED_NEAR },
        uSizeNear: { value: SIZE_NEAR },
        uOverscan: { value: OVERSCAN },
        uStreak: { value: STREAK },
        uTravel: { value: 0 },
        uSpeed: { value: 0 },
        /* Mostly white; a few in the page's cream, fewer in the night's azure. */
        uCream: { value: cssColor('--color-text-050') },
        uAzure: { value: cssColor('--color-space-azure-soft') },
        uLensCentre: { value: new THREE.Vector2(0, 0) },
        uLensEinstein: { value: 0 },
        uLensAmount: { value: 0 },
        /** A gate for measurement, and 1 in the product: the scene writes the three above every frame. */
        uLensGain: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      /* Depth test ON: the far plane is behind the ground and the devices, so they occlude it. */
      depthTest: true,
      /*
       * BOTH sides. The quad is offset in css pixels and the y axis is flipped on the way to clip space, which
       * reverses its winding; front-face culling then threw every star away — except, at the landing, the
       * ones the lens's rotated axes happened to turn back the right way, which is what made the field look
       * present there and absent on the stops (found 2026-09-29, after a long hunt through everything else).
       */
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
    quad.dispose()
    return { material, geometry }
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
    if (import.meta.env.DEV) {
      const w = window as unknown as { __stars?: unknown; __starsMat?: unknown }
      w.__stars = u
      w.__starsMat = built.material
    }
    u.uAmount.value = amount.value
    u.uDpr.value = dpr
    ;(u.uRes.value as THREE.Vector2).set(size.width, size.height)
    /* The hole, converted from viewport fractions into the CSS pixels this shader thinks in. */
    ;(u.uLensCentre.value as THREE.Vector2).set(lens.x * size.width, lens.y * size.height)
    u.uLensEinstein.value = lens.radius * lens.strength * size.height
    u.uLensAmount.value = lens.amount
    u.uTravel.value = motion.travel
    u.uSpeed.value = frozen ? 0 : motion.speed
    if (!frozen) u.uTime.value = clock.elapsedTime
    // The hold is a measurement device and belongs to development only; the branch is stripped from the build.
    if (import.meta.env.DEV && u.uHold.value >= 0) u.uTime.value = u.uHold.value
  })

  /* renderOrder: first of the transparent pass, so the nebula and the black hole lie over it, not under. */
  return <mesh ref={mesh} geometry={built.geometry} material={built.material} renderOrder={-3000} frustumCulled={false} />
}

export default StarField
