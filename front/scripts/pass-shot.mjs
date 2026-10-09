// Capture the hero at a list of sequence positions, plus a few numbers read out of the page.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const OUT = process.argv[3] ?? 'design-shots/pass25'
const POINTS = (process.argv[4] ?? '0.30,0.62,0.86,0.97').split(',').map(Number)

mkdirSync(OUT, { recursive: true })

for (const p of POINTS) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`${BASE}/?dawn=1&p=${p}`, { waitUntil: 'load' })
  // Software GL renders a handful of frames a second; give it real frames, not a wall-clock guess.
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${OUT}/p${String(p).replace('.', '_')}.png` })
  const probe = await page.evaluate(() => {
    const w = window
    const st = w.__stars
    const num = (x) => (typeof x === 'number' ? +x.toFixed(4) : x)
    const lights = []
    w.__hero?.scene?.traverse?.((o) => {
      if (o.isLight) lights.push({ type: o.type, i: +o.intensity.toFixed(3) })
    })
    return {
      // the lens lives in the star field now, in CSS pixels
      lens: st ? { cx: num(st.uLensCentre.value.x), cy: num(st.uLensCentre.value.y), rE: num(st.uLensEinstein.value), a: num(st.uLensAmount.value) } : null,
      lights,
      dataSpace: document.getElementById('hero')?.getAttribute('data-space'),
      noteArmed: document.getElementById('hero')?.getAttribute('data-note-armed'),
      n2: ['--n2-x', '--n2-y', '--n2-end-x', '--n2-end-y', '--n2-run', '--n2-drop', '--n1-x', '--n1-y', '--n1-rise', '--n1-run', '--n0-x', '--n0-y'].reduce((a, k) => {
        a[k] = document.getElementById('hero')?.style.getPropertyValue(k)
        return a
      }, {}),
    }
  })
  console.log(JSON.stringify({ p, errs: errs.slice(0, 4), ...probe }))
  await browser.close()
}
