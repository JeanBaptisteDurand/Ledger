// How many near-white pixels the star field puts in the top third of the frame, and how they clump.
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'

for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(file))
  const { width, height, data } = png
  const h3 = process.env.FULL ? height : Math.floor(height / 3)
  let n = 0
  const sizes = new Map()
  const seen = new Uint8Array(width * h3)
  const at = (x, y) => {
    const i = (y * width + x) * 4
    return data[i] > 140 && data[i + 1] > 140 && data[i + 2] > 140
  }
  for (let y = 0; y < h3; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y) || seen[y * width + x]) continue
      // flood the blob so 1, 2 and 3 px dots can be told apart
      const stack = [[x, y]]
      let area = 0
      seen[y * width + x] = 1
      while (stack.length) {
        const [cx, cy] = stack.pop()
        area++
        n++
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= h3 || seen[ny * width + nx] || !at(nx, ny)) continue
          seen[ny * width + nx] = 1
          stack.push([nx, ny])
        }
      }
      sizes.set(area, (sizes.get(area) ?? 0) + 1)
    }
  }
  console.log(file, JSON.stringify({ area: `${width}x${h3}`, whitePixels: n, blobs: [...sizes].sort((a, b) => a[0] - b[0]) }))
}
