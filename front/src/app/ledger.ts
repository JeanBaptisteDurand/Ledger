/**
 * The Ledger, in this browser. The bench serves a bundle (dist/ledger-web.js) that exposes window.LedgerWeb:
 * Ledger's Signer Kit over WebHID (a real device plugged into this computer) or over the bench's emulator
 * through the same-origin proxy /speculos. The server never sees the device: it parks a signature in
 * `state.pending`, this page has it signed, and hands the signature back to POST /api/signed.
 *
 * One client at a time on the device. A pending signature carries a token; only the tab that asked for it signs it.
 */
import { post, type Pending, type UnsignedTx } from './api'

export type Transport = 'webhid' | 'speculos'

interface LedgerWeb {
  connect(transport: Transport, speculosUrl: string): Promise<string>
  getAddress(): Promise<string>
  signMessage(message: string, onStep?: (iv: Step) => void): Promise<{ signature: string; address: string }>
  signTypedData(typedData: unknown, descriptor: unknown, onStep?: (iv: Step) => void): Promise<{ signature: string; address: string; report: unknown }>
  signTransaction(tx: UnsignedTx, onStep?: (iv: Step) => void): Promise<{ raw: string; r: string; s: string; v: number; address: string }>
  disconnect(): Promise<void>
  address(): string | null
  transport(): Transport | null
  webHidSupported(): boolean
}
export interface Step { requiredUserInteraction?: string; step?: string }

declare global {
  interface Window { LedgerWeb?: LedgerWeb }
}

const TRANSPORT_KEY = 'pdsTransport'
let loading: Promise<LedgerWeb> | null = null

/** The bundle is 2 MB of Ledger SDK: fetched on first use, not on the landing page. */
export function loadLedger(): Promise<LedgerWeb> {
  if (window.LedgerWeb) return Promise.resolve(window.LedgerWeb)
  loading ??= new Promise<LedgerWeb>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/dist/ledger-web.js'
    s.onload = () => (window.LedgerWeb ? resolve(window.LedgerWeb) : reject(new Error('bundle Ledger vide')))
    s.onerror = () => { loading = null; reject(new Error('bundle Ledger introuvable : le banc tourne-t-il sur le port 8099 ?')) }
    document.head.appendChild(s)
  })
  return loading
}

export const webHidAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator

export function getTransport(): Transport {
  try {
    const saved = localStorage.getItem(TRANSPORT_KEY) as Transport | null
    if (saved === 'webhid' || saved === 'speculos') return saved
  } catch { /* private window */ }
  return 'speculos'
}

export async function setTransport(t: Transport): Promise<void> {
  try { localStorage.setItem(TRANSPORT_KEY, t) } catch { /* private window */ }
  if (window.LedgerWeb) await window.LedgerWeb.disconnect()
}

export const errText = (e: unknown): string => {
  if (!e) return 'erreur'
  if (e instanceof Error) return e.message
  if (typeof e === 'object') {
    const o = e as { message?: string; _tag?: string }
    return o.message || o._tag || JSON.stringify(e)
  }
  return String(e)
}

const REFUSED = /refus|reject|6985|denied|NoDevice|cancel/i

/** What a device status means to a person. */
export function explain(message: string): string {
  if (/6985|reject|refus/i.test(message)) return 'Refusé sur l’appareil.'
  if (/6980/.test(message)) return 'L’app Ethereum est restée sur un message abandonné : quittez-la et rouvrez-la sur l’appareil.'
  if (/6901/.test(message)) return 'Un autre client parle à l’appareil : fermez les autres onglets, puis rouvrez l’app Ethereum.'
  if (/5515|Locked/i.test(message)) return 'L’appareil est verrouillé : déverrouillez-le et ouvrez l’app Ethereum.'
  if (/NoDevice|not found|No device/i.test(message)) return 'Aucun appareil sélectionné.'
  return message
}

/** Connect once; a failed first try is often a device that was not ready, so try again a moment later. */
export async function connect(): Promise<string> {
  const lw = await loadLedger()
  const here = lw.address()
  if (here) return here
  const url = location.origin + '/speculos'
  try {
    return await lw.connect(getTransport(), url)
  } catch (e) {
    if (REFUSED.test(errText(e))) throw e
    await new Promise((r) => setTimeout(r, 1500))
    await lw.disconnect()
    return lw.connect(getTransport(), url)
  }
}

export async function disconnect(): Promise<void> {
  if (window.LedgerWeb) await window.LedgerWeb.disconnect()
}

/**
 * Sign-In with Ethereum (EIP-4361), signed on the device. No `statement`, seconds precision, plain ASCII: one
 * non-ASCII character and Ledger's Signer Kit 1.18.1 drops the whole message and strands the app (FEEDBACK § 7).
 */
export async function signIn(onStep?: (text: string) => void): Promise<{ ok: boolean; msg?: string; address?: string }> {
  onStep?.('Connexion à l’appareil…')
  const address = await connect()
  const n = await (await fetch('/api/siwe/nonce', { cache: 'no-store' })).json()
  const issued = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const message =
    `${n.domain} wants you to sign in with your Ethereum account:\n${address}\n\n` +
    `URI: ${location.origin}\nVersion: 1\nChain ID: ${n.chainId}\nNonce: ${n.nonce}\nIssued At: ${issued}`
  onStep?.('Sur l’appareil : lisez le message de connexion, puis signez.')
  const lw = await loadLedger()
  let signature: string
  try {
    ({ signature } = await lw.signMessage(message))
  } catch (first) {
    if (REFUSED.test(errText(first))) throw first
    // The session may be dead (DeviceSessionNotFound: emulator restarted, device replugged, a session dropped right
    // after connecting) while the address is still remembered: reconnect once, as signPending does.
    await lw.disconnect().catch(() => {})
    const again = await lw.connect(getTransport(), location.origin + '/speculos')
    if (again.toLowerCase() !== address.toLowerCase()) throw new Error('L’appareil a changé d’adresse pendant la connexion : reconnectez-vous.')
    ;({ signature } = await lw.signMessage(message))
  }
  const r = await post('/siwe/verify', { message, signature, address })
  return { ok: r.ok, msg: r.msg, address: r.address as string | undefined }
}

let busy = false
export const isSigning = () => busy

/** Have the pending mandate or exception signed on the device, then hand it back to the server. */
export async function signPending(p: Pending, onStep?: (text: string) => void): Promise<void> {
  if (busy) return
  busy = true
  const step = (iv: Step) => {
    const k = iv.requiredUserInteraction
    if (k === 'sign-typed-data') onStep?.('Sur l’appareil : lisez chaque champ, puis maintenez « Hold to sign ».')
    else if (k === 'sign-transaction') onStep?.('Sur l’appareil : le montant, l’adresse de votre coffre, les frais — puis maintenez « Hold to sign ».')
    else if (k === 'web3-checks-opt-in') onStep?.('L’appareil propose « Transaction Check » : répondez « Maybe later ».')
    else onStep?.('L’appareil prépare la revue…')
  }
  try {
    const lw = await loadLedger()
    if (p.kind === 'deposit') {
      // the deposit: an ETH transfer to the vault — the one transaction the Ledger signs, readable by any Ethereum app
      let t
      try {
        await connect()
        t = await lw.signTransaction(p.tx!, step)
      } catch (first) {
        if (REFUSED.test(errText(first))) throw first
        await lw.disconnect()
        await connect()
        t = await lw.signTransaction(p.tx!, step)
      }
      await post('/signed', { kind: p.kind, raw: t.raw, owner: t.address })
      return
    }
    const descriptor = await (await fetch('/api/descriptor?kind=' + p.kind, { cache: 'no-store' })).json()
    if (descriptor.error) throw new Error(descriptor.error)
    let r
    try {
      await connect()
      r = await lw.signTypedData(p.typedData, descriptor, step)
    } catch (first) {
      if (REFUSED.test(errText(first))) throw first
      // the session may be dead (device replugged, emulator restarted): reconnect once
      try {
        await lw.disconnect()
        await connect()
        r = await lw.signTypedData(p.typedData, descriptor, step)
      } catch (second) {
        throw new Error(`${errText(first)} — puis, après reconnexion : ${errText(second)}`)
      }
    }
    await post('/signed', { kind: p.kind, signature: r.signature, owner: r.address, report: r.report })
  } catch (e) {
    await post('/signed', { kind: p.kind, error: errText(e) })
    throw e
  } finally {
    busy = false
  }
}
