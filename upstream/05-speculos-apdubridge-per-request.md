api: one APDUBridge per HTTP request, so two concurrent /apdu POSTs cross their answers

In `speculos/api/apdu.py`, flask-restful creates a new `Resource` for every request, so each `/apdu` POST builds its own
`APDUBridge`. As a result its `endpoint_lock` doesn't serialize anything, and each bridge appends itself to
`seph.apdu_callbacks` and stays there for the life of the process.

With two concurrent `/apdu` POSTs, both commands are written to the app and each response is handed to every waiting
request. We saw a `B0010000` (transport connect) get the answer to an `e002…` (`GET_PUBLIC_KEY`), so the connecting
client parsed an address as a version. It can also make a pending command look refused: while a review is on screen,
the `0x6901` the SDK returns to a second client is delivered to the request waiting on the review too, even though the
device is still waiting for the user.

To reproduce (Speculos 0.26.8, same code on master abc6b7d, app-ethereum 1.22.4 for Flex, `--api-port 5000`), run this
20 times:

```
curl -s -X POST -d '{"data":"e002000015058000002c8000003c800000000000000000000000"}' localhost:5000/apdu &
curl -s -X POST -d '{"data":"b001000000"}' localhost:5000/apdu &
wait
```

In 16 of the 20 runs, one request got the other's answer.

A possible fix: one bridge per process (or per seph), holding the lock from the write until the matching reply, and
clearing the callback once a request completes. Then only one `/apdu` is in flight at a time and each reply goes back to
the request that sent the command. Returning a `409` to a concurrent caller would also be better than a crossed answer.

More context and a full trace: `FEEDBACK.md`, section 8, in https://github.com/JeanBaptisteDurand/Ledger.
