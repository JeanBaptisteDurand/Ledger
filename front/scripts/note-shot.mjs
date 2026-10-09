/*
 * The three descriptions, captured where they actually live: the sequence is parked on each stop, the note is
 * opened through its own control (the pointer door), and the frame is read together with the anchor the scene
 * handed the CSS that frame.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const OUT = process.argv[3] ?? 'design-shots/pass25-notes'
mkdirSync(OUT, { recursive: true })

// The stop positions, read out of the player rather than guessed.
const probeBrowser = await chromium.launch()
const probePage = await probeBrowser.newPage({ viewport: { width: 1440, height: 900 } })
await probePage.goto(`${BASE}/?dawn=1&p=0.2`, { waitUntil: 'load' })
await probePage.waitForTimeout(3000)
const stops = await probePage.evaluate(() => window.__heroPlayer.timing.stops.map((s) => s.at))
await probeBrowser.close()
console.log(JSON.stringify({ stops }))

for (let stop = 0; stop < stops.length; stop++) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`${BASE}/?dawn=1&p=${stops[stop]}`, { waitUntil: 'load' })
  await page.waitForTimeout(6000)
  const armed = await page.evaluate(() => document.getElementById('hero')?.getAttribute('data-note-armed'))
  const btn = page.locator(`.screen-note-layer[data-note-stop="${stop}"] .screen-note__hotspot`)
  if ((await btn.count()) > 0) await btn.first().hover({ force: true }).catch(() => {})
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${OUT}/note-${stop}.png` })
  const probe = await page.evaluate(() => {
    const st = document.getElementById('hero').style
    const keys = ['--n0-x', '--n0-y', '--n1-x', '--n1-y', '--n1-rise', '--n1-run', '--n2-x', '--n2-y', '--n2-run', '--n2-drop']
    const vars = {}
    for (const k of keys) vars[k] = st.getPropertyValue(k)
    return { armed: document.getElementById('hero').getAttribute('data-note-armed'), vars }
  })
  console.log(JSON.stringify({ stop, at: stops[stop], armedBefore: armed, ...probe, errs: errs.slice(0, 3) }))
  await browser.close()
}
