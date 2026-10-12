/**
 * /account — what is mine, on the home's surface. The funds, signed on the Ledger (the vault, a deposit from the
 * device, a withdrawal to it); the analyst, the one real agent, read only; the MCP key and the Claude configuration;
 * what I did. The Ledger signs two things on this page: the deposit (one ETH transfer, the only transaction it ever
 * signs) and the withdrawal authorisation (EIP-712, read in clear).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ProductPage, Sheets } from './shell'
import { AnalystThread } from './analyst'
import { useBench } from '../../app/useBench'
import { useLogin } from '../../app/session'
import { EVENT_LABELS, fmtWei, getAccount, short, type Account, type BenchState } from '../../app/api'
import { linkProps } from '../../app/router'
import { Field, SignOnDevice, Skeleton, dateTime, time } from '../../app/ui'
import { Badge, Band, hotTitle, Kicker, Mark, Note, Panel, Source, Takeaway, Title } from '../landing/primitives'
import type { HotTitle } from '../landing/content'

const HERO = { title: 'ACCOUNT', catch: 'Your Ledger is your account. What is yours lives here.', heading: 'My account' }

const FUNDS = {
  title: ['Your funds, ', 'signed on your Ledger.', ''] as HotTitle,
  takeaway: 'A vault in your name · funded from your Ledger · back on an authorisation read in clear',
  lead: 'The vault is a contract you own. Its funds come from your Ledger: one ETH transfer, kept as WETH. They come back on an authorisation you read on the device. Your bots can only call the vault, inside the bounds you sign.',
  note: ['One ETH transfer is ', 'the only transaction your Ledger signs', ', readable by any Ethereum app. The withdrawal is an EIP-712 message read in clear: the bench executes it and pays the gas, without being able to change a digit.'] as const,
  source: 'contracts/src/ExitVault.sol, receive() and withdrawWithAuthorization() (six tests). front/APP.md, “The funds, signed on the Ledger”.',
}
const ANALYST = {
  title: ['It understands. ', 'It can do nothing.', ''] as HotTitle,
  takeaway: 'Claude on ten read-only tools · a key derived from your address · the tool cited under every number',
  lead: 'An agent wired to your account, read only. It does not answer from memory: it queries your bots, your decisions, your positions and the measures, and names the tool behind every figure.',
  source: 'mcp/pds_mcp.py, ten tools, none of which signs, sends or stops a bot. README.md, “L’analyste”.',
}
const KEY = {
  title: ['Your Claude ', 'reads your vault.', ''] as HotTitle,
  takeaway: 'Derived from a master secret and your address · written nowhere · read only',
  lead: 'This key is derived from a master secret and your address; it is stored nowhere. Pasted into your own Claude, it opens your data read only: your bots, your decisions, your positions. Nothing else.',
  source: 'web/accounts.py: HMAC-SHA256(master, address). scripts/ring-seal.sh: the master secret sealed in the Ledger Key Ring.',
}
const HISTORY = {
  title: ['What ', 'you did.', ''] as HotTitle,
  takeaway: 'Every gesture, newest first · the bench’s own log under it',
}

export function AccountPage() {
  return (
    <ProductPage route="/account" hero={HERO} skip="funds">
      <Sections />
    </ProductPage>
  )
}

function Sections() {
  const { state } = useBench()
  if (!state) return null
  return (
    <Sheets>
      <Band id="funds" label="Your funds, signed on your Ledger">
        <Takeaway>{FUNDS.takeaway}</Takeaway>
        <Title size="xl" className="max-w-[16ch]">{hotTitle(FUNDS.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{state.vault ? FUNDS.lead : state.network === 'live' ? `A vault is deployed at the address your Ledger proved, on the live network (chain ${state.chain_id ?? '…'}). Nothing is credited: the funds come from your Ledger.` : 'A vault is deployed at the address your Ledger proved, on a Base fork at block 50 614 000. Open the session: the bench puts 5 fictional ETH on your address to deposit from.'}</p>
        <div className="mt-10" data-wipe><Funds s={state} /></div>
        {state.vault ? <div className="mt-8"><Note>{FUNDS.note[0]}<Mark>{FUNDS.note[1]}</Mark>{FUNDS.note[2]}</Note></div> : null}
        <Source>{FUNDS.source}</Source>
      </Band>

      <Band id="analyst" label="Your analyst" lift={1}>
        <Takeaway>{ANALYST.takeaway}</Takeaway>
        <Title className="max-w-[18ch]">{hotTitle(ANALYST.title)}</Title>
        <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{ANALYST.lead}</p>
        <div className="mt-10 max-w-[860px]" data-wipe><AnalystThread s={state} /></div>
        <Source>{ANALYST.source}</Source>
      </Band>

      <Band id="key" label="Your key and your address" lift={2} full>
        <div className="mx-auto max-w-[1200px]">
          <Takeaway>{KEY.takeaway}</Takeaway>
          <Title className="max-w-[16ch]">{hotTitle(KEY.title)}</Title>
          <p data-lead className="t-body-lg mt-8 max-w-[62ch] text-pretty text-page-text-mute">{KEY.lead}</p>
          <div className="mt-10" data-wipe><Keys s={state} /></div>
          <Source>{KEY.source}</Source>
        </div>
      </Band>

      <Band id="history" label="What you did">
        <Takeaway>{HISTORY.takeaway}</Takeaway>
        <Title className="max-w-[16ch]">{hotTitle(HISTORY.title)}</Title>
        <div className="mt-10" data-wipe><History s={state} /></div>
      </Band>
    </Sheets>
  )
}

function Kv({ k, v }: { k: ReactNode; v: ReactNode }) {
  return <div className="kv__row"><dt className="t-mono-data text-page-text">{k}</dt><dd className="t-body-md m-0 text-page-text-mute">{v}</dd></div>
}

/* ─── the funds: the vault, a deposit from the Ledger, a withdrawal to it, the device ─── */

const PATH_LABEL = { browser: 'my Ledger · this browser', dmk: 'Signer Kit · bench', python: 'APDU client · bench' } as const

function Funds({ s }: { s: BenchState }) {
  const { act } = useBench()
  const [busy, setBusy] = useState(false)
  const [dep, setDep] = useState('0.5')
  const [wd, setWd] = useState('all')
  const waiting = !!s.signing || !!s.pending
  const eth = (wei: string) => `${(Number(wei || '0') / 1e18).toFixed(4)} ETH`
  const open = async () => { setBusy(true); await act('/boot'); setBusy(false) }
  const deposit = async (e: React.FormEvent) => { e.preventDefault(); await act('/deposit', { amount_eth: dep }) }
  const withdraw = async (e: React.FormEvent) => { e.preventDefault(); const a = wd.trim().toLowerCase(); await act('/withdraw', { amount: a === '' || a === 'all' || a === 'tout' ? 'tout' : wd.trim() }) }
  if (!s.vault) {
    return (
      <Panel lift={2}>
        <Kicker>No vault yet</Kicker>
        <p className="t-body-md m-0 max-w-[60ch] text-pretty text-page-text-mute">{s.anvil ? 'One click deploys a vault in your name. Nothing is signed yet: the mandate comes after.' : 'The Base fork is not running: the session cannot open. Start the bench at the root of the repository.'}</p>
        <div className="mt-5"><button type="button" className="btn-ghost btn-ghost--hot t-button-cap" onClick={open} disabled={busy || !s.anvil}>{busy ? 'Opening…' : 'Open the session'}</button></div>
      </Panel>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <Panel lift={2}>
          <Kicker>The vault</Kicker>
          <dl className="kv">
            <Kv k="Owner" v={short(s.owner, 10, 8)} />
            <Kv k="Contract" v={short(s.vault, 10, 8)} />
            <Kv k="Available" v={fmtWei(s.weth)} />
            <Kv k="Spent under mandate" v={fmtWei(s.spent)} />
            <Kv k="Positions" v={`${s.positions.length}${s.positions.some((p) => p.under_exception) ? ', some under exception' : ''}`} />
            <Kv k="Mandate" v={s.signed ? <span className="is-success">signed</span> : <span className="text-page-text-faint">to sign, on the <a {...linkProps('/demo', '#map')} className="underline">live map</a></span>} />
          </dl>
        </Panel>
      </div>
      <div className="xl:col-span-4">
        <Panel lift={3}>
          <Kicker>Your funds · signed on your Ledger</Kicker>
          <dl className="kv"><Kv k="Your address" v={eth(s.owner_eth)} /></dl>
          <form className="mt-5 flex flex-col gap-3" onSubmit={deposit}>
            <Field label="Deposit (ETH)" type="number" step="any" min={0} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} disabled={waiting} />
            <div><SignOnDevice type="submit" disabled={waiting || s.signer !== 'browser'}>Deposit from my Ledger</SignOnDevice></div>
            {s.signer !== 'browser' ? <p className="t-caption m-0 text-page-text-faint">The deposit is signed in this page: choose “My Ledger · this browser” at the <a {...linkProps('/connexion')} className="underline">door</a>.</p> : null}
          </form>
          <form className="mt-5 flex flex-col gap-3" onSubmit={withdraw}>
            <Field label="Withdraw (WETH)" value={wd} onChange={(e) => setWd(e.target.value)} placeholder="all" disabled={waiting} />
            <div><button type="submit" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" disabled={waiting}>Withdraw to my Ledger</button></div>
          </form>
          {waiting ? <p className="t-caption m-0 mt-4 text-hot">The Flex is waiting for you: {s.signing === 'deposit' ? 'the deposit' : s.signing === 'withdraw' ? 'the withdrawal authorisation' : s.signing ?? 'a signature'}.</p> : null}
        </Panel>
      </div>
      <div className="xl:col-span-4">
        <Panel lift={2}>
          <Kicker>The device</Kicker>
          <dl className="kv">
            <Kv k="Signing path" v={PATH_LABEL[s.signer]} />
            <Kv k="Bench Flex" v={s.speculos ? <span className="is-success">powered on</span> : <span className="text-page-text-faint">powered off</span>} />
            <Kv k={s.network === 'live' ? 'Live network' : 'Base fork'} v={s.anvil ? <span className="is-success">{s.network === 'live' ? `chain ${s.chain_id ?? '…'}` : `block ${s.fork_block}, online`}</span> : <span className="text-page-text-faint">stopped</span>} />
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a {...linkProps('/connexion')} className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap">Change the device</a>
            <a {...linkProps('/demo', '#map')} className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap">The live map</a>
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ─── the address, the MCP key, the Claude configuration ─── */

function Keys({ s }: { s: BenchState }) {
  const { act, say } = useBench()
  const { logout } = useLogin()
  const [account, setAccount] = useState<Account | null>(null)
  const [reveal, setReveal] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState<'key' | 'config' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const address = s.address

  const load = useCallback(async () => {
    if (!address) { setAccount(null); return }
    try { setAccount(await getAccount(reveal)) } catch { /* the bench is down: the page says so elsewhere */ }
  }, [address, reveal])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!address) return
    const t = window.setInterval(load, 6000)
    return () => window.clearInterval(t)
  }, [address, load])

  const config = account ? JSON.stringify(account.mcp_config, null, 2) : ''
  /** One click: fetch the key in clear (it is derived on the server, never stored), copy it, done. */
  const copyText = async (what: 'key' | 'config') => {
    try {
      const a = await getAccount(true)
      await navigator.clipboard.writeText(what === 'key' ? a.mcp_key : JSON.stringify(a.mcp_config, null, 2))
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      say('Cannot copy: this browser refuses the clipboard.')
    }
  }
  const reset = async () => { setConfirming(false); await act('/reset') }
  const ring = (s.ring ?? null) as { initialised?: boolean } | null
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-5">
        <Panel lift={3}>
          <Kicker>The address, proven by your Ledger</Kicker>
          <p className="t-mono-data-lg m-0 break-all text-page-text">{address}</p>
          <dl className="kv mt-5">
            <Kv k="Since" v={dateTime(account?.profile.created)} />
            <Kv k="Sign-ins" v={account?.profile.logins ?? '·'} />
            <Kv k="Last path" v={account?.profile.last_via ?? '·'} />
            <Kv k="Vault" v={s.vault ? short(s.vault, 10, 8) : 'not opened'} />
            <Kv k="Mandate" v={s.signed ? <span className="is-success">signed</span> : <span className="text-page-text-faint">to sign</span>} />
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={logout}>Sign out</button>
            {confirming ? (
              <>
                <button type="button" className="btn-ghost btn-ghost--small t-button-cap" onClick={reset}>Confirm the reset</button>
                <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setConfirming(false)}>Keep everything</button>
              </>
            ) : (
              <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setConfirming(true)}>Reset</button>
            )}
          </div>
          {confirming ? <p className="t-caption m-0 mt-3 is-warning">Reset this account? The mandate and the bots are deleted; the vault stays on the chain.</p> : null}
        </Panel>
      </div>
      <div className="xl:col-span-7">
        <Panel lift={3}>
          <Kicker>The MCP key</Kicker>
          <p className="t-mono-data-lg m-0 break-all text-page-text">{account?.mcp_key ?? '·'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-ghost btn-ghost--small t-button-cap" onClick={() => setReveal((v) => !v)}>{reveal ? 'Hide' : 'Reveal'}</button>
            <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setShowConfig((v) => !v)}>{showConfig ? 'Close the configuration' : 'Claude configuration'}</button>
            <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => copyText('key')}>{copied === 'key' ? 'Key copied' : 'Copy the key'}</button>
            <button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => copyText('config')}>{copied === 'config' ? 'Configuration copied' : 'Copy the configuration'}</button>
          </div>
          {showConfig ? (
            <div className="mt-6">
              <Kicker>To paste into Claude’s MCP configuration</Kicker>
              <pre className="t-mono-data m-0 overflow-auto whitespace-pre-wrap break-all is-info">{config || '…'}</pre>
              <p className="t-caption m-0 mt-4 text-page-text-faint">This configuration launches the MCP on the bench’s machine: it reads your files there. Elsewhere it would have to be served over HTTP. On this site, your analyst already has it.</p>
            </div>
          ) : (
            <p className="t-body-md m-0 mt-6 max-w-[60ch] text-pretty text-page-text-mute">Ten tools, all read only: <span className="t-mono-data is-info">bots · operations · decision · positions · mandate · compare_entry_exit · universe_facts · hook_analysis · vault_openness · ledger_earn_yields</span>. None signs, sends or stops a bot.</p>
          )}
          <p className="t-caption m-0 mt-5 text-page-text-faint">
            The master secret it derives from can be sealed in the operator’s Ledger Key Ring: one key to protect for every account. {ring ? (ring.initialised ? 'Key Ring: initialised on this machine.' : 'Key Ring: not initialised here (wallet-cli ring init needs a Flex over USB).') : ''}
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* ─── what I did ─── */

function History({ s }: { s: BenchState }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [all, setAll] = useState(false)
  const address = s.address
  useEffect(() => {
    if (!address) return
    let live = true
    const load = async () => { try { const a = await getAccount(false); if (live) setAccount(a) } catch { /* said elsewhere */ } }
    load()
    const t = window.setInterval(load, 6000)
    return () => { live = false; window.clearInterval(t) }
  }, [address, s.journal.length, s.bots.length, s.signed])
  return (
    <>
      {account?.events.length ? (
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Time</th><th>Gesture</th><th>Detail</th></tr></thead>
            <tbody>
              {account.events.slice().reverse().slice(0, all ? undefined : 60).map((e, i) => {
                const { ts, kind, ...rest } = e
                const detail = Object.entries(rest)
                  .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                  .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                  .join(' · ')
                const tone = kind === 'exception_signed' ? 'warning' : kind === 'mandate_signed' ? 'success' : kind === 'exception_refused' ? 'error' : null
                return (
                  <tr key={i}>
                    <td>{time(ts as number)}</td>
                    <td className="label">{tone ? <Badge tone={tone}>{EVENT_LABELS[kind] ?? kind}</Badge> : <span className="text-page-text">{EVENT_LABELS[kind] ?? kind}</span>}</td>
                    <td className="label is-mute" style={{ overflowWrap: 'anywhere' }}>{detail || '·'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : account ? <p className="t-body-md m-0 text-page-text-mute">Nothing yet.</p> : <Skeleton rows={4} />}
      {account && account.events.length > 60 && !all ? <div className="mt-4"><button type="button" className="btn-ghost btn-ghost--quiet btn-ghost--small t-button-cap" onClick={() => setAll(true)}>Show all {account.events.length} gestures</button></div> : null}
      {s.log.length ? (
        <details className="mt-10">
          <summary className="t-kicker cursor-pointer text-page-text-faint">The bench’s log · {s.log.length} lines</summary>
          <pre className="log t-mono-data mt-4 m-0">{s.log.slice(-80).join('\n')}</pre>
        </details>
      ) : null}
    </>
  )
}
