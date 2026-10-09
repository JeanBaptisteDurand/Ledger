/*
 * Same measurements and same budget rules as design-generator/scripts/shots-motion.mjs, with one difference:
 * a FRESH browser per profile. The shared-browser version crashes its GPU process after the desktop WebGL page
 * closes, and every later screenshot then fails with "Unable to capture screenshot". Verified: the mobile
 * capture succeeds on its own against this same server, and against the untouched main checkout too, so the
 * crash belongs to the shared browser, not to the page.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const [url, out, route = '/'] = process.argv.slice(2)
const target = url.replace(/\/$/, '') + route
mkdirSync(out, { recursive: true })

const errors = []
let jsBytes = 0

const wire = (page) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', async (r) => {
    try {
      if (r.request().resourceType() === 'script') jsBytes += Number(r.headers()['content-length'] || (await r.body()).length)
    } catch {}
  })
}

const clsInit = () => {
  window.__cls = 0
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
  }).observe({ type: 'layout-shift', buffered: true })
}

// ── desktop ──────────────────────────────────────────────────────────────────
let b = await chromium.launch()
let page = await b.newPage({ viewport: { width: 1440, height: 900 } })
wire(page)
await page.addInitScript(clsInit)
await page.goto(target, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/desktop-top.png` })
await page.mouse.wheel(0, 1350)
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/desktop-mid.png` })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/desktop-end.png` })
const metrics = await page.evaluate(() => ({
  continuousAnimations: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length,
  webglCanvases: [...document.querySelectorAll('canvas')].filter((c) => c.getContext('webgl2') || c.getContext('webgl')).length,
  cls: window.__cls,
}))
await b.close()

// ── mobile ───────────────────────────────────────────────────────────────────
b = await chromium.launch()
page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
wire(page)
await page.goto(target, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/mobile-top.png` })
const mobileWebgl = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.getContext('webgl2') || c.getContext('webgl')).length)
await b.close()

// ── reduced motion ───────────────────────────────────────────────────────────
b = await chromium.launch()
page = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
wire(page)
await page.goto(target, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/reduced-motion.png` })
const rmAnims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length)
await b.close()

const result = { url: target, ...metrics, consoleErrors: errors, jsBytes, mobileWebglCanvases: mobileWebgl, reducedMotionContinuousAnimations: rmAnims }
const breaches = []
if (result.cls >= 0.1) breaches.push(`CLS ${result.cls.toFixed(3)} >= 0.1`)
if (errors.length) breaches.push(`${errors.length} console error(s)`)
if (result.continuousAnimations > 2) breaches.push(`${result.continuousAnimations} continuous animations (> 2 per viewport)`)
if (result.webglCanvases > 1) breaches.push(`${result.webglCanvases} WebGL canvases (> 1)`)
if (mobileWebgl > 0) breaches.push('WebGL canvas present on mobile (poster expected)')
if (rmAnims > 0) breaches.push(`${rmAnims} continuous animation(s) under prefers-reduced-motion`)
result.budgetBreaches = breaches
writeFileSync(`${out}/metrics.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
console.log(breaches.length ? `BUDGET BREACHED: ${breaches.join('; ')}` : 'budget OK')
