#!/usr/bin/env node
// Edge cases around the device, on the emulated Flex, through the front:
//   1. the holder REFUSES on the device → the page says so, nothing is signed, the flow stays usable
//   2. two tabs of the same account → only the tab that asked signs (the other never touches the device)
//   3. the bench restarts → the pages recover the account's state by themselves
// Needs: the bench, the front (5173), and NO automatic holder running (this script starts its own).
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const URL = 'http://127.0.0.1:5173'
const BENCH = '/Users/beorlor/Documents/ethonline/porte-de-sortie'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T0 = Date.now(); let failed = false
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`)
const fail = (m) => { failed = true; log('ÉCHEC : ' + m) }
const porteur = (mode) => { const out = fs.openSync(`/tmp/porteur-tests-${mode || 'normal'}.log`, 'a'); return spawn('python3', ['-u', `${BENCH}/scripts/porteur.py`, '600', '1', ...(mode ? [mode] : [])], { stdio: ['ignore', out, out] }) }
const kill = (p) => { try { p.kill() } catch {} }

const sessions = JSON.parse(fs.readFileSync(`${BENCH}/accounts/sessions.json`, 'utf8'))
const token = Object.keys(sessions).pop()
const browser = await chromium.launch({ headless: true })
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR' })
  await ctx.addCookies([{ name: 'pds_session', value: token, domain: '127.0.0.1', path: '/' }])
  await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
  const page = await ctx.newPage(); page.on('dialog', (d) => d.accept()); return page
}
const state = (page) => page.evaluate(() => fetch('/api/state').then((r) => r.json()).catch(() => null))
const api = (page, path, body = {}) => page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [path, body])
async function until(page, pred, label, timeout = 90000) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(page); if (s && pred(s)) { log('ok  ' + label); return s } await sleep(1000) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}

const A = await mk()
await A.goto(URL + '/app'); await sleep(2000)
let s = await state(A)
if (!s?.address) { fail('pas de compte connecté (lance d’abord le parcours)'); process.exit(1) }
await api(A, '/signer', { signer: 'browser' })
if (!s.vault) { await api(A, '/boot'); await until(A, (x) => !!x.vault, 'coffre') }
if (!s.proposal) { await api(A, '/chat', { prompt: '0,5 WETH prudemment' }); await until(A, (x) => !!x.proposal, 'bornes', 120000) }
if (s.signed) { await api(A, '/reset'); await sleep(500); await api(A, '/boot'); await until(A, (x) => !!x.vault, 'coffre neuf'); await api(A, '/chat', { prompt: '0,5 WETH prudemment' }); await until(A, (x) => !!x.proposal, 'bornes', 120000) }
await A.reload(); await sleep(2000)

// 1 · refusal on the device
log('— 1 · le porteur refuse sur l’appareil')
let p = porteur('reject'); await sleep(1500)
await A.getByRole('button', { name: 'Signer sur Ledger' }).click()
s = await until(A, (x) => !x.signing && !x.pending, 'signature terminée (refusée)', 120000)
if (s?.signed) fail('le mandat est signé alors que le porteur a refusé')
log(`écran de l’appareil : ${await A.evaluate(() => fetch('/speculos/events?currentscreenonly=true').then((r) => r.json()).then((j) => j.events.map((e) => e.text).filter(Boolean).join(' | ')).catch(() => '?'))}`)
const toast = await A.locator('.toast').allInnerTexts()
log(`page : ${toast.join(' | ') || '(pas de message)'} · serveur : ${s?.log.slice(-1)[0]}`)
if (!toast.some((t) => /refus/i.test(t))) fail('la page n’a pas dit que l’appareil a refusé')
kill(p); await sleep(1000)

// 2 · two tabs: only the asking tab signs
log('— 2 · deux onglets du même compte')
const B = await mk(); await B.goto(URL + '/app'); await sleep(2000)
p = porteur(null); await sleep(1500)
const before = (await state(A)).log.length
await A.getByRole('button', { name: 'Signer sur Ledger' }).click()
s = await until(A, (x) => x.signed, 'mandat signé par l’onglet demandeur', 180000)
const bHint = await B.locator('.device-hint').count()
const errors = (s?.log || []).slice(before).filter((l) => /erreur|6901|6980/i.test(l))
log(`onglet B a montré une consigne d’appareil : ${bHint ? 'OUI' : 'non'} · lignes d’erreur : ${errors.length}`)
if (bHint) fail('l’onglet B a tenté de signer')
if (errors.length) fail('des erreurs d’appareil pendant la signature : ' + errors.join(' / '))
await B.close()

// 3 · the bench restarts under the page
log('— 3 · redémarrage du banc sous la page')
execSync(`pkill -f "web/server.py" || true`); await sleep(1200)
spawn('bash', ['-c', `cd ${BENCH} && . .venv/bin/activate && nohup python3 web/server.py > /tmp/pds-web.log 2>&1 &`], { stdio: 'ignore', detached: true })
s = await until(A, (x) => x.signed && !!x.vault, 'état retrouvé après redémarrage (mandat, coffre)', 60000)
const txt = await A.innerText('body')
log(`la page affiche de nouveau le mandat : ${/mandat signé/i.test(txt) ? 'oui' : 'non'}`)
kill(p)
log(failed ? 'TESTS APPAREIL : des échecs' : 'TESTS APPAREIL : tout est passé')
await browser.close(); process.exit(failed ? 1 : 0)
