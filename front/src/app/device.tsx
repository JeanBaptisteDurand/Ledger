/**
 * The device, as the door and the demo need it: the three signing paths, and the emulated Flex's screen live with a
 * finger on it (click = tap, drag left = swipe, hold = sign). What /appareil used to carry; the page is gone.
 */
import { useEffect, useRef, useState } from 'react'
import { post, type Signer } from './api'

export const PATHS: { value: Signer; label: string; what: string }[] = [
  { value: 'browser', label: 'My Ledger · this browser', what: 'Ledger’s Signer Kit runs in this page. The server never sees the device: it receives a signature. This is the path of a customer at home.' },
  { value: 'dmk', label: 'Signer Kit · bench', what: 'The same Signer Kit, launched by the bench server against the emulated Flex. For a demonstration without a device.' },
  { value: 'python', label: 'APDU client · bench', what: 'The official Python client of app-ethereum, in direct APDUs. The path that found the chainId bug.' },
]

/** The emulated Flex's screen, refreshed twice a second, and a finger on it. */
export function LiveScreen({ live, signing, real }: { live: boolean; signing: string | null; real: boolean }) {
  const [stamp, setStamp] = useState(0)
  const down = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => setStamp(Date.now()), 450)
    return () => window.clearInterval(t)
  }, [live])

  const point = (e: React.PointerEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const r = img.getBoundingClientRect()
    return { x: Math.round(((e.clientX - r.left) / r.width) * img.naturalWidth), y: Math.round(((e.clientY - r.top) / r.height) * img.naturalHeight) }
  }
  const finger = (action: 'press' | 'release', p: { x: number; y: number }) => post('/finger', { action, ...p }).catch(() => undefined)

  const status = signing ? 'waiting for you' : live ? 'powered on' : 'powered off'
  return (
    <div>
      <p className="t-micro-cap eyebrow m-0 mb-3">{real ? 'The bench’s emulated Flex (your real Ledger has its own screen)' : 'The Flex screen, live'} · {status}</p>
      <div className={`device-frame ${signing ? 'app-mirror--pending' : ''}`}>
        {live ? (
          <img
            src={`/api/screen?t=${stamp}`}
            alt="Screen of the emulated Ledger Flex"
            draggable={false}
            onPointerDown={(e) => { const p = point(e); down.current = { ...p, t: Date.now() }; e.currentTarget.setPointerCapture(e.pointerId); finger('press', p) }}
            onPointerUp={(e) => { if (!down.current) return; finger('release', point(e)); down.current = null }}
          />
        ) : (
          <p className="t-mono-device m-0 p-8 is-faint">SCREEN OFF</p>
        )}
      </div>
      <p className="t-caption m-0 mt-3 max-w-[40ch] is-faint">A click is a tap. Drag left to turn the page. Hold to sign.</p>
    </div>
  )
}
