/**
 * Wind-borne sand: one point cloud (COUNT grains, one draw call), animated entirely in the vertex shader.
 * Grains drift sideways along the horizon with a slow undulation and soft gusts, densest near the ground and
 * sparse higher up, in front of and behind the device; they fade with distance and vanish during the climb.
 *
 * Two extras, both in the shader (no state, no React):
 *   - glint: each grain has a stable pseudo-random facet normal that drifts slowly; it flashes (Blinn lobe, high
 *     exponent) when that facet aligns with the half vector between the horizon light and the camera, more so for
 *     grains seen against the light (forward scattering). Tinted by the light, never white, never a size change,
 *     never tied to a contact; it follows the scene's light level (uGlint) and so fades out with the dawn/climb;
 *   - density: the gust that drives the wind also drives how many grains are in the air, so the blow visibly
 *     thickens and thins instead of running as a constant stream;
 *   - collision: the volume is the key's own oriented box (exact half extents, a 4 mm skin, the device's full
 *     rotation — lean and spin included), so grains touch the surface before they deviate. A grain whose free
 *     path crosses it keeps its size and brightness; its velocity is
 *     projected onto the face it meets, so it slides across the windward face to the nearest vertical edge,
 *     follows that edge round the side, then eases back onto its free path behind the key, a little slower than
 *     in free flight. Seen on many grains, that flow traces the key's silhouette. Nothing accumulates.
 * Time, fade and the box pose are uniforms written from useFrame.
 */
import { useEffect } from 'react'
import * as THREE from 'three'
import type { SceneColors } from './tokens'

const COUNT = 5400
/** Cloud volume around the standing device (world units). */
const SPAN_X = 26
const SPAN_Z = 12
const HEIGHT = 2.4
/** Centred on the planted key (x -0.6, z 2.2) so the dense depth band actually meets it. */
const CENTER = new THREE.Vector3(-0.6, 0, 2.2)
/** Share of grains seeded on the device's depth band, so enough of them meet the key. */
const NEAR_BAND_SHARE = 0.6
const NEAR_BAND_Z = 0.4

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const VERT = /* glsl */ `
  attribute vec4 aSeed; // phase, speed factor, size, undulation factor
  attribute float aMica; // 0 for ordinary quartz, 1 for the rare flake that catches the sun
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWind;
  uniform float uSpanX;
  uniform vec3 uBoxCenter;
  uniform vec3 uBoxHalf;
  uniform mat3 uBoxRotInv; // world → box frame: the device's full orientation (lean and spin included)
  uniform float uBoxActive;
  uniform vec3 uSunDir;
  uniform float uGlint;
  /* The key refusing to come out: x is seconds since the shake, y its strength. The sand answers at the foot. */
  uniform vec2 uKick;
  varying float vFade;
  varying float vSpark;
  varying float vMica;

  void main() {
    float t = uTime;
    // Soft gusts: the whole cloud speeds up and slows down together, each grain slightly out of phase.
    float gust = 0.55 + 0.45 * (0.5 + 0.5 * sin(t * 0.32 + aSeed.x * 1.7)) * (0.6 + 0.4 * sin(t * 0.11 + 2.0));
    // Density follows the same gusts: each grain has its own threshold, so the blow thickens and thins.
    float front = 0.5 + 0.5 * sin(t * 0.23 + position.x * 0.12 + 1.3);
    float density = smoothstep(aSeed.y * 0.85, aSeed.y * 0.85 + 0.25, 0.35 + 0.75 * front * gust);
    float x = position.x + t * uWind * (0.6 + 0.8 * aSeed.y) * gust;
    x = mod(x + uSpanX * 0.5, uSpanX) - uSpanX * 0.5;
    float y = position.y + 0.14 * aSeed.w * sin(t * 1.1 + aSeed.x * 6.2832) + 0.05 * sin(t * 2.3 + aSeed.x * 3.0);
    float z = position.z + 0.10 * sin(t * 0.7 + aSeed.x * 4.1);
    vec3 p = vec3(x, y, z);

    // Collision with the key, in the box's frame (yawed around Y). The velocity is projected onto the face met:
    // across the windward face to the nearest vertical edge, then along the side edge, then back onto the free path.
    vec3 q = uBoxRotInv * (p - uBoxCenter);
    float r = 0.004;                // grain radius: the skin is 4 mm, so contact reads on the surface itself
    vec3 h = uBoxHalf + vec3(r);
    float slow = 0.35;              // extra path spent at the surface: the contact slows the grain down a little
    float tail = 0.5;               // blend-back distance behind the box
    float contact = 0.0;
    if (uBoxActive > 0.5 && abs(q.y) < h.y && abs(q.z) < h.z && q.x > -h.x && q.x < h.x + slow + tail) {
      float side = q.z >= 0.0 ? 1.0 : -1.0;
      float span = 2.0 * h.x + slow;
      float f = clamp((q.x + h.x) / span, 0.0, 1.0);
      float toEdge = smoothstep(0.0, 0.5, f);      // first half: slide across the windward face to the edge
      float alongSide = smoothstep(0.5, 1.0, f);   // second half: follow the side edge, front to back
      float back = clamp((q.x - (h.x + slow)) / tail, 0.0, 1.0);
      vec3 qc = vec3(mix(-h.x, h.x, alongSide), q.y + 0.06 * f, side * mix(abs(q.z), h.z, toEdge));
      q = mix(qc, q, back * back);                 // behind the key: ease back onto the free path
      contact = 1.0 - back;
      p = uBoxCenter + q * uBoxRotInv;             // box → world (uBoxRotInv is orthonormal: transpose = inverse)
    }

    /*
     * The sand answers the shake. Only grains near the buried foot, only for the length of the shake, and the
     * push is outward and up: what a driven post throws off when it is worked loose, not a wind gust. Grains
     * further out than the falloff never move, so the puff stays at the base rather than rippling the dune.
     */
    if (uKick.y > 0.0 && uKick.x < 0.75) {
      vec2 fromFoot = p.xz - uBoxCenter.xz;
      float dFoot = length(fromFoot);
      float near = 1.0 - smoothstep(0.06, 0.5, dFoot);
      float env = exp(-uKick.x * 4.2) * near * uKick.y;
      vec2 away = fromFoot / max(dFoot, 1e-4);
      p.xz += away * env * 0.07 * (0.5 + 0.5 * aSeed.y);
      p.y += env * 0.11 * (0.35 + 0.65 * aSeed.z);
    }

    // Glint: a stable pseudo-random facet per grain, drifting slowly, flashing when it aligns with the half vector
    // between the horizon light and the camera (Blinn lobe, exponent 64). Grains seen against the light flash more
    // (forward scattering). Free flight only: never tied to a contact, never a size change.
    float a1 = aSeed.x * 6.2832 + t * (0.15 + 0.25 * aSeed.w);
    float a2 = aSeed.y * 3.1416 + t * 0.09 * aSeed.z;
    vec3 facet = vec3(cos(a1) * sin(a2), cos(a2), sin(a1) * sin(a2));
    vec3 toCam = normalize(cameraPosition - p);
    vec3 hv = normalize(uSunDir + toCam);
    float forward = 0.25 + 0.75 * smoothstep(0.1, 0.9, dot(-toCam, uSunDir));
    /*
     * Ordinary grains scatter a little; a few per hundred are flakes lying flat enough to act as a mirror, and
     * those are what actually flash in a sunbeam. The flake keeps the same facet model, just a far tighter lobe
     * and a far brighter return, so the flash is short and sharp instead of a general shimmer.
     */
    float lobe = pow(max(dot(facet, hv), 0.0), mix(64.0, 150.0, aMica));
    float sp = lobe * forward * uGlint * (1.0 - contact) * mix(1.0, 9.0, aMica);
    vSpark = sp;
    vMica = aMica;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    // Small grains: distance attenuation, capped so grains near the camera never become blobs.
    // The flash widens the flake very slightly. Not the collision: a grain meeting the key never changes size,
    // that rule stands. This is the bloom of a specular point, which is what a spark actually is.
    gl_PointSize = min(aSeed.z * uPixelRatio * (34.0 / dist), 5.5 * uPixelRatio) * (1.0 + 0.55 * sp * aMica);
    // Fade with distance (haze) and slightly with height (thinner air higher up).
    vFade = (1.0 - smoothstep(4.0, 18.0, dist)) * (1.0 - 0.35 * clamp(p.y / 3.0, 0.0, 1.0)) * density;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSparkColor;
  uniform float uOpacity;
  varying float vFade;
  varying float vSpark;
  varying float vMica;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float disc = smoothstep(1.0, 0.35, d);
    // A flake at the peak of its flash is not a slightly brighter grain: it reads as a point of light, so its
    // alpha is allowed past the cloud's own opacity instead of being scaled by it.
    float a = disc * vFade * (uOpacity + vSpark * mix(0.4, 2.2, vMica));
    if (a < 0.004) discard;
    vec3 col = mix(uColor, uSparkColor, clamp(vSpark * 1.4, 0.0, 1.0));
    gl_FragColor = vec4(col, min(a, 1.0));
  }
`

export function makeSand(colors: SceneColors) {
  const pos = new Float32Array(COUNT * 3)
  const seed = new Float32Array(COUNT * 4)
  const mica = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    const r1 = hash(i, 0.7)
    const r2 = hash(i, 3.3)
    const r3 = hash(i, 9.1)
    const r4 = hash(i, 5.6)
    const nearBand = hash(i, 2.2) < NEAR_BAND_SHARE
    pos[i * 3] = CENTER.x + (r1 - 0.5) * SPAN_X
    pos[i * 3 + 1] = CENTER.y + 0.04 + HEIGHT * Math.pow(r2, 3.0) // dense near the ground
    pos[i * 3 + 2] = CENTER.z + (r3 - 0.5) * (nearBand ? NEAR_BAND_Z * 2 : SPAN_Z) // many on the key's depth band
    seed[i * 4] = r4
    seed[i * 4 + 1] = hash(i, 1.9)
    seed[i * 4 + 2] = 1.1 + 1.6 * hash(i, 7.2) * hash(i, 7.2) // mostly tiny, a few bigger
    seed[i * 4 + 3] = 0.4 + 0.6 * hash(i, 4.4)
    // Roughly one grain in sixteen is a flake. Chosen from the same stable hash, so it never flickers per frame.
    mica[i] = hash(i, 11.3) < 0.06 ? 1 : 0
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geometry.setAttribute('aMica', new THREE.BufferAttribute(mica, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uWind: { value: 0.9 },
      uSpanX: { value: SPAN_X },
      uColor: { value: new THREE.Color().copy(colors.regolithLight).lerp(colors.peach, 0.35) },
      uSparkColor: { value: new THREE.Color().copy(colors.peach).lerp(colors.orange, 0.4) }, // the light's tint, never white
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlint: { value: 0 },
      uOpacity: { value: 0.46 },
      uBoxCenter: { value: new THREE.Vector3() },
      uBoxHalf: { value: new THREE.Vector3() },
      uBoxRotInv: { value: new THREE.Matrix3() },
      uBoxActive: { value: 0 },
      uKick: { value: new THREE.Vector2(99, 0) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })
  return { geometry, material }
}

export function Sand({ sand }: { sand: ReturnType<typeof makeSand> }) {
  const { geometry, material } = sand
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return <points geometry={geometry} material={material} frustumCulled={false} />
}
