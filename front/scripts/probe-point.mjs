// What DOM element is painted at a given point, at a given sequence position.
import { chromium } from 'playwright'

const [base, p, x, y] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5])]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${base}/?dawn=1&p=${p}`, { waitUntil: 'load' })
await page.waitForTimeout(5000)
console.log(
  JSON.stringify(
    await page.evaluate(
      ([px, py]) =>
        document.elementsFromPoint(px, py).slice(0, 5).map((e) => {
          const r = e.getBoundingClientRect()
          const cs = getComputedStyle(e)
          return {
            tag: e.tagName,
            cls: e.className?.baseVal ?? e.className,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            bg: cs.backgroundColor,
            opacity: cs.opacity,
          }
        }),
      [x, y],
    ),
    null,
    1,
  ),
)
await browser.close()
