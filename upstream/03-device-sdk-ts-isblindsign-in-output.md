signer-eth: expose isBlindSign / blindSignReason in the sign device actions' output, and warn once without originToken

**Versions.** `@ledgerhq/device-signer-kit-ethereum` 1.18.1, `@ledgerhq/context-module` 2.6.0, DMK 1.9.1.

**What happens.** When the context module cannot provide a descriptor (no `originToken`: the registry answers
`403`; or the device rejects the context), `BuildEIP712ContextTask` falls back silently to
`ClearSigningType.BASIC`, and `BlindSigningDetectionTask` computes `isBlindSign` and `blindSignReason`
(`no_clear_signing_context` / `device_rejected_context`), posts the report to the context module's reporter —
Ledger's telemetry — and logs it at debug level. The device action's output is `{ r, s, v }` and nothing else.

So the kit knows a signature was blind, tells Ledger, and hands the integrator a signature indistinguishable from
a clear-signed one. Your own skill says it (`agent-skills`, `skills/dmk/dmk-business-logic/SKILL.md:29`: *"the
experience silently degrades to blind signing with no runtime error"*). On a Flex with blind signing off, the
device refuses with `0x6a80` and the user sees *"This transaction cannot be clear-signed"* — the device is strict,
the stack is silent.

**What we measured** (10 October 2026, Speculos Flex, app-ethereum 1.22.4, our own context module): with our
descriptors the internal report says `isBlindSign=false, clearSigningType=eip7730, partialContextErrors=0`;
without them, `isBlindSign=true, blindSignReason=device_rejected_context`. The data exists in the internal state
of the device action; it never reaches the caller.

**Suggestion.**
1. Put `isBlindSign` and `blindSignReason` (and `clearSigningType`) in `SignTypedDataDAOutput` and
   `SignTransactionDAOutput`, next to the signature.
2. Log one warning per session when `originToken` is absent and a descriptor lookup returns `403`:
   *"no originToken: clear signing disabled, the device will display raw data."*

Integrators can then refuse to continue a flow that would blind-sign, instead of discovering it on the screen.
