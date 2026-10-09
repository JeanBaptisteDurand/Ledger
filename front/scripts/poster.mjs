#!/usr/bin/env node
// poster.mjs [base-url]
// Captures the live WebGL hero (?scene=1 forces the scene at any width) as posters:
//   public/poster-hero-landscape.jpg        1440x900      act 1 (arrival), desktop
//   public/poster-hero-portrait.jpg          390x844 @2x  act 1 (arrival), mobile
//   public/poster-hero-final-landscape.jpg  1440x900      finished scene (?p=1), prefers-reduced-motion
//   public/poster-hero-final-portrait.jpg    390x844 @2x  finished scene, prefers-reduced-motion on mobile
// Re-run whenever the title, the scene or the tokens change.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
mkdirSync('public', { recursive: true })

const browser = await chromium.launch()
const shots = [
  { file: 'public/poster-hero-landscape.jpg', viewport: { width: 1440, height: 900 }, scale: 1.5, query: '' },
  { file: 'public/poster-hero-portrait.jpg', viewport: { width: 390, height: 844 }, scale: 2, query: '' },
  { file: 'public/poster-hero-final-landscape.jpg', viewport: { width: 1440, height: 900 }, scale: 1.5, query: '&p=1' },
  { file: 'public/poster-hero-final-portrait.jpg', viewport: { width: 390, height: 844 }, scale: 2, query: '&p=1' },
]
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.viewport, deviceScaleFactor: s.scale })
  await page.goto(`${base}/?scene=1&dawn=1${s.query}`, { waitUntil: 'networkidle' })
  // The nav must not be baked into the image.
  await page.addStyleTag({ content: '#site-nav { display: none !important; }' })
  await page.waitForTimeout(2200) // title wipe done
  const hero = page.locator('#hero')
  await hero.screenshot({ path: s.file, type: 'jpeg', quality: 86 })
  await page.close()
  console.log(s.file)
}
await browser.close()
