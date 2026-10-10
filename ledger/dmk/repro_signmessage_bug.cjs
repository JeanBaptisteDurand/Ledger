/**
 * Reproduction de FEEDBACK.md § 7 — Signer Kit ETH 1.18.1 : `signMessage` jette tout message qui contient un
 * caractère non ASCII (le tampon et le champ longueur sont dimensionnés en caractères, le message encodé en octets).
 *
 *   node repro_signmessage_bug.cjs http://127.0.0.1:5013 "message court"      -> signature (une seule APDU)
 *   node repro_signmessage_bug.cjs http://127.0.0.1:5013 "$(python3 -c "print('é'*10)")"   -> echec, app coincee
 *   -> en cas d'echec, le kit envoie `e0 08 00 00 19 <chemin> <longueur en CARACTERES>` SANS un octet de
 *      message, l'app repond 9000 (elle attend la suite), le kit echoue en InvalidStatusWordError — et l'app reste
 *      en SIGNING_MESSAGE : tout message suivant recoit 0x6980 jusqu'a redemarrage (FORCE=1 ledger/speculos.sh up).
 *   Un message ASCII de 600 octets, lui, est decoupe et signe (verifie le 10 oct. 2026).
 *
 * Cause (source du kit) : SendSignPersonalMessageTask.ts l.51 dimensionne le ByteArrayBuilder avec message.length
 * (des caracteres UTF-16) et l.61 ecrit message.length comme longueur ; l.64 addAsciiStringToData encode en UTF-8
 * (des octets). Un caractere accentue = un octet de trop : addBufferToData enregistre un DataOverflowError, jette
 * le message, et getErrors() n'est jamais lu. Logs DMK en debug pour voir l'echange.
 */
const { firstValueFrom } = require("rxjs");
const { DeviceManagementKitBuilder, DeviceActionStatus, DeviceModelId, ConsoleLogger, LogLevel } = require("@ledgerhq/device-management-kit");
const { speculosTransportFactory } = require("@ledgerhq/device-transport-kit-speculos");
const { SignerEthBuilder } = require("@ledgerhq/device-signer-kit-ethereum");
(async () => {
  const url = process.argv[2] || "http://127.0.0.1:5013";
  const dmk = new DeviceManagementKitBuilder().addLogger(new ConsoleLogger(LogLevel.Debug)).addTransport(speculosTransportFactory(url, false, DeviceModelId.FLEX)).build();
  const device = await firstValueFrom(dmk.startDiscovering({}));
  const sessionId = await dmk.connect({ device });
  const cm = { async getContexts(){return [];}, async getFieldContext(){return {type:"error", error:new Error("x")};}, async getTypedDataFilters(){return {type:"error", error:new Error("x")};}, async report(){}, async signReport(){} };
  const signer = new SignerEthBuilder({ dmk, sessionId }).withContextModule(cm).build();
  const msg = process.argv[3] || "127.0.0.1:8099 wants you to sign in with your Ethereum account:\n0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D\n\nPorte de sortie\n\nURI: http://127.0.0.1:8099\nVersion: 1\nChain ID: 8453\nNonce: abcd1234\nIssued At: 2026-09-24T00:00:00.000Z";
  const st = await new Promise((res, rej) => signer.signMessage("44'/60'/0'/0/0", msg).observable.subscribe({ next: s => { if (s.status === DeviceActionStatus.Pending && s.intermediateValue) console.error("step:", JSON.stringify(s.intermediateValue)); if (s.status !== DeviceActionStatus.Pending && s.status !== DeviceActionStatus.NotStarted) res(s); }, error: rej }));
  console.error("RESULT:", st.status, st.error ? JSON.stringify(st.error).slice(0, 400) : JSON.stringify(st.output));
  dmk.close(); process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });
