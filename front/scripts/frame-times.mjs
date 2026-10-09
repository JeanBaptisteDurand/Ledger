/*
 * Where are the stalls?
 *
 * The complaint is small freezes. This plays the sequence the way a reader does — scroll, wait, scroll — and
 * records every frame interval plus every long task the browser reports, so a stall can be attributed rather
 * than guessed at. Long tasks carry an attribution name, which separates "the browser was busy compiling a
 * shader" from "a chunk was being parsed" from "the frame loop itself is slow".
 *
 * Headless software GL renders far slower than a real GPU, so the ABSOLUTE numbers here are meaningless. What
 * is meaningful is where the outliers sit relative to the run's own median, and what the long-task records say
 * was happening.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const SCROLLS = Number(process.argv[3] ?? 9)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/?dawn=1`, { waitUntil: 'load' })
await page.waitForTimeout(5000)

await page.evaluate(() => {
  const w = window
  w.__ft = { frames: [], tasks: [], marks: [] }
  let last = performance.now()
  const tick = (t) => {
    w.__ft.frames.push({ t: +t.toFixed(1), dt: +(t - last).toFixed(2), p: w.__heroPlayer ? +w.__heroPlayer.p().toFixed(4) : null })
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        w.__ft.tasks.push({
          t: +e.startTime.toFixed(1),
          dur: +e.duration.toFixed(1),
          name: e.name,
          attribution: (e.attribution ?? []).map((a) => a.name + ':' + a.containerType).join(','),
        })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* Safari and some headless builds have no longtask observer; the frame intervals still answer. */
  }
})

// Play it: one scroll to launch, then one per stop, with reading pauses.
for (let i = 0; i < SCROLLS; i++) {
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(1600)
}
await page.waitForTimeout(3000)

const out = await page.evaluate(() => {
  const w = window
  const f = w.__ft.frames.slice(4)
  const dts = f.map((x) => x.dt).sort((a, b) => a - b)
  const med = dts[dts.length >> 1]
  const p95 = dts[Math.floor(dts.length * 0.95)]
  const spikes = f
    .filter((x) => x.dt > med * 3)
    .map((x) => ({ atMs: x.t, dtMs: x.dt, p: x.p }))
  return {
    frames: f.length,
    medianFrameMs: +med.toFixed(2),
    p95FrameMs: +p95.toFixed(2),
    worstFrameMs: +dts[dts.length - 1].toFixed(2),
    spikesOverThreeTimesMedian: spikes.length,
    worstSpikes: spikes.sort((a, b) => b.dtMs - a.dtMs).slice(0, 8),
    longTasks: w.__ft.tasks.sort((a, b) => b.dur - a.dur).slice(0, 8),
  }
})
await browser.close()
console.log(JSON.stringify(out, null, 1))
