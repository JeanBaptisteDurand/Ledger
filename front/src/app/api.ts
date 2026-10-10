/**
 * The bench's API (web/server.py at the repository root, port 8099), reached through the Vite proxy (/api, /speculos, /dist).
 * Every POST answers { ok, msg, … }; an ok:false is a sentence to show, not an exception.
 * Shapes are those documented in FRONT.md (repository root) § 4–5.
 */

export type Signer = 'browser' | 'dmk' | 'python'
export type Universe = 'pools' | 'vaults'

export interface Proposal {
  budget_weth: number
  max_round_trip_loss_bps: number
  slice_weth: number
  ticks: number
  days: number
  risk: 'prudent' | 'equilibre' | 'offensif'
  min_depth_sizes: number
  require_registry: boolean
  rationale: string
  warning: string
}

export interface ChatLine { role: 'user' | 'assistant'; text: string; warning?: string; source?: string }

export interface Mandate {
  owner: string
  vault: string
  signature: string
  signer: string
  mandate: { agent: string; budgetToken: string; budgetAmount: string; maxRoundTripLossBps: number; expiry: number; nonce: number }
}

export interface Bot {
  id: string
  name: string
  universe: Universe
  ticks: number
  interval_s: number
  slice_wei: string
  created: number
  started: number
  stopped: number | null
  status: 'running' | 'stopped' | 'done'
  rounds: number
  next_run: number
  stop_reason: string | null
  executed: number
  refused: number
  exceptions: number
  positions: number
  spent_wei: string
  last_ts: number | null
}

export interface JournalRow {
  tick: number | string
  bot: string | null
  pool: string
  hook: string
  kind: 'pool' | 'vault'
  name: string | null
  apy_pct: number | null
  under_exception: boolean
  own_bps: number | null
  stuck_bps: number | null
  deposit_refused: string | null
  entry: number
  exit: number | null
  hook_in: number | null
  hook_out: number | null
  registry: boolean | null
  decision: 'EXECUTED' | 'REFUSED_BY_VAULT'
  error: string | null
  why: string
}

export interface Position {
  pool: string
  token: string
  kind: 'pool' | 'vault'
  name: string | null
  bot: string | null
  exit_bps: number | null
  tick: number | string
  under_exception: boolean
  balance: string
}

export interface Escalation {
  possible: boolean
  pool_id: string
  seen_exit_bps: number
  mandate_allows_bps: number
  amount_in: string
  question: string
  name?: string
  bot?: { id: string; name: string }
  kind?: 'pool' | 'vault'
}

export interface WatchRow {
  kind: 'pool' | 'vault'
  pool_id: string
  name: string | null
  exit_bps_at_buy: number | null
  exit_bps_now: number | null
  blocked: boolean | null
  delta_bps: number | null
  action: string
}

export interface Analysis {
  question: string
  pending: boolean
  answer: string
  tools_used: { tool: string; args: Record<string, unknown> }[]
  error: string | null
  ts: number
}

export type PendingKind = 'mandate' | 'exception' | 'withdraw' | 'deposit'
export interface UnsignedTx { chainId: number; nonce: number; to: string; value: string; data: string; gas: number; maxFeePerGas: string; maxPriorityFeePerGas: string }
export interface Pending { kind: PendingKind; typedData?: unknown; tx?: UnsignedTx; amount_wei?: string; expiry?: number; token: string; ts?: number }

export interface BenchState {
  anvil: boolean
  speculos: boolean
  network: 'fork' | 'live'
  chain_id: number | null
  fork_block: number | null
  ledger_stack: Record<string, string>
  ring: unknown
  address: string | null
  owner: string | null
  vault: string | null
  weth: string
  owner_eth: string
  signer: Signer
  universe: Universe
  chat: ChatLine[]
  proposal: Proposal | null
  signing: PendingKind | null
  pending: Pending | null
  mandate: Mandate | null
  signed: boolean
  last_report: { isBlindSign?: boolean; clearSigningType?: string } | null
  running: boolean
  bot_running: string | null
  bots: Bot[]
  journal: JournalRow[]
  spent: string
  positions: Position[]
  escalation: Escalation | null
  escalation_queue: Escalation[]
  refused_escalations: string[]
  exception_buys: unknown[]
  watch: { ts: number; rows: WatchRow[]; sell_if: number | null } | null
  watching: boolean
  analysis: Analysis | null
  analyses: Analysis[]
  log: string[]
}

export interface AccountEvent { ts: number; kind: string; [k: string]: unknown }

export interface Account {
  ok: boolean
  msg?: string
  profile: { address: string; created?: number; logins?: number; last_via?: string; vault?: string }
  events: AccountEvent[]
  mcp_key: string
  mcp_config: unknown
  dir: string
  key_note?: string
}

export interface Reply { ok: boolean; msg?: string; pending_token?: string | null; [k: string]: unknown }

export async function getState(): Promise<BenchState> {
  const r = await fetch('/api/state', { cache: 'no-store' })
  return r.json()
}

export async function getAccount(reveal = false): Promise<Account> {
  const r = await fetch('/api/account' + (reveal ? '?reveal=1' : ''), { cache: 'no-store' })
  return r.json()
}

export async function post(path: string, body: unknown = {}): Promise<Reply> {
  const r = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

/** wei (string) → "0.5000 WETH" above 0.001, else wei with thin spaces. */
export function fmtWei(w: string | number | null | undefined): string {
  if (w == null || w === '') return '—'
  const n = Number(w) / 1e18
  if (n >= 0.001) return n.toFixed(4) + ' WETH'
  return Number(w).toLocaleString('fr') + ' wei'
}

export const short = (a?: string | null, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : '—')

export const EVENT_LABELS: Record<string, string> = {
  login: 'connexion',
  session: 'session ouverte',
  strategy: 'stratégie demandée',
  mandate_signed: 'mandat signé',
  bot_added: 'bot ajouté',
  run: 'tour lancé',
  run_done: 'tour terminé',
  bot_stopped: 'bot arrêté',
  bot_restarted: 'bot relancé',
  bot_done: 'bot terminé',
  notified: 'prévenu',
  exception_signed: 'dérogation signée',
  exception_refused: 'refus maintenu',
  watch: 'surveillance',
  analysis: "question à l'analyste",
  reset: 'remise à zéro',
}

export const STOP_REASONS: Record<string, string> = {
  'arrêté par le porteur': 'arrêté par vous',
}
