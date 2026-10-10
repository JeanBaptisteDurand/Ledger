api: one APDUBridge per HTTP request, so two concurrent /apdu POSTs cross their answers

**Where.** `speculos/api/apdu.py`: flask-restful instantiates a `Resource` per request, so every `/apdu` POST
builds its own `APDUBridge`. Its `endpoint_lock` therefore serialises nothing, and each bridge appends itself to
`seph.apdu_callbacks` for the life of the process.

**What happens.** Two concurrent `/apdu` POSTs are both written to the app, and each response is handed to every
waiting request. We watched a `B0010000` (transport connect) receive the answer of an `e002…` (`GET_PUBLIC_KEY`):
the connecting client parsed an address as a version. Combined with the Secure SDK's TOCTOU latch (a separate
issue, `0x6901` on the pending command), the app then refuses everything until restart.

**How to reproduce.** Speculos `latest`, app-ethereum 1.22.4 (Flex), the HTTP API; two DMK clients (or two
`curl` loops) posting to `/apdu` at the same time — a `GET_PUBLIC_KEY` from one, `GET_APP_AND_VERSION` from the
other.

**Suggestion.** One bridge per process (or per seph), with the lock held from the write to the matching reply,
and the callback list cleared when a request completes — so that at most one `/apdu` is in flight and each
reply goes to the request that sent the command. A `409` for a concurrent caller would be more honest than a
crossed answer.

Trace and context in `FEEDBACK.md` § 8 of https://github.com/JeanBaptisteDurand/Ledger (10 October 2026).
