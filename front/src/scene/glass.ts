/**
 * Real glass, in the compositing pass.
 *
 * The optical model is RealGlass' (github.com/Explosion-Scratch/realglass, LGPL-2.1): a surface whose normal is
 * the gradient of a rounded-rectangle distance field, flat in the middle and tilting toward the rim; refraction
 * through an index of 1.52 with a thickness that grows toward the rim; a Cauchy dispersion so red, green and
 * blue bend by different amounts; a Blinn-Phong highlight from one light; frosting by sampling a blurred copy of
 * what is behind. RealGlass itself is not used: it photographs the page once with html2canvas, and what is
 * behind these sheets is a WebGL ring that moves every frame. So the model is re-implemented here, where the
 * frame is: the sheets' rectangles are read off the DOM and handed to the quad that already composites the
 * scene, and the glass sees the ring live. The light is the ring's own centre.
 *
 * Nothing in here is a colour literal: the tint and the light are tokens, read once.
 */
import * as THREE from 'three'
import { cssColor } from './tokens'

/** How many sheets the shader takes at once. More than this many are never on screen together. */
export const GLASS_MAX = 8
/**
 * The star field's layer. The frosted copy is rendered with this layer off: a star is a point, and a point
 * downsampled to an eighth and blurred is a grey pavé, not a star. Under the glass, the ring alone.
 */
export const STAR_LAYER = 1

export const GLASS = {
  ior: 1.52, // RealGlass default
  /** Displacement scale, css px, for a unit refraction at full thickness. */
  disp: 30,
  thickness: 1.0,
  /**
   * The dome. The surface is a pillow, not a plate with a bevel: the tilt starts far inside, at this share of
   * the sheet's half size (never under `edgeMin` px), and grows as a power toward the rim, so there is no inner
   * edge and no crease. The author saw the plate: "trop rectangulaire à l'intérieur, avec ses facettes".
   */
  rim: 0.42,
  edgeMin: 70,
  domePower: 1.8,
  /** Corner softness of the field the normal is taken from, css px: rounds away the diagonal creases. */
  soft: 48,
  aberration: 0.5,
  shininess: 90,
  /** A faint, tight highlight in the page's cream, not a colour: the glass is clear, only the blur is opacity. */
  lightStrength: 0.06,
  /** No tint. The author: "la seule chose qui doit produire de l'opacité est le blur". */
  tint: 0,
  /**
   * The frosted copy: quarter resolution, a 5-tap kernel at one texel, run this many times. One wide kernel
   * skipped texels and striped the blur; several narrow ones do not. Four passes: with no tint, the blur is
   * the whole legibility.
   */
  frost: 1.0,
  frostPasses: 6,
  /**
   * Smoked, not tinted: what the glass shows is darkened to half and takes no colour. The blur alone left the
   * ring's glow too close to the text; a tinted smoke and a near-opaque plate were tried beside this and the
   * author kept the deep smoke (2026-09-28).
   */
  absorb: 0.5,
  /** The frosted copy's downsampling. At a quarter the stars blurred into squares; at an eighth they are breath. */
  frostDiv: 8,
  /** Height of the light above the page, css px: the ring is a lamp, not a point on the glass. */
  lightZ: 520,
} as const

export const GLASS_UNIFORMS_GLSL = /* glsl */ `
  uniform vec2 uCss;                       // css size of the canvas
  uniform int uGlassN;
  uniform vec4 uGlassRect[${GLASS_MAX}];   // centre x, centre y (css px, y down), half width, half height
  uniform float uGlassR[${GLASS_MAX}];     // corner radius, css px
  uniform sampler2D tFrost;
  uniform vec3 uGlassTint;
  uniform float uGlassTintA;
  uniform vec3 uGlassLightCol;
  uniform vec2 uGlassLight;                // css px
  uniform float uGlassIOR, uGlassDisp, uGlassThick, uGlassRim, uGlassEdgeMin, uGlassPow, uGlassSoft, uGlassAberr, uGlassShine, uGlassLightK, uGlassLightZ, uGlassAbsorb;

  float sdRR(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  // A polynomial smooth maximum: the field's corners round off over k px, and its gradient never jumps.
  float smax(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }
  float sdSoft(vec2 p, vec2 b, float k) {
    vec2 q = abs(p) - b;
    return smax(q.x, q.y, k);
  }
`

/** Applied after the scene colour is known; overwrites \`col\`/\`a\` inside a sheet. */
export const GLASS_APPLY_GLSL = /* glsl */ `
  {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uCss;
    for (int i = 0; i < ${GLASS_MAX}; i++) {
      if (i >= uGlassN) break;
      vec4 rc = uGlassRect[i];
      float r = uGlassR[i];
      vec2 p = px - rc.xy;
      float d = sdRR(p, rc.zw, r);
      if (d > 0.0) continue;
      /*
       * The dome. The profile is taken from a soft-cornered field, rises as a power from deep inside the
       * sheet and reaches 1 at the rim: a pillow of glass, with no plateau, no inner edge and no facet along
       * the diagonals (the exact field's gradient turns a corner there; the soft one does not).
       */
      float ds = sdSoft(p, rc.zw - uGlassSoft * 0.5, uGlassSoft);
      float w = max(uGlassEdgeMin, uGlassRim * min(rc.z, rc.w));
      float t = pow(smoothstep(-w, 0.0, ds), uGlassPow);
      vec2 g = vec2(sdSoft(p + vec2(1.0, 0.0), rc.zw - uGlassSoft * 0.5, uGlassSoft) - sdSoft(p - vec2(1.0, 0.0), rc.zw - uGlassSoft * 0.5, uGlassSoft),
                    sdSoft(p + vec2(0.0, 1.0), rc.zw - uGlassSoft * 0.5, uGlassSoft) - sdSoft(p - vec2(0.0, 1.0), rc.zw - uGlassSoft * 0.5, uGlassSoft)) * 0.5;
      vec3 n = normalize(vec3(g * t * 0.55, 1.0));
      vec3 view = vec3(0.0, 0.0, 1.0);
      float thick = mix(0.1, 0.7, t) * uGlassThick;
      // Cauchy: n(lambda) = A + B / lambda^2, pinned so that green is uGlassIOR.
      float B = 0.02 * uGlassAberr;
      float A = uGlassIOR - B / (0.55 * 0.55);
      float iR = A + B / (0.65 * 0.65);
      float iB = A + B / (0.45 * 0.45);
      vec2 dR = refract(-view, n, 1.0 / iR).xy * thick * uGlassDisp;
      vec2 dG = refract(-view, n, 1.0 / uGlassIOR).xy * thick * uGlassDisp;
      vec2 dB = refract(-view, n, 1.0 / iB).xy * thick * uGlassDisp;
      // css px displacement → uv (y flips)
      vec2 kUv = vec2(1.0, -1.0) / uCss;
      vec3 gcol = vec3(texture2D(tFrost, clamp(vUv + dR * kUv, 0.0, 1.0)).r,
                       texture2D(tFrost, clamp(vUv + dG * kUv, 0.0, 1.0)).g,
                       texture2D(tFrost, clamp(vUv + dB * kUv, 0.0, 1.0)).b);
      gcol = mix(gcol, uGlassTint, uGlassTintA) * uGlassAbsorb;
      // The ring lights the dome: a faint Blinn-Phong highlight from the ring's centre, in the page's cream.
      vec3 L = normalize(vec3(uGlassLight - px, uGlassLightZ));
      vec3 H = normalize(L + view);
      float spec = pow(max(dot(n, H), 0.0), uGlassShine) * uGlassLightK * t;
      col = gcol + uGlassLightCol * spec;
      a = 1.0;
      break;
    }
  }
`

/** The frosted copy: a separable blur at quarter resolution, two passes. */
const BLUR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uStep; // one texel along the pass direction, scaled by the radius
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tSrc, vUv) * 0.2270;
    c += (texture2D(tSrc, vUv + uStep * 1.3846) + texture2D(tSrc, vUv - uStep * 1.3846)) * 0.3162;
    c += (texture2D(tSrc, vUv + uStep * 3.2308) + texture2D(tSrc, vUv - uStep * 3.2308)) * 0.0703;
    gl_FragColor = c;
  }
`
const BLUR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export type GlassPass = {
  rtSrc: THREE.WebGLRenderTarget
  rtA: THREE.WebGLRenderTarget
  rtB: THREE.WebGLRenderTarget
  material: THREE.ShaderMaterial
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  quad: THREE.Mesh
  setSize: (w: number, h: number) => void
  /** Renders the scene without its stars at low resolution and blurs it into rtB; the caller binds rtB.texture as tFrost. */
  run: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void
  dispose: () => void
}

export function makeGlassPass(): GlassPass {
  const mk = (depth: boolean) => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
  const rtSrc = mk(true)
  const rtA = mk(false)
  const rtB = mk(false)
  const material = new THREE.ShaderMaterial({
    vertexShader: BLUR_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(quad)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let w = 1
  let h = 1
  return {
    rtSrc,
    rtA,
    rtB,
    material,
    scene,
    camera,
    quad,
    setSize: (cw, ch) => {
      w = Math.max(1, Math.floor(cw / GLASS.frostDiv))
      h = Math.max(1, Math.floor(ch / GLASS.frostDiv))
      rtSrc.setSize(w, h)
      rtA.setSize(w, h)
      rtB.setSize(w, h)
    },
    run: (renderer, sceneToFrost, cam) => {
      cam.layers.disable(STAR_LAYER)
      renderer.setRenderTarget(rtSrc)
      renderer.clear()
      renderer.render(sceneToFrost, cam)
      cam.layers.enable(STAR_LAYER)
      const u = material.uniforms
      let from: THREE.Texture = rtSrc.texture
      for (let i = 0; i < GLASS.frostPasses; i++) {
        u.tSrc.value = from
        u.uStep.value.set(GLASS.frost / w, 0)
        renderer.setRenderTarget(rtA)
        renderer.render(scene, camera)
        u.tSrc.value = rtA.texture
        u.uStep.value.set(0, GLASS.frost / h)
        renderer.setRenderTarget(rtB)
        renderer.render(scene, camera)
        from = rtB.texture
      }
      renderer.setRenderTarget(null)
    },
    dispose: () => {
      rtSrc.dispose()
      rtA.dispose()
      rtB.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}

export function makeGlassUniforms(frost: THREE.Texture): Record<string, THREE.IUniform> {
  return {
    uCss: { value: new THREE.Vector2(1, 1) },
    uGlassN: { value: 0 },
    uGlassRect: { value: Array.from({ length: GLASS_MAX }, () => new THREE.Vector4()) },
    uGlassR: { value: new Array(GLASS_MAX).fill(0) },
    tFrost: { value: frost },
    uGlassTint: { value: cssColor('--color-canvas-night') },
    uGlassTintA: { value: GLASS.tint },
    uGlassLightCol: { value: cssColor('--color-text-050') },
    uGlassLight: { value: new THREE.Vector2(0, 0) },
    uGlassIOR: { value: GLASS.ior },
    uGlassDisp: { value: GLASS.disp },
    uGlassThick: { value: GLASS.thickness },
    uGlassRim: { value: GLASS.rim },
    uGlassEdgeMin: { value: GLASS.edgeMin },
    uGlassPow: { value: GLASS.domePower },
    uGlassSoft: { value: GLASS.soft },
    uGlassAberr: { value: GLASS.aberration },
    uGlassShine: { value: GLASS.shininess },
    uGlassLightK: { value: GLASS.lightStrength },
    uGlassLightZ: { value: GLASS.lightZ },
    uGlassAbsorb: { value: GLASS.absorb },
  }
}

/**
 * The sheets, read off the DOM. The list is refreshed now and then (sections mount once; pins move them with
 * transforms, which getBoundingClientRect follows); the rectangles are read every frame the home is showing.
 * Off-screen sheets are skipped, so the shader loops over what is visible and no more.
 */
export class GlassSheets {
  private els: HTMLElement[] = []
  private radii: number[] = []
  private frame = 0
  refresh() {
    this.els = Array.from(document.querySelectorAll<HTMLElement>('.glass'))
    this.radii = this.els.map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0)
  }
  /** Writes the visible sheets into the uniforms; returns how many. */
  write(u: Record<string, THREE.IUniform>, cssW: number, cssH: number): number {
    if (this.frame++ % 90 === 0) this.refresh()
    const rects = u.uGlassRect.value as THREE.Vector4[]
    const radii = u.uGlassR.value as number[]
    let n = 0
    for (let i = 0; i < this.els.length && n < GLASS_MAX; i++) {
      const r = this.els[i].getBoundingClientRect()
      if (r.bottom < 0 || r.top > cssH || r.right < 0 || r.left > cssW || r.width < 2) continue
      rects[n].set(r.left + r.width / 2, r.top + r.height / 2, r.width / 2, r.height / 2)
      radii[n] = this.radii[i]
      n++
    }
    u.uGlassN.value = n
    ;(u.uCss.value as THREE.Vector2).set(cssW, cssH)
    return n
  }
}
