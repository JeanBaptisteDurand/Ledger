signer-eth: signMessage drops the whole message when it contains a non-ASCII character

**Versions.** `@ledgerhq/device-signer-kit-ethereum` 1.18.1, `@ledgerhq/device-management-kit` 1.9.1,
app-ethereum 1.22.4 on Speculos (Flex) and on a physical Flex.

**What happens.** `signMessage(path, "é".repeat(10))` fails with `InvalidStatusWordError`, and the next `signMessage` is
refused with `0x6980` (the app still waits for the announced bytes); that refusal resets the app, and the one after
it signs. Any string that
contains one accented letter, a typographic dash, an emoji or a non-Latin script fails the same way — common in free-form
`personal_sign` messages. Plain ASCII of any length (we tried 230, 255, 256 and 600 bytes)
signs correctly, chunked.

The exchange, for ten "é" (10 characters, 20 bytes):

```
=> e008000019 05 8000002c 8000003c 80000000 00000000 00000000 0000000a   (path + length 10, ZERO message bytes)
<= 9000                                                                  (the app waits for the rest)
   SendSignPersonalMessageTask -> InvalidStatusWordError
=> e00800001e … 00000005 68656c6c6f                                         ("hello", right after)
<= 6980                                                                  (still in SIGNING_MESSAGE; this refusal resets it)
```

**Where.** `src/internal/app-binder/task/SendSignPersonalMessageTask.ts`:

- l. 51 sizes the `ByteArrayBuilder` with `message.length + 1 + (paths.length + 1) * PATH_SIZE`;
- l. 61 writes `message.length` as the length field;
- l. 64 calls `addAsciiStringToData(message)`, which (`ByteArrayBuilder.ts` l. 229) encodes with `TextEncoder` — UTF-8.

`message.length` counts UTF-16 code units; the encoder produces UTF-8 bytes. One accented letter is two bytes, the
buffer is one byte short, `addBufferToData` (l. 198) records a `DataOverflowError` and drops the whole message,
`build()` returns the header alone, and `getErrors()` is never read. The app receives a length of N and zero bytes,
answers `9000` while waiting; `parseResponse` returns no data for that `9000`, and the task (l. 96–100) reports
`InvalidStatusWordError("no signature returned")`. The app's next first chunk gets `0x6980`, and its error path
returns it to idle.

**Fix.** Encode once and count bytes:

```ts
const bytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
const builder = new ByteArrayBuilder(bytes.length + 1 + (paths.length + 1) * PATH_SIZE);
…
builder.add32BitUIntToData(bytes.length);
builder.addBufferToData(bytes);
```

and read `getErrors()` wherever a builder may overflow.

**Reproduction.** A 32-line Node script against Speculos, with the DMK logs at debug level:
`ledger/dmk/repro_signmessage_bug.cjs` in https://github.com/JeanBaptisteDurand/Ledger —
`node repro_signmessage_bug.cjs http://127.0.0.1:5013 "$(python3 -c "print('é'*10)")"`.
