/*
 * What does the sky APPEAR to do during the last segment?
 *
 * The complaint is that the scene seems to swing to the right when the camera is supposed to be rising. The
 * camera carries no yaw at all, so whatever is read as a turn is something else moving. This measures it: the
 * star field's own drift and the disc's clock are PINNED, the sequence is stepped through the segment, and the
 * star blobs are matched between consecutive frames. The median displacement says which way the sky goes; the
 * median rotation about the hole's centre says whether it turns, and by how much.
 *
 * Everything on screen at that moment is either the device, the ring, or the star field, and only the field
 * covers enough of the frame to read as "the scene". So the field is the whole measurement.
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const STEPS = (process.argv[3] ?? '0.78,0.82,0.86,0.90,0.94,0.97,1.0').split(',').map(Number)
const MATCH = 40

const blobs = (png) => {
  const { width: W, height: H, data } = png
  const bright = (x, y) => Math.min(data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]) > 120
  const seen = new Uint8Array(W * H)
  const out = []
  for (let y = 60; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // the device and the nav carry white pixels of their own; neither is the sky
      if (x > 460 && x < 980 && y < 840) continue
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
          if (nx < 0 || ny < 60 || nx >= W || ny >= H || seen[ny * W + nx] || !bright(nx, ny)) continue
          seen[ny * W + nx] = 1
          st.push([nx, ny])
        }
      }
      if (n <= 16) out.push({ x: sx / n, y: sy / n })
    }
  }
  return out
}

const med = (xs) => {
  if (!xs.length) return null
  const v = xs.slice().sort((a, b) => a - b)
  return +v[v.length >> 1].toFixed(2)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/?dawn=1&p=${STEPS[0]}`, { waitUntil: 'load' })
await page.waitForTimeout(7000)
// Pin both clocks: the field drifts at up to 40 px/s and the disc turns, and neither is what is being asked about.
await page.evaluate(() => {
  window.__stars.uHold.value = window.__stars.uTime.value
  if (window.__hole) window.__hole.uHold.value = window.__hole.uTime.value
})
const H = 900
const W = 1440
const R = (H * H + W * W) / (4 * H)
const cx = W / 2
const cy = H / 2 - R

const frames = []
for (const p of STEPS) {
  await page.evaluate((v) => window.__heroPlayer && window.__heroPlayer.p && null, p)
  await page.goto(`${BASE}/?dawn=1&p=${p}`, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  await page.evaluate(() => {
    window.__stars.uHold.value = 0
    if (window.__hole) window.__hole.uHold.value = 0
  })
  await page.waitForTimeout(1200)
  const lens = await page.evaluate(() => ({
    amount: window.__stars.uLensAmount.value,
    rE: window.__stars.uLensEinstein.value,
  }))
  frames.push({ p, lens, png: PNG.sync.read(await page.screenshot()) })
}
await browser.close()

console.log(JSON.stringify({ holeCentrePx: { x: cx, y: Math.round(cy) }, arcRadiusPx: Math.round(R) }))
for (let i = 1; i < frames.length; i++) {
  const a = blobs(frames[i - 1].png)
  const b = blobs(frames[i].png)
  const dxs = []
  const dys = []
  const rots = []
  for (const s of a) {
    let best = null
    let bd = MATCH
    for (const t of b) {
      const d = Math.hypot(t.x - s.x, t.y - s.y)
      if (d < bd) {
        bd = d
        best = t
      }
    }
    if (!best) continue
    dxs.push(best.x - s.x)
    dys.push(best.y - s.y)
    const a0 = Math.atan2(s.y - cy, s.x - cx)
    const a1 = Math.atan2(best.y - cy, best.x - cx)
    let da = a1 - a0
    if (da > Math.PI) da -= 2 * Math.PI
    if (da < -Math.PI) da += 2 * Math.PI
    rots.push(da)
  }
  console.log(
    JSON.stringify({
      from: frames[i - 1].p,
      to: frames[i].p,
      lensAmount: +frames[i].lens.amount.toFixed(3),
      matched: dxs.length,
      medianDxPx: med(dxs),
      medianDyPx: med(dys),
      medianRotationDeg: rots.length ? +((med(rots) * 180) / Math.PI).toFixed(2) : null,
    }),
  )
}
