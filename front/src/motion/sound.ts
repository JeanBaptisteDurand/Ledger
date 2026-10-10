/**
 * The scene's sound, in two layers, both from public/ and both the author's files.
 *
 *   wind-desert.mp3   The desert while the key stands in the sand. It comes up with the dawn and goes out
 *                     over the launch — the key tears free and the wind is left below.
 *   zarathustra.mp3   Strauss, Also sprach Zarathustra, the Sunrise. Played ONCE, continuously, from the
 *                     first occurrence of the call (the trumpet rises at 19.3 s; the start is 18.5) to the
 *                     end of the file, started by the launch and never cut or moved by the scroll after
 *                     that. The scene is timed on the music, loosely, by its own pacing: the trumpet calls
 *                     fall about the flights and the stops, and the fortissimo at 65.5 s — forty-seven
 *                     seconds after the launch — arrives on the final vision at a reading pace. Two earlier
 *                     cuts (one phrase per segment; one held brass sound per word) were heard by the author
 *                     and refused (2026-09-29). The descent to the home lets the music go on and fades it
 *                     slowly instead of cutting it.
 *
 * THE BROWSER'S RULE. A page may not make a sound before the reader has clicked, pressed a key or touched
 * it; a wheel notch does not count. So the context is created at the dawn and tried, and if the browser
 * refuses it waits for the first click, key or touch anywhere — the scroll-to-launch is a wheel, so most
 * readers will hear the wind only once they have touched something. The toggle (components/SoundToggle.tsx)
 * is that something, and says so. The choice is kept in localStorage.
 *
 * Nothing here is React state: the player calls in, the toggle reads a snapshot.
 */

/** Where the music starts, seconds into zarathustra.mp3: just before the first trumpet call. It plays to the end. */
export const MUSIC_START = 18.5
export const WIND_URL = '/wind-desert.mp3'
export const MUSIC_URL = '/zarathustra.mp3'
/** Levels, 0..1. The wind is a bed; the music is the event. */
const WIND_LEVEL = 0.32
const MUSIC_LEVEL = 0.85
/** Fades, seconds: the wind in with the dawn, out over the launch; a phrase's edges; the finale over the descent. */
const WIND_IN = 2.5
const WIND_OUT = 3.2
const CUE_EDGE = 0.35
/** After the descent's fade, how long the burst is still let go on before it is stopped. */
const AFTER_DESCENT = 4.5
const STORAGE_KEY = 'monolith-sound'

export type SoundState = 'off' | 'blocked' | 'on'

export type Soundtrack = {
  /** Creates the context and starts loading; tries to run, and arms the gesture fallback. */
  arm: () => void
  /** The reader's switch. */
  toggle: () => void
  state: () => SoundState
  subscribe: (fn: () => void) => () => void
  /** The wind, on (dawn) or off (launch). */
  wind: (on: boolean) => void
  /** The segment released; the launch (0) starts the music. */
  cue: (index: number) => void
  /** The descent: everything fades over `seconds`. */
  descend: (seconds: number) => void
  stop: () => void
  destroy: () => void
}

export function createSoundtrack(): Soundtrack {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let windGain: GainNode | null = null
  let musicGain: GainNode | null = null
  let windSrc: AudioBufferSourceNode | null = null
  let musicSrc: AudioBufferSourceNode | null = null
  /** The playing phrase's own gain, so a handover can fade it rather than cut it. */
  let musicNode: GainNode | null = null
  let stopTimer: number | null = null
  let windBuf: AudioBuffer | null = null
  let musicBuf: AudioBuffer | null = null
  let wantWind = false
  let pendingCue: number | null = null
  let off = (() => { try { return localStorage.getItem(STORAGE_KEY) === 'off' } catch { return false } })()
  let destroyed = false
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((f) => f())

  const state = (): SoundState => (off ? 'off' : ctx && ctx.state === 'running' ? 'on' : 'blocked')

  const load = async (url: string): Promise<AudioBuffer | null> => {
    if (!ctx) return null
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url}: ${res.status}`)
      const data = await res.arrayBuffer()
      return await ctx.decodeAudioData(data)
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[sound] could not load', url, e)
      return null
    }
  }

  const startWind = () => {
    if (!ctx || !windGain || !windBuf || windSrc || !wantWind || off) return
    windSrc = ctx.createBufferSource()
    windSrc.buffer = windBuf
    windSrc.loop = true
    windSrc.connect(windGain)
    windSrc.start()
    const t = ctx.currentTime
    windGain.gain.cancelScheduledValues(t)
    windGain.gain.setValueAtTime(0.0001, t)
    windGain.gain.linearRampToValueAtTime(WIND_LEVEL, t + WIND_IN)
  }

  /** The music, once, from MUSIC_START to the end. A second call while it plays does nothing. */
  const playMusic = () => {
    if (!ctx || !musicGain || !musicBuf || off || musicSrc) return
    const t = ctx.currentTime
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(0.0001, t)
    bus.gain.linearRampToValueAtTime(1, t + CUE_EDGE)
    bus.connect(musicGain)
    const src = ctx.createBufferSource()
    src.buffer = musicBuf
    src.connect(bus)
    src.start(t, MUSIC_START)
    src.onended = () => { if (musicSrc === src) { musicSrc = null; if (musicNode === bus) musicNode = null } }
    musicSrc = src
    musicNode = bus
  }

  const onRunning = () => {
    notify()
    if (wantWind) startWind()
    if (pendingCue !== null) { pendingCue = null; playMusic() }
  }

  const tryResume = () => {
    if (!ctx || off) return
    ctx.resume().then(() => { if (ctx && ctx.state === 'running') onRunning() }).catch(() => {})
  }
  const gesture = () => tryResume()
  const gestureEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchend']

  const arm = () => {
    if (ctx || destroyed) return
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)
    windGain = ctx.createGain()
    windGain.gain.value = 0.0001
    windGain.connect(master)
    musicGain = ctx.createGain()
    musicGain.gain.value = MUSIC_LEVEL
    musicGain.connect(master)
    ctx.onstatechange = () => notify()
    load(WIND_URL).then((b) => { windBuf = b; if (ctx?.state === 'running') startWind() })
    load(MUSIC_URL).then((b) => { musicBuf = b; if (ctx?.state === 'running' && pendingCue !== null) { pendingCue = null; playMusic() } })
    for (const ev of gestureEvents) window.addEventListener(ev, gesture, { passive: true })
    tryResume()
    notify()
  }

  const toggle = () => {
    off = !off
    try { localStorage.setItem(STORAGE_KEY, off ? 'off' : 'on') } catch { /* private mode */ }
    if (off) {
      if (ctx && master) {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(master.gain.value, t)
        master.gain.linearRampToValueAtTime(0.0001, t + 0.4)
      }
    } else {
      if (!ctx) arm()
      if (ctx && master) {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(0.0001, t)
        master.gain.linearRampToValueAtTime(1, t + 0.6)
      }
      tryResume()
      if (ctx?.state === 'running') onRunning()
    }
    notify()
  }

  const wind = (on: boolean) => {
    wantWind = on
    if (!ctx || !windGain) return
    if (on) startWind()
    else if (windSrc) {
      const t = ctx.currentTime
      windGain.gain.cancelScheduledValues(t)
      windGain.gain.setValueAtTime(windGain.gain.value, t)
      windGain.gain.linearRampToValueAtTime(0.0001, t + WIND_OUT)
      windSrc.stop(t + WIND_OUT + 0.05)
      windSrc = null
    }
  }

  /** The launch (index 0) starts the music; later segments change nothing, the music is already playing. */
  const cue = (index: number) => {
    if (off || index !== 0) return
    if (!ctx || ctx.state !== 'running' || !musicBuf) { pendingCue = index; tryResume(); return }
    playMusic()
  }

  /**
   * The descent. The burst is not cut with the scene: it goes on under the home for a while and fades over
   * the descent plus AFTER_DESCENT, then is stopped. The author heard the cut and asked for this.
   */
  const descend = (seconds: number) => {
    if (!ctx || !master) return
    const t = ctx.currentTime
    const total = seconds + AFTER_DESCENT
    master.gain.cancelScheduledValues(t)
    master.gain.setValueAtTime(master.gain.value, t)
    master.gain.linearRampToValueAtTime(0.0001, t + total)
    if (stopTimer !== null) clearTimeout(stopTimer)
    stopTimer = window.setTimeout(() => { stopTimer = null; stop() }, total * 1000 + 100)
  }

  const stop = () => {
    pendingCue = null
    wantWind = false
    try { windSrc?.stop() } catch { /* already stopped */ }
    try { musicSrc?.stop() } catch { /* already stopped */ }
    windSrc = null
    musicSrc = null
    musicNode = null
  }

  const destroy = () => {
    destroyed = true
    stop()
    for (const ev of gestureEvents) window.removeEventListener(ev, gesture)
    ctx?.close().catch(() => {})
    ctx = null
    subs.clear()
  }

  const api: Soundtrack = {
    arm,
    toggle,
    state,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
    wind,
    cue,
    descend,
    stop,
    destroy,
  }
  if (import.meta.env.DEV) (window as unknown as { __sound?: unknown }).__sound = { api, get ctx() { return ctx }, get master() { return master?.gain.value }, get playing() { return { wind: !!windSrc, music: !!musicSrc, pendingCue, wantWind } } }
  return api
}
