#!/usr/bin/env python3
"""Le contrefactuel de TARE, exécuté EN DIRECT sur le fork du banc.

On ne lit pas un chiffre dans un corpus daté : on le remesure au bloc courant, avec la méthode
qui a valu le prix Uniswap Foundation à TARE.

    On remplace le hook, pas le pool. `anvil_setCode` réécrit le bytecode à l'adresse du hook ;
    la PoolKey — qui contient cette adresse — est intacte, donc poolId, liquidité, slot0 et
    réserves sont identiques. On cote deux fois. L'écart est ce que le hook a pris.

        bps = (out_sans - out_avec) / out_sans * 10 000

Un résultat négatif n'est pas un prélèvement négatif : le hook EST la liquidité (comptabilité
personnalisée), et le retirer détruit le pool au lieu de révéler des frais. C'est `NOT_MEASURABLE`,
jamais un nombre.

Et la relecture après écriture n'est pas une coquetterie : un `anvil_setCode` qui échoue en
silence ferait recoter le VRAI hook, l'écart vaudrait zéro, et la panne sortirait déguisée en
« ce hook ne prend rien » — la fausse mesure la plus crédible de toutes.
"""

from __future__ import annotations

import json
import urllib.request

V4_QUOTER = "0x0d5e0f971ed27fbff6c2837bf31316121532048d"

# 89 octets qui répondent à tout : le hook inerte de TARE.
STUB = (
    "0x7fffffffff0000000000000000000000000000000000000000000000000000000060003516806000527f"
    "575e24b4000000000000000000000000000000000000000000000000000000001460535760406000f35b60"
    "606000f3"
)


def _rpc(url: str, method: str, params: list):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(url, data=body, headers={"content-type": "application/json"})
    out = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if "error" in out:
        raise RuntimeError(out["error"].get("message", str(out["error"])))
    return out["result"]


def _get_code(url: str, addr: str) -> str:
    return _rpc(url, "eth_getCode", [addr, "latest"])


def _set_code(url: str, addr: str, code: str) -> None:
    _rpc(url, "anvil_setCode", [addr, code])


def _encode_quote(key: dict, zero_for_one: bool, amount_in: int) -> str:
    """quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))"""
    sel = "aa9d21cb"  # keccak("quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))")[:4]
    w = []
    w.append(f"{32:064x}")  # offset du tuple
    w.append(key["currency0"][2:].rjust(64, "0"))
    w.append(key["currency1"][2:].rjust(64, "0"))
    w.append(f"{key['fee']:064x}")
    ts = key["tickSpacing"]
    w.append(f"{ts & (2**256 - 1):064x}")
    w.append(key["hooks"][2:].rjust(64, "0"))
    w.append(f"{1 if zero_for_one else 0:064x}")
    w.append(f"{amount_in:064x}")
    w.append(f"{32 * 8:064x}")  # offset de hookData, relatif au debut du tuple
    w.append(f"{0:064x}")  # hookData vide
    return "0x" + sel + "".join(w)


def _quote(url: str, key: dict, zero_for_one: bool, amount_in: int):
    try:
        raw = _rpc(url, "eth_call", [{"to": V4_QUOTER, "data": _encode_quote(key, zero_for_one, amount_in)}, "latest"])
    except RuntimeError as e:
        return None, str(e)[:120]
    if not raw or len(raw) < 66:
        return None, "SHORT_RETURN"
    out = int(raw[2:66], 16)
    return (out, None) if out > 0 else (None, "ZERO_OUT")


def measure(url: str, key: dict, zero_for_one: bool, amount_in: int) -> dict:
    """Ce que CE hook prend, ici, maintenant. Deux cotations, une seule différence."""
    base = {
        "method": "counterfactual-anvil_setCode",
        "stub_bytes": len(STUB) // 2 - 1,
        "hook": key["hooks"],
        "zero_for_one": zero_for_one,
        "amount_in": str(amount_in),
        "block": int(_rpc(url, "eth_blockNumber", []), 16),
    }

    with_hook, err = _quote(url, key, zero_for_one, amount_in)
    if with_hook is None:
        return {**base, "bps": None, "label": "NOT_MEASURABLE", "reason": f"cotation_avec_hook:{err}"}

    original = _get_code(url, key["hooks"])
    _set_code(url, key["hooks"], STUB)

    # Le talon est-il VRAIMENT en place ? Sinon on recoterait le vrai hook et l'ecart vaudrait zero.
    if (_get_code(url, key["hooks"]) or "").lower() != STUB.lower():
        _set_code(url, key["hooks"], original)
        return {**base, "bps": None, "label": "NOT_MEASURABLE", "reason": "talon_absent_apres_setCode"}

    try:
        without_hook, err2 = _quote(url, key, zero_for_one, amount_in)
        still = (_get_code(url, key["hooks"]) or "").lower() == STUB.lower()
    finally:
        _set_code(url, key["hooks"], original)  # on remet TOUJOURS le hook en place

    if not still:
        return {**base, "bps": None, "label": "NOT_MEASURABLE", "reason": "talon_retire_pendant_la_cotation"}
    if without_hook is None:
        return {**base, "bps": None, "label": "NOT_MEASURABLE", "reason": f"cotation_sans_hook:{err2}"}
    if without_hook <= 0:
        return {**base, "bps": None, "label": "NOT_MEASURABLE", "reason": "sans_hook_rend_zero"}

    bps = (without_hook - with_hook) / without_hook * 10_000
    if bps < 0:
        # Le hook EST la liquidite : le retirer detruit le pool au lieu de reveler des frais.
        return {
            **base, "bps": None, "label": "NOT_MEASURABLE",
            "reason": "hook_est_la_liquidite", "out_with": str(with_hook), "out_without": str(without_hook),
        }
    return {
        **base, "bps": round(bps, 4), "label": "MEASURED",
        "out_with": str(with_hook), "out_without": str(without_hook),
        "reading": f"ce hook prend {bps:.2f} bps sur ce swap, a ce bloc",
    }


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="remesure en direct ce qu'un hook prend")
    ap.add_argument("--rpc", default="http://127.0.0.1:8545")
    ap.add_argument("--c0", required=True)
    ap.add_argument("--c1", required=True)
    ap.add_argument("--fee", type=int, required=True)
    ap.add_argument("--ts", type=int, required=True)
    ap.add_argument("--hook", required=True)
    ap.add_argument("--amount", type=int, default=10**14)
    a = ap.parse_args()
    key = {"currency0": a.c0, "currency1": a.c1, "fee": a.fee, "tickSpacing": a.ts, "hooks": a.hook}
    print(json.dumps(measure(a.rpc, key, True, a.amount), indent=1, ensure_ascii=False))
