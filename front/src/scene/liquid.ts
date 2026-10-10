/**
 * The liquid figure: a glass of lava, in the compositing pass.
 *
 * A rolling number (9 990 bps, the 124 s clock) is a glass the shape of its own glyphs, and the count is the
 * liquid that fills it. What is drawn here, inside the glyphs and nowhere else:
 *   - the level, which is the value — never an animation running beside the count. It reaches its mark
 *     through a damped spring, so it lags, overshoots and settles the way a liquid does;
 *   - the surface: two slow sines, plus a one-dimensional damped wave equation that the pouring excites, so
 *     a fast scroll raises ripples that travel along the surface and die down when the count stops;
 *   - the body: the lava technique of three.js' webgl_shader_lava (MIT) done procedurally — a noise field
 *     warped by a second noise and by time, and colour channels that overflow 1.0 bleeding into the others,
 *     which is what makes the glow read as heat rather than as a bright colour. The palette is the titles'
 *     ignition and nothing darker: sky-orange, with veins of accent-incandescent running through it, brighter
 *     toward the surface; a thin cream meniscus. Nothing is drawn outside the ink: only the number fills.
 * Above the surface, the glyph is the page's cream, as it is in the DOM.
 *
 * The glyph mask is the DOM text drawn into a canvas with the DOM's own font, at the DOM's own size, uploaded
 * as a texture when the text changes. The DOM number stays where it is for layout and for assistive tech; in
 * WebGL mode it is transparent and this pass is what is seen (tokens.css, html[data-glass='webgl'] .liquid).
 * Without a canvas, the CSS version of the same figure is the fallback.
 */
import * as THREE from 'three'
import { cssColor } from './tokens'

/** How many figures the shader draws at once; the page never has more than two in view. */
export const FIG_MAX = 2
/** Samples along the surface for the ripple equation. */
export const WAVE_N = 48

export const LIQUID = {
  spring: { k: 42, c: 7.5 },
  /** Ripples: wave speed, damping, how hard the pouring hits the surface. */
  wave: { c: 90, damping: 2.2, pour: 1.6 },
  /** Base swell of the surface, as a share of the ink height, at rest and at full pour. */
  swell: { rest: 0.006, pour: 0.03 },
  /** Margin the glyph box is grown by, css px, so the mask never clips an overhanging glyph. */
  pad: 6,
} as const

export const LIQUID_UNIFORMS_GLSL = /* glsl */ `
  uniform int uFigN;
  uniform vec4 uFigRect[${FIG_MAX}];     // left, top (css px), width, height of the glyph box
  uniform vec2 uFigInk[${FIG_MAX}];      // ink bottom, ink top, as v (0 at the box bottom, 1 at its top)
  uniform float uFigLevel[${FIG_MAX}];   // sprung level, 0..1 of the ink height
  uniform float uFigPour[${FIG_MAX}];    // |velocity| of the level, 0..1
  uniform float uWave0[${WAVE_N}];
  uniform float uWave1[${WAVE_N}];
  uniform sampler2D tFig0;
  uniform sampler2D tFig1;
  uniform vec3 uLiqOrange, uLiqHot, uLiqCream;
  uniform float uLiqTime, uLiqSwellRest, uLiqSwellPour;

  float figMask(int i, vec2 uv) {
    if (i == 0) return texture2D(tFig0, uv).a;
    return texture2D(tFig1, uv).a;
  }
  float waveAt(int i, float x) {
    float fx = clamp(x, 0.0, 0.9999) * float(${WAVE_N} - 1);
    int a = int(floor(fx));
    float f = fx - float(a);
    float ha = 0.0; float hb = 0.0;
    for (int k = 0; k < ${WAVE_N}; k++) {
      if (k == a) { ha = (i == 0) ? uWave0[k] : uWave1[k]; }
      if (k == a + 1) { hb = (i == 0) ? uWave0[k] : uWave1[k]; }
    }
    return mix(ha, hb, f);
  }
  float lhash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 39482.7); }
  float lnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lhash(i), lhash(i + vec2(1.0, 0.0)), u.x), mix(lhash(i + vec2(0.0, 1.0)), lhash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`

/** Applied after the glass; overwrites \`col\`/\`a\` inside a figure's glyphs. */
export const LIQUID_APPLY_GLSL = /* glsl */ `
  {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uCss;
    for (int i = 0; i < ${FIG_MAX}; i++) {
      if (i >= uFigN) break;
      vec4 rc = uFigRect[i];
      vec2 q = (px - rc.xy) / rc.zw;           // 0..1, y down, inside the glyph box
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
      vec2 muv = vec2(q.x, 1.0 - q.y);         // the mask texture is uploaded with its top at v = 1
      float m = figMask(i, muv);
      if (m < 0.004) continue;
      // The surface, in v: the sprung level over the ink, plus the swell and the ripples.
      vec2 ink = uFigInk[i];
      float inkH = max(ink.y - ink.x, 1e-3);
      float pour = uFigPour[i];
      float swell = mix(uLiqSwellRest, uLiqSwellPour, pour);
      float s = ink.x + uFigLevel[i] * inkH
              + inkH * (swell * (0.6 * sin(q.x * 9.4 + uLiqTime * 1.9) + 0.4 * sin(q.x * 17.0 - uLiqTime * 2.7)))
              + inkH * waveAt(i, q.x);
      float v = 1.0 - q.y;
      float under = s - v;                     // > 0 below the surface, in v
      float underPx = under * rc.w;
      // The lava body: a warped noise field, moving. Orange, with veins of incandescent — the titles' palette.
      vec2 lp = vec2(px.x, px.y) * 0.014;
      vec2 warp = vec2(lnoise(lp * 1.7 + vec2(uLiqTime * 0.11, 0.0)), lnoise(lp * 1.7 + vec2(0.0, uLiqTime * 0.09))) - 0.5;
      float n = lnoise(lp + warp * 0.9 + vec2(0.0, -uLiqTime * 0.16));
      n = 0.6 * n + 0.4 * lnoise(lp * 2.3 - warp * 0.6 + vec2(uLiqTime * 0.07, -uLiqTime * 0.21));
      float depth = clamp(under / inkH, 0.0, 1.0);
      float vein = smoothstep(0.34, 0.72, n);
      // Deep, the orange with fewer veins; near the surface, the incandescent takes over.
      float toward = clamp(vein * (1.0 - 0.45 * depth) + smoothstep(0.55, 0.0, depth) * 0.45, 0.0, 1.0);
      vec3 body = mix(uLiqOrange, uLiqHot, toward);
      // The veins are hotter than white: the overflow bleeds into the other channels (the lava shader's trick).
      body *= 1.0 + 0.35 * vein;
      vec3 over = max(body - 1.0, 0.0);
      body += over.gbr * 0.6 + over.brg * 0.3;
      // The meniscus: a thin cream line right under the surface, and a faint heat just above it.
      float men = smoothstep(3.0, 1.5, underPx) * smoothstep(-0.5, 0.6, underPx);
      vec3 liquid = mix(body, uLiqCream, men);
      float aboveGlow = smoothstep(10.0, 0.0, -underPx) * step(underPx, 0.0) * 0.5;
      float inside = step(0.0, underPx);
      vec3 glyph = mix(mix(uLiqCream, uLiqHot, aboveGlow), liquid, inside);
      // Only the ink: nothing is drawn outside the number.
      col = mix(col, glyph, m);
      a = max(a, m);
    }
  }
`

type Slot = {
  el: HTMLElement | null
  text: string
  font: string
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  inkBottom: number
  inkTop: number
  level: number
  vel: number
  h: Float32Array
  hv: Float32Array
  wave: number[]
}

function makeCanvasTexture(): [HTMLCanvasElement, THREE.CanvasTexture] {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return [canvas, texture]
}

function makeSlot(): Slot {
  const [canvas, texture] = makeCanvasTexture()
  return { el: null, text: '', font: '', canvas, texture, inkBottom: 0, inkTop: 1, level: 0, vel: 0, h: new Float32Array(WAVE_N), hv: new Float32Array(WAVE_N), wave: new Array(WAVE_N).fill(0) }
}

export function makeLiquidUniforms(slots: Slot[]): Record<string, THREE.IUniform> {
  return {
    uFigN: { value: 0 },
    uFigRect: { value: Array.from({ length: FIG_MAX }, () => new THREE.Vector4()) },
    uFigInk: { value: Array.from({ length: FIG_MAX }, () => new THREE.Vector2(0, 1)) },
    uFigLevel: { value: new Array(FIG_MAX).fill(0) },
    uFigPour: { value: new Array(FIG_MAX).fill(0) },
    uWave0: { value: slots[0].wave },
    uWave1: { value: slots[1].wave },
    tFig0: { value: slots[0].texture },
    tFig1: { value: slots[1].texture },
    uLiqOrange: { value: cssColor('--color-sky-orange') },
    uLiqHot: { value: cssColor('--color-accent-incandescent') },
    uLiqCream: { value: cssColor('--color-text-050') },
    uLiqTime: { value: 0 },
    uLiqSwellRest: { value: LIQUID.swell.rest },
    uLiqSwellPour: { value: LIQUID.swell.pour },
  }
}

export class LiquidFigures {
  readonly slots: Slot[] = [makeSlot(), makeSlot()]
  private els: HTMLElement[] = []
  private frame = 0

  refresh() {
    this.els = Array.from(document.querySelectorAll<HTMLElement>('.liquid'))
  }

  /**
   * Draws the DOM text into the slot's canvas with the DOM's font: the mask. The box is the DOM's inline box
   * grown by `pad` on every side, so an overhanging glyph is never clipped; the ink bounds are recorded in v
   * (bottom-origin) for the level.
   */
  private draw(slot: Slot, base: HTMLElement, text: string, dpr: number) {
    const cs = getComputedStyle(base)
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const key = `${font}|${cs.letterSpacing}|${text}|${dpr}`
    if (slot.font === key) return
    slot.font = key
    const r = base.getBoundingClientRect()
    const pad = LIQUID.pad
    const w = Math.max(2, Math.ceil((r.width + pad * 2) * dpr))
    const h = Math.max(2, Math.ceil((r.height + pad * 2) * dpr))
    const c = slot.canvas
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
      /*
       * On WebGL2 three.js allocates a texture's storage once, immutably, at the size of its first upload; a
       * canvas that grows after that can never be written into it. Disposing frees the storage, and the next
       * upload allocates it at the new size.
       */
      slot.texture.dispose()
    }
    const probe = slot.canvas.getContext('2d')!
    probe.font = font
    const mt = probe.measureText(text)
    // The DOM's inline box is the font's ascent + descent; the baseline sits ascent down from its top.
    const asc = mt.fontBoundingBoxAscent
    const desc = mt.fontBoundingBoxDescent
    const scale = r.height / Math.max(1, asc + desc)
    const ls = parseFloat(cs.letterSpacing)
    const paint = (c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.scale(dpr, dpr)
      ctx.font = font
      if (Number.isFinite(ls) && 'letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls}px`
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'alphabetic'
      ctx.save()
      ctx.translate(pad, pad)
      ctx.scale(scale, scale)
      ctx.fillText(text, 0, asc)
      ctx.restore()
    }
    paint(slot.canvas)
    const boxH = r.height + pad * 2
    const baselineV = 1 - (pad + asc * scale) / boxH
    slot.inkBottom = baselineV - (mt.actualBoundingBoxDescent * scale) / boxH
    slot.inkTop = baselineV + (mt.actualBoundingBoxAscent * scale) / boxH
    slot.texture.needsUpdate = true
  }

  /** Steps the physics and writes the visible figures into the uniforms; returns how many. */
  write(u: Record<string, THREE.IUniform>, cssW: number, cssH: number, dpr: number, dt: number, time: number): number {
    if (this.frame++ % 90 === 0) this.refresh()
    const rects = u.uFigRect.value as THREE.Vector4[]
    const inks = u.uFigInk.value as THREE.Vector2[]
    const levels = u.uFigLevel.value as number[]
    const pours = u.uFigPour.value as number[]
    u.uLiqTime.value = time
    let n = 0
    for (let i = 0; i < this.els.length && n < FIG_MAX; i++) {
      const el = this.els[i]
      const base = el.querySelector<HTMLElement>('[data-text]')
      if (!base) continue
      const r = base.getBoundingClientRect()
      if (r.bottom < -40 || r.top > cssH + 40 || r.right < 0 || r.left > cssW || r.width < 2) continue
      const slot = this.slots[n]
      if (slot.el !== el) {
        slot.el = el
        slot.font = ''
        slot.level = Number(el.dataset.fill ?? 0)
        slot.vel = 0
        slot.h.fill(0)
        slot.hv.fill(0)
      }
      this.draw(slot, base, base.textContent ?? '', dpr)
      // The level: a damped spring toward the count's share.
      const target = Number(el.dataset.fill ?? 0)
      const step = Math.min(dt, 0.05)
      slot.vel += ((target - slot.level) * LIQUID.spring.k - slot.vel * LIQUID.spring.c) * step
      slot.level += slot.vel * step
      const pour = Math.min(1, Math.abs(slot.vel) * 2.2)
      // The ripples: a 1-D damped wave equation, excited where the pouring lands.
      const { c, damping, pour: pourK } = LIQUID.wave
      const h = slot.h
      const hv = slot.hv
      if (pour > 0.02) {
        const at = Math.floor(Math.random() * WAVE_N)
        hv[at] += (Math.random() - 0.5) * pour * pourK
      }
      const cc = c * c * step
      for (let k = 0; k < WAVE_N; k++) {
        const l = h[k > 0 ? k - 1 : k]
        const rr = h[k < WAVE_N - 1 ? k + 1 : k]
        hv[k] += ((l + rr - 2 * h[k]) * cc - hv[k] * damping * step) / WAVE_N
      }
      for (let k = 0; k < WAVE_N; k++) {
        h[k] += hv[k] * step
        slot.wave[k] = Math.max(-0.08, Math.min(0.08, h[k]))
      }
      rects[n].set(r.left - LIQUID.pad, r.top - LIQUID.pad, r.width + LIQUID.pad * 2, r.height + LIQUID.pad * 2)
      inks[n].set(slot.inkBottom, slot.inkTop)
      levels[n] = slot.level
      pours[n] = pour
      n++
    }
    u.uFigN.value = n
    return n
  }

  dispose() {
    for (const s of this.slots) s.texture.dispose()
  }
}
