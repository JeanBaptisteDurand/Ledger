Update ERC-7730: the submitOrder example uses formats the spec does not define

The example at `ERCS/erc-7730.md` lines 862–864 uses `"format": "number"` twice and `"format": "bytes32"` once:

```json
{ "path": "order.amount", "label": "Amount", "format": "number" },
{ "path": "order.price",  "label": "Price",  "format": "number" },
{ "path": "salt",         "label": "Salt",   "format": "bytes32" }
```

Neither `number` nor `bytes32` is a format defined by the specification, and the reference linter rejects them
(`Value "number" is not valid: Input should be 'raw', 'addressName', … or 'chainId'`). Anyone who copies the
example gets an invalid descriptor.

This change replaces the three with `raw`, the format the specification defines for a value displayed as is.
No normative text is touched.
