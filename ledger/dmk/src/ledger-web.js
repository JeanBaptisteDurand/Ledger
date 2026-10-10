/**
 * La Ledger du porteur, dans SON navigateur — le chemin d'un client chez lui.
 *
 * Le même Signer Kit Ethereum que côté serveur (DMK + device-signer-kit-ethereum), avec le transport
 * WebHID pour une vraie Ledger branchée à l'ordinateur du porteur, ou le transport Speculos (à travers
 * le proxy du banc, même origine) pour l'appareil émulé. Notre context module sert nos descripteurs
 * compilés (servis par le banc) ; rien ne part vers un serveur de Ledger.
 *
 * Quatre gestes, et rien d'autre :
 *   connect(transport)         -> l'adresse du porteur (aucune signature)
 *   signMessage(message)       -> la connexion « Sign-In with Ethereum » (EIP-4361, signature EIP-191)
 *   signTypedData(typed, desc) -> le mandat, une dérogation, ou un retrait (EIP-712, clear-signé)
 *   signTransaction(tx)        -> le dépôt : un envoi d'ETH au coffre (la seule transaction, lue par toute app Ethereum)
 *
 * Bundle : `npm run build:web` dans ledger/dmk (esbuild) -> web/dist/ledger-web.js
 */

import { DeviceManagementKitBuilder, DeviceActionStatus, DeviceModelId, ConsoleLogger, LogLevel } from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { firstValueFrom } from "rxjs";
import * as nobleSha from "@noble/hashes/sha256";

const PATH = "44'/60'/0'/0/0";
let state = { dmk: null, sessionId: null, signer: null, address: null, transport: null };

async function sha224Hex(text) {
  // sha224 n'est pas dans WebCrypto : on le prend au kit (il est déjà dans le bundle via @noble/hashes)
  const { sha224 } = nobleSha;
  const bytes = sha224(new TextEncoder().encode(text));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Le hash de schéma tel que le Signer Kit le calcule (getSchemaHash), pour vérifier qu'on parle du même. */
async function schemaHashKit(schema) {
  const sorted = Object.fromEntries(Object.entries(schema).sort(([x], [y]) => x.localeCompare(y))
    .map(([tn, fields]) => [tn, fields.map(f => ({ name: f.name, type: f.type }))]));
  return sha224Hex(JSON.stringify(sorted));
}

/** Un ContextModule minimal : aucune requête réseau, un seul descripteur, le rapport gardé pour nous. */
function makeContextModule(descriptor, sink) {
  return {
    async getContexts() { return []; },
    async getFieldContext() { return { type: "error", error: new Error("porte-de-sortie : pas de contexte de champ") }; },
    async getTypedDataFilters(ctx) {
      if (!descriptor) return { type: "error", error: new Error("aucun descripteur") };
      const want = descriptor.verifyingContract.toLowerCase();
      const got = (ctx.verifyingContract || "").toLowerCase();
      const hash = await schemaHashKit(ctx.schema);
      if (got !== want || Number(ctx.chainId) !== Number(descriptor.chainId) || hash !== descriptor.schemaHashKit) {
        return { type: "error", error: new Error(`descripteur ${want}@${descriptor.chainId}, demandé ${got}@${ctx.chainId}`) };
      }
      return {
        type: "success",
        messageInfo: descriptor.kit.messageInfo,
        filters: descriptor.kit.filters,
        trustedNamesAddresses: {},
        tokens: Object.fromEntries(Object.entries(descriptor.kit.tokens).map(([k, v]) => [Number(k), v])),
        calldatas: {},
      };
    },
    async report(params) { sink.report = params; },     // partirait chez Ledger ; ici il reste
    async signReport() {},
  };
}

function lastState(observable, onStep) {
  return new Promise((resolve, reject) => observable.subscribe({
    next: st => {
      if (st.status === DeviceActionStatus.Pending && st.intermediateValue && onStep) onStep(st.intermediateValue);
      if (st.status === DeviceActionStatus.Completed || st.status === DeviceActionStatus.Error
          || st.status === DeviceActionStatus.Stopped) resolve(st);
    },
    error: reject,
  }));
}

function describe(st) {
  const e = st.error || {};
  return `${e._tag || e.name || st.status} ${e.errorCode || ""} ${e.message || ""}`.trim();
}

function toSig({ r, s, v }) {
  const vv = Number(v) < 27 ? Number(v) + 27 : Number(v);
  return "0x" + r.replace(/^0x/, "").padStart(64, "0") + s.replace(/^0x/, "").padStart(64, "0") + vv.toString(16).padStart(2, "0");
}

/** Se connecter à la Ledger : 'webhid' (une vraie, branchée ici) ou 'speculos' (l'émulateur, via le proxy du banc). */
async function connect(transport = "webhid", speculosUrl = location.origin + "/speculos") {
  await disconnect();
  const factory = transport === "webhid" ? webHidTransportFactory : speculosTransportFactory(speculosUrl, false, DeviceModelId.FLEX);
  let b = new DeviceManagementKitBuilder().addTransport(factory);
  try { if (localStorage.getItem('pdsDebug') === '1') b = b.addLogger(new ConsoleLogger(LogLevel.Debug)); } catch { /* pas de stockage */ }
  const dmk = b.build();
  const device = await firstValueFrom(dmk.startDiscovering({}));   // WebHID : ouvre le sélecteur d'appareil du navigateur
  // sans le rafraîchisseur du DMK : il envoie b001000000 toutes les secondes avec un délai de 800 ms — pendant que le
  // porteur lit l'écran (10 s, 30 s…), ce battement expire, le transport Speculos coupe la session et la signature meurt
  const sessionId = await dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
  state = { dmk, sessionId, transport, address: null, signer: null };
  return getAddress();
}

async function getAddress() {
  const signer = new SignerEthBuilder({ dmk: state.dmk, sessionId: state.sessionId }).withContextModule(makeContextModule(null, {})).build();
  const st = await lastState(signer.getAddress(PATH, { checkOnDevice: false, returnChainCode: false }).observable);
  if (st.status !== DeviceActionStatus.Completed) throw new Error("getAddress : " + describe(st));
  state.address = st.output.address;
  return state.address;
}

/** Sign-In with Ethereum : un message texte (EIP-4361), signé en personal_sign (EIP-191) sur l'appareil. */
async function signMessage(message, onStep) {
  if (!state.dmk) throw new Error("pas de Ledger connectée");
  const signer = new SignerEthBuilder({ dmk: state.dmk, sessionId: state.sessionId }).withContextModule(makeContextModule(null, {})).build();
  const st = await lastState(signer.signMessage(PATH, message).observable, onStep);
  if (st.status !== DeviceActionStatus.Completed) throw new Error("signMessage : " + describe(st));
  return { signature: toSig(st.output), address: state.address };
}

/** Le mandat ou une dérogation : EIP-712 clear-signé avec NOS descripteurs. */
async function signTypedData(typedData, descriptor, onStep) {
  if (!state.dmk) throw new Error("pas de Ledger connectée");
  const sink = {};
  const signer = new SignerEthBuilder({ dmk: state.dmk, sessionId: state.sessionId }).withContextModule(makeContextModule(descriptor, sink)).build();
  const st = await lastState(signer.signTypedData(PATH, typedData).observable, onStep);
  if (st.status !== DeviceActionStatus.Completed) throw new Error("signTypedData : " + describe(st));
  return { signature: toSig(st.output), address: state.address, report: sink.report || null };
}

/* ----------------------------------------------------------- une transaction : le dépôt */

// RLP minimal, pour sérialiser une transaction EIP-1559 avant et après signature. Rien d'autre.
function hexToBytes(h) {
  h = String(h).replace(/^0x/, ""); if (h.length % 2) h = "0" + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function bigToBytes(v) { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return hexToBytes(h); }
function concat(...arrs) { const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; }
function rlpLen(len, offset) { if (len < 56) return new Uint8Array([len + offset]); const lb = bigToBytes(len); return concat(new Uint8Array([offset + 55 + lb.length]), lb); }
function rlpBytes(b) { return (b.length === 1 && b[0] < 0x80) ? b : concat(rlpLen(b.length, 0x80), b); }
function rlpList(items) { const body = concat(...items); return concat(rlpLen(body.length, 0xc0), body); }
const toHex = (b) => "0x" + Array.from(b, x => x.toString(16).padStart(2, "0")).join("");

/** Les neuf champs d'une transaction EIP-1559, dans l'ordre du type 2. */
function txFields(tx) {
  return [bigToBytes(tx.chainId), bigToBytes(tx.nonce), bigToBytes(tx.maxPriorityFeePerGas), bigToBytes(tx.maxFeePerGas),
          bigToBytes(tx.gas), hexToBytes(tx.to), bigToBytes(tx.value), hexToBytes(tx.data || "0x")].map(rlpBytes).concat([rlpList([])]);
}

/**
 * Le dépôt : un envoi d'ETH du porteur vers son coffre — la seule transaction que la Ledger signe, et que n'importe
 * quelle app Ethereum lit en clair (montant, destinataire, frais). `tx` vient du banc (chainId, nonce, frais, gaz,
 * destinataire, montant) ; on la sérialise, l'appareil la signe, on rend la transaction signée prête à publier.
 */
async function signTransaction(tx, onStep) {
  if (!state.dmk) throw new Error("pas de Ledger connectée");
  const unsigned = concat(new Uint8Array([2]), rlpList(txFields(tx)));
  const signer = new SignerEthBuilder({ dmk: state.dmk, sessionId: state.sessionId }).withContextModule(makeContextModule(null, {})).build();
  const st = await lastState(signer.signTransaction(PATH, unsigned).observable, onStep);
  if (st.status !== DeviceActionStatus.Completed) throw new Error("signTransaction : " + describe(st));
  const { r, s, v } = st.output;
  let y = Number(v); if (y === 27 || y === 28) y -= 27; if (y > 1) y = y & 1;  // type 2 : la parité, 0 ou 1
  const signed = concat(new Uint8Array([2]), rlpList(txFields(tx).concat([rlpBytes(bigToBytes(y)), rlpBytes(bigToBytes(r)), rlpBytes(bigToBytes(s))])));
  return { raw: toHex(signed), r, s, v: y, address: state.address };
}

async function disconnect() {
  if (state.dmk) {
    try { await state.dmk.disconnect({ sessionId: state.sessionId }); } catch { /* Speculos : rien à fermer */ }
    try { state.dmk.close(); } catch { /* idem */ }
  }
  state = { dmk: null, sessionId: null, signer: null, address: null, transport: null };
}

window.LedgerWeb = {
  connect, getAddress, signMessage, signTypedData, signTransaction, disconnect,
  address: () => state.address, transport: () => state.transport,
  webHidSupported: () => typeof navigator !== "undefined" && !!navigator.hid,
};
