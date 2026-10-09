/*
 * Is the Y of "YOUR" hidden behind the Ledger, so the line first reads "BEGIN OUR JOURNEY"?
 *
 * The device is a tilted slab, so how much of it is in the way depends on the height at which you look: at the
 * top of the letters it covers one range of columns, at their feet another, and a letter tall enough to span
 * both pokes out at one end or the other. That is why this is measured rather than reasoned about.
 *
 * Method. The device is first moved out of frame (its group's own x, which the frame loop does not touch, as
 * opposed to its visibility, which it rewrites every frame) so the full line can be read. The two word spaces
 * are the two largest column gaps, which gives the three words; inside the second word the first letter gap
 * gives the Y. The device is then put back and the same columns are read again: if any ink survives in the Y's
 * range, the Y is not hidden, and the report says by how many pixels and on which side.
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const BASE = process.argv[2] ?? 'http://localhost:5199'
const AT = process.argv[3] ?? '0.02'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/?dawn=1&p=${AT}`, { waitUntil: 'load' })
await page.waitForTimeout(6500)

const move = async (x) => {
  await page.evaluate((v) => {
    const g = window.__hero.scene.getObjectByName('device-nano')
    if (g) g.position.x = v
  }, x)
  await page.waitForTimeout(1300)
  return PNG.sync.read(await page.screenshot())
}

/** Columns carrying title ink, and the row band the letters occupy. */
const inkColumns = (png) => {
  const { width: W, height: H, data } = png
  const white = (x, y) => {
    const i = (y * W + x) * 4
    return Math.min(data[i], data[i + 1], data[i + 2]) > 170
  }
  let top = H
  let bot = 0
  const rowCount = []
  for (let y = 0; y < H; y++) {
    let n = 0
    for (let x = 0; x < W; x++) if (white(x, y)) n++
    rowCount.push(n)
    if (n > 40) {
      if (y < top) top = y
      if (y > bot) bot = y
    }
  }
  const col = new Array(W).fill(0)
  for (let y = top; y <= bot; y++) for (let x = 0; x < W; x++) if (white(x, y)) col[x]++
  return { col, top, bot }
}

const runs = (col, minWidth = 3) => {
  const out = []
  let s = -1
  for (let x = 0; x < col.length; x++) {
    if (col[x] > 0 && s < 0) s = x
    else if (col[x] === 0 && s >= 0) {
      if (x - s >= minWidth) out.push([s, x - 1])
      s = -1
    }
  }
  if (s >= 0) out.push([s, col.length - 1])
  return out
}

const clear = await move(60)
const { col: colClear, top, bot } = inkColumns(clear)
const groupsClear = runs(colClear)
// the two word spaces are the two widest gaps
const gaps = []
for (let i = 1; i < groupsClear.length; i++) gaps.push({ i, w: groupsClear[i][0] - groupsClear[i - 1][1] })
gaps.sort((a, b) => b.w - a.w)
const cuts = gaps.slice(0, 2).map((g) => g.i).sort((a, b) => a - b)
const word2 = groupsClear.slice(cuts[0], cuts[1])
// inside word two, the first gap ends the Y
const yStart = word2[0][0]
const yEnd = word2[0][1]
/* The O is the next run along; it is what must stay guessable while the Y goes. */
const oStart = word2.length > 1 ? word2[1][0] : yEnd + 1
const oEnd = word2.length > 1 ? word2[1][1] : yEnd + 1

const back = await move(0)
const { col: colBack } = inkColumns(back)
const survey = (from, to, ref) => {
  let ink = 0
  let full = 0
  let lo = null
  let hi = null
  for (let x = from; x <= to; x++) {
    full += ref[x]
    if (colBack[x] > 0) {
      ink += colBack[x]
      if (lo === null) lo = x
      hi = x
    }
  }
  return { inkPx: ink, shareOfLetter: full ? +(ink / full).toFixed(2) : 0, visibleFrom: lo, visibleTo: hi }
}
const theYSurvey = survey(yStart, yEnd, colClear)
const theOSurvey = survey(oStart, oEnd, colClear)
await browser.close()

console.log(
  JSON.stringify(
    {
      at: AT,
      titleRows: [top, bot],
      titleInk: [groupsClear[0][0], groupsClear[groupsClear.length - 1][1]],
      words: cuts,
      theY: { from: yStart, to: yEnd, widthPx: yEnd - yStart + 1, ...theYSurvey, hidden: theYSurvey.inkPx === 0 },
      theO: { from: oStart, to: oEnd, widthPx: oEnd - oStart + 1, ...theOSurvey },
    },
    null,
    1,
  ),
)
