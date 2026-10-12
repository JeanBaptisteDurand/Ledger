/**
 * The whole system on one sheet: who signs, who acts, who measures, who understands, who keeps the secret.
 * Inline SVG, DESIGN.md's grammar — panels on the warm near-black, mono labels, one accent for the connectors,
 * every connector a single right angle with a dot at each end. Colours are CSS variables; nothing is hex here.
 */

type Node = { id: string; x: number; y: number; w: number; h: number; kicker: string; title: string; lines: string[]; tone?: 'signer' | 'agent' | 'ring' }
type Edge = { from: string; to: string; label?: string; via?: 'h' | 'v'; offset?: number }

const W = 1200
const H = 820

const NODES: Node[] = [
  { id: 'ledger', x: 440, y: 20, w: 320, h: 124, tone: 'signer', kicker: 'The holder · Signer', title: 'Ledger Flex', lines: ['sign-in · SIWE message', 'deposit · one ETH transfer', 'mandate · exception · EIP-712', 'withdrawal · EIP-712 authorisation'] },
  { id: 'ring', x: 860, y: 20, w: 300, h: 104, tone: 'ring', kicker: 'Ring CLI', title: 'Ledger Key Ring', lines: ['master secret, sealed', 'MCP keys derived from it', 'init: a Flex over USB, once'] },
  { id: 'browser', x: 40, y: 190, w: 300, h: 104, tone: 'signer', kicker: 'In the browser · clear signing', title: 'Signer Kit · DMK', lines: ['WebHID or Speculos', 'ERC-7730 descriptors, test key', 'signature → /api/signed'] },
  { id: 'bench', x: 440, y: 190, w: 320, h: 118, kicker: 'The server', title: 'Account · bots · scheduler', lines: ['account = proven address', 'bots, one round at a time', 'out-of-bounds requests, queued'] },
  { id: 'mcp', x: 860, y: 190, w: 300, h: 104, tone: 'agent', kicker: 'Agent Stack · read only', title: 'MCP · 10 tools', lines: ['bots · operations · decision', 'positions · vault_openness', 'hook_analysis · earn_yields'] },
  { id: 'bots', x: 40, y: 350, w: 300, h: 118, kicker: 'Execution agents · no LLM', title: 'The bots', lines: ['agent.py · DCA, v4 pools', 'vaults.py · yield, ERC-4626', 'session key: the vault only'] },
  { id: 'vault', x: 440, y: 420, w: 320, h: 118, kicker: 'The contract · Base fork', title: 'ExitVault', lines: ['verify mandate · ecrecover', 'buy(): swap + resale, same tx', 'enterVault(): deposit + redeem'] },
  { id: 'analyst', x: 860, y: 350, w: 300, h: 104, tone: 'agent', kicker: 'Agent Stack · Claude', title: 'The analyst', lines: ['reads through the MCP tools', 'cites each tool it called', 'no signing, no sending'] },
  { id: 'tare', x: 40, y: 540, w: 300, h: 104, kicker: 'The measure', title: 'TARE · counterfactual', lines: ['hook → 89 inert bytes', 'quoted twice: in, out', 'watch.py · re-probe, exit'] },
  { id: 'pools', x: 440, y: 580, w: 150, h: 104, kicker: 'Universe 1', title: 'Uniswap v4', lines: ['WETH long tail', 'six traps', '0 → 9 990 bps'] },
  { id: 'vaults', x: 610, y: 580, w: 150, h: 104, kicker: 'Universe 2', title: 'ERC-4626', lines: ['ten Morpho vaults', 'Moonwell door', '27 % closed'] },
  { id: 'walletcli', x: 860, y: 540, w: 300, h: 104, tone: 'agent', kicker: 'Agent Stack · tool', title: 'wallet-cli', lines: ['earn yields', 'yield · token · deposit', 'no exit field'] },
  { id: 'journal', x: 440, y: 724, w: 320, h: 90, kicker: 'The memory', title: 'journal · events', lines: ['decisions, per bot', 'holder gestures'] },
]

const EDGES: Edge[] = [
  { from: 'ledger', to: 'browser', label: 'signature (r, s, v)', via: 'h' },
  { from: 'ledger', to: 'bench', label: 'or bench side', via: 'v' },
  { from: 'ring', to: 'mcp', label: 'master secret', via: 'v' },
  { from: 'browser', to: 'bench', label: '/api/signed', via: 'h' },
  { from: 'bench', to: 'mcp', label: 'files', via: 'h' },
  { from: 'bench', to: 'bots', label: 'starts, stops', via: 'v', offset: -140 },
  { from: 'bench', to: 'vault', label: 'mandate · exception', via: 'v' },
  { from: 'bots', to: 'vault', label: 'session key', via: 'h', offset: 30 },
  { from: 'bots', to: 'tare', via: 'v' },
  { from: 'tare', to: 'pools', label: 'measures again', via: 'h' },
  { from: 'mcp', to: 'analyst', label: 'stdio', via: 'v' },
  { from: 'walletcli', to: 'analyst', label: 'one of its tools', via: 'v' },
  { from: 'vault', to: 'pools', via: 'v' },
  { from: 'vault', to: 'vaults', via: 'v' },
  { from: 'pools', to: 'journal', via: 'v' },
  { from: 'vaults', to: 'journal', via: 'v' },
]

/** A line never leaves its box: cut to what fits between the paddings, at `px` per glyph for the face it is set in. */
const clip = (t: string, w: number, px: number) => { const max = Math.floor((w - 32) / px); return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t }

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]))
const cx = (n: Node) => n.x + n.w / 2
const cy = (n: Node) => n.y + n.h / 2

/** One right angle, from the edge of one box to the edge of the other. `via` says which leg leaves first. */
function path(e: Edge): { d: string; a: [number, number]; b: [number, number]; label?: [number, number] } {
  const f = byId[e.from], t = byId[e.to]
  if (e.via === 'h') {
    // leave horizontally from f's side facing t, arrive vertically or horizontally into t
    const dir = cx(t) > cx(f) ? 1 : -1
    const ax = dir > 0 ? f.x + f.w : f.x
    const ay = cy(f) + (e.offset ?? 0)
    const sameRow = Math.abs(cy(t) - cy(f)) < 60
    if (sameRow) {
      const bx = dir > 0 ? t.x : t.x + t.w
      return { d: `M${ax} ${ay} H${bx}`, a: [ax, ay], b: [bx, ay], label: [(ax + bx) / 2, ay - 8] }
    }
    const bx = cx(t)
    const by = cy(t) > ay ? t.y : t.y + t.h
    return { d: `M${ax} ${ay} H${bx} V${by}`, a: [ax, ay], b: [bx, by], label: [(ax + bx) / 2, ay - 8] }
  }
  // leave vertically from f, arrive horizontally into t (or vertically if aligned)
  const down = cy(t) > cy(f)
  const ay = down ? f.y + f.h : f.y
  const aligned = !e.offset && (Math.abs(cx(t) - cx(f)) < 40 || (t.x < cx(f) && cx(f) < t.x + t.w))
  const ax = aligned ? Math.max(t.x + 20, Math.min(t.x + t.w - 20, cx(f))) : cx(f) + (e.offset ?? 0)
  if (aligned) {
    const by = down ? t.y : t.y + t.h
    return { d: `M${ax} ${ay} V${by}`, a: [ax, ay], b: [ax, by], label: [ax + 8, (ay + by) / 2] }
  }
  const by = cy(t)
  const bx = cx(t) > ax ? t.x : t.x + t.w
  return { d: `M${ax} ${ay} V${by} H${bx}`, a: [ax, ay], b: [bx, by], label: [ax + 8, (ay + by) / 2] }
}

const TONE: Record<NonNullable<Node['tone']> | 'default', string> = {
  signer: 'var(--color-accent)',
  agent: 'var(--color-state-success)',
  ring: 'var(--color-state-info)',
  default: 'var(--color-page-hairline-strong)',
}

/**
 * Live: the demo lights the map from the bench's state. A node takes a tone and its lines are replaced by what is
 * happening now. An edge named "from>to" is drawn hot. `stamp` changes whenever the activity changes, so the hot
 * parts blink on again (the hero's pulse table, in CSS steps), never fade.
 */
/**
 * The colour code, one meaning each: `hot` is acting now (incandescent), `asks` waits for the holder on the Flex
 * (gold), `ok` is signed or entered (green), `refused` is refused by the vault (red). A node the journey has not
 * reached yet is dimmed and dashed; it rises in when reached. An edge is drawn along its length when both its
 * ends are reached, and takes the colour of the thing travelling it when it is live.
 */
export type LiveTone = 'hot' | 'ok' | 'refused' | 'asks'
export type MapSlot = { name: string; state: 'live' | 'running' | 'stopped' | 'done' }
/** `hot` lights one of the node's lines (the Ledger's gesture in progress); `slots` draws the agents' places, filled as they come. */
export type LiveNode = { tone?: LiveTone; lines?: string[]; hot?: number; slots?: MapSlot[] }
/** `reached`: the nodes the journey has touched so far. `liveTone`: the colour a live edge takes (default incandescent). */
export type MapLive = { nodes: Record<string, LiveNode>; edges: string[]; reached?: Set<string>; liveTone?: LiveTone; stamp: string }

/** A region of the map, in its own units, the live stage zooms to: the group is scaled and translated to fit it. */
export type MapFocus = { x: number; y: number; w: number; h: number }
export const MAP_SIZE = { w: W, h: H }

export function SchemaMap({ live, focus, fit = false }: { live?: MapLive; focus?: MapFocus; fit?: boolean } = {}) {
  const f = focus ?? { x: 0, y: 0, w: W, h: H }
  const k = Math.min(W / f.w, H / f.h)
  const tx = -f.x * k + (W - f.w * k) / 2
  const ty = -f.y * k + (H - f.h * k) / 2
  const svg = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={fit ? '100%' : undefined} style={fit ? { display: 'block' } : { minWidth: 900, display: 'block' }} role="img" aria-labelledby="schema-map-title">
        <g className="map-view" style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})`, transformOrigin: '0 0' }}>
        <title id="schema-map-title">Overview: the holder and their Ledger, the site, the bots, the contract, the TARE measure, the MCP, the analyst, the Key Ring</title>
        <g fill="none" stroke="var(--color-accent)" strokeWidth={1}>
          {EDGES.map((e, i) => {
            const p = path(e)
            const hot = live?.edges.includes(`${e.from}>${e.to}`)
            const drawn = !live?.reached || (live.reached.has(e.from) && live.reached.has(e.to))
            return <path key={i} d={p.d} pathLength={1} className={`map-edge ${drawn ? 'is-drawn' : ''} ${hot ? `is-live tone-${live!.liveTone ?? 'hot'}` : ''}`} />
          })}
        </g>
        <g fill="var(--color-accent)">
          {EDGES.map((e, i) => {
            const p = path(e)
            const hot = live?.edges.includes(`${e.from}>${e.to}`)
            const drawn = !live?.reached || (live.reached.has(e.from) && live.reached.has(e.to))
            return <g key={i} className={`map-dots ${drawn ? 'is-drawn' : ''} ${hot ? `is-live tone-${live!.liveTone ?? 'hot'}` : ''}`}><circle cx={p.a[0]} cy={p.a[1]} r={hot ? 4 : 2.5} /><circle cx={p.b[0]} cy={p.b[1]} r={hot ? 4 : 2.5} /></g>
          })}
        </g>
        {NODES.map((n) => {
          const l = live?.nodes[n.id]
          const lines = l?.lines ?? n.lines
          const reached = !live?.reached || live.reached.has(n.id)
          return (
            <g key={n.id} className={`map-node ${reached ? 'is-reached' : 'is-ahead'} ${l?.tone ? `is-${l.tone}` : ''}`} data-node={n.id} style={{ transformOrigin: `${cx(n)}px ${cy(n)}px` }}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="var(--color-page-panel)" stroke={TONE[n.tone ?? 'default']} strokeWidth={1} strokeDasharray={reached ? undefined : '4 4'} />
              <text x={n.x + 16} y={n.y + 20} fill="var(--color-page-text-faint)" style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase' }}>{clip(n.kicker.toUpperCase(), n.w, 7.4)}</text>
              <text x={n.x + 16} y={n.y + 44} fill="var(--color-text-050)" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{n.title.toUpperCase()}</text>
              {l?.slots ? (
                <g className="map-slots">
                  {Array.from({ length: 4 }, (_, i) => {
                    const slots = l.slots!
                    const more = i === 3 && slots.length > 4 ? slots.length - 3 : 0
                    const sl = slots[i]
                    const sx = n.x + 16 + (i % 2) * 138
                    const sy = n.y + 54 + Math.floor(i / 2) * 28
                    const colour = !sl ? 'var(--color-page-hairline)' : more ? 'var(--color-page-hairline-strong)' : sl.state === 'live' ? 'var(--color-accent-incandescent)' : sl.state === 'running' ? 'var(--color-state-success)' : 'var(--color-page-hairline-strong)'
                    return (
                      <g key={i} className={`map-slot ${sl ? `is-${more ? 'more' : sl.state}` : 'is-empty'}`}>
                        <rect x={sx} y={sy} width={130} height={22} rx={4} fill={sl ? 'var(--color-page-surface-lift)' : 'none'} stroke={colour} strokeWidth={sl && sl.state === 'live' ? 1.5 : 1} strokeDasharray={sl ? undefined : '3 3'} />
                        {sl && !more ? <circle cx={sx + 10} cy={sy + 11} r={3} fill={sl.state === 'live' ? 'var(--color-accent-incandescent)' : sl.state === 'running' ? 'var(--color-state-success)' : 'var(--color-page-text-faint)'} /> : null}
                        <text x={sx + (sl && !more ? 19 : 8)} y={sy + 15} fill={sl ? 'var(--color-text-050)' : 'var(--color-page-text-faint)'} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{more ? `+${more} more` : sl ? sl.name.slice(0, 15) : `slot ${i + 1}`}</text>
                      </g>
                    )
                  })}
                </g>
              ) : lines.slice(0, 4).map((t, i) => (
                <text key={`${t}-${i}`} className={l?.lines || l?.hot != null ? 'map-line rise-in' : 'map-line'} x={n.x + 16} y={n.y + 64 + i * 16} fill={l?.hot === i ? 'var(--color-accent-incandescent)' : l?.hot != null ? 'var(--color-page-text-faint)' : l?.lines ? 'var(--color-text-050)' : 'var(--color-page-text-mute)'} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: l?.hot === i ? 700 : 400 }}>{clip(t, n.w, 6.95)}</text>
              ))}
            </g>
          )
        })}
        {/* The edge labels, drawn last so a short run never hides its word under a box; a halo in the canvas colour keeps them legible over a hairline. */}
        <g fill="var(--color-page-text-faint)" stroke="var(--color-canvas-night)" strokeWidth={3} strokeLinejoin="round" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 0.3, paintOrder: 'stroke' }}>
          {EDGES.map((e, i) => { if (!e.label) return null; const p = path(e); return <text key={i} x={p.label![0]} y={p.label![1]} textAnchor={e.via === 'h' ? 'middle' : 'start'}>{e.label}</text> })}
        </g>
        </g>
      </svg>
  )
  return fit ? svg : <div className="data-scroll">{svg}</div>
}
