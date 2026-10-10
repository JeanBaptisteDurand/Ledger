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

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR' })
await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
const page = await ctx.newPage()
let dialogAnswer = false
page.on('dialog', (d) => (dialogAnswer ? d.accept() : d.dismiss()))
const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()).catch(() => null))
const api = (p, body = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [p, body])
async function until(pred, label, timeout = 120000, every = 1000) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(); if (s && pred(s)) { log('ok  ' + label); return s } await sleep(every) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}
const btn = (name, exact = false) => page.getByRole('button', { name, exact })   // exact where a longer name contains it
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
const toasts = async () => (await page.locator('.toast').allInnerTexts()).join(' | ')
const go = async (label) => {
  const nav = page.getByRole('navigation', { name: 'Principale' }).first().getByRole('link', { name: label })
  if (await nav.count()) await nav.first().click(); else await page.getByRole('link', { name: label }).first().click()   // the door sits in the header, next to the nav
  await sleep(700)
}
const has = async (text) => (await page.getByText(text, { exact: false }).count()) > 0

// speculos ready
for (let i = 0; i < 120; i++) { try { const r = await fetch(URL + '/speculos/events?currentscreenonly=true'); if (r.ok) break } catch {} await sleep(500) }

// ───────────── 1 · first visit, no account — the home in its own tab (its scene and sound keep a headless tab busy)
{
  const home = await ctx.newPage()
  await home.goto(URL + '/', { waitUntil: 'domcontentloaded' }); await sleep(3500)
  if (!(await home.getByText('Se connecter').count())) fail('la porte « Se connecter » n’est pas dans la barre de l’accueil')
  await home.screenshot({ path: `${OUT}/01-accueil.png`, fullPage: false })
  if (!(await home.getByRole('link', { name: 'Se connecter' }).first().isVisible()))
    note('sur l’accueil, la porte « Se connecter » n’est visible qu’après avoir traversé le héros (barre masquée jusqu’au relâchement)')
  const cta = await home.getByRole('link', { name: 'Open your account' }).count()
  if (!cta) note('la dernière section de l’accueil n’a pas de bouton vers le compte')
  await home.close()
}
await page.goto(URL + '/connexion', { waitUntil: 'domcontentloaded' }); await sleep(1500)
if (!/\/connexion$/.test(page.url())) fail('/connexion ne s’ouvre pas : ' + page.url())
const firstCard = await page.locator('.panel').first().innerText()
if (!/appareil/i.test(firstCard)) note(`la première carte de /connexion n’est pas l’appareil : « ${firstCard.slice(0, 40)} »`)
await page.getByRole('group', { name: 'Appareil' }).getByRole('button', { name: 'Vraie Ledger (USB)' }).click(); await sleep(400)
if (!(await has('ne sait pas parler à un appareil USB'))) note('en choisissant « Vraie Ledger » dans un navigateur sans WebHID, aucun message ne dit quoi faire')
await page.getByRole('group', { name: 'Appareil' }).getByRole('button', { name: 'Flex émulée (banc)' }).click(); await sleep(400)
await btn('Ma Ledger · ce navigateur').click(); await until((x) => x.signer === 'browser', 'chemin = ma Ledger · ce navigateur')
await btn('Tester la connexion').click(); await sleep(4000)
if (!(await page.locator('.app-badge').count())) note('« Tester la connexion » ne montre pas l’adresse lue (badge absent)')
await shot('02-connexion')
await btn('Se connecter avec ma Ledger').click()
let s = await until((x) => !!x.address, 'connexion SIWE depuis la porte', 120000)
await page.waitForURL('**/app', { timeout: 15000 }).catch(() => fail('après la connexion, pas sur /app'))
if (!(await page.getByRole('navigation', { name: 'Principale' }).first().getByRole('link', { name: 'Agents de trading' }).count())) fail('la barre ne montre pas les pages du compte après connexion')
if (s.vault) { await api('/reset'); s = await until((x) => !x.vault, 'compte remis à zéro pour le test') }

// ───────────── 2 · before a session: what the empty pages say
await page.reload(); await sleep(1500)
if (!(await btn('Ouvrir une session').count())) fail('/app sans session : pas de bouton « Ouvrir une session »')
await shot('03-app-vide')
await go('Agents de trading'); if (!(await has('D’abord, le mandat'))) note('/app/agents sans session ne dit pas qu’il faut d’abord un mandat')
await go('Analyste'); if (!(await has('D’abord, une session'))) note('/app/analyste sans session ne dit pas qu’il faut d’abord une session')
await go('Vue d’ensemble')

// ───────────── 3 · session, then the wrong deposits, then a right one
await btn('Ouvrir une session').click()
s = await until((x) => !!x.vault, 'session ouverte', 180000)
s = await until((x) => x.log.some((l) => /5 ETH fictifs/.test(l)) && BigInt(x.owner_eth || '0') >= 4990000000000000000n, 'le porteur a ses ETH fictifs', 60000)
await shot('04-app-session')
for (const [v, why] of [['0', 'zéro'], ['5000', 'trop grand']]) {
  await page.getByLabel('Déposer (ETH)').fill(v); await btn('Déposer depuis ma Ledger').click(); await sleep(1200)
  const t = await toasts(); if (!t) fail(`dépôt ${why} (${v}) : aucun message`); else log(`dépôt ${why} → « ${t.slice(0, 70)} »`)
  await sleep(2500)
}
await page.getByLabel('Déposer (ETH)').fill('0.3'); await btn('Déposer depuis ma Ledger').click()
s = await until((x) => !x.pending && !x.signing && x.log.some((l) => /dépôt signé sur ta Ledger et confirmé/.test(l)), 'dépôt de 0.3 ETH signé sur l’appareil', 180000)
if (!(await has('L’appareil')) ) note('pendant la signature, l’indication sur l’appareil n’est pas visible dans la page')

// ───────────── 4 · bounds with the keyboard, the chips, the mandate
if (await btn('Signer sur Ledger', true).isEnabled().catch(() => true)) note('« Signer sur Ledger » est cliquable avant d’avoir demandé des bornes')
await page.getByLabel('En une phrase').fill('0,5 WETH prudemment'); await page.getByLabel('En une phrase').press('Enter')
s = await until((x) => !!x.proposal, 'bornes demandées au clavier (Entrée)', 120000)
await page.locator('button.segment', { hasText: '1 WETH, profil offensif' }).click()
s = await until((x) => x.proposal && Number(x.proposal.budget_weth) === 1, 'une puce d’exemple change les bornes', 120000)
await shot('05-app-mandat')
await btn('Signer sur Ledger', true).click()
s = await until((x) => x.signed, 'mandat signé dans la page', 180000)
if (!(await has('Mandat signé')) && !(await has('mandat signé'))) note('après la signature, la page ne dit pas clairement « mandat signé »')

// ───────────── 5 · the agents page: empty state, a rhythmic bot, stop, restart, a second bot, the filters
await go('Agents de trading')
if (!(await has('Aucun bot ne tourne'))) note('la page des agents sans bot n’a pas son état vide')
await shot('06-agents-vide')
await page.getByLabel('Nom').fill('Rythmé'); await page.getByLabel('Univers').selectOption('pools'); await page.getByLabel('Tranches').fill('2'); await page.getByLabel('Rythme').selectOption('30')
await btn('Ajouter et lancer').click()
s = await until((x) => x.bots.some((b) => b.name === 'Rythmé' && b.status === 'running'), 'bot rythmé ajouté et en marche', 60000)
s = await until((x) => x.bots.some((b) => b.name === 'Rythmé' && b.rounds >= 1), 'un premier tour', 300000, 2000)
await page.getByLabel('Nom').fill('Second'); await page.getByLabel('Rythme').selectOption('60'); await btn('Ajouter et lancer').click()
s = await until((x) => x.bots.filter((b) => b.status === 'running').length === 2, 'deux bots en marche', 60000)
if (s.bot_running && s.bots.filter((b) => b.status === 'running').length === 2) log('ok  un seul tour à la fois : ' + s.bot_running)
await shot('07-agents-actifs')
await page.locator('tr', { hasText: 'Rythmé' }).getByRole('button', { name: 'Arrêter' }).click()
s = await until((x) => x.bots.some((b) => b.name === 'Rythmé' && b.status !== 'running'), 'bot arrêté', 60000)
if (!(await has('Historique')) && !(await has('historique'))) note('le bot arrêté n’est pas présenté comme un historique')
await page.locator('tr', { hasText: 'Rythmé' }).getByRole('button', { name: 'Relancer' }).click()
s = await until((x) => x.bots.some((b) => b.name === 'Rythmé' && b.status === 'running'), 'bot relancé depuis l’historique', 60000)
for (const b of s.bots.filter((b) => b.status === 'running')) await api('/bots/stop', { id: b.id })
s = await until((x) => !x.bots.some((b) => b.status === 'running'), 'tous les bots arrêtés', 60000)
await page.getByRole('group', { name: 'Filtrer le journal' }).getByRole('button', { name: 'Refus' }).click(); await sleep(500)
const rowsRefus = await page.locator('table.data-table tbody tr').allInnerTexts()
if (rowsRefus.length && rowsRefus.some((r) => /OK|ENTR/i.test(r) && !/REFUS/i.test(r))) note('le filtre « Refus » laisse passer des entrées')
await page.getByRole('group', { name: 'Filtrer le journal' }).getByRole('button', { name: 'Tout' }).click(); await sleep(300)

// ───────────── 6 · the requests: a one-shot round (ten slices) raises them; leave one refused, sign the next
await page.locator('button.segment', { hasText: 'Ou lancer un seul tour maintenant' }).click()
s = await until((x) => x.bots.some((b) => /tour unique/.test(b.name) && b.status === 'done'), 'un tour unique terminé', 420000, 2000)
s = await until((x) => x.escalation && x.escalation.possible, 'une demande hors bornes est là', 120000)
const q0 = s.escalation_queue.length; const p0 = s.escalation.pool_id
await btn('Laisser refusé').click()
s = await until((x) => x.refused_escalations.includes(p0.toLowerCase()) || !x.escalation || x.escalation.pool_id !== p0, '« laisser refusé » : la demande suivante monte', 30000)
log(`file : ${q0} → ${s.escalation_queue.length}`)
await shot('08-demandes')
if (s.escalation && s.escalation.possible) {
  const n = s.exception_buys.length
  await btn('Lire et signer sur Ledger').click()
  s = await until((x) => x.exception_buys.length > n || x.log.some((l) => /dérogation/.test(l) && /refus|empir/.test(l)), 'dérogation signée (ou refusée par le coffre, dit)', 240000)
}

// ───────────── 7 · the analyst: Enter, then a follow-up that needs the history
await go('Analyste')
await page.getByLabel('Votre question').fill('Que font mes bots ?'); await page.getByLabel('Votre question').press('Enter')
s = await until((x) => x.analysis && !x.analysis.pending && x.analysis.answer, 'l’analyste répond (Entrée)', 300000, 2500)
await page.getByLabel('Votre question').fill('Et lequel a le plus de refus ?'); await btn('Demander', true).click()
s = await until((x) => x.analyses.length >= 2 && !x.analysis.pending && x.analysis.answer, 'une seconde question, avec l’historique', 300000, 2500)
if (!(await page.locator('.thread__trace').count())) note('la trace des outils n’est pas visible sous la réponse')
await shot('09-analyste')

// ───────────── 8 · the account: key, config, copy, history, reset cancelled
await go('Compte')
await btn('Révéler').click(); await sleep(300)
const key = (await page.locator('.t-mono-data-lg').first().innerText()).trim()
if (!/^[A-Za-z0-9_-]{20,}$/.test(key)) fail('la clé MCP révélée n’a pas la forme attendue : ' + key.slice(0, 20))
await btn('Copier la clé').click(); await sleep(400)
if (!(await has('Clé copiée')) && !(await has('Copie impossible'))) note('« Copier la clé » ne dit ni copié ni impossible')
await btn('Configuration Claude').click(); await sleep(300)
if (!(await has('porte-de-sortie'))) fail('la configuration Claude ne s’affiche pas')
const events = await page.locator('table.data-table tbody tr').count()
if (events < 5) fail('l’historique du compte est vide ou trop court : ' + events)
dialogAnswer = false; await btn('Remettre à zéro').click(); await sleep(1500)
s = await state(); if (!s.vault) fail('« annuler » sur la remise à zéro a quand même remis à zéro')
else log('ok  remise à zéro annulée : rien n’a bougé')
await shot('10-compte')

// ───────────── 9 · the device page: the two bench signing paths sign a fresh mandate each, then a Speculos restart
const freshMandate = async () => {
  await api('/reset'); await until((x) => !x.vault, 'compte remis à zéro')
  await api('/boot'); await until((x) => !!x.vault, 'session rouverte', 180000)
  await api('/chat', { prompt: '0,5 WETH prudemment' }); await until((x) => !!x.proposal && !x.signed, 'bornes prêtes', 120000)
}
for (const [label, signer, line] of [['Client APDU · banc', 'python', /client officiel en APDU/], ['Signer Kit · banc', 'dmk', /Signer Kit \+ DMK/]]) {
  await freshMandate()
  await go('Appareil'); await btn(label).click(); s = await until((x) => x.signer === signer, 'chemin = ' + label)
  await go('Vue d’ensemble'); await btn('Signer sur Ledger', true).click()
  s = await until((x) => x.signed && x.log.some((l) => /mandat signé sur l'appareil/.test(l) && line.test(l)), `mandat signé par « ${label} », sur la Flex du banc`, 180000)
}
await go('Appareil'); await btn('Ma Ledger · ce navigateur').click(); s = await until((x) => x.signer === 'browser', 'chemin = ma Ledger · ce navigateur')
// the live screen: a tap on the picture reaches the emulator
let fingered = false; page.on('request', (r) => { if (r.url().includes('/api/finger')) fingered = true })
const img = page.locator('.device-frame img').first()
if (await img.count()) { const b = await img.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(600); if (!fingered) note('un clic sur l’écran en direct n’envoie rien à l’émulateur'); else log('ok  un clic sur l’écran en direct touche l’émulateur') } else note('l’écran de la Flex en direct n’est pas affiché sur /appareil')
await shot('11-appareil')
log('— redémarrage de l’émulateur sous la page, puis une signature dans la page')
await freshMandate()
execSync(`cd ${BENCH} && FORCE=1 ledger/speculos.sh up >/dev/null 2>&1`)
kill(); await sleep(1000); holder = porteur()
await go('Vue d’ensemble'); await btn('Signer sur Ledger', true).click()
s = await until((x) => x.signed && !x.signing && !x.pending, 'après un redémarrage de l’émulateur, la page se reconnecte et signe', 180000)

// ───────────── 10 · on a phone: the menu, a page, a form
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'fr-FR' })).newPage()
await m.context().addCookies(await ctx.cookies())
await m.goto(URL + '/app', { waitUntil: 'domcontentloaded' }); await sleep(2000)
await m.getByRole('button', { name: 'Menu' }).click(); await sleep(400)
await m.getByRole('navigation', { name: 'Principale' }).last().getByRole('link', { name: 'Compte' }).click(); await sleep(1200)
if (!/\/compte$/.test(m.url())) fail('sur téléphone, le menu ne mène pas à /compte : ' + m.url())
await m.screenshot({ path: `${OUT}/12-mobile-menu.png` })
await m.goto(URL + '/app/analyste', { waitUntil: 'domcontentloaded' }); await sleep(1500)
if (!(await m.getByLabel('Votre question').isVisible())) fail('sur téléphone, le champ de question de l’analyste n’est pas visible')
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
await page.goto(URL + '/compte', { waitUntil: 'domcontentloaded' }); await sleep(1500)
dialogAnswer = true; await btn('Remettre à zéro').click()
s = await until((x) => !x.vault && !x.signed, 'remise à zéro acceptée : plus de coffre ni de mandat', 30000)
await page.goto(URL + '/app', { waitUntil: 'domcontentloaded' }); await sleep(1500)
if (!(await btn('Ouvrir une session').count())) fail('après la remise à zéro, /app ne propose pas d’ouvrir une session')

kill()
log(failed ? 'USAGE : des échecs' : 'USAGE : tout est passé')
if (notes.length) { log('— remarques d’utilisabilité :'); for (const n of notes) console.log('   · ' + n) }
await browser.close(); process.exit(failed ? 1 : 0)
