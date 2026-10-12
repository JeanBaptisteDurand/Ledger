/**
 * The demo's player: a list of beats, each held for a few seconds, and a cursor the page reads. NEW file: nothing
 * else in src/motion/ is touched. No tween, no scroll: the page's grammar is the blink (CSS steps), so the player
 * only decides WHEN the next screen comes on. Under prefers-reduced-motion it never auto-plays: the reader steps.
 */
import { prefersReducedMotion } from './flags'

export type Player = {
  play(): void
  pause(): void
  toggle(): void
  seek(i: number): void
  next(): void
  prev(): void
  destroy(): void
  readonly playing: boolean
  readonly index: number
}

/** `holds` in seconds per beat. `onBeat` fires on every cursor move, `onPlaying` on every play/pause. */
export function createDemoPlayer(holds: readonly number[], onBeat: (i: number) => void, onPlaying: (p: boolean) => void): Player {
  let index = 0
  let playing = false
  let timer: number | null = null
  const stop = () => { if (timer !== null) { window.clearTimeout(timer); timer = null } }
  const arm = () => {
    stop()
    if (!playing) return
    timer = window.setTimeout(() => {
      if (index + 1 >= holds.length) { playing = false; onPlaying(false); return }
      index += 1
      onBeat(index)
      arm()
    }, holds[index] * 1000)
  }
  const player: Player = {
    play() {
      if (prefersReducedMotion()) return
      if (index + 1 >= holds.length) { index = 0; onBeat(index) }
      playing = true
      onPlaying(true)
      arm()
    },
    pause() { playing = false; onPlaying(false); stop() },
    toggle() { if (playing) player.pause(); else player.play() },
    seek(i) { index = Math.max(0, Math.min(holds.length - 1, i)); onBeat(index); arm() },
    next() { player.seek(index + 1) },
    prev() { player.seek(index - 1) },
    destroy() { stop() },
    get playing() { return playing },
    get index() { return index },
  }
  return player
}
