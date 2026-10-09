#!/usr/bin/env node
// Le parcours complet, dans un VRAI navigateur (Chromium headless) : la page du banc, le Signer Kit dans la page,
// l'émulateur par le proxy. Un « porteur » automatique doit approuver ce que l'appareil montre (scripts/porteur.py).
//
//   node scripts/parcours.mjs [dossier de sortie]         # tout, depuis la connexion SIWE
//   RESUME=1 node scripts/parcours.mjs                    # reprend le compte connecté (cookie) là où il en est
//
// Playwright : `npm i -D playwright@1.63.0` dans ledger/dmk, ou PLAYWRIGHT_DIR=<dossier qui contient node_modules/playwright>.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const PW = process.env.PLAYWRIGHT_DIR || path.join(ROOT, 'ledger', 'dmk');
const { chromium } = createRequire(path.join(PW, 'package.json'))('playwright');

const URL = process.env.PDS_URL || 'http://127.0.0.1:8099', OUT = process.argv[2] || path.join(ROOT, 'captures', 'parcours');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (...a) => { const s = `[${((Date.now()-T0)/1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`; console.log(s); fs.appendFileSync(`${OUT}/journey.log`, s + '\n'); };
const fail = (m) => { log('ÉCHEC : ' + m); process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1380, height: 1900 }, locale: 'fr-FR' });
await ctx.addInitScript(() => { try { localStorage.setItem('pdsTransport', 'speculos'); } catch (e) {} });
const RESUME = process.env.RESUME === '1';
if (RESUME) { const sessions = JSON.parse(fs.readFileSync(path.join(ROOT, 'accounts', 'sessions.json'), 'utf8')); const token = Object.keys(sessions).pop(); await ctx.addCookies([{ name: 'pds_session', value: token, domain: '127.0.0.1', path: '/' }]); }
const page = await ctx.newPage();
const dialogs = [];
page.on('dialog', async d => { dialogs.push(d.message()); log('ALERTE page : ' + d.message()); await d.dismiss(); });
page.on('console', m => { if (m.type() === 'error') log('console : ' + m.text().slice(0, 200)); });

const state = () => page.evaluate(() => fetch('/api/state').then(r => r.json()));
async function until(pred, label, timeout = 120000, every = 1200) {
  const t = Date.now(); let s;
  while (Date.now() - t < timeout) { s = await state(); if (pred(s)) { log(`ok  ${label}`); return s; } await sleep(every); }
  fail(`${label} : pas atteint en ${timeout / 1000}s`); return s;
}
const click = async (sel) => { await page.waitForSelector(sel + ':not([disabled])', { timeout: 60000 }); await page.click(sel); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// l'émulateur doit répondre avant de commencer (un redémarrage prend quelques secondes)
for (let i = 0; i < 120; i++) { try { const r = await fetch(URL + "/speculos/events?currentscreenonly=true"); if (r.ok) break; } catch (e) {} await sleep(500); }
await page.goto(URL); await page.waitForSelector('#b-login'); await sleep(1500);
let s = await state();
log(`banc : anvil=${s.anvil} speculos=${s.speculos} compte=${s.address || 'invité'} signer=${s.signer}`);

let ADDR = s.address;
if (RESUME && s.signed) { log(`REPRISE : compte ${s.address}, coffre ${s.vault}, mandat déjà signé — on saute à l'agent`); } else {
// 0 · repartir de zéro : déconnexion, chemin « ma Ledger · navigateur », émulateur
if (s.address) { await click('#b-logout'); await page.waitForSelector('#b-login'); await sleep(1500); log('déconnecté'); }
await click('#s-browser'); await sleep(600); await click('#t-speculos'); await sleep(600);
s = await until(x => x.signer === 'browser', 'chemin = ma Ledger · navigateur');

// 1 · se connecter : Sign-In with Ethereum, signé par le Signer Kit DANS la page, sur l'émulateur via le proxy
const t1 = Date.now();
await click('#b-login');
s = await until(x => !!x.address, 'connexion SIWE (compte créé / rouvert)', 90000);
log(`compte : ${s.address}  (${((Date.now()-t1)/1000).toFixed(1)} s)`);
ADDR = s.address;

// 2 · remise à zéro du compte (pas du banc), puis une session : un coffre neuf pour cette adresse
await page.evaluate(() => fetch('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.json()));
await page.reload(); await sleep(1500);
s = await until(x => x.address === ADDR && !x.vault, 'compte remis à zéro, toujours connecté');
const t2 = Date.now();
await click('#b-boot');
s = await until(x => !!x.vault, 'session ouverte : coffre déployé', 180000);
log(`coffre ${s.vault}  owner ${s.owner}  weth ${s.weth}  (${((Date.now()-t2)/1000).toFixed(1)} s)`);
if ((s.owner || '').toLowerCase() !== ADDR.toLowerCase()) fail('le owner du coffre n\'est pas le compte');

// 3 · une phrase → des bornes (le stratège)
await page.fill('#prompt', '0,5 WETH prudemment sur la longue traîne de Base, je ne veux pas rester coincé dans une position');
await page.click('#b-ask');
s = await until(x => !!x.proposal, 'stratégie proposée', 120000);
log(`bornes : budget ${s.proposal.budget_weth} WETH · perte de sortie ${s.proposal.max_round_trip_loss_bps} bps · ${s.proposal.ticks} tranches de ${s.proposal.slice_weth}`);

// 4 · le mandat, signé dans la page (Signer Kit, context module à nous), approuvé sur l'appareil
const t4 = Date.now();
await click('#b-sign');
s = await until(x => x.signed, 'mandat signé (EIP-712, dans le navigateur)', 120000);
if (!s.signed) { log('arrêt : pas de mandat signé — ' + (s.log.slice(-1)[0] || '')); await shot('01-echec-mandat'); await browser.close(); process.exit(1); }
log(`mandat : ${JSON.stringify(s.mandate.mandate)}  rapport : ${JSON.stringify(s.last_report || {}).slice(0, 160)}  (${((Date.now()-t4)/1000).toFixed(1)} s)`);
await shot('01-mandat');
}

// 5 · pools v4 : l'agent tourne, le coffre refuse ce qui ne ressort pas
await click('#u-pools'); s = await until(x => x.universe === 'pools', 'univers = pools v4');
if (!(RESUME && s.escalation)) {
const nb0 = (s.bots || []).length;
await click('#b-run');
s = await until(x => (x.bots || []).length > nb0, 'tour unique (pools) lancé', 30000);
s = await until(x => !x.running && x.bots.slice(-1)[0].status !== 'running', 'tour pools terminé', 420000, 2000);
} else log('REPRISE : une escalade attend déjà, pas de nouveau tour');
const rows = s.journal.map(r => `${r.decision === 'EXECUTED' ? 'OK ' : 'NON'} ${r.name || r.pool} exit=${r.exit ?? '?'}${r.under_exception ? ' (déro.)' : ''}`);
log(`journal pools (${s.journal.length}) : ${rows.join(' | ')}`);
log(`escalade : ${s.escalation ? s.escalation.question : 'aucune'}`);
await shot('02-pools');

// 6 · la dérogation : le porteur lit le coût réel et signe (dans la page), l'achat passe sous dérogation
if (s.escalation) {
  const t6 = Date.now();
  await click('#b-esc');
  s = await until(x => x.exception_buys.length > 0 || (!x.signing && !x.pending && !x.escalation), 'dérogation pool signée et achat exécuté', 150000);
  log(`achats sous dérogation : ${s.exception_buys.length}  positions : ${s.positions.length}  (${((Date.now()-t6)/1000).toFixed(1)} s)`);
  if (!s.exception_buys.length) fail('pas d\'achat sous dérogation');
  // 7 · resonder, puis resonder et sortir
  await click('#b-watch'); s = await until(x => !x.watching && x.watch, 'resondage', 120000);
  log(`watch : ${JSON.stringify((s.watch.rows || []).map(r => [r.name || (r.pool_id || '').slice(0, 10), r.exit_bps_at_buy, r.exit_bps_now, r.action]))}`);
  await click('#b-watch-sell'); s = await until(x => !x.watching && x.watch && x.watch.sell_if != null, 'resonder et sortir', 180000);
  log(`watch+sell : ${JSON.stringify((s.watch.rows || []).map(r => [r.name || (r.pool_id || '').slice(0, 10), r.exit_bps_at_buy, r.exit_bps_now, r.action]))}`);
  await shot('03-pools-derogation-watch');
} else fail('aucune escalade après le tour pools : rien à signer');

// 8 · coffres ERC-4626 : même mandat, dix coffres réels de Base
await click('#u-vaults'); s = await until(x => x.universe === 'vaults', 'univers = coffres ERC-4626');
const before = s.journal.length;
const nbots = (s.bots || []).length;
await click('#b-run');
s = await until(x => (x.bots || []).length > nbots, 'tour unique (coffres) lancé', 30000);
s = await until(x => !x.running && x.bots.slice(-1)[0].status !== 'running', 'tour coffres terminé', 600000, 2000);
const vrows = s.journal.slice(before).map(r => `${r.decision === 'EXECUTED' ? 'OK ' : 'NON'} ${r.kind || 'pool'} ${r.name || r.pool} exit=${r.exit ?? '?'}${r.stuck_bps != null ? ' porte=' + r.stuck_bps : ''}${r.deposit_refused ? ' (dépôt refusé)' : ''}`);
log(`journal coffres (${s.journal.length - before}) : ${vrows.join(' | ')}`);
if (!s.journal.slice(before).some(r => r.kind === 'vault')) fail('le tour « coffres » n\'a pas produit de lignes kind=vault');
log(`escalade : ${s.escalation ? s.escalation.question : 'aucune'}`);
await shot('04-vaults');

// 9 · la dérogation coffre (Moonwell), signée dans la page
if (s.escalation) {
  const t9 = Date.now(); const nb = s.exception_buys.length;
  await click('#b-esc');
  s = await until(x => x.exception_buys.length > nb || (!x.signing && !x.pending && !x.escalation), 'dérogation coffre signée et entrée exécutée', 180000);
  log(`achats sous dérogation : ${s.exception_buys.length}  positions : ${JSON.stringify(s.positions.map(p => [p.kind, p.name || p.pool, p.under_exception ? 'déro.' : '']))}  (${((Date.now()-t9)/1000).toFixed(1)} s)`);
  if (s.exception_buys.length <= nb) fail('pas d\'entrée sous dérogation dans le coffre');
  await click('#b-watch'); s = await until(x => !x.watching && x.watch, 'resondage (coffres)', 180000);
  log(`watch : ${JSON.stringify((s.watch.rows || []).map(r => [r.kind, r.name || (r.pool_id || '').slice(0, 10), r.exit_bps_at_buy, r.exit_bps_now, r.action]))}`);
  await shot('05-vaults-derogation-watch');
} else if (!RESUME) fail('aucune escalade après le tour coffres (Moonwell aurait dû déborder)'); else log('reprise : Moonwell déjà détenu, pas de nouvelle escalade — normal');

// 9 bis · les bots : en ajouter un qui tourne à son rythme, le voir faire un tour, l'arrêter, le retrouver dans l'historique
{
  const nb = (s.bots || []).length;
  await page.fill('#bot-name', 'explorateur de nuit'); await page.selectOption('#bot-universe', 'pools');
  await page.fill('#bot-ticks', '2'); await page.selectOption('#bot-interval', '30'); await page.click('#b-bot-add');
  s = await until(x => (x.bots || []).length > nb && x.bots.some(b => b.name === 'explorateur de nuit' && b.status === 'running'), 'bot ajouté et lancé', 30000);
  s = await until(x => { const b = x.bots.find(y => y.name === 'explorateur de nuit'); return b && b.rounds >= 1 && !x.running; }, 'premier tour du bot', 180000, 2000);
  let b = s.bots.find(y => y.name === 'explorateur de nuit');
  log(`bot « ${b.name} » : ${b.rounds} tour, ${b.executed} achat(s), ${b.refused} refus, prochain tour dans ${Math.round(b.next_run - Date.now()/1000)} s · lignes du journal au nom du bot : ${s.journal.filter(r => r.bot === b.name).length}`);
  if (!s.journal.some(r => r.bot === b.name)) fail('le journal ne porte pas le nom du bot');
  await page.click(`button[data-stop="${b.id}"]`);
  s = await until(x => x.bots.find(y => y.name === 'explorateur de nuit').status === 'stopped', 'bot arrêté', 30000);
  b = s.bots.find(y => y.name === 'explorateur de nuit');
  log(`historique : ${b.name} · ${b.status} · ${b.stop_reason} · ${b.rounds} tour(s)`);
  await page.$eval('#c-run', el => el.scrollIntoView()); await sleep(800); await page.locator('#c-run').screenshot({ path: `${OUT}/05b-bots.png` });
}

// 10 · l'analyste : une question, il répond par les outils du MCP, avec LA clé du compte
const t10 = Date.now();
await page.fill('#aq', 'que font mes bots, lequel a le plus de refus, et Moonwell, sa porte est fermée de combien ?');
await page.click('#b-analyze');
s = await until(x => x.analysis && !x.analysis.pending, 'réponse de l\'analyste', 300000, 2500);
log(`analyste (${((Date.now()-t10)/1000).toFixed(1)} s) outils : ${JSON.stringify(s.analysis.tools_used)}\n   réponse : ${(s.analysis.answer || s.analysis.error || '').slice(0, 700)}`);
if (!s.analysis.tools_used.length) fail('l\'analyste n\'a consulté aucun outil MCP');
await sleep(1500); await shot('06-analyste');

// 11 · mon compte : les gestes enregistrés, la clé dérivée, la config à coller dans Claude
await click('#b-login'); await sleep(1200);
await click('#b-reveal'); await sleep(800); await click('#b-mcpcfg'); await sleep(800);
const acc = await page.evaluate(() => fetch('/api/account?reveal=1').then(r => r.json()));
log(`compte : ${acc.profile.address} · ${acc.profile.logins} connexion(s) · événements : ${JSON.stringify(acc.events.map(e => e.kind))}`);
log(`clé MCP (dérivée) : ${acc.mcp_key}  config env : ${JSON.stringify(acc.mcp_config.mcpServers['porte-de-sortie'].env)}`);
for (const k of (RESUME ? ['login', 'run', 'run_done', 'watch', 'analysis', 'bot_added', 'bot_stopped'] : ['login', 'session', 'strategy', 'mandate_signed', 'run', 'run_done', 'notified', 'exception_signed', 'watch', 'analysis', 'bot_added', 'bot_stopped']))
  if (!acc.events.some(e => e.kind === k)) fail(`événement manquant : ${k}`);
await page.$eval('#c-account', el => el.scrollIntoView());
await page.locator('#c-account').screenshot({ path: `${OUT}/07-compte.png` });
await shot('08-page-complete');

// 12 · le schéma
await page.goto(URL + '/schema.html'); await sleep(800); await shot('09-schema');

// 13 · se déconnecter, revenir par l'autre chemin (adresse lue sur l'appareil du banc, Signer Kit côté serveur)
await page.goto(URL); await page.waitForSelector('#b-login'); await sleep(1200);
await click('#b-logout'); await page.waitForSelector('#b-login'); await sleep(1200);
s = await until(x => !x.address, 'déconnecté (invité)');
await click('#s-dmk'); s = await until(x => x.signer === 'dmk', 'chemin = Signer Kit · DMK (banc)');
await click('#b-login');
s = await until(x => x.address && x.address.toLowerCase() === ADDR.toLowerCase(), 'reconnexion par l\'appareil du banc : même compte', 90000);
log(`même compte, état retrouvé : coffre ${s.vault}  signé=${s.signed}  positions=${s.positions.length}  dérogations=${s.exception_buys.length}`);
if (!s.vault || !s.signed) fail('l\'état du compte n\'a pas été retrouvé après reconnexion');
await click('#s-browser'); await sleep(600);

log(`alertes : ${dialogs.length ? JSON.stringify(dialogs) : 'aucune'}`);
log(process.exitCode ? 'PARCOURS : des échecs (voir ÉCHEC)' : 'PARCOURS : tout est passé');
await browser.close();
