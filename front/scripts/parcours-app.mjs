#!/usr/bin/env node
// The whole product journey through the site's pages, in headless Chromium, against the live bench (port 8099 behind
// the Vite proxy) and the emulated Flex. An automatic holder must approve the device screens:
//   python3 ../scripts/porteur.py 3600 2 &
//   node scripts/parcours-app.mjs [output dir]
// Or a person approves, with no holder at all: APPROVER=page makes every approval a gesture on the Flex picture the
// page itself shows (a click is a tap, a drag to the left turns the page, a hold signs) — as a juror would on the site.
//   APPROVER=page FRONT_URL=https://netout.tech node scripts/parcours-app.mjs
// The pages: /connexion (the door), /account (funds, analyst, keys, history), /demo#map (the live map: bounds, the
// mandate), /trades (agents, requests, positions, journal). The Ledger signs: the sign-in, the deposit, the mandate,
// each exception, the withdrawal.
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.FRONT_URL || 'http://127.0.0.1:5173'
const OUT = process.argv[2] || 'design-shots/app'
fs.mkdirSync(OUT, { recursive: true })
const T0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`)
let failed = false
const fail = (m) => { failed = true; log('ÉCHEC : ' + m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true, args: ['--disable-3d-apis'] })   // no WebGL: the hero shows its poster, the pages stay fast
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' })
await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
const page = await ctx.newPage()
page.on('dialog', (d) => d.accept())
page.on('pageerror', (e) => log('erreur page : ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/502|Failed to load/.test(m.text())) log('console : ' + m.text().slice(0, 180)) })
// every POST the page makes to the bench, with its answer: what the page asked, and what the bench said
page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/')) log('    → POST ' + r.url().replace(URL, '')) })
page.on('response', async (r) => { if (r.request().method() === 'POST' && r.url().includes('/api/')) { const t = await r.text().catch(() => ''); log(`    ← ${r.status()} ${r.url().replace(URL, '')} ${t.slice(0, 140).replace(/\s+/g, ' ')}`) } })
page.on('requestfailed', (r) => { if (r.url().includes('/api/') && !r.url().includes('/api/screen')) log('    ✗ ' + r.method() + ' ' + r.url().replace(URL, '') + ' ' + (r.failure()?.errorText ?? '')) })

const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()))
const api = (path, body = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [path, body])
async function until(pred, label, timeout = 120000, every = 1200) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(); if (pred(s)) { log('ok  ' + label); await handFree(); return s } await sleep(every) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}
// a person finishes their gesture on the device before they click anything else on the page (APPROVER=page)
let handBusy = false
const handFree = async () => { while (handBusy) await sleep(100) }
const btn = (name, exact = false) => page.getByRole('button', { name, exact }).first()
const chip = (text) => page.locator('button.segment', { hasText: text }).first()
/** The sheets reveal on scroll (Florent's motion): walk the page once so everything is on, then come back up. */
const reveal = async () => {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 500) { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(90) }
  await sleep(700); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(250)
}
const go = async (label) => { await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: label, exact: true }).click(); await sleep(1200); await reveal(); log(`    page ${page.url().replace(URL, '')} · toasts : ${(await page.locator('.toast').allInnerTexts()).join(' | ') || 'none'}`) }
const liveMap = async () => { await go('Demo'); await sleep(1500) }   // the demo is the live map (12 October, Florent's v2)
const shot = async (name, full = true) => { if (full) await reveal(); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }) }

for (let i = 0; i < 120; i++) { try { const r = await fetch(URL + '/speculos/events?currentscreenonly=true'); if (r.ok) break } catch {} await sleep(500) }

// APPROVER=page · a person at the page: they read the Flex screen and answer it on the picture the page shows. If the
// device waits and the page shows no Flex, a person could not sign there: that is a failure of the page, named.
const BY_HAND = process.env.APPROVER === 'page'
let handOn = BY_HAND, handGestures = 0
const screenNow = () => page.evaluate(() => fetch('/speculos/events?currentscreenonly=true').then((r) => r.json()).then((j) => j.events || []).catch(() => [])).catch(() => [])
async function gesture(kind, x = 0, y = 0) {
  const img = page.locator('.device-frame img:visible').first()
  if (!(await img.count())) return false
  await img.scrollIntoViewIfNeeded().catch(() => {})
  const box = await img.boundingBox(); if (!box) return false
  const [w, h] = await img.evaluate((i) => [i.naturalWidth || 480, i.naturalHeight || 600])
  const at = (dx, dy) => [box.x + (dx / w) * box.width, box.y + (dy / h) * box.height]
  handBusy = true
  try {
  if (kind === 'swipe') { const [a, b] = at(400, 300); const [c, d] = at(80, 300); await page.mouse.move(a, b); await page.mouse.down(); await sleep(150); await page.mouse.move(c, d, { steps: 6 }); await page.mouse.up() }
  else { const [a, b] = at(x, y); await page.mouse.move(a, b); await page.mouse.down(); await sleep(kind === 'hold' ? 3200 : 150); await page.mouse.up() }
  handGestures++; await sleep(800); return true
  } finally { handBusy = false }
}
async function byHand() {
  let missed = '', seen = ''
  while (handOn) {
    try {
      // a person answers the device when the page asked for a signature (or while signing in), not a screen in passing
      const st = await page.evaluate(() => fetch('/api/state').then((r) => r.json()).catch(() => null)).catch(() => null)
      if (!st || (st.address && !st.signing && !st.pending)) { seen = ''; await sleep(500); continue }
      const e = await screenNow(); const tx = e.map((x) => x.text || '').filter(Boolean); const low = tx.join(' | ').toLowerCase()
      if (tx.join('|') !== seen) { seen = tx.join('|'); await sleep(450); continue }   // the same screen twice: it has settled
      const find = (f) => e.find((x) => f((x.text || '').trim().toLowerCase()))
      let hit, act = null
      if ((hit = find((t) => t.includes('maybe later')))) act = ['tap', 240, hit.y + 10]
      else if ((hit = find((t) => t.includes('hold to sign')))) { await sleep(1000); act = ['hold', 240, hit.y + 10] }   // a person reads before signing
      else if ((hit = find((t) => t.includes('reject transaction')))) act = ['tap', 240, hit.y + 10]
      else if ((hit = find((t) => t.includes('accept risk')))) act = ['tap', 240, hit.y + 10]
      else if (low.includes('reject') || low.includes('swipe to review')) act = ['swipe']
      if (act) {
        if (await gesture(...act)) missed = ''
        else { const where = page.url().replace(URL, '') || '/'; if (missed !== where) { missed = where; fail(`${where} : la Flex émulée attend (« ${tx.slice(0, 3).join(' · ')} ») et la page ne la montre pas — une personne ne pourrait pas signer ici`) } await sleep(1500) }
        continue
      }
    } catch { /* the page navigates under the hand: look again */ }
    await sleep(500)
  }
}
const handLoop = BY_HAND ? byHand() : null
if (BY_HAND) log('approbations : à la main, par des gestes sur la Flex que montre la page (pas de porteur)')
const handDone = async () => { handOn = false; await handLoop; if (BY_HAND) log(`gestes sur la Flex de la page : ${handGestures}`) }

// 0 · the door: /connexion, the client's path, on the emulated Flex
await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500)
let s = await state()
if (s.address) { await api('/logout'); await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1200) }
await reveal()
await btn('My Ledger · this browser').click(); await sleep(700)
await btn('Emulated Flex (bench)').click(); await sleep(500)
s = await until((x) => x.signer === 'browser', 'chemin = my Ledger · this browser')

// 1 · sign in with the Ledger, in the page — then the door hands over to the demo's live map
await shot('01-connexion')
let t = Date.now()
await btn('Sign in with my Ledger').click()
s = await until((x) => !!x.address, 'connexion SIWE', 120000)
log(`compte ${s.address} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
await page.waitForURL('**/demo*', { timeout: 15000 }).then(() => log('ok  après la connexion : /demo (la carte vivante)')).catch(() => fail('la connexion ne mène pas à /demo : ' + page.url()))
await api('/reset'); await sleep(600)

// 2 · session, on the account page
await go('Account')
await btn('Open the session').click()
s = await until((x) => !!x.vault, 'session ouverte : coffre déployé', 180000)

// the deposit: an ETH transfer to the vault, signed on the device — the one transaction the Ledger signs
{
  // the bench put 5 fictional ETH on the holder's address: wait for the balance to show it (it refreshes every 5 s)
  s = await until((x) => x.log.some((l) => /5 fictional ETH/.test(l)) && BigInt(x.owner_eth || '0') >= 4990000000000000000n, 'le porteur a des ETH (fictifs, fork)', 60000)
  const wethBefore = BigInt(s.weth || '0')
  await page.getByLabel('Deposit (ETH)').fill('0.5')
  t = Date.now()
  await btn('Deposit from my Ledger').click()
  s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /deposit signed on your Ledger and confirmed/.test(l)) && BigInt(x.weth || '0') >= wethBefore + 500000000000000000n, 'dépôt signé sur l’appareil, 0.5 ETH gardés en WETH', 180000)
  if (BigInt(s.owner_eth || '0') > 4500000000000000000n) fail('l’adresse du porteur n’a pas baissé de 0.5 ETH')
  log(`dépôt (${((Date.now() - t) / 1000).toFixed(1)} s) · coffre ${(Number(s.weth) / 1e18).toFixed(4)} WETH · adresse ${(Number(s.owner_eth) / 1e18).toFixed(4)} ETH`)
  await shot('01b-depot')
}

// 3 · strategy → bounds, on the demo's live map (the setup drawer)
await liveMap()
await chip('0.5 WETH cautiously').click()
s = await until((x) => !!x.proposal, 'bornes proposées', 120000)
log(`bornes : ${s.proposal.budget_weth} WETH · ${s.proposal.max_round_trip_loss_bps} bps · ${s.proposal.days} j`)

// 4 · the mandate, signed in the page
t = Date.now()
await btn('Sign on Ledger', true).click()
s = await until((x) => x.signed, 'mandat signé dans la page', 180000)
log(`mandat signé (${((Date.now() - t) / 1000).toFixed(1)} s) · ${JSON.stringify(s.last_report || {}).slice(0, 110)}`)
await sleep(800); await shot('02-mandat', false)

// PARCOURS=fonds : a real network (Base Sepolia) has none of the trap pools and vaults — so only the gestures the
// Ledger signs: sign in, deposit, mandate, withdrawal, log out. The rest of the journey is for the fork.
if (process.env.PARCOURS === 'fonds') {
  await go('Account')
  const before = BigInt(s.weth || '0')
  await page.getByLabel('Withdraw (WETH)').fill('0.1')
  t = Date.now()
  await btn('Withdraw to my Ledger').click()
  s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /withdrawal authorised on your Ledger and executed/.test(l)), 'retrait autorisé sur l’appareil, 0.1 WETH rendus', 180000)
  if (BigInt(s.weth || '0') > before) fail('le coffre n’a pas baissé après le retrait')
  log(`retrait (${((Date.now() - t) / 1000).toFixed(1)} s) · coffre ${(Number(s.weth) / 1e18).toFixed(4)} WETH`)
  await shot('03-compte')
  await api('/logout'); await handDone()
  log(failed ? 'PARCOURS (fonds) : des échecs' : `PARCOURS (fonds) : tout est passé — chaîne ${s.chain_id ?? '?'}, ${s.network}`)
  await browser.close(); process.exit(failed ? 1 : 0)
}

// 5 · a pools bot, one round — on the trades page
await go('Trades')
await page.getByLabel('Name').fill('Careful DCA')
await page.getByLabel('Universe').selectOption('pools')
await page.getByLabel('Slices').fill('10')
await page.getByLabel('Pace').selectOption('0')
await btn('Add and launch').click()
s = await until((x) => x.bots.some((b) => b.name === 'Careful DCA' && b.status === 'done'), 'bot pools : un tour terminé', 420000, 2000)
let b = s.bots.find((x) => x.name === 'Careful DCA')
log(`Careful DCA : ${b.executed} achats, ${b.refused} refus · demande : ${s.escalation ? s.escalation.question.slice(0, 80) : 'aucune'}`)
if (!s.journal.some((r) => r.bot === 'Careful DCA')) fail('le journal ne porte pas le nom du bot')

// 6 · the out-of-bounds request: read and sign on the device
if (s.escalation) {
  const n = s.exception_buys.length
  t = Date.now()
  await btn('Read and sign on Ledger').click()
  s = await until((x) => x.exception_buys.length > n, 'dérogation signée, achat exécuté', 240000)
  log(`dérogation (${((Date.now() - t) / 1000).toFixed(1)} s) · en file : ${s.escalation_queue.length}`)
  if (s.escalation) {
    const pid = s.escalation.pool_id
    await btn('Leave refused').click()
    s = await until((x) => !x.escalation || x.escalation.pool_id !== pid, '« leave refused » tient', 30000)
    log(`refus retenus : ${s.refused_escalations.length}`)
  }
} else fail('aucune demande hors bornes après le tour pools')
await shot('03-bots-demandes')

// 7 · watch, then watch and exit — the positions are on the trades page
await btn('Re-probe', true).click()
s = await until((x) => !x.watching && x.watch, 'resondage', 180000)
await btn('Re-probe and exit', true).click()
s = await until((x) => !x.watching && x.watch && x.watch.sell_if != null, 'resonder et sortir', 240000)
log(`surveillance : ${JSON.stringify(s.watch.rows.map((r) => [r.name || r.pool_id.slice(0, 10), r.exit_bps_at_buy, r.exit_bps_now, r.action]))}`)

// 7 bis · the withdrawal: an EIP-712 authorization read on the device, executed by the bench — on the account page
{
  await go('Account')
  const before = BigInt(s.weth || '0')
  await page.getByLabel('Withdraw (WETH)').fill('0.1')
  t = Date.now()
  await btn('Withdraw to my Ledger').click()
  s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /withdrawal authorised on your Ledger and executed/.test(l)), 'retrait autorisé sur l’appareil, 0.1 WETH rendus', 180000)
  if (BigInt(s.weth || '0') > before) fail('le coffre n’a pas baissé après le retrait')
  log(`retrait (${((Date.now() - t) / 1000).toFixed(1)} s) · coffre ${(Number(s.weth) / 1e18).toFixed(4)} WETH`)
}

// 8 · a vaults bot that runs on a rhythm, then is stopped
await go('Trades')
await page.getByLabel('Name').fill('Vault watcher')
await page.getByLabel('Universe').selectOption('vaults')
await page.getByLabel('Slices').fill('5')
await page.getByLabel('Pace').selectOption('30')
await btn('Add and launch').click()
s = await until((x) => { const v = x.bots.find((y) => y.name === 'Vault watcher'); return v && v.rounds >= 1 && !x.running }, 'bot coffres : premier tour', 300000, 2000)
b = s.bots.find((x) => x.name === 'Vault watcher')
log(`Vault watcher : ${b.executed} entrées, ${b.refused} refus · demande : ${s.escalation ? s.escalation.question.slice(0, 70) : 'aucune'}`)
await shot('04-bot-actif')
await page.locator('tr', { hasText: 'Vault watcher' }).getByRole('button', { name: 'Stop' }).first().click()
s = await until((x) => x.bots.find((y) => y.name === 'Vault watcher').status === 'stopped', 'bot arrêté, dans l’historique', 30000)
if (s.escalation) {
  const n = s.exception_buys.length
  await btn('Read and sign on Ledger').click()
  s = await until((x) => x.exception_buys.length > n, 'dérogation coffre signée', 240000)
}

// 9 · the account's analysis agent, on the account page
await go('Account')
t = Date.now()
await chip('What are my bots doing').click()
s = await until((x) => x.analysis && !x.analysis.pending, 'réponse de l’analyste', 300000, 2500)
log(`analyste (${((Date.now() - t) / 1000).toFixed(1)} s) · outils : ${s.analysis.tools_used.map((u) => u.tool).join(', ')} · ${(s.analysis.answer || s.analysis.error || '').slice(0, 160)}`)
if (!s.analysis.tools_used.length) fail('l’analyste n’a appelé aucun outil')
await sleep(1200); await shot('05-analyste')

// 10 · the account: the key, the configuration, the history
await btn('Reveal', true).click(); await sleep(900)
await btn('Claude configuration').click(); await sleep(900)
const acc = await page.evaluate(() => fetch('/api/account?reveal=1').then((r) => r.json()))
log(`compte : ${acc.profile.address} · ${acc.events.length} gestes · clé ${acc.mcp_key.slice(0, 6)}…`)
for (const k of ['login', 'session', 'strategy', 'mandate_signed', 'bot_added', 'run_done', 'exception_signed', 'watch', 'analysis', 'bot_stopped'])
  if (!acc.events.some((e) => e.kind === k)) fail('événement manquant : ' + k)
await shot('06-compte')

// 11 · the demo: the live map with everything that happened, and its panels (Bots, TARE, Watch and analyst)
await liveMap(); await shot('07-demo-map', false)
await page.getByRole('button', { name: 'Bots', exact: true }).first().click(); await sleep(1200)
const botRows = await page.locator('.bots__row').count()
if (botRows < 1) fail('le volet Bots de la carte vivante ne montre aucune décision'); else log(`ok  volet Bots : ${botRows} décisions du bot choisi, ${await page.locator('.bots__bot').count()} bots`)
await shot('08-demo-bots', false)
await page.getByRole('button', { name: 'TARE', exact: true }).first().click(); await sleep(1200); await shot('08b-demo-tare', false)
await page.getByRole('button', { name: /Watch and analyst/ }).first().click(); await sleep(1200); await shot('08c-demo-watch', false)

// 12 · log out from the account page, come back through the bench's device: same account, same mandate
await go('Account')
await btn('Sign out').click()
s = await until((x) => !x.address, 'déconnecté')
await page.waitForURL('**/connexion', { timeout: 15000 }).then(() => log('ok  déconnecté : renvoyé vers la porte')).catch(() => fail('après la déconnexion, pas sur /connexion : ' + page.url()))
await reveal()
await btn('Signer Kit · bench').click()
s = await until((x) => x.signer === 'dmk', 'chemin = Signer Kit · bench')
await btn('Sign in with my Ledger').click()
s = await until((x) => !!x.address && x.signed, 'reconnexion par l’appareil du banc : même compte, même mandat', 120000)
log(`état retrouvé : coffre ${s.vault} · ${s.positions.length} positions · ${s.bots.length} bots`)
await page.waitForURL('**/account', { timeout: 15000 }).then(() => log('ok  reconnecté : retour sur /account')).catch(() => fail('après la connexion, pas de retour sur /account : ' + page.url()))

// 13 · the SaaS door: logged out, an account page sends you to /connexion, and back there once logged in
await api('/logout'); await page.goto(URL + '/trades', { waitUntil: 'domcontentloaded' }); await sleep(2000)
if (/\/connexion$/.test(page.url())) log('ok  déconnecté : /trades renvoie vers /connexion')
else fail('déconnecté, /trades ne renvoie pas vers /connexion : ' + page.url())
await reveal()
await btn('Sign in with my Ledger').click()
s = await until((x) => !!x.address, 'reconnexion depuis la porte', 120000)
await page.waitForURL('**/trades', { timeout: 15000 }).then(() => log('ok  reconnecté : retour sur /trades')).catch(() => fail('après la connexion, pas de retour sur /trades : ' + page.url()))
await shot('09-retour-trades')
await api('/signer', { signer: 'browser' })   // leave the bench on the client's path

await handDone()
log(failed ? 'PARCOURS : des échecs' : 'PARCOURS : tout est passé')
await browser.close(); process.exit(failed ? 1 : 0)
