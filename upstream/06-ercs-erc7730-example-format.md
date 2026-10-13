Update ERC-7730: the submitOrder example uses formats the spec does not define

The example at `ERCS/erc-7730.md` lines 862 to 864 uses `"format": "number"` twice and `"format": "bytes32"` once:

```json
{ "path": "order.amount", "label": "Amount", "format": "number" },
{ "path": "order.price",  "label": "Price",  "format": "number" },
{ "path": "salt",         "label": "Salt",   "format": "bytes32" }
```

Neither `number` nor `bytes32` is defined by the spec. The ERC's own schema (`assets/erc-7730/erc7730-v2.schema.json`)
doesn't list them, and Ledger's python-erc7730 linter rejects them (`Value "number" is not valid: Input should be 'raw',
'addressName', … or 'chainId'`). Anyone who copies the example ends up with an invalid descriptor.

This PR replaces all three with `raw`, which the spec defines for a value shown as is. No normative text changes.
