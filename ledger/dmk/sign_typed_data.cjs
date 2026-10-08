#!/usr/bin/env node
/**
 * Le chemin « Signer » du brief, littéralement : le Signer Kit Ethereum de Ledger, sur le DMK,
 * fait signer NOTRE mandat EIP-712 à l'appareil — Speculos ou Flex en USB — avec NOS filtres.
 *
 *   node ledger/dmk/sign_typed_data.cjs --typed-data mandate.typed.json --descriptor descriptors/mandate.json \
 *        [--speculos http://127.0.0.1:5013 | --usb] [--auto] [--shots captures/] [--out signature.json]
 *
 * Ce que ça montre, et que le client Python ne montrait pas :
 *
 *   1. le Signer Kit accepte un « context module » à nous. Le nôtre lit un descripteur compilé et signé
 *      localement (compile_descriptor.py) et ne contacte aucun serveur : c'est la CAL, sans la CAL ;
 *   2. sans descripteur (--blind), le kit signe quand même — l'appareil montre des hachages — et
 *      rend une signature identique au développeur. Il DÉTECTE le blind signing, le rapporte à Ledger
 *      (context module `report`) et le loggue en debug ; le développeur, lui, ne reçoit que {r, s, v}.
 *      Ici on imprime ce rapport, pour que ça se voie.
 *
 * Paquets : @ledgerhq/device-management-kit 1.9.1, device-signer-kit-ethereum 1.18.1,
 *           device-transport-kit-speculos 1.2.1, device-transport-kit-node-hid 1.0.1.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { firstValueFrom } = require("rxjs");
const {
  DeviceManagementKitBuilder, DeviceActionStatus, DeviceModelId, ConsoleLogger, LogLevel,
} = require("@ledgerhq/device-management-kit");
const { speculosTransportFactory } = require("@ledgerhq/device-transport-kit-speculos");
const { SignerEthBuilder } = require("@ledgerhq/device-signer-kit-ethereum");

// ------------------------------------------------------------------ arguments

function parseArgs(argv) {
  const a = { speculos: process.env.SPECULOS_URL || "http://127.0.0.1:5013", path: "44'/60'/0'/0/0",
              usb: false, auto: false, blind: false, verbose: false, shots: null, out: null,
              typedData: null, descriptor: null, address: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case "--typed-data": a.typedData = v; i++; break;
      case "--descriptor": a.descriptor = v; i++; break;
      case "--speculos": a.speculos = v; i++; break;
      case "--path": a.path = v; i++; break;
      case "--shots": a.shots = v; i++; break;
      case "--out": a.out = v; i++; break;
      case "--usb": a.usb = true; break;
      case "--auto": a.auto = true; break;
      case "--blind": a.blind = true; break;
      case "--verbose": a.verbose = true; break;
      case "--address": a.address = true; break;
      case "-h": case "--help": usage(0); break;
      default: console.error(`argument inconnu : ${k}`); usage(2);
    }
  }
  if (!a.address && !a.typedData) { console.error("--typed-data manquant"); usage(2); }
  if (!a.blind && !a.address && !a.descriptor) { console.error("--descriptor manquant (ou --blind pour signer sans filtres)"); usage(2); }
  return a;
}

function usage(code) {
  console.error(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 22).map(l => l.replace(/^ \*\/?/, "")).join("\n"));
  process.exit(code);
}

const log = (...m) => console.error(...m);

// ------------------------------------------------------------------ le context module à nous

/** Le hash de schéma tel que le Signer Kit le calcule (getSchemaHash) — pour vérifier qu'on parle du même. */
function schemaHashKit(schema) {
  const sorted = Object.fromEntries(Object.entries(schema).sort(([x], [y]) => x.localeCompare(y))
    .map(([tn, fields]) => [tn, fields.map(f => ({ name: f.name, type: f.type }))]));
  return crypto.createHash("sha224").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * Un ContextModule minimal : aucune requête réseau, un seul descripteur, un rapport imprimé.
 * (Interface : getContexts, getFieldContext, getTypedDataFilters, report, signReport.)
 */
function makeContextModule(descriptor, sink) {
  return {
    async getContexts() { return []; },
    async getFieldContext() { return { type: "error", error: new Error("porte-de-sortie : pas de contexte de champ") }; },
    async getTypedDataFilters(ctx) {
      if (!descriptor) {
        return { type: "error", error: new Error("aucun descripteur : le kit va signer en aveugle") };
      }
      const want = descriptor.verifyingContract.toLowerCase();
      const got = (ctx.verifyingContract || "").toLowerCase();
      const hash = schemaHashKit(ctx.schema);
      if (got !== want || Number(ctx.chainId) !== Number(descriptor.chainId) || hash !== descriptor.schemaHashKit) {
        return { type: "error", error: new Error(
          `descripteur pour ${want}@${descriptor.chainId}/${descriptor.schemaHashKit.slice(0, 12)}, ` +
          `demandé ${got}@${ctx.chainId}/${hash.slice(0, 12)}`) };
      }
      sink.contextServed = { version: ctx.version, fields: ctx.fieldsValues.map(f => f.path) };
      return {
        type: "success",
        messageInfo: descriptor.kit.messageInfo,
        filters: descriptor.kit.filters,
        trustedNamesAddresses: {},
        tokens: Object.fromEntries(Object.entries(descriptor.kit.tokens).map(([k, v]) => [Number(k), v])),
        calldatas: {},
      };
    },
    // Ce que le kit enverrait au « reporter » de Ledger. On le garde, on l'imprime, rien ne part.
    async report(params) { sink.blindSigningReport = params; },
    async signReport(params) { sink.signReport = params; },
  };
}

// ------------------------------------------------------------------ Speculos : piloter l'écran

async function speculos(url, method, route, body) {
  const r = await fetch(url + route, { method, headers: { "content-type": "application/json" },
                                      body: body ? JSON.stringify(body) : undefined });
  return r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenEvents(url) {
  const r = await speculos(url, "GET", "/events?currentscreenonly=true");
  return (await r.json()).events || [];
}
async function finger(url, action, x, y) { await speculos(url, "POST", "/finger", { action, x, y }); }
async function tap(url, x, y, hold = 0.2) { await finger(url, "press", x, y); await sleep(hold * 1000); await finger(url, "release", x, y); await sleep(600); }
async function swipeLeft(url) { await finger(url, "press", 400, 300); await sleep(150); await finger(url, "release", 80, 300); await sleep(700); }

/**
 * Avant de signer, le kit demande à l'app d'activer « Transaction Check » (le service de Ledger) et
 * l'appareil pose la question au porteur. Sur Speculos le réglage repart à zéro à chaque lancement,
 * donc la question revient à chaque fois. On répond « Maybe later » : notre mandat n'en a pas besoin.
 */
async function declineTxCheck(url) {
  for (let i = 0; i < 20; i++) {
    const ev = await screenEvents(url);
    const later = ev.find(e => /maybe later/i.test(e.text || ""));
    if (later) { await tap(url, 240, later.y + 10); return true; }
    await sleep(300);
  }
  return false;
}

/** Port de navigate_and_sign (sign_mandate.py) : défile, capture, maintient « Hold to sign ». */
async function autoReview(url, shotsDir, prefix, stop) {
  const pages = [];
  let last = null;
  await sleep(1200);
  for (let i = 0; i < 24 && !stop.done; i++) {
    let ev = await screenEvents(url);
    let texts = ev.filter(e => e.text).map(e => e.text);
    if (JSON.stringify(texts) === JSON.stringify(last)) {
      await swipeLeft(url);
      ev = await screenEvents(url); texts = ev.filter(e => e.text).map(e => e.text);
      if (JSON.stringify(texts) === JSON.stringify(last)) continue;
    }
    last = texts;
    log(`    écran ${pages.length}: ${texts.join(" | ")}`);
    if (shotsDir) {
      fs.mkdirSync(shotsDir, { recursive: true });
      const png = await (await speculos(url, "GET", "/screenshot")).arrayBuffer();
      fs.writeFileSync(path.join(shotsDir, `${prefix}-${String(pages.length).padStart(2, "0")}.png`), Buffer.from(png));
    }
    pages.push(texts);
    if (texts.some(t => /signed/i.test(t))) break;
    const hold = ev.find(e => /hold to sign/i.test(e.text || ""));
    if (hold) { await tap(url, 240, hold.y + 10, 2.2); continue; }
    const accept = ev.find(e => /accept risk and continue/i.test(e.text || ""));
    if (accept) { await tap(url, 240, accept.y); continue; }
    await swipeLeft(url);
  }
  return pages;
}

// ------------------------------------------------------------------ main

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const typedData = a.typedData ? JSON.parse(fs.readFileSync(a.typedData, "utf8")) : null;
  const descriptor = a.descriptor && !a.blind ? JSON.parse(fs.readFileSync(a.descriptor, "utf8")) : null;

  // 1. le DMK, avec le transport qu'on a : Speculos (HTTP) ou un appareil en USB (node-hid)
  let builder = new DeviceManagementKitBuilder();
  if (a.verbose) builder = builder.addLogger(new ConsoleLogger(LogLevel.Debug));
  let transport;
  if (a.usb) {
    const { nodeHidTransportFactory } = require("@ledgerhq/device-transport-kit-node-hid");
    transport = nodeHidTransportFactory;
    log("transport : USB (node-hid) — branche et déverrouille le Flex, ouvre l'app Ethereum");
  } else {
    transport = speculosTransportFactory(a.speculos, false, DeviceModelId.FLEX);
    log(`transport : Speculos ${a.speculos} (Flex)`);
  }
  const dmk = builder.addTransport(transport).build();

  const device = await firstValueFrom(dmk.startDiscovering({}));
  // rafraîchisseur coupé : son battement b001000000 (toutes les secondes, délai 800 ms) tue une signature qu'un humain met
  // plus de quelques secondes à lire ; et c'est lui qui corrompt l'appareil quand un second client est ouvert (0x6901)
  const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
  const connected = dmk.getConnectedDevice({ sessionId });
  log(`appareil : ${connected.modelId} · ${connected.name || ""}`);

  // 2. le Signer Kit, avec NOTRE context module
  const sink = {};
  const signer = new SignerEthBuilder({ dmk, sessionId })
    .withContextModule(makeContextModule(descriptor, sink))
    .build();

  const result = { transport: a.usb ? "usb" : "speculos", derivationPath: a.path, steps: [] };

  // 3. l'adresse du porteur (sans rien afficher), pour que le contrat sache qui vérifier
  {
    const st = await lastState(signer.getAddress(a.path, { checkOnDevice: false, returnChainCode: false }).observable);
    if (st.status !== DeviceActionStatus.Completed) throw new Error("getAddress : " + describe(st));
    result.owner = st.output.address;
    log(`porteur (Ledger) : ${result.owner}`);
    if (a.address) { finish(result, a); dmk.close(); return; }
  }

  // 4. la signature — le kit construit le contexte (nos filtres), le pousse à l'app, puis signe
  log(descriptor ? `descripteur : ${descriptor.kind} · ${Object.keys(descriptor.kit.filters).length} filtres · ${descriptor.signedWith}`
                 : "AUCUN descripteur : signature en aveugle, comme une intégration sans originToken");
  const { observable } = signer.signTypedData(a.path, typedData);
  const stop = { done: false };
  let review = null;
  const final = await new Promise((resolve, reject) => {
    observable.subscribe({
      next: st => {
        if (st.status === DeviceActionStatus.Pending && st.intermediateValue) {
          const { step, requiredUserInteraction } = st.intermediateValue;
          const line = `${step}${requiredUserInteraction && requiredUserInteraction !== "none" ? "  ← " + requiredUserInteraction : ""}`;
          if (result.steps[result.steps.length - 1] !== line) { result.steps.push(line); log("  " + line); }
          if (a.auto && !a.usb && requiredUserInteraction === "web3-checks-opt-in" && !result.txCheckPrompt) {
            result.txCheckPrompt = "l'appareil a d'abord proposé d'activer Transaction Check — répondu « Maybe later »";
            declineTxCheck(a.speculos).then(ok => { if (!ok) log("  (pas trouvé « Maybe later » à l'écran)"); });
          }
          if (a.auto && !a.usb && requiredUserInteraction === "sign-typed-data" && !review) {
            review = autoReview(a.speculos, a.shots, descriptor ? descriptor.kind : "blind", stop);
          }
        } else if (st.status === DeviceActionStatus.Completed || st.status === DeviceActionStatus.Error
                   || st.status === DeviceActionStatus.Stopped) {
          resolve(st);
        }
      },
      error: reject,
    });
  });
  stop.done = true;
  if (review) result.screens = await review;

  if (final.status !== DeviceActionStatus.Completed) {
    result.error = describe(final);
    log("ÉCHEC : " + result.error);
  } else {
    const { r, s, v } = final.output;
    const vv = Number(v) < 27 ? Number(v) + 27 : Number(v);
    result.r = r; result.s = s; result.v = vv;
    result.signature = "0x" + r.replace(/^0x/, "").padStart(64, "0") + s.replace(/^0x/, "").padStart(64, "0")
                       + vv.toString(16).padStart(2, "0");
    log(`SIGNÉ sur l'appareil — v=${vv}`);
  }

  // 5. ce que le kit sait, et que son résultat ne dit pas
  result.contextServed = sink.contextServed || null;
  result.blindSigningReport = sink.blindSigningReport || null;
  if (sink.blindSigningReport) {
    const b = sink.blindSigningReport;
    log(`rapport du kit (partirait chez Ledger) : isBlindSign=${b.isBlindSign}` +
        (b.blindSignReason ? ` · raison=${b.blindSignReason}` : "") +
        (b.ethContext ? ` · clearSigningType=${b.ethContext.clearSigningType} · erreurs de contexte=${b.ethContext.partialContextErrors}` : ""));
  }
  finish(result, a);
  try { await dmk.disconnect({ sessionId }); } catch { /* Speculos : rien à fermer */ }
  dmk.close();
  process.exit(result.signature ? 0 : 1);
}

function describe(st) {
  const e = st.error || {};
  return `${st.status} ${e._tag || e.name || ""} ${e.errorCode || ""} ${e.message || ""}`.trim();
}

async function lastState(observable) {
  return new Promise((resolve, reject) => observable.subscribe({
    next: st => { if (st.status !== DeviceActionStatus.Pending && st.status !== DeviceActionStatus.NotStarted) resolve(st); },
    error: reject,
  }));
}

function finish(result, a) {
  const text = JSON.stringify(result, null, 1);
  if (a.out) { fs.writeFileSync(a.out, text); log(`écrit : ${a.out}`); }
  else process.stdout.write(text + "\n");
}

main().catch(e => { log("erreur :", e && e.stack || e); process.exit(1); });
