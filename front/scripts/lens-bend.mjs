/*
 * Does the lens actually bend the star field, and by how much at what distance?
 *
 * Method. The star field is PINNED first: it drifts at up to 40 px a second, and two captures a second apart
 * would otherwise read that drift and nothing else. Then the same frame is captured twice, once with the
 * Einstein radius at its real value and once at zero, and every star in the undeflected image is paired with
 * the nearest star in the deflected one. The displacement is reported by distance from the hole, in HORIZON
 * radii, so the profile of the deflection can be read off directly.
 *
 * A NULL RUN comes first: two captures with the lens off both times. Whatever that reports is the
 * instrument's own noise, and the real run is only worth reading against it.
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const MATCH_RADIUS = 45
const BANDS = [1.2, 1.6, 2.2, 3.2, 5.0, 99]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/?dawn=1&p=0.99`, { waitUntil: 'load' })
await page.waitForTimeout(7000)
await page.evaluate(() => {
  window.__stars.uHold.value = window.__stars.uTime.value
})
await page.waitForTimeout(1200)

// The gate on the STAR FIELD, which is where the lens lives now, and not the strength: the hole writes that
// every frame, so setting it here would not stick.
const shot = async (gain) => {
  await page.evaluate((v) => {
    window.__stars.uLensGain.value = v
  }, gain)
  await page.waitForTimeout(1400)
  return page.screenshot()
}

const nullA = await shot(0)
const nullB = await shot(0)
const lensOn = await shot(1.0)
const lensOff = await shot(0)
const lens = await page.evaluate(() => ({
  // in CSS pixels, straight out of the star field's own uniforms
  cx: window.__stars.uLensCentre.value.x,
  cy: window.__stars.uLensCentre.value.y,
  rE: window.__stars.uLensEinstein.value,
  a: window.__stars.uLensAmount.value,
}))
await browser.close()

/** Star blobs in one image, as centroids. Anything over 16 px is type or chrome, not a star. */
const blobs = (png) => {
  const { width: W, height: H, data } = png
  const bright = (x, y) => data[(y * W + x) * 4] > 60
  const seen = new Uint8Array(W * H)
  const out = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!bright(x, y) || seen[y * W + x]) continue
      const st = [[x, y]]
      seen[y * W + x] = 1
      let sx = 0
      let sy = 0
      let n = 0
      while (st.length) {
        const [cx, cy] = st.pop()
        sx += cx
        sy += cy
        n++
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !bright(nx, ny)) continue
          seen[ny * W + nx] = 1
          st.push([nx, ny])
        }
      }
      if (n <= 16) out.push({ x: sx / n, y: sy / n })
    }
  }
  return out
}

const report = (bufA, bufB, label) => {
  const A = PNG.sync.read(bufA)
  const B = PNG.sync.read(bufB)
  const H = A.height
  // The shader's y runs up from the bottom; an image's runs down from the top.
  const cx = lens.cx
  const cy = H - lens.cy
  const rUnit = lens.rE
  const a = blobs(A)
  const rows = []
  for (const s of blobs(B)) {
    let bd = MATCH_RADIUS
    let hit = false
    for (const t of a) {
      const d = Math.hypot(t.x - s.x, t.y - s.y)
      if (d < bd) {
        bd = d
        hit = true
      }
    }
    // A star with no match within MATCH_RADIUS moved further than that; it is counted, not dropped.
    rows.push({ r: Math.hypot(s.x - cx, s.y - cy) / rUnit, shift: hit ? bd : null })
  }
  rows.sort((p, q) => p.r - q.r)
  let i = 0
  const table = []
  for (const hi of BANDS) {
    const take = []
    while (i < rows.length && rows[i].r < hi) take.push(rows[i++].shift)
    if (take.length) {
      const matched = take.filter((v) => v !== null).sort((p, q) => p - q)
      table.push({
        rUpTo: hi,
        stars: take.length,
        movedMoreThanMatchRadius: take.length - matched.length,
        medianShiftPx: matched.length ? +matched[matched.length >> 1].toFixed(2) : null,
      })
    }
  }
  console.log(JSON.stringify({ run: label, matched: rows.length, byRadius: table }))
}

/*
 * ── Verifying the map instead of discovering it ──────────────────────────────
 * Nearest-neighbour matching runs out at this scale: the deflection here is sixty to ninety pixels and the
 * densest star layer sits on a 76 px cell, so a displaced star is often nearer some OTHER star's old place
 * than its own new one. The report above saturates because of that, not because the lens is weak.
 *
 * So this asks the opposite question. For every star in the undeflected image, the lens map says exactly
 * where it must appear: a star truly at radius b is seen at r with b = r - rE²/r, so r = (b + sqrt(b² +
 * 4rE²)) / 2, and its angle is turned back by the twist evaluated at r. The residual is then the distance
 * from that predicted place to the nearest star actually there. Against it, the same residual computed with
 * NO lens is the control: if the lens did nothing, the two would be equal.
 */
const verify = (bufOn, bufOff) => {
  const ON = PNG.sync.read(bufOn)
  const OFF = PNG.sync.read(bufOff)
  const H = ON.height
  const cx = lens.cx
  const cy = H - lens.cy
  /*
   * Two conversions that are easy to get wrong and were, on the first try.
   * The amount multiplies rE SQUARED in the radial term, so the effective Einstein radius there is
   * rE * sqrt(amount); the twist, which uses rE unscaled inside k, multiplies the amount only once.
   * And the shader thinks in a frame whose y runs UP while an image's runs DOWN, so a rotation by +phi
   * there is a rotation by -phi here: the sign of the twist flips on the way into image coordinates.
   */
  const rEradial = lens.rE * Math.sqrt(lens.a)
  const rE = lens.rE
  const TWIST = 1.6 * lens.a
  const seen = blobs(ON)
  const near = (x, y) => {
    let best = 1e9
    for (const t of seen) {
      const d = Math.hypot(t.x - x, t.y - y)
      if (d < best) best = d
    }
    return best
  }
  const sweep = []
  for (const twistScale of [-1, -0.5, 0, 0.5, 1, 1.5]) {
    const rs = []
    for (const s of blobs(OFF)) {
      const dx = s.x - cx
      const dy = s.y - cy
      const b = Math.hypot(dx, dy)
      if (b < rE * 1.2) continue
      const r = (b + Math.sqrt(b * b + 4 * rEradial * rEradial)) / 2
      const k = rE / Math.max(r, rE)
      const phi = TWIST * twistScale * k * k
      const a0 = Math.atan2(dy, dx)
      const px = cx + r * Math.cos(a0 + phi)
      const py = cy + r * Math.sin(a0 + phi)
      if (px < 4 || py < 4 || px > ON.width - 4 || py > H - 4) continue
      rs.push(near(px, py))
    }
    rs.sort((a, c) => a - c)
    sweep.push({ twistScale, median: rs.length ? +rs[rs.length >> 1].toFixed(2) : null, n: rs.length })
  }
  console.log(JSON.stringify({ twistSweep: sweep }))

  const rows = []
  for (const s of blobs(OFF)) {
    const dx = s.x - cx
    const dy = s.y - cy
    const b = Math.hypot(dx, dy)
    if (b < rE * 1.2) continue
    const r = (b + Math.sqrt(b * b + 4 * rEradial * rEradial)) / 2
    const k = rE / Math.max(r, rE)
    const phi = TWIST * k * k
    const a0 = Math.atan2(dy, dx)
    const px = cx + r * Math.cos(a0 + phi)
    const py = cy + r * Math.sin(a0 + phi)
    if (px < 4 || py < 4 || px > ON.width - 4 || py > H - 4) continue
    rows.push({ predicted: near(px, py), ifNoLens: near(s.x, s.y), moved: Math.hypot(px - s.x, py - s.y) })
  }
  const med = (xs) => {
    const v = xs.slice().sort((a, c) => a - c)
    return v.length ? +v[v.length >> 1].toFixed(2) : null
  }
  return {
    stars: rows.length,
    medianPredictedDisplacementPx: med(rows.map((r) => r.moved)),
    medianResidualAtPredictedPlacePx: med(rows.map((r) => r.predicted)),
    medianResidualIfNoLensPx: med(rows.map((r) => r.ifNoLens)),
    withinTwoPxOfPrediction: rows.filter((r) => r.predicted <= 2).length,
  }
}

console.log(JSON.stringify({ lens, einsteinRadiusPx: Math.round(lens.rE), centreOffScreen: lens.cy > 900 || lens.cy < 0 }))
report(nullA, nullB, 'null: lens off both times')
report(lensOn, lensOff, 'lens on vs off (nearest-neighbour, saturates here)')
console.log(JSON.stringify({ run: 'predicted map vs rendered frame', ...verify(lensOn, lensOff) }))
