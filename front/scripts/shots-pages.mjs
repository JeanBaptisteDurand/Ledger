#!/usr/bin/env node
// Screenshots of every page of the site, signed in with the bench's emulated Flex, at a desktop and a phone width.
//   node scripts/shots-pages.mjs [output dir]      (the bench and the Vite server must be running)
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.FRONT_URL || 'http://127.0.0.1:5173'
const OUT = process.argv[2] || 'design-shots/pages'
fs.mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log(a.join(' '))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
const errors = []
async function shoot(width, height, suffix) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-GB' })
  await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${suffix} ${page.url()} : ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/502|Failed to load|favicon/.test(m.text())) errors.push(`${suffix} console ${page.url()} : ${m.text().slice(0, 160)}`) })
  const api = (p, b = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [p, b])
  const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()))
  await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500)
  let s = await state()
  if (!s.address) { await api('/login_device'); await sleep(800); s = await state() }
  if (!s.vault) { await api('/boot'); for (let i = 0; i < 60 && !(await state()).vault; i++) await sleep(2000) }
  for (const [path, name] of [['/connexion', 'connexion'], ['/account', 'account'], ['/trades', 'trades'], ['/demo', 'demo-replay'], ['/demo#map', 'demo-map'], ['/demo#cockpit', 'demo-cockpit']]) {
    await page.goto(URL + path, { waitUntil: 'domcontentloaded' }); await sleep(2500)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    if (w > width) errors.push(`${suffix} ${path} : horizontal overflow ${w} > ${width}`)
    await page.screenshot({ path: `${OUT}/${name}-${suffix}.png`, fullPage: path.startsWith('/demo#') ? false : true })
    log(`shot ${name}-${suffix} (${w}px wide)`)
  }
  await ctx.close()
}
await shoot(1440, 900, 'desktop')
await shoot(390, 844, 'phone')
await browser.close()
if (errors.length) { console.log('PROBLEMS:'); errors.forEach((e) => console.log('  ' + e)) } else console.log('no page error, no overflow')
