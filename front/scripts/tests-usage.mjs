#!/usr/bin/env node
// Usability pass on the emulated Flex: everything a person can click, in the order a person meets it, with the
// wrong inputs, the empty states, the three signing paths, the menu on a phone, a device restart, the bench page.
// Needs: the bench (8099), the front (5173), Speculos, and NO holder running — this script starts its own.
//
//   node scripts/tests-usage.mjs [dossier de captures]
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = process.env.FRONT_URL || 'http://127.0.0.1:5173'
const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = process.argv[2] || 'design-shots/usage'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T0 = Date.now(); let failed = false; const notes = []
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`)
const fail = (m) => { failed = true; log('ÉCHEC : ' + m) }
const note = (m) => { notes.push(m); log('note : ' + m) }
const porteur = (slow = '1') => { const out = fs.openSync('/tmp/porteur-usage.log', 'a'); return spawn('python3', ['-u', `${BENCH}/scripts/porteur.py`, '1800', slow], { stdio: ['ignore', out, out] }) }
let holder = porteur()
const kill = () => { try { holder.kill() } catch {} }

const browser = await chromium.launch({ headless: true, args: ['--disable-3d-apis'] })   // no WebGL: the hero shows its poster, the pages stay fast
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' })
await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
const page = await ctx.newPage()
page.on('dialog', (d) => d.dismiss())
const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()).catch(() => null))
const api = (p, body = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch((e) => ({ ok: false, msg: 'fetch: ' + e })), [p, body])
async function until(pred, label, timeout = 120000, every = 1000) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(); if (s && pred(s)) { log('ok  ' + label); return s } await sleep(every) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}
const btn = (name, exact = false) => page.getByRole('button', { name, exact })   // exact where a longer name contains it
const chip = (text) => page.locator('button.segment', { hasText: text }).first()
/** The sheets reveal on scroll (Florent's motion): walk the page once so everything is on, then come back up. */
const reveal = async (p = page) => {
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 500) { await p.evaluate((y) => window.scrollTo(0, y), y); await sleep(80) }
  await sleep(600); await p.evaluate(() => window.scrollTo(0, 0)); await sleep(250)
}
const shot = async (name) => { await reveal(); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }) }
const toasts = async () => (await page.locator('.toast').allInnerTexts()).join(' | ')
const go = async (label) => {
  const nav = page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: label, exact: true })
  if (await nav.count()) await nav.first().click(); else await page.getByRole('link', { name: label }).first().click()   // the door sits in the header, next to the nav
  await sleep(1200); await reveal()
}
const liveMap = async () => { await go('Demo'); await btn('Live map', true).click(); await sleep(1500) }
const has = async (text) => (await page.getByText(text, { exact: false }).count()) > 0

// speculos ready
for (let i = 0; i < 120; i++) { try { const r = await fetch(URL + '/speculos/events?currentscreenonly=true'); if (r.ok) break } catch {} await sleep(500) }

// ───────────── 1 · first visit, no account — the home in its own tab (its scene and sound keep a headless tab busy)
{
  const home = await ctx.newPage()
  await home.goto(URL + '/', { waitUntil: 'domcontentloaded' }); await sleep(3500)
  if (!(await home.getByText('Sign in').count())) fail('la porte « Sign in » n’est pas dans la barre de l’accueil')
  await home.screenshot({ path: `${OUT}/01-accueil.png`, fullPage: false })
  if (!(await home.getByRole('link', { name: 'Sign in' }).first().isVisible()))
    note('sur l’accueil, la porte « Sign in » n’est visible qu’après avoir traversé le héros (barre masquée jusqu’au relâchement)')
  const cta = await home.getByRole('link', { name: 'Open your account' }).count()
  if (!cta) note('la dernière section de l’accueil n’a pas de bouton vers le compte')
  await home.close()
}
await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500)
if (!/\/connexion$/.test(page.url())) fail('/connexion ne s’ouvre pas : ' + page.url())
let s = await state()
if (s?.address) { await api('/logout'); await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500) }
await reveal()
const firstCard = await page.locator('.panel').first().innerText()
if (!/device/i.test(firstCard)) note(`la première carte de /connexion n’est pas l’appareil : « ${firstCard.slice(0, 40)} »`)
await page.getByRole('group', { name: 'Device' }).getByRole('button', { name: 'Real Ledger (USB)' }).click(); await sleep(400)
if (!(await has('cannot talk to a USB device'))) note('en choisissant « Real Ledger » dans un navigateur sans WebHID, aucun message ne dit quoi faire (Chromium sans tête a navigator.hid)')
await page.getByRole('group', { name: 'Device' }).getByRole('button', { name: 'Emulated Flex (bench)' }).click(); await sleep(400)
await btn('My Ledger · this browser').click(); await until((x) => x.signer === 'browser', 'chemin = my Ledger · this browser')
await btn('Test the connection').click(); await sleep(4000)
if (!(await page.locator('.badge').count())) note('« Test the connection » ne montre pas l’adresse lue (badge absent)')
await shot('02-connexion')
await btn('Sign in with my Ledger').click()
s = await until((x) => !!x.address, 'connexion SIWE depuis la porte', 120000)
await page.waitForURL('**/demo*', { timeout: 15000 }).catch(() => fail('après la connexion, pas sur /demo : ' + page.url()))
if (!(await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Trades', exact: true }).count())) fail('la barre ne montre pas les pages du compte après connexion')
if (s.vault) { await api('/reset'); s = await until((x) => !x.vault, 'compte remis à zéro pour le test') }

// ───────────── 2 · before a session: what the empty pages say
await go('Account')
if (!(await btn('Open the session').count())) fail('/account sans session : pas de bouton « Open the session »')
if (!(await has('Open a session first'))) note('/account sans session : l’analyste ne dit pas qu’il faut d’abord une session')
await shot('03-account-vide')
await go('Trades'); if (!(await has('First, the mandate'))) note('/trades sans mandat ne dit pas qu’il faut d’abord un mandat')
await go('Account')

// ───────────── 3 · session, then the wrong deposits, then a right one
await btn('Open the session').click()
s = await until((x) => !!x.vault, 'session ouverte', 180000)
s = await until((x) => x.log.some((l) => /5 ETH fictifs/.test(l)) && BigInt(x.owner_eth || '0') >= 4990000000000000000n, 'le porteur a ses ETH fictifs', 60000)
await shot('04-account-session')
for (const [v, why] of [['0', 'zéro'], ['5000', 'trop grand']]) {
  await page.getByLabel('Deposit (ETH)').fill(v); await btn('Deposit from my Ledger').click(); await sleep(1200)
  const t = await toasts(); if (!t) fail(`dépôt ${why} (${v}) : aucun message`); else log(`dépôt ${why} → « ${t.slice(0, 70)} »`)
  await sleep(2500)
}
await page.getByLabel('Deposit (ETH)').fill('0.3'); await btn('Deposit from my Ledger').click()
s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /dépôt signé sur ta Ledger et confirmé/.test(l)), 'dépôt de 0.3 ETH signé sur l’appareil', 180000)

// ───────────── 4 · bounds with the keyboard, the chips, the mandate — on the demo's live map
await liveMap()
if (await btn('Sign on Ledger', true).count()) note('« Sign on Ledger » est proposé avant d’avoir demandé des bornes')
await page.getByLabel('In one sentence').fill('0.5 WETH cautiously'); await page.getByLabel('In one sentence').press('Enter')
s = await until((x) => !!x.proposal, 'bornes demandées au clavier (Entrée)', 120000)
if (s.proposal.max_round_trip_loss_bps !== 150) note(`« cautiously » donne ${s.proposal.max_round_trip_loss_bps} bps (prudent = 150)`)
await chip('1 WETH, aggressive profile').click()
s = await until((x) => x.proposal && Number(x.proposal.budget_weth) === 1, 'une puce d’exemple change les bornes', 120000)
await page.screenshot({ path: `${OUT}/05-demo-mandat.png`, fullPage: false })
await btn('Sign on Ledger', true).click()
s = await until((x) => x.signed, 'mandat signé dans la page', 180000)
if (!(await has('Exit mandate · signed'))) note('après la signature, la carte ne dit pas clairement « signed »')
if (!(await has('isBlindSign=false'))) note('après la signature, le rapport du kit (isBlindSign) n’est pas visible')

// ───────────── 5 · the trades page: empty state, a rhythmic bot, stop, restart, a second bot, the filters
await go('Trades')
if (!(await has('No bot is running'))) note('la page des trades sans bot n’a pas son état vide')
await shot('06-trades-vide')
await page.getByLabel('Name').fill('Rhythmic'); await page.getByLabel('Universe').selectOption('pools'); await page.getByLabel('Slices').fill('2'); await page.getByLabel('Pace').selectOption('30')
await btn('Add and launch').click()
s = await until((x) => x.bots.some((b) => b.name === 'Rhythmic' && b.status === 'running'), 'bot rythmé ajouté et en marche', 60000)
s = await until((x) => x.bots.some((b) => b.name === 'Rhythmic' && b.rounds >= 1), 'un premier tour', 300000, 2000)
await page.getByLabel('Name').fill('Second'); await page.getByLabel('Pace').selectOption('60'); await btn('Add and launch').click()
s = await until((x) => x.bots.filter((b) => b.status === 'running').length === 2, 'deux bots en marche', 60000)
if (s.bot_running && s.bots.filter((b) => b.status === 'running').length === 2) log('ok  un seul tour à la fois : ' + s.bot_running)
await shot('07-trades-actifs')
await page.locator('tr', { hasText: 'Rhythmic' }).getByRole('button', { name: 'Stop' }).click()
s = await until((x) => x.bots.some((b) => b.name === 'Rhythmic' && b.status !== 'running'), 'bot arrêté', 60000)
if (!(await has('the history'))) note('le bot arrêté n’est pas présenté comme un historique')
await page.locator('tr', { hasText: 'Rhythmic' }).getByRole('button', { name: 'Restart' }).click()
s = await until((x) => x.bots.some((b) => b.name === 'Rhythmic' && b.status === 'running'), 'bot relancé depuis l’historique', 60000)
for (const b of s.bots.filter((b) => b.status === 'running')) await api('/bots/stop', { id: b.id })
s = await until((x) => !x.bots.some((b) => b.status === 'running'), 'tous les bots arrêtés', 60000)
await page.getByRole('group', { name: 'Filter the journal' }).getByRole('button', { name: 'Refusals' }).click(); await sleep(500)
const rowsRefus = await page.locator('#journal table.data-table tbody tr').allInnerTexts()
if (rowsRefus.length && rowsRefus.some((r) => /bought|entered/i.test(r) && !/refused/i.test(r))) note('le filtre « Refusals » laisse passer des entrées')
await page.getByRole('group', { name: 'Filter the journal' }).getByRole('button', { name: 'All' }).click(); await sleep(300)

// ───────────── 6 · the requests: a one-shot round (ten slices) raises them; leave one refused, sign the next
await chip('Or run one round now').click()
s = await until((x) => x.bots.some((b) => /tour unique/.test(b.name) && b.status === 'done'), 'un tour unique terminé', 420000, 2000)
s = await until((x) => x.escalation && x.escalation.possible, 'une demande hors bornes est là', 120000)
const q0 = s.escalation_queue.length; const p0 = s.escalation.pool_id
await btn('Leave refused').click()
s = await until((x) => x.refused_escalations.includes(p0.toLowerCase()) || !x.escalation || x.escalation.pool_id !== p0, '« leave refused » : la demande suivante monte', 30000)
log(`file : ${q0} → ${s.escalation_queue.length}`)
await shot('08-demandes')
if (s.escalation && s.escalation.possible) {
  const n = s.exception_buys.length
  await btn('Read and sign on Ledger').click()
  s = await until((x) => x.exception_buys.length > n || x.log.some((l) => /dérogation/.test(l) && /refus|empir/.test(l)), 'dérogation signée (ou refusée par le coffre, dit)', 240000)
}

// ───────────── 7 · the analyst: Enter, then a follow-up that needs the history — on the account page
await go('Account')
await page.getByLabel('Your question').fill('What are my bots doing?'); await page.getByLabel('Your question').press('Enter')
s = await until((x) => x.analysis && !x.analysis.pending && x.analysis.answer, 'l’analyste répond (Entrée)', 300000, 2500)
await page.getByLabel('Your question').fill('And which one has the most refusals?'); await btn('Ask', true).click()
s = await until((x) => x.analyses.length >= 2 && !x.analysis.pending && x.analysis.answer, 'une seconde question, avec l’historique', 300000, 2500)
if (!(await page.locator('.thread__trace').count())) note('la trace des outils n’est pas visible sous la réponse')
await shot('09-analyste')
// the same conversation, compact, in the demo's drawer
await liveMap()
if (!(await has('And which one has the most refusals?'))) note('la carte vivante ne montre pas la conversation avec l’analyste dans son tiroir')
if (!(await page.getByLabel('Your question').count())) fail('la carte vivante n’a pas de champ pour parler à l’analyste')

// ───────────── 8 · the account: key, config, copy, history, reset cancelled
await go('Account')
await btn('Reveal', true).click(); await sleep(300)
const key = (await page.locator('#key .t-mono-data-lg').nth(1).innerText()).trim()
if (!/^[A-Za-z0-9_-]{20,}$/.test(key)) fail('la clé MCP révélée n’a pas la forme attendue : ' + key.slice(0, 20))
await btn('Copy the key').click(); await sleep(400)
if (!(await has('Key copied')) && !(await has('Cannot copy'))) note('« Copy the key » ne dit ni copié ni impossible')
await btn('Claude configuration').click(); await sleep(300)
if (!(await has('porte-de-sortie'))) fail('la configuration Claude ne s’affiche pas')
const events = await page.locator('#history table.data-table tbody tr').count()
if (events < 5) fail('l’historique du compte est vide ou trop court : ' + events)
await btn('Reset', true).click(); await sleep(300)
if (!(await btn('Confirm the reset').count())) fail('« Reset » ne demande pas de confirmation')
await btn('Keep everything').click(); await sleep(800)
s = await state(); if (!s.vault) fail('« keep everything » sur la remise à zéro a quand même remis à zéro')
else log('ok  remise à zéro annulée : rien n’a bougé')
await shot('10-account')

// ───────────── 9 · the door, signed in: the two bench signing paths sign a fresh mandate each, then a Speculos restart
const freshMandate = async () => {
  await api('/reset'); await until((x) => !x.vault, 'compte remis à zéro')
  let r = await api('/boot'); if (!r.ok) { log('    /boot → ' + r.msg); await sleep(2000); r = await api('/boot') }
  await until((x) => !!x.vault, 'session rouverte', 180000)
  await api('/chat', { prompt: '0.5 WETH cautiously' }); await until((x) => !!x.proposal && !x.signed, 'bornes prêtes', 120000)
}
for (const [label, signer, line] of [['APDU client · bench', 'python', /client officiel en APDU/], ['Signer Kit · bench', 'dmk', /Signer Kit \+ DMK/]]) {
  await freshMandate()
  await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500); await reveal()
  if (!/\/connexion$/.test(page.url())) fail('connecté, /connexion renvoie ailleurs : ' + page.url())
  await btn(label).click(); s = await until((x) => x.signer === signer, 'chemin = ' + label)
  await liveMap(); await btn('Sign on Ledger', true).click()
  s = await until((x) => x.signed && x.log.some((l) => /mandat signé sur l'appareil/.test(l) && line.test(l)), `mandat signé par « ${label} », sur la Flex du banc`, 180000)
}
await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500); await reveal()
await btn('My Ledger · this browser').click(); s = await until((x) => x.signer === 'browser', 'chemin = my Ledger · this browser')
// the live screen: a tap on the picture reaches the emulator
let fingered = false; page.on('request', (r) => { if (r.url().includes('/api/finger')) fingered = true })
const img = page.locator('.device-frame img').first()
if (await img.count()) { await img.scrollIntoViewIfNeeded(); const b = await img.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(600); if (!fingered) note('un clic sur l’écran de la Flex n’atteint pas l’émulateur') }
else note('la porte ne montre pas l’écran de la Flex')
await shot('11-porte-connectee')
log('— redémarrage de l’émulateur sous la page, puis une signature dans la page')
await freshMandate()
execSync(`cd ${BENCH} && FORCE=1 ledger/speculos.sh up >/dev/null 2>&1`)
kill(); await sleep(1000); holder = porteur()
await liveMap(); await btn('Sign on Ledger', true).click()
s = await until((x) => x.signed && !x.signing && !x.pending, 'après un redémarrage de l’émulateur, la page se reconnecte et signe', 180000)

// ───────────── 10 · on a phone: the menu, a page, a form
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'en-GB' })).newPage()
await m.context().addCookies(await ctx.cookies())
await m.goto(URL + '/trades', { waitUntil: 'domcontentloaded' }); await sleep(2000)
await m.getByRole('button', { name: 'Menu' }).click(); await sleep(400)
await m.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Account', exact: true }).click(); await sleep(1200)
if (!/\/account$/.test(m.url())) fail('sur téléphone, le menu ne mène pas à /account : ' + m.url())
await m.screenshot({ path: `${OUT}/12-mobile-menu.png` })
await reveal(m)
if (!(await m.getByLabel('Your question').isVisible())) fail('sur téléphone, le champ de question de l’analyste n’est pas visible')
const wide = await m.evaluate(() => document.documentElement.scrollWidth)
if (wide > 390) fail(`sur téléphone, /account déborde : ${wide}px`)
await m.context().close()

// ───────────── 11 · the bench page: its own deposit and withdrawal
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' }); await sleep(2500)
if (await page.locator('#b-deposit').count()) {
  await page.fill('#dep-amount', '0.2'); await page.click('#b-deposit')
  s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /0\.2 ETH, gardés en WETH/.test(l)), 'banc : dépôt de 0.2 ETH signé', 180000)
  await page.fill('#wd-amount', '0.1'); await page.click('#b-withdraw')
  s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /0\.1000 WETH rendus/.test(l)), 'banc : retrait de 0.1 WETH autorisé', 180000)
} else fail('la page du banc n’a pas les boutons de dépôt et de retrait')

// ───────────── 12 · reset, accepted
await page.goto(URL + '/account', { waitUntil: 'domcontentloaded' }); await sleep(1500); await reveal()
await btn('Reset', true).click(); await sleep(300); await btn('Confirm the reset').click()
s = await until((x) => !x.vault && !x.signed, 'remise à zéro acceptée : plus de coffre ni de mandat', 30000)
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500); await reveal()
if (!(await btn('Open the session').count())) fail('après la remise à zéro, /account ne propose pas d’ouvrir une session')

kill()
log(failed ? 'USAGE : des échecs' : 'USAGE : tout est passé')
if (notes.length) { log('— remarques d’utilisabilité :'); for (const n of notes) console.log('   · ' + n) }
await browser.close(); process.exit(failed ? 1 : 0)
