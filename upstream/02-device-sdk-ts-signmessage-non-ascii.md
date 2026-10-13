signer-eth: signMessage drops the whole message when it contains a non-ASCII character

Versions: `@ledgerhq/device-signer-kit-ethereum` 1.18.1, `@ledgerhq/device-management-kit` 1.9.1, app-ethereum 1.22.4
on a Flex (Speculos and a real device).

`signMessage(path, "é".repeat(10))` fails with `InvalidStatusWordError`. The next `signMessage` is then refused with
`0x6980`, because the app is still waiting for the bytes it was promised. That refusal resets the app, and the call after
it works again. Any message with an accented letter, a typographic dash, an emoji or a non-Latin script hits this. Plain
ASCII of any length (we tried 230, 255, 256 and 600 bytes) signs fine and is chunked correctly.

What goes over the wire for ten "é" (10 characters, 20 bytes):

```
=> e008000019 05 8000002c 8000003c 80000000 00000000 00000000 0000000a   (path + length 10, zero message bytes)
<= 9000                                                                  (the app waits for the rest)
   SendSignPersonalMessageTask -> InvalidStatusWordError
=> e00800001e … 00000005 68656c6c6f                                         ("hello", right after)
<= 6980                                                                  (still in SIGNING_MESSAGE, this refusal resets it)
```

The cause is in `src/internal/app-binder/task/SendSignPersonalMessageTask.ts`. Line 51 sizes the `ByteArrayBuilder` with
`message.length + 1 + (paths.length + 1) * PATH_SIZE`, and line 61 writes `message.length` as the length field. Line 64
then calls `addAsciiStringToData(message)`, which encodes with `TextEncoder` (`ByteArrayBuilder.ts` line 229), so UTF-8.
`message.length` counts UTF-16 code units, not bytes. With one accented letter the buffer is one byte short:
`addBufferToData` (line 198) records a `DataOverflowError` and drops the whole message, and `build()` returns only the
header. Nothing reads `getErrors()`. The app gets a length of N and no data, answers `9000` while it waits,
`parseResponse` returns no data, and the task (lines 96 to 100) reports `InvalidStatusWordError("no signature returned")`.

Suggested fix: encode once and use the byte length for both the buffer size and the length field.

```ts
const bytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
const builder = new ByteArrayBuilder(bytes.length + 1 + (paths.length + 1) * PATH_SIZE);
…
builder.add32BitUIntToData(bytes.length);
builder.addBufferToData(bytes);
```

Checking `getErrors()` wherever a builder can overflow would also have surfaced this.

Repro: a 32-line Node script against Speculos, with the DMK logs at debug level, `ledger/dmk/repro_signmessage_bug.cjs`
in https://github.com/JeanBaptisteDurand/Ledger:
`node repro_signmessage_bug.cjs http://127.0.0.1:5013 "$(python3 -c "print('é'*10)")"`
