/*
 * How fast does the photon ring actually turn?
 *
 * A per-pixel difference cannot answer this: the disc has turbulence that shimmers where it stands, and an
 * earlier version of it scored high on that test while travelling nowhere. So this measures DISPLACEMENT. A
 * brightness profile is taken around the ring, averaged across its thickness at each angle, its smooth
 * envelope removed, and the two profiles are cross-correlated. The answer is the angle that lines them up.
 *
 * The disc's clock is PINNED and stepped by a chosen amount rather than left to the wall clock. That is what
 * makes the result unambiguous: the finest streak component repeats every 2*pi/13 = 0.483 rad, so a shift
 * beyond half of that cannot be told from the next streak along, and the headless renderer's four to twelve
 * frames a second would put the pattern well past it at this rotation rate.
 *
 * Run twice, at uMotion 0 (which reproduces the shader before the motion was added) and 1 (the product).
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
/** Seconds stepped between the two frames. 0.85 rad/s * 0.2 s = 0.17 rad, inside the unambiguous range. */
const DT = Number(process.argv[3] ?? 0.2)
/** Where the profile is taken, as multiples of the horizon radius. The lensed ring sits at about 1.62. */
const R_LO = 1.0
const R_HI = 1.16
const R_STEPS = 14
const PHI_STEP = 0.004
/*
 * The search range. It used to be half the finest streak spacing (2*pi/13), because the streaks were the only
 * thing in the profile that travelled. Now the Doppler bright side carries the ring too, and it is a ONE-fold
 * pattern of period 2*pi, so a shift is unambiguous up to pi. The old ceiling was clipping the answer: at a
 * step of 0.24 s the reported shift was exactly the ceiling.
 */
const MAX_SHIFT = 0.8
const AMBIGUOUS_ABOVE = Math.PI

const profile = (png, cx, cy, R) => {
  const { width: W, height: H, data } = png
  const out = []
  // Only the angles whose samples can land in frame; for an off-screen centre that is the lower semicircle.
  const PHI_FROM = PARTIAL ? 0.47 : 0
  const PHI_TO = PARTIAL ? Math.PI - 0.47 : Math.PI * 2
  for (let phi = PHI_FROM; phi < PHI_TO; phi += PHI_STEP) {
    let sum = 0
    let n = 0
    for (let k = 0; k < R_STEPS; k++) {
      const r = R * (R_LO + ((R_HI - R_LO) * k) / (R_STEPS - 1))
      const x = Math.round(cx + r * Math.cos(phi))
      const y = Math.round(cy + r * Math.sin(phi))
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const i = (y * W + x) * 4
      // the ring only: warm pixels, so a white star crossing it cannot tug the correlation
      if (!(data[i] > data[i + 1] + 6 && data[i + 1] >= data[i + 2])) continue
      sum += data[i] * 0.6 + data[i + 1] * 0.3 + data[i + 2] * 0.1
      n++
    }
    out.push({ phi, v: n ? sum / n : NaN })
  }
  return out
}

/*
 * The high pass is OFF here, and that is a change from the previous pass. It was needed when the hole was an
 * arc across the top of the frame: the arc's brightness varied strongly along its length, and that envelope,
 * which does not travel, won the correlation. The ring is a full circle at constant radius now, so its
 * envelope is the same at every angle and contributes nothing. What is left in the profile IS the pattern:
 * the Doppler bright side, a clean one-fold marker that travels at exactly the orbit rate.
 */
const highPass = (P, windowRad) => {
  if (windowRad <= 0) return P.map((s) => ({ v: s.v }))
  const half = Math.max(1, Math.round(windowRad / PHI_STEP / 2))
  return P.map((s, i) => {
    let sum = 0
    let n = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= P.length || !Number.isFinite(P[j].v)) continue
      sum += P[j].v
      n++
    }
    return { v: n && Number.isFinite(s.v) ? s.v - sum / n : NaN }
  })
}

const bestShift = (A, B) => {
  const steps = Math.round(MAX_SHIFT / PHI_STEP)
  let best = 0
  let bestScore = -Infinity
  for (let s = -steps; s <= steps; s++) {
    let sa = 0
    let sb = 0
    let saa = 0
    let sbb = 0
    let sab = 0
    let n = 0
    for (let i = 0; i < A.length; i++) {
      /*
       * The profile goes all the way round, so the correlation WRAPS. Truncating it instead — which is what
       * this did while the hole was an arc with two ends — drops a sample for every step of shift, and the
       * shrinking overlap biases the answer toward zero. It read the ring as motionless at every rate.
       */
      // Wrap only when the profile IS a full circle; truncate when it is an arc with two ends.
      const j = PARTIAL ? i + s : (i + s + B.length) % B.length
      if (PARTIAL && (j < 0 || j >= B.length)) continue
      const a = A[i].v
      const b = B[j].v
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      sa += a
      sb += b
      saa += a * a
      sbb += b * b
      sab += a * b
      n++
    }
    // An arc gives far fewer usable samples than a full circle; the floor is set for the thinner case.
    if (n < 150) continue
    const cov = sab / n - (sa / n) * (sb / n)
    const va = saa / n - (sa / n) ** 2
    const vb = sbb / n - (sb / n) ** 2
    const r = cov / Math.sqrt(Math.max(1e-9, va * vb))
    if (r > bestScore) {
      bestScore = r
      best = s
    }
  }
  return { shiftRad: +(best * PHI_STEP).toFixed(4), correlation: +bestScore.toFixed(3) }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/?dawn=1&p=0.99`, { waitUntil: 'load' })
await page.waitForTimeout(7000)
/*
 * The arc's own geometry, not the lens's: the mesh is drawn at the framed radius (h² + w²) / 4h with its
 * centre that far above mid-screen, and the lens no longer moves it (it acts on the star field alone).
 */
const geom = await page.evaluate(() => {
  const w = window.innerWidth
  const h = window.innerHeight
  const R = (h * h + w * w) / (4 * h)
  return { cxPx: w / 2, cyPx: h / 2 - R, R, t0: window.__hole.uTime.value, w, h }
})
/*
 * The centre is off the top of the screen, so only an arc of the ring is in frame. That decides two things:
 * the correlation must NOT wrap (there is no full circle to wrap around), and the high pass must be back on
 * (the visible arc has a strong brightness envelope along its length, and an envelope that does not travel
 * wins a correlation that is allowed to see it).
 */
const PARTIAL = geom.cyPx < 0 || geom.cyPx > geom.h

const at = async (motion, time) => {
  await page.evaluate(
    ([m, t]) => {
      window.__hole.uMotion.value = m
      window.__hole.uHold.value = t
    },
    [motion, time],
  )
  await page.waitForTimeout(1300)
  return PNG.sync.read(await page.screenshot())
}

const measure = async (motion) => {
  const a = await at(motion, geom.t0)
  const b = await at(motion, geom.t0 + DT)
  const H = a.height
  const cx = geom.cxPx
  const cy = geom.cyPx
  const R = geom.R
  /*
   * The high pass is off in BOTH modes now. It was needed while the arc's brightness envelope did not travel;
   * since the Doppler beaming is carried by the ring the envelope travels at exactly the orbit rate, and it is
   * the strongest thing in the profile. Removing it threw away the signal and left three streak components
   * running at three different rates, which is what a differentially rotating disc is and what the
   * correlation cannot resolve.
   */
  const W_RAD = 0
  const { shiftRad, correlation } = bestShift(highPass(profile(a, cx, cy, R), W_RAD), highPass(profile(b, cx, cy, R), W_RAD))
  return {
    uMotion: motion,
    stepSeconds: DT,
    horizonRadiusPx: Math.round(R),
    ringRadiusPx: Math.round(R),
    shiftRad,
    radPerSecond: +(shiftRad / DT).toFixed(4),
    pxAlongRingPerSecond: Math.round((Math.abs(shiftRad) / DT) * R),
    correlation,
    mode: PARTIAL ? 'arc: truncated correlation, envelope removed' : 'circle: wrapped correlation',
    unambiguous: Math.abs(shiftRad) < Math.min(MAX_SHIFT, AMBIGUOUS_ABOVE) - PHI_STEP,
  }
}

/*
 * The fallback, for the arc. The correlation above recovers a rate when the whole ring is in frame; on an arc
 * that is a third of the circle it does not, and the reason is in the disc's own design: it rotates
 * DIFFERENTIALLY, so its three angular components travel at three different rates, and spreading the in-fall
 * term over a radius six times larger separates them further. What can still be measured, and is worth
 * measuring because "it looks static" was the complaint that started this, is decorrelation: how far the arc's
 * pixels have moved apart after a chosen step. A still image reads zero at every step; a travelling pattern
 * rises and then saturates as it loses all memory of where it was.
 */
const decorrelate = async (steps) => {
  const out = []
  for (const dt of steps) {
    const a = await at(1, geom.t0)
    const b = await at(1, geom.t0 + dt)
    let sum = 0
    let n = 0
    const W = a.width
    for (let y = 0; y < Math.round(geom.h * 0.58); y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (a.data[i] < 40 && b.data[i] < 40) continue
        n++
        sum += Math.abs(a.data[i] - b.data[i])
      }
    }
    out.push({ stepSeconds: dt, arcPixels: n, meanRedDelta: +(sum / Math.max(1, n)).toFixed(2) })
  }
  return out
}

console.log(JSON.stringify(await measure(0)))
console.log(JSON.stringify(await measure(1)))
console.log(JSON.stringify({ run: 'decorrelation of the arc', orbitRateInShader: 0.175, pxAlongArcPerSecond: Math.round(0.175 * geom.R), steps: await decorrelate([0, 0.35, 1.0, 3.0]) }))
await browser.close()
