#!/usr/bin/env node
// The whole product journey through the app pages, in headless Chromium, against the live bench (port 8099 behind
// the Vite proxy) and the emulated Flex. An automatic holder must approve the device screens:
//   python3 ../scripts/porteur.py 3600 2 &
//   node scripts/parcours-app.mjs [output dir]
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

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
const page = await ctx.newPage()
page.on('dialog', (d) => d.accept())
page.on('pageerror', (e) => log('erreur page : ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/502|Failed to load/.test(m.text())) log('console : ' + m.text().slice(0, 180)) })

const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()))
const api = (path, body = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [path, body])
async function until(pred, label, timeout = 120000, every = 1200) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(); if (pred(s)) { log('ok  ' + label); return s } await sleep(every) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}
const btn = (name) => page.getByRole('button', { name, exact: false }).first()
const go = async (label) => { await page.getByRole('link', { name: label, exact: true }).first().click(); await sleep(900) }
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })

for (let i = 0; i < 120; i++) { try { const r = await fetch(URL + '/speculos/events?currentscreenonly=true'); if (r.ok) break } catch {} await sleep(500) }

// 0 · the device page: the client's path, on the emulated Flex
await page.goto(URL + '/appareil'); await sleep(1500)
let s = await state()
if (s.address) { await api('/logout'); await page.reload(); await sleep(1200) }
await btn('Ma Ledger · ce navigateur').click(); await sleep(700)
await btn('Flex émulée (banc)').click(); await sleep(500)
s = await until((x) => x.signer === 'browser', 'chemin = ma Ledger · ce navigateur')

// 1 · sign in with the Ledger, in the page
let t = Date.now()
await btn('Se connecter avec ma Ledger').click()
s = await until((x) => !!x.address, 'connexion SIWE', 120000)
log(`compte ${s.address} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
await api('/reset'); await sleep(600)
await shot('01-appareil')

// 2 · session
await go('Tableau de bord')
await btn('Ouvrir une session').click()
s = await until((x) => !!x.vault, 'session ouverte : coffre déployé', 180000)

// 3 · strategy → bounds
await page.getByRole('button', { name: /0,5 WETH prudemment sur la longue traîne/ }).click()
s = await until((x) => !!x.proposal, 'bornes proposées', 120000)
log(`bornes : ${s.proposal.budget_weth} WETH · ${s.proposal.max_round_trip_loss_bps} bps · ${s.proposal.days} j`)

// 4 · the mandate, signed in the page
t = Date.now()
await btn('Signer sur Ledger').click()
s = await until((x) => x.signed, 'mandat signé dans la page', 180000)
log(`mandat signé (${((Date.now() - t) / 1000).toFixed(1)} s) · ${JSON.stringify(s.last_report || {}).slice(0, 110)}`)
await shot('02-mandat')

// 5 · a pools bot, one round
await page.getByLabel('Nom').fill('DCA prudente')
await page.getByLabel('Univers').selectOption('pools')
await page.getByLabel('Tranches').fill('10')
await page.getByLabel('Rythme').selectOption('0')
await btn('Ajouter et lancer').click()
s = await until((x) => x.bots.some((b) => b.name === 'DCA prudente' && b.status === 'done'), 'bot pools : un tour terminé', 420000, 2000)
let b = s.bots.find((x) => x.name === 'DCA prudente')
log(`DCA prudente : ${b.executed} achats, ${b.refused} refus · demande : ${s.escalation ? s.escalation.question.slice(0, 80) : 'aucune'}`)
if (!s.journal.some((r) => r.bot === 'DCA prudente')) fail('le journal ne porte pas le nom du bot')

// 6 · the out-of-bounds request: read and sign on the device
if (s.escalation) {
  const n = s.exception_buys.length
  t = Date.now()
  await btn('Lire et signer sur Ledger').click()
  s = await until((x) => x.exception_buys.length > n, 'dérogation signée, achat exécuté', 240000)
  log(`dérogation (${((Date.now() - t) / 1000).toFixed(1)} s) · en file : ${s.escalation_queue.length}`)
  if (s.escalation) {
    const pid = s.escalation.pool_id
    await btn('Laisser refusé').click()
    s = await until((x) => !x.escalation || x.escalation.pool_id !== pid, '« laisser refusé » tient', 30000)
    log(`refus retenus : ${s.refused_escalations.length}`)
  }
} else fail('aucune demande hors bornes après le tour pools')
await shot('03-bots-demandes')

// 7 · watch, then watch and exit
await btn('Resonder').click()
s = await until((x) => !x.watching && x.watch, 'resondage', 180000)
await page.getByRole('button', { name: 'Resonder et sortir' }).click()
s = await until((x) => !x.watching && x.watch && x.watch.sell_if != null, 'resonder et sortir', 240000)
log(`surveillance : ${JSON.stringify(s.watch.rows.map((r) => [r.name || r.pool_id.slice(0, 10), r.exit_bps_at_buy, r.exit_bps_now, r.action]))}`)

// 8 · a vaults bot that runs on a rhythm, then is stopped
await page.getByLabel('Nom').fill('veilleur de coffres')
await page.getByLabel('Univers').selectOption('vaults')
await page.getByLabel('Tranches').fill('5')
await page.getByLabel('Rythme').selectOption('30')
await btn('Ajouter et lancer').click()
s = await until((x) => { const v = x.bots.find((y) => y.name === 'veilleur de coffres'); return v && v.rounds >= 1 && !x.running }, 'bot coffres : premier tour', 300000, 2000)
b = s.bots.find((x) => x.name === 'veilleur de coffres')
log(`veilleur de coffres : ${b.executed} entrées, ${b.refused} refus · demande : ${s.escalation ? s.escalation.question.slice(0, 70) : 'aucune'}`)
await shot('04-bot-actif')
await page.getByRole('button', { name: 'Arrêter' }).first().click()
s = await until((x) => x.bots.find((y) => y.name === 'veilleur de coffres').status === 'stopped', 'bot arrêté, dans l’historique', 30000)
if (s.escalation) {
  const n = s.exception_buys.length
  await btn('Lire et signer sur Ledger').click()
  s = await until((x) => x.exception_buys.length > n, 'dérogation coffre signée', 240000)
}

// 9 · the account's analyst
t = Date.now()
await page.getByRole('button', { name: /Que font mes bots/ }).click()
s = await until((x) => x.analysis && !x.analysis.pending, 'réponse de l’analyste', 300000, 2500)
log(`analyste (${((Date.now() - t) / 1000).toFixed(1)} s) · outils : ${s.analysis.tools_used.map((u) => u.tool).join(', ')} · ${(s.analysis.answer || s.analysis.error || '').slice(0, 160)}`)
if (!s.analysis.tools_used.length) fail('l’analyste n’a appelé aucun outil')
await sleep(1200); await shot('05-tableau-de-bord')

// 10 · the account
await go('Compte'); await sleep(1500)
await btn('Révéler').click(); await sleep(900)
await btn('Configuration Claude').click(); await sleep(900)
const acc = await page.evaluate(() => fetch('/api/account?reveal=1').then((r) => r.json()))
log(`compte : ${acc.profile.address} · ${acc.events.length} gestes · clé ${acc.mcp_key.slice(0, 6)}…`)
for (const k of ['login', 'session', 'strategy', 'mandate_signed', 'bot_added', 'run_done', 'exception_signed', 'watch', 'analysis', 'bot_stopped'])
  if (!acc.events.some((e) => e.kind === k)) fail('événement manquant : ' + k)
await shot('06-compte')

// 11 · the device page and the schema
await go('Appareil'); await sleep(1500); await shot('07-appareil')
await go('Schéma'); await sleep(800); await shot('08-schema')

// 12 · log out, come back through the bench's device: same account
await go('Appareil'); await sleep(800)
await btn('Se déconnecter').click()
s = await until((x) => !x.address, 'déconnecté')
await btn('Signer Kit · banc').click()
s = await until((x) => x.signer === 'dmk', 'chemin = Signer Kit · banc')
await btn('Se connecter avec ma Ledger').click()
s = await until((x) => !!x.address && x.signed, 'reconnexion par l’appareil du banc : même compte, même mandat', 120000)
log(`état retrouvé : coffre ${s.vault} · ${s.positions.length} positions · ${s.bots.length} bots`)
await btn('Ma Ledger · ce navigateur').click(); await sleep(600)

log(failed ? 'PARCOURS : des échecs' : 'PARCOURS : tout est passé')
await browser.close()
process.exit(failed ? 1 : 0)
