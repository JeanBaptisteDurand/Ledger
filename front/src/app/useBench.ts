/**
 * One live view of the bench: GET /api/state every 1.4 s, the same cadence as the reference page. Everything the
 * app screens draw comes from this object. Actions post, then refresh at once so the screen answers the click.
 *
 * It also carries the one rule that protects the device: a pending signature is signed by the tab that asked for
 * it (it holds the token), or — after a reload — by a tab that has the focus. Never by a tab left in the background.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getState, post, type BenchState, type Reply } from './api'
import { disconnect, errText, explain, isSigning, signPending } from './ledger'

const LOADED_AT = Date.now()
const POLL_MS = 1400

export interface Toast { id: number; tone: 'error' | 'info' | 'success'; text: string }

interface Bench {
  state: BenchState | null
  offline: boolean
  deviceHint: string | null
  toasts: Toast[]
  dismiss(id: number): void
  say(text: string, tone?: Toast['tone']): void
  refresh(): Promise<void>
  act(path: string, body?: unknown): Promise<Reply>
}

const Ctx = createContext<Bench | null>(null)

export function BenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BenchState | null>(null)
  const [offline, setOffline] = useState(false)
  const [deviceHint, setDeviceHint] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const myToken = useRef<string | null>(null)
  const nextId = useRef(1)
  const lastEscalation = useRef<string | null>(null)

  const say = useCallback((text: string, tone: Toast['tone'] = 'error') => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-3), { id, tone, text }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000)
  }, [])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const refresh = useCallback(async () => {
    try {
      setState(await getState())
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  const act = useCallback(
    async (path: string, body: unknown = {}) => {
      let r: Reply
      try {
        r = await post(path, body)
      } catch {
        r = { ok: false, msg: 'Le banc ne répond pas (port 8099).' }
      }
      if (r.pending_token) myToken.current = r.pending_token
      if (!r.ok && r.msg) say(r.msg)
      await refresh()
      return r
    },
    [refresh, say],
  )

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(t)
  }, [refresh])

  // The pending signature: this tab signs it if it asked for it, or if it is the tab in front after a reload.
  useEffect(() => {
    const p = state?.pending
    if (!p || state?.signer !== 'browser' || isSigning()) return
    // no token: only a request older than this tab (the asking tab was reloaded), never one born while this tab was already open
    const mine = p.token === myToken.current || (!myToken.current && (p.ts ?? 0) * 1000 < LOADED_AT && document.hasFocus())
    if (!mine) return
    setDeviceHint('L’appareil prépare la revue…')
    signPending(p, setDeviceHint)
      .catch((e) => say(explain(errText(e))))
      .finally(() => {
        setDeviceHint(null)
        refresh()
      })
  }, [state?.pending, state?.signer, refresh, say])

  // When the signature is server-side, this tab must not keep a session open on the device.
  useEffect(() => {
    if (state && state.signer !== 'browser' && window.LedgerWeb?.address() && !isSigning()) disconnect()
  }, [state?.signer, state])

  // A new out-of-bounds request: tell the person, even if the tab is not in front.
  useEffect(() => {
    const e = state?.escalation
    const key = e ? e.pool_id + e.seen_exit_bps : null
    if (key && key !== lastEscalation.current && e?.possible) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Demande hors bornes', { body: (e.bot ? `Bot « ${e.bot.name} » — ` : '') + e.question })
        }
      } catch { /* notifications are a courtesy */ }
    }
    lastEscalation.current = key
  }, [state?.escalation])

  const value = useMemo<Bench>(
    () => ({ state, offline, deviceHint, toasts, dismiss, say, refresh, act }),
    [state, offline, deviceHint, toasts, dismiss, say, refresh, act],
  )
  return createElement(Ctx.Provider, { value }, children)
}

export function useBench(): Bench {
  const b = useContext(Ctx)
  if (!b) throw new Error('useBench hors de BenchProvider')
  return b
}

/** Ask for the right to notify on a gesture (launching a round, adding a bot), never on load. */
export function askToNotify(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  } catch { /* courtesy */ }
}
