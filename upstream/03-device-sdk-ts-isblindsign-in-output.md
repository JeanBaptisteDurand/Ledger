signer-eth: expose isBlindSign / blindSignReason in the sign device actions' output, and warn once without originToken

Versions: `@ledgerhq/device-signer-kit-ethereum` 1.18.1, `@ledgerhq/context-module` 2.6.0, DMK 1.9.1.

When the context module can't provide a descriptor (no `originToken`, so the registry answers 403, or the device rejects
the context), `BuildEIP712ContextTask` silently falls back to `ClearSigningType.BASIC` (lines 134 to 138).
`BlindSigningDetectionTask` then computes `isBlindSign` and `blindSignReason` (`no_clear_signing_context` or
`device_rejected_context`), sends the report to the context module's reporter, which by default posts it to Ledger's
ingest endpoint, and logs it at debug level. The device action's output is only `{ r, s, v }`.

So the SDK knows a signature was blind, but the integrator can't tell it apart from a clear-signed one. The agent skill
says as much (`agent-skills`, `skills/dmk/dmk-business-logic/SKILL.md` line 29: "the experience silently degrades to
blind signing with no runtime error"). On a Flex with blind signing off, the device refuses with `0x6a80` and shows
"This transaction cannot be clear-signed".

What we measured on 10 October 2026 (Speculos Flex, app-ethereum 1.22.4, our own context module): with our descriptors,
the internal report says `isBlindSign=false, clearSigningType=eip7730, partialContextErrors=0`. Without them, it says
`isBlindSign=true, blindSignReason=device_rejected_context`. We could only read this by plugging our own reporter into
the context module.

Two suggestions:

1. Add `isBlindSign`, `blindSignReason` and `clearSigningType` to `SignTypedDataDAOutput` and `SignTransactionDAOutput`,
   next to the signature.
2. Log one warning per session when `originToken` is missing and a descriptor lookup returns 403, something like
   "no originToken: clear signing disabled, the device will show raw data".

Integrators could then reject or flag a blind signature in code instead of relying on the user to read the screen.
Detection currently runs after signing (#1398). The no-context case is already known after `BuildContext`, so it could
also be exposed in the intermediate value before the device is asked to sign.
