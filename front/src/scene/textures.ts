/**
 * Procedural textures: no binary assets, colors from tokens (CSS strings passed in).
 * Everything here runs once at mount.
 */
import * as THREE from 'three'

const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
const fade = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq)
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum / norm
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Soft white disc, alpha falls off with `power`. Used by the flare glow and ghosts. */
export function makeRadialTexture(size = 256, alpha = 1, power = 2): THREE.CanvasTexture {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    g.addColorStop(t, `rgba(255,255,255,${(alpha * Math.pow(1 - t, power)).toFixed(4)})`)
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

/** Thin soft ring for lens-flare ghosts. */
export function makeRingTexture(size = 128, alpha = 0.5): THREE.CanvasTexture {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.7, 'rgba(255,255,255,0)')
  g.addColorStop(0.84, `rgba(255,255,255,${alpha})`)
  g.addColorStop(0.92, `rgba(255,255,255,${alpha * 0.4})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

/** Very faint nebulosity: a handful of soft color blobs on a transparent canvas. */
export function makeNebulaTexture(size = 512, colorsCss: string[], seed = 3): THREE.CanvasTexture {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 9; i++) {
    const cx = (0.15 + 0.7 * hash2(i, seed)) * size
    const cy = (0.2 + 0.6 * hash2(i, seed + 1)) * size
    const r = (0.12 + 0.28 * hash2(i, seed + 2)) * size
    const col = new THREE.Color(colorsCss[i % colorsCss.length])
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    const { r: rr, g: gg, b: bb } = col
    g.addColorStop(0, `rgba(${Math.round(rr * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)},0.22)`)
    g.addColorStop(0.5, `rgba(${Math.round(rr * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)},0.07)`)
    g.addColorStop(1, `rgba(${Math.round(rr * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Fine random-grain normal map for sand micro-reflections. Tiled many times over the ground. */
export function makeGrainNormalMap(size = 256, strength = 0.9): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  const n = new THREE.Vector3()
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    n.set((hash2(x, y) - 0.5) * strength, (hash2(x + 91, y + 17) - 0.5) * strength, 1).normalize()
    data[i * 4] = Math.round((n.x * 0.5 + 0.5) * 255)
    data[i * 4 + 1] = Math.round((n.y * 0.5 + 0.5) * 255)
    data[i * 4 + 2] = Math.round((n.z * 0.5 + 0.5) * 255)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/** First quoted family of a CSS font-family list, for document.fonts.load. */
function firstFamily(list: string): string {
  return list.match(/["']([^"']+)["']/)?.[1] ?? list.split(',')[0].trim()
}

/**
 * Nano X OLED: 128×64 monochrome pixels, white on black, no anti-aliasing (thresholded), nearest filtering.
 * The panel is rotated a quarter turn on the key, so "up" on the device is the right end of this canvas:
 * the label sits in the left part, the chevron lives on its own small plane at the right end (see makeChevronTexture).
 */
/**
 * The Nano X OLED: a real 128x64 one-bit display. The word is variable (the narrative is carried by the screen),
 * redrawn on demand, thresholded to pure black and white because an OLED has no grey at this size, and sampled
 * with NearestFilter so the pixels stay pixels however close the camera comes.
 *
 * The longest word of the sequence sets the type size: it is fitted to the panel width rather than clipped, so
 * a long word gets smaller pixels instead of running off the screen.
 */
export type OledScreen = {
  texture: THREE.CanvasTexture
  setWord: (word: string) => void
  dispose: () => void
}

export function makeOledScreen(fontFamilyList: string, initialWord: string): OledScreen {
  const w = 128
  const h = 64
  /** Safe area inside the panel, in texture pixels. */
  const PAD_X = 8
  const c = makeCanvas(w, h)
  // This canvas is read back after drawing (see getImageData below), so it is CPU-backed from the start.
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  let word = initialWord
  const draw = () => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Fit the word to the panel: start at the display size and step down until it clears the safe area.
    let size = 26
    do {
      ctx.font = `700 ${size}px ${fontFamilyList}`
      if (ctx.measureText(word).width <= w - PAD_X * 2) break
      size -= 1
    } while (size > 9)
    ctx.fillText(word, w / 2, h / 2 + 1)
    thresholdToPixels(ctx, w, h)
    tex.needsUpdate = true
  }
  draw()
  document.fonts?.load(`700 22px "${firstFamily(fontFamilyList)}"`).then(draw).catch(() => {})
  return {
    texture: tex,
    setWord: (next) => {
      if (next === word) return
      word = next
      draw()
    },
    dispose: () => tex.dispose(),
  }
}

/** Pure black/white pixels: an OLED has no grey anti-aliasing at this size. */
function thresholdToPixels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] > 140 ? 255 : 0
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/** A 16×16 pixel chevron pointing up, drawn pixel by pixel, for the pulsing scroll hint. */
export function makeChevronTexture(): THREE.CanvasTexture {
  const s = 16
  const c = makeCanvas(s, s)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, s, s)
  ctx.fillStyle = '#fff'
  // 2px-thick chevron: apex at the top centre, 6 rows down each side
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(7 - i, 4 + i, 2, 1)
    ctx.fillRect(7 + i, 4 + i, 2, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Flex E Ink: 480×600 paper-grey panel with fine grain, black ink, optional label framed by four corner
 * brackets like the device's lock screen. Non-emissive: the material lights it like paper.
 */
/**
 * The wordmark on the Flex's screen: ink and corner brackets on a TRANSPARENT canvas.
 *
 * It used to be drawn over a sheet of E Ink paper with its own grain, which is what a Flex shows when it is
 * off and which is what the brief originally asked for. It is gone at the author's request: the mark now sits
 * straight on the device's own black screen, so the only thing this texture carries is the mark.
 *
 * THE BRACKETS ARE FITTED, not placed. Drawn at a fixed type size they ended up sixteen pixels from the
 * canvas edge, which is the very rim of the screen panel on the model, and they were invisible on every
 * capture. The type is now scaled down until the mark plus its brackets plus a margin fit inside a share of
 * the canvas, so the whole lockup is inside the panel whatever the label and whatever the face renders at.
 */
export function makeWordmarkTexture(
  label: string,
  fontFamilyList: string,
  inkCss: string,
  weight = '600',
  tracking = '0.16em',
): THREE.CanvasTexture {
  const w = 480
  const h = 600
  /** The share of the canvas width the whole lockup, brackets included, is allowed to take. */
  const FIT = 0.74
  /** Distance from the end of the mark to the bracket, and the length of a bracket's arms, in canvas px. */
  const PAD = 34
  const ARM = 20
  /** Half the height of the bracket frame. */
  const BH = 58
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = inkCss
    ctx.strokeStyle = inkCss
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    /*
     * Letter-spacing on the context, not in the `font` shorthand, which has no slot for it. Assigning a
     * property the engine does not know is a no-op rather than an error, and measureText accounts for it
     * where it IS known, so the brackets stay on the mark either way.
     */
    ctx.letterSpacing = tracking
    // Fit: step the type down until the mark plus its brackets and their arms clear the margin.
    let size = 64
    let markWidth = 0
    for (; size > 14; size -= 1) {
      ctx.font = `${weight} ${size}px ${fontFamilyList}`
      markWidth = ctx.measureText(label).width
      if (markWidth + 2 * (PAD + ARM) <= w * FIT) break
    }
    ctx.lineWidth = Math.max(2, Math.round(size / 22))
    ctx.fillText(label, w / 2, h / 2)
    // The corner brackets: the Flex lock-screen motif, four right angles around the mark.
    const bw = markWidth / 2 + PAD
    for (const [x, y, sx, sy] of [
      [-bw, -BH, 1, 1],
      [bw, -BH, -1, 1],
      [-bw, BH, 1, -1],
      [bw, BH, -1, -1],
    ] as ReadonlyArray<readonly [number, number, number, number]>) {
      ctx.beginPath()
      ctx.moveTo(w / 2 + x, h / 2 + y + sy * ARM)
      ctx.lineTo(w / 2 + x, h / 2 + y)
      ctx.lineTo(w / 2 + x + sx * ARM, h / 2 + y)
      ctx.stroke()
    }
    tex.needsUpdate = true
  }
  draw()
  document.fonts?.load(`${weight} 64px "${firstFamily(fontFamilyList)}"`).then(draw).catch(() => {})
  return tex
}

/**
 * The hero title, white on transparent, for the ground-anchored billboard. Condensed display face, heavy weight,
 * fitted to the canvas width (so the line length is fixed by the frame) and drawn with a mild vertical stretch so
 * the cap height clears the horizon glow. One line on landscape frames (4096×1024), two on portrait (2048×1024).
 * Returns the texture, its aspect and the baseline position as a fraction of the height from the bottom.
 */
export function makeTitleTexture(
  text: string,
  fontFamilyList: string,
  colorCss: string,
  lines: 1 | 2 = 1,
  weight: string = '800',
  fontStretch: string = '100%',
): { texture: THREE.CanvasTexture; aspect: number; baselineFrac: number; descenderFrac: number } {
  const w = lines === 2 ? 2048 : 4096
  /*
   * On one line the letters' height on screen is fixed by the line's own aspect: the plane can only be as wide as
   * the frame, so a longer string means smaller letters. The canvas is therefore made taller and the glyphs are
   * stretched about their baseline, which buys height without widening the line by a single pixel.
   */
  const h = lines === 2 ? 1024 : 2560
  /*
   * How tall the drawn ink should be, as a share of the canvas WIDTH. It is expressed against the width because
   * that is what fixes the letters' height on screen: the plane can only be as wide as the frame, so its world
   * height per canvas pixel is set by the canvas width alone. Holding this share constant keeps the title the
   * same height in frame whatever face carries it, which is the whole point of the vertical stretch: a wide
   * display face would otherwise shrink the line to fit the frame and sit far below the sky's first band.
   */
  /*
   * How much room to leave under the baseline, in canvas pixels. It is MEASURED, not fixed: a display face can
   * drop its J and Y far below the baseline, and the vertical stretch multiplies that drop. A fixed reserve that
   * suits one face clips the next one's descenders against the bottom edge of the canvas, which then reads as a
   * title cut off at the sand line rather than standing on it.
   */
  let baseline = lines === 2 ? 140 : 250
  /*
   * Vertical stretch of the glyphs about their baseline: it buys cap height without widening the line by a
   * single pixel. The value is not free. Measured on the base scene at 1440x900, with the title standing on
   * the ground, the key fills 685 px of frame height and the sky's orange band 188 px. The composition asks
   * for a title between those two, and clearly under the key rather than level with it. At 3.25 the ink was
   * 393 px tall and its top reached 237, within 5 px of the key's, so it read as tall as the key. 2.65 brought
   * it to 321 px, and 2.40 to the current height, which is where the author settled.
   */
  const stretch = lines === 2 ? 1 : 2.40
  const c = makeCanvas(w, h)
  /*
   * Deliberately NOT `willReadFrequently`, unlike the small OLED canvas above. This one is 4096x2560 and is
   * uploaded to a GPU texture; pinning it CPU-side to satisfy a readback hint would push 42 MB through main
   * memory on every upload. It is read back exactly twice, once per draw, so the hint does not apply: the
   * browser warns on the count, not on the cost, and two reads over the page's life is not a hot path.
   */
  const ctx = c.getContext('2d')!
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const words = text.toUpperCase().split(' ')
  const rows = lines === 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words.join(' ')]
  const spacingEm = 0.0
  /**
   * Canvas 2D rejects a percentage font-stretch inside the `font` shorthand (the whole string is then ignored and
   * the context silently falls back to 10px sans-serif), so the width axis goes through the separate `fontStretch`
   * attribute, as a keyword, and only where the browser supports it.
   */
  type StretchKeyword = CanvasFontStretch
  const STRETCH_KEYWORDS: ReadonlyArray<readonly [number, StretchKeyword]> = [
    [50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'],
    [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded'], [150, 'extra-expanded'], [200, 'ultra-expanded'],
  ]
  const pct = parseFloat(fontStretch) || 100
  const stretchKeyword = STRETCH_KEYWORDS.reduce((best, k) => (Math.abs(k[0] - pct) < Math.abs(best[0] - pct) ? k : best))[1]
  const setFont = (px: number) => {
    ctx.font = `${weight} ${px}px ${fontFamilyList}`
    if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: StretchKeyword }).fontStretch = stretchKeyword
  }
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = colorCss
    ctx.textBaseline = 'alphabetic'
    const target = w * 0.96
    /* The stretched ink may not fill the canvas edge to edge, or it gets clipped instead of standing on it. */
    const room = h * 0.97
    const probe = lines === 2 ? h * 0.36 : h * 0.24
    /*
     * Everything is fitted to the ink the face actually lays down, never to its advance widths. A display face
     * hangs its swashes well outside the advance box: fitting on advances lets the last letter's tail run off
     * the side of the canvas, which on a plane that already spans the frame means a title clipped by the edge
     * of the screen. All four bounding-box figures scale linearly with the font size, so one probe measures
     * the ratios for every size.
     */
    setFont(probe)
    let inkAscent = 0
    let inkDescent = 0
    let widestInk = 0
    for (const row of rows) {
      const m = ctx.measureText(row)
      inkAscent = Math.max(inkAscent, m.actualBoundingBoxAscent)
      inkDescent = Math.max(inkDescent, m.actualBoundingBoxDescent)
      widestInk = Math.max(widestInk, m.actualBoundingBoxLeft + m.actualBoundingBoxRight)
    }
    const byWidth = widestInk > 0 ? probe * (target / widestInk) : probe
    const inkPerPx = (inkAscent + inkDescent) / probe + (rows.length - 1) * 1.02
    // The stretched ink must still fit the canvas, so the size is capped by the vertical room as well.
    const byHeight = inkPerPx > 0 ? room / (stretch * inkPerPx) : byWidth
    const size = Math.min(byWidth, byHeight)
    setFont(size)
    // The reserve under the baseline is the face's own stretched descent, plus a thin margin against rounding.
    baseline = Math.ceil((inkDescent / probe) * size * stretch + h * 0.006)
    const ls = size * spacingEm
    rows.forEach((row, i) => {
      const y = h - baseline - (rows.length - 1 - i) * size * 1.02
      // Centre the INK in the canvas, not the advance box: the pen starts wherever the leftmost stroke requires.
      const m = ctx.measureText(row)
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight + ls * (row.length - 1)
      let x = (w - inkWidth) / 2 + m.actualBoundingBoxLeft
      ctx.textAlign = 'left'
      ctx.save()
      // Vertical stretch about the baseline: taller caps, same line length.
      ctx.translate(0, y)
      ctx.scale(1, stretch)
      /*
       * The stroke is ONE flat colour and carries NO light of its own: no bloom, no halo, no shadow. Both the
       * 2001 cream-to-ochre gradient and the photographic bloom were tried here and both were dropped by the
       * author. What is left is ink on the horizon, which is also what DESIGN.md's "no glow" rule asked for.
       */
      ctx.fillStyle = colorCss
      for (const ch of row) {
        ctx.fillText(ch, x, 0)
        x += ctx.measureText(ch).width + ls
      }
      ctx.restore()
    })
    tex.needsUpdate = true
  }
  draw()
  document.fonts?.load(`${weight} 200px "${firstFamily(fontFamilyList)}"`).then(draw).catch(() => {})
  /*
   * How far the ink actually reaches below the baseline, as a share of the canvas height. The billboard stands
   * on the ground, so a descender that is not accounted for is a descender buried in the sand: with this face
   * and this vertical stretch the J of JOURNEY reached well over a world unit below the baseline. Measured from
   * the drawn pixels rather than from the font's metrics, because the stretch multiplies it.
   */
  const measureDescender = (): number => {
    const baselineRow = h - baseline
    const data = ctx.getImageData(0, baselineRow, w, h - baselineRow).data
    let lowest = 0
    for (let row = 0; row < h - baselineRow; row++) {
      for (let x = 0; x < w; x += 4) {
        if (data[(row * w + x) * 4 + 3] > 24) {
          lowest = row
          break
        }
      }
    }
    return lowest / h
  }
  const made = { texture: tex, aspect: w / h, baselineFrac: baseline / h, descenderFrac: measureDescender() }
  // The first draw may run before the face has arrived; re-measure once it has. Both fractions move together:
  // a different face means a different descent, which means a different baseline AND a different ink depth.
  document.fonts?.ready.then(() => {
    made.baselineFrac = baseline / h
    made.descenderFrac = measureDescender()
  })
  return made
}
