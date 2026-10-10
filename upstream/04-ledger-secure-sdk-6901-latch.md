io_legacy: after a concurrent command is refused with 0x6901, the pending command is refused too and the latch never releases

**Where.** `io_legacy/src/os_io_legacy.c` (~l. 397), the TOCTOU guard: *"reject a new command while a previous
one still awaits its reply"* — a latch armed when a command is accepted, released in `io_legacy_apdu_tx` when the
app replies; `SWO_COMMAND_NOT_ACCEPTED` (`0x6901`) for the newcomer. Observed with app-ethereum 1.22.4 (API level
26) on Speculos (Flex); not verified on hardware.

**What happens.** Two clients on one app: client A is in the middle of an EIP-712 flow (the Transaction Check
opt-in prompt is on screen, or a filter is being sent); client B sends a single `B0010000` (a transport connect)
or `b001000000` (`GET_APP_AND_VERSION`). The newcomer is refused with `0x6901`, which is right. But the *pending*
command of client A is refused as well, and from then on every APDU — including `b001000000`, which the OS layer
answers, not the app — gets `0x6901` until the app is relaunched. The trace, through a proxy between the browser
and Speculos:

```
21:14:52.076  B0010000                 (client B connects while A's filters are being sent)
21:14:53.729  e00c0001…  -> 6901       (A's pending sign command, refused 1.2 s later)
21:14:53.729  B0010000   -> 6901
21:14:53.739  b001000000 -> 6901
…every APDU, until Speculos was restarted
```

Reproduced four times (10 October 2026). Any second DMK instance is "client B": a second tab of the same page, a
wallet polling in the background, the DMK's own session refresher (`b001000000` every second,
`PINGER_TIMEOUT` 800 ms) from another session — and a human reading a screen for ten seconds is the window.

**Suggestion.** When a newcomer is refused with `0x6901`, leave the pending command and its latch untouched: one
stray poll should cost the poller, not the signer. If the latch must be cleared, clear it when the pending reply
goes out, whatever path it takes.

**What we did on our side.** Disabled the session refresher (`sessionRefresherOptions: { isRefresherDisabled:
true }`) and bound each pending signature to the browser tab that asked for it; the same flows then pass with a
signer who takes 20 s per screen. Details in `FEEDBACK.md` § 8 of https://github.com/JeanBaptisteDurand/Ledger.
