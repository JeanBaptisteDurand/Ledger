#!/usr/bin/env node
// Edge cases around the device, on the emulated Flex, through the front:
//   1. the holder REFUSES on the device → the page says so, nothing is signed, the flow stays usable
// The mandate is signed from the demo's live map (/demo#map), where the setup drawer carries « Sign on Ledger ».
//   2. two tabs of the same account → only the tab that asked signs (the other never touches the device)
//   3. the bench restarts → the pages recover the account's state by themselves
// Needs: the bench, the front (5173), and NO automatic holder running (this script starts its own).
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = 'http://127.0.0.1:5173'
const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')  // the repository root: the bench
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T0 = Date.now(); let failed = false
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`)
const fail = (m) => { failed = true; log('ÉCHEC : ' + m) }
const porteur = (mode) => { const out = fs.openSync(`/tmp/porteur-tests-${mode || 'normal'}.log`, 'a'); return spawn('python3', ['-u', `${BENCH}/scripts/porteur.py`, '600', '1', ...(mode ? [mode] : [])], { stdio: ['ignore', out, out] }) }
const kill = (p) => { try { p.kill() } catch {} }

const sessions = JSON.parse(fs.readFileSync(`${BENCH}/accounts/sessions.json`, 'utf8'))
const token = Object.keys(sessions).pop()
const browser = await chromium.launch({ headless: true, args: ['--disable-3d-apis'] })   // no WebGL: the hero shows its poster, the pages stay fast
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' })
  await ctx.addCookies([{ name: 'pds_session', value: token, domain: '127.0.0.1', path: '/' }])
  await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos') } catch {} })
  const page = await ctx.newPage(); page.on('dialog', (d) => d.accept()); return page
}
const state = (page) => page.evaluate(() => fetch('/api/state').then((r) => r.json()).catch(() => null))
const api = async (page, path, body = {}) => {
  const r = await page.evaluate(([p, b]) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch((e) => ({ ok: false, msg: 'fetch: ' + e })), [path, body])
  if (!r.ok) log(`    ${path} → ${r.msg}`)
  return r
}
/** A fresh vault: reset, then boot — and say what the bench answered if it did not deploy. */
const freshVault = async (page) => {
  await api(page, '/reset'); await until(page, (x) => !x.vault, 'compte remis à zéro', 30000)
  let r = await api(page, '/boot')
  if (!r.ok) { await sleep(2000); r = await api(page, '/boot') }
  await until(page, (x) => !!x.vault, 'coffre neuf', 180000)
}
async function until(page, pred, label, timeout = 90000) {
  const t = Date.now(); let s
  while (Date.now() - t < timeout) { s = await state(page); if (s && pred(s)) { log('ok  ' + label); return s } await sleep(1000) }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s
}

const A = await mk()
await A.goto(URL + '/demo#map', { waitUntil: 'domcontentloaded' }); await sleep(2500)
let s = await state(A)
if (!s?.address) { fail('pas de compte connecté (lance d’abord le parcours)'); process.exit(1) }
await api(A, '/signer', { signer: 'browser' })
if (!s.vault) { await api(A, '/boot'); await until(A, (x) => !!x.vault, 'coffre', 180000) }
if (!s.proposal) { await api(A, '/chat', { prompt: '0.5 WETH cautiously' }); await until(A, (x) => !!x.proposal, 'bornes', 120000) }
if (s.signed) { await freshVault(A); await api(A, '/chat', { prompt: '0.5 WETH cautiously' }); await until(A, (x) => !!x.proposal, 'bornes neuves', 120000) }
await A.reload(); await sleep(2500)

// 1 · refusal on the device
log('— 1 · le porteur refuse sur l’appareil')
let p = porteur('reject'); await sleep(1500)
await A.getByRole('button', { name: 'Sign on Ledger', exact: true }).first().click()
s = await until(A, (x) => !x.signing && !x.pending, 'signature terminée (refusée)', 120000)
if (s?.signed) fail('le mandat est signé alors que le porteur a refusé')
log(`écran de l’appareil : ${await A.evaluate(() => fetch('/speculos/events?currentscreenonly=true').then((r) => r.json()).then((j) => j.events.map((e) => e.text).filter(Boolean).join(' | ')).catch(() => '?'))}`)
const toast = await A.locator('.toast').allInnerTexts()
log(`page : ${toast.join(' | ') || '(pas de message)'} · serveur : ${s?.log.slice(-1)[0]}`)
if (!toast.some((t) => /refus/i.test(t))) fail('la page n’a pas dit que l’appareil a refusé')
kill(p); await sleep(1000)

// 2 · two tabs: only the asking tab signs
log('— 2 · deux onglets du même compte')
const B = await mk(); await B.goto(URL + '/demo#map', { waitUntil: 'domcontentloaded' }); await sleep(2500)
p = porteur(null); await sleep(1500)
const before = (await state(A)).log.length
await A.getByRole('button', { name: 'Sign on Ledger', exact: true }).first().click()
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
log(`la page affiche de nouveau le mandat : ${/Exit mandate · signed/i.test(txt) ? 'oui' : 'non'}`)
kill(p)
log(failed ? 'TESTS APPAREIL : des échecs' : 'TESTS APPAREIL : tout est passé')
await browser.close(); process.exit(failed ? 1 : 0)
