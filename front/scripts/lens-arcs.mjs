/*
 * Are the stars near the ring actually drawn out into arcs, and where does it start?
 *
 * A gravitational lens does not simply move a star, it STRETCHES it: a small patch of sky at radius b is seen
 * at radius r, compressed radially by dr/db and spread tangentially by r/b. The signature is therefore a blob
 * elongated ALONG the ring, more so the closer it is to it. This measures exactly that: every star blob is
 * found, its principal axes are taken from its second moments, and the elongation is reported with the angle
 * between the long axis and the tangent to the circle.
 *
 * A blob that is round reads 1.0. A blob stretched along the tangent reads high with an angle near zero.
 */
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const png = PNG.sync.read(readFileSync(file))
const { width: W, height: H, data } = png
const R = (H * H + W * W) / (4 * H)
const cx = W / 2
const cy = H / 2 - R

const bright = (x, y) => Math.min(data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]) > 110
const seen = new Uint8Array(W * H)
const rows = []
for (let y = 60; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // neither the device nor the nav is sky
    if (x > 460 && x < 980 && y < 840) continue
    if (!bright(x, y) || seen[y * W + x]) continue
    const st = [[x, y]]
    seen[y * W + x] = 1
    const px = []
    while (st.length) {
      const [ax, ay] = st.pop()
      px.push([ax, ay])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = ax + dx
        const ny = ay + dy
        if (nx < 0 || ny < 60 || nx >= W || ny >= H || seen[ny * W + nx] || !bright(nx, ny)) continue
        seen[ny * W + nx] = 1
        st.push([nx, ny])
      }
    }
    if (px.length < 3 || px.length > 400) continue
    const n = px.length
    const mx = px.reduce((a, q) => a + q[0], 0) / n
    const my = px.reduce((a, q) => a + q[1], 0) / n
    let sxx = 0
    let syy = 0
    let sxy = 0
    for (const [qx, qy] of px) {
      sxx += (qx - mx) ** 2
      syy += (qy - my) ** 2
      sxy += (qx - mx) * (qy - my)
    }
    sxx /= n
    syy /= n
    sxy /= n
    const tr = sxx + syy
    const det = sxx * syy - sxy * sxy
    const disc = Math.sqrt(Math.max(0, (tr / 2) ** 2 - det))
    const l1 = tr / 2 + disc
    /*
     * The floor on the minor axis is half a pixel, not an epsilon. A blob one pixel tall has a second moment
     * of zero across its short axis, and dividing by that reports an elongation in the thousands, which is a
     * property of the arithmetic and not of the image. Half a pixel is the smallest width an image can
     * actually hold, so it is the smallest honest denominator.
     */
    const l2 = Math.max(tr / 2 - disc, 0.25)
    const elong = Math.sqrt(l1 / l2)
    // the long axis, and the tangent to the circle at this blob
    const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    const tangent = Math.atan2(mx - cx, -(my - cy))
    let off = Math.abs(((axis - tangent + Math.PI / 2) % Math.PI) - Math.PI / 2) * (180 / Math.PI)
    if (off > 90) off = 180 - off
    rows.push({ r: Math.hypot(mx - cx, my - cy) / R, elong, off, n })
  }
}

const med = (xs) => {
  if (!xs.length) return null
  const v = xs.slice().sort((a, b) => a - b)
  return +v[v.length >> 1].toFixed(2)
}
rows.sort((a, b) => a.r - b.r)
/*
 * Bands on both sides of the ring. Inside it the sky is the SECOND image of the same lens, so the same
 * measurement applies: if the distortion is carried through, the blobs in there are elongated and tangential
 * too, and if it is not they are round or absent.
 */
const BANDS = [0.8, 0.94, 1.06, 1.25, 1.45, 9]
let i = 0
const table = []
for (const hi of BANDS) {
  const take = []
  while (i < rows.length && rows[i].r < hi) take.push(rows[i++])
  if (take.length)
    table.push({
      rUpTo: hi,
      blobs: take.length,
      medianElongation: med(take.map((t) => t.elong)),
      medianDegreesOffTangent: med(take.map((t) => t.off)),
      medianAreaPx: med(take.map((t) => t.n)),
    })
}
console.log(JSON.stringify({ file, arcRadiusPx: Math.round(R), byRadius: table }, null, 1))
