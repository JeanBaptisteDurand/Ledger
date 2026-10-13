api: one APDUBridge per HTTP request, so two concurrent /apdu POSTs cross their answers

**Where.** `speculos/api/apdu.py`: flask-restful instantiates a `Resource` per request, so every `/apdu` POST
builds its own `APDUBridge`. Its `endpoint_lock` therefore serialises nothing, and each bridge appends itself to
`seph.apdu_callbacks` for the life of the process.

**What happens.** Two concurrent `/apdu` POSTs are both written to the app, and each response is handed to every
waiting request. We watched a `B0010000` (transport connect) receive the answer of an `e002…` (`GET_PUBLIC_KEY`):
the connecting client parsed an address as a version. It also makes a pending command look refused: while a
review is on screen, the `0x6901` the SDK sends a second client is also delivered to the request waiting for the
review, though the device keeps waiting for the user.

**How to reproduce.** Speculos 0.26.8 (same code on master abc6b7d), app-ethereum 1.22.4 for Flex,
`--api-port 5000`. Run 20 times:

```
curl -s -X POST -d '{"data":"e002000015058000002c8000003c800000000000000000000000"}' localhost:5000/apdu &
curl -s -X POST -d '{"data":"b001000000"}' localhost:5000/apdu &
wait
```

In 16 runs out of 20, one request got the other's answer.

**Suggestion.** One bridge per process (or per seph), with the lock held from the write to the matching reply,
and the callback list cleared when a request completes — so that at most one `/apdu` is in flight and each
reply goes to the request that sent the command. A `409` for a concurrent caller would be more honest than a
crossed answer.

Trace and context in `FEEDBACK.md` § 8 of https://github.com/JeanBaptisteDurand/Ledger (10 October 2026).
