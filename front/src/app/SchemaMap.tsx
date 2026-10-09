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
  { id: 'ledger', x: 440, y: 20, w: 320, h: 104, tone: 'signer', kicker: 'Le porteur · Signer', title: 'Ledger Flex', lines: ['connexion, mandat (une fois),', 'chaque dérogation — jamais un achat', 'BUDGET · MAX LOSS · EXPIRES'] },
  { id: 'ring', x: 860, y: 20, w: 300, h: 104, tone: 'ring', kicker: 'Ring CLI · garder un secret', title: 'Ledger Key Ring', lines: ['scelle le secret maître', 'dont dérivent les clés MCP', 'une fois, un Flex en USB'] },
  { id: 'browser', x: 40, y: 190, w: 300, h: 104, tone: 'signer', kicker: 'Dans le navigateur du client', title: 'Signer Kit · DMK', lines: ['WebHID (vraie Ledger) ou Speculos', 'nos descripteurs, signés par nous', 'le serveur ne voit pas l’appareil'] },
  { id: 'bench', x: 440, y: 190, w: 320, h: 118, kicker: 'Le site', title: 'Compte · bots · ordonnanceur', lines: ['un compte = une adresse prouvée', 'bots nommés, un tour à la fois', 'demandes hors bornes en file'] },
  { id: 'mcp', x: 860, y: 190, w: 300, h: 104, tone: 'agent', kicker: 'Agent Stack · lecture seule', title: 'MCP · 10 outils', lines: ['bots · operations · decision', 'positions · vault_openness', 'hook_analysis · earn_yields'] },
  { id: 'bots', x: 40, y: 350, w: 300, h: 118, kicker: 'Ils agissent · sans LLM', title: 'Les bots', lines: ['agent.py : DCA longue traîne v4', 'vaults.py : rendement affiché', 'ne voient jamais la sortie'] },
  { id: 'vault', x: 440, y: 420, w: 320, h: 118, kicker: 'Le contrat · fork de Base', title: 'ExitVault', lines: ['mandat vérifié par ecrecover', 'buy() : achat + revente, même tx', 'enterVault() : dépôt + retrait'] },
  { id: 'analyst', x: 860, y: 350, w: 300, h: 104, tone: 'agent', kicker: 'Le vrai agent · Claude', title: 'L’analyste du compte', lines: ['répond par les outils, cite tout', 'ne signe, n’envoie, n’arrête rien', 'une clé par compte, dérivée'] },
  { id: 'tare', x: 40, y: 540, w: 300, h: 104, kicker: 'La mesure', title: 'TARE · contrefactuel', lines: ['hook → 89 octets inertes, coté 2×', 'l’écart = ce que le hook prend', 'watch.py : resonde, sort à temps'] },
  { id: 'pools', x: 440, y: 580, w: 150, h: 104, kicker: 'Univers 1', title: 'Uniswap v4', lines: ['longue traîne WETH', 'six pièges réels', '0 → 9 990 bps'] },
  { id: 'vaults', x: 610, y: 580, w: 150, h: 104, kicker: 'Univers 2', title: 'ERC-4626', lines: ['dix coffres Morpho', 'Moonwell : porte', 'fermée à 27 %'] },
  { id: 'walletcli', x: 860, y: 540, w: 300, h: 104, tone: 'agent', kicker: 'Agent Stack · leur outil', title: 'wallet-cli', lines: ['earn yields : rendement, jeton,', 'dépôt — rien sur la sortie', 'lu par l’analyste'] },
  { id: 'journal', x: 440, y: 724, w: 320, h: 76, kicker: 'La mémoire', title: 'journal · events', lines: ['chaque décision porte son bot', 'chaque geste du porteur'] },
]

const EDGES: Edge[] = [
  { from: 'ledger', to: 'browser', label: 'signature (r, s, v)', via: 'h' },
  { from: 'ledger', to: 'bench', label: 'ou côté banc', via: 'v' },
  { from: 'ring', to: 'mcp', label: 'secret maître', via: 'v' },
  { from: 'browser', to: 'bench', label: '/api/signed', via: 'h' },
  { from: 'bench', to: 'mcp', label: 'fichiers', via: 'h' },
  { from: 'bench', to: 'bots', label: 'lance, arrête', via: 'v', offset: -140 },
  { from: 'bench', to: 'vault', label: 'mandat · dérogation', via: 'v' },
  { from: 'bots', to: 'vault', label: 'clé de session', via: 'h', offset: 30 },
  { from: 'bots', to: 'tare', via: 'v' },
  { from: 'tare', to: 'pools', label: 'remesure', via: 'h' },
  { from: 'mcp', to: 'analyst', label: 'stdio', via: 'v' },
  { from: 'walletcli', to: 'analyst', label: 'un de ses outils', via: 'v' },
  { from: 'vault', to: 'pools', via: 'v' },
  { from: 'vault', to: 'vaults', via: 'v' },
  { from: 'pools', to: 'journal', via: 'v' },
  { from: 'vaults', to: 'journal', via: 'v' },
]

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

export function SchemaMap() {
  return (
    <div className="data-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 900, display: 'block' }} role="img" aria-labelledby="schema-map-title">
        <title id="schema-map-title">Vue d’ensemble : le porteur et sa Ledger, le site, les bots, le contrat, la mesure TARE, le MCP, l’analyste, le Key Ring</title>
        <g fill="none" stroke="var(--color-accent)" strokeWidth={1}>
          {EDGES.map((e, i) => { const p = path(e); return <path key={i} d={p.d} /> })}
        </g>
        <g fill="var(--color-accent)">
          {EDGES.map((e, i) => { const p = path(e); return <g key={i}><circle cx={p.a[0]} cy={p.a[1]} r={2.5} /><circle cx={p.b[0]} cy={p.b[1]} r={2.5} /></g> })}
        </g>
        <g fill="var(--color-page-text-faint)" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 0.3 }}>
          {EDGES.map((e, i) => { if (!e.label) return null; const p = path(e); return <text key={i} x={p.label![0]} y={p.label![1]} textAnchor={e.via === 'h' ? 'middle' : 'start'}>{e.label}</text> })}
        </g>
        {NODES.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="var(--color-page-panel)" stroke={TONE[n.tone ?? 'default']} strokeWidth={1} />
            <text x={n.x + 16} y={n.y + 20} fill="var(--color-page-text-faint)" style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase' }}>{n.kicker.toUpperCase()}</text>
            <text x={n.x + 16} y={n.y + 44} fill="var(--color-text-050)" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{n.title.toUpperCase()}</text>
            {n.lines.map((l, i) => (
              <text key={i} x={n.x + 16} y={n.y + 64 + i * 16} fill="var(--color-page-text-mute)" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{l}</text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
