#!/usr/bin/env python3
"""Compile NOS descripteurs de clear signing EIP-712, signés avec la clé de TEST de la CAL.

C'est le travail que la Crypto Assets List de Ledger fait pour les dapps partenaires : partir d'un
format déclaratif (nos FILTERS, dans l'esprit d'ERC-7730), en dériver les filtres que l'app Ethereum
vérifie sur la puce — `magic || chainId || contrat || schemaHash || chemin || libellé` — les signer,
et les servir au Signer Kit. Ici la clé est `cal.pem`, la clé de test que l'app compilée avec
`CAL_TEST_KEY=1` accepte. Aucun serveur de Ledger n'est contacté.

    python3 ledger/compile_descriptor.py --kind mandate --vault 0x... --out ledger/dmk/descriptors/mandate.json

Le fichier produit a deux visages, pour le même contenu :

  - `kit` : ce qu'un `TypedDataContextLoader` rend au Signer Kit (`TypedDataClearSignContextSuccess`) ;
  - `cal` : la réponse HTTP de la CAL (`/dapps?output=descriptors_eip712`), telle que
    `HttpTypedDataDataSource` la lit — pour servir NOTRE CAL si on le souhaite.

Les descripteurs dépendent du contrat (domaine) et du schéma, pas des valeurs du message : un seul
fichier par (kind, coffre) suffit pour signer autant de mandats qu'on veut.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import ledger_app_clients.ethereum as _eth_pkg

sys.modules.setdefault("client", _eth_pkg)  # le client fait `from client import keychain`

from ledger_app_clients.ethereum import keychain  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sign_mandate as sm  # noqa: E402  (FILTERS, EXCEPTION_FILTERS, build_*)

# Les « magic » que l'app attend devant chaque signature de filtre (InputData.py, client officiel).
MAGIC_MESSAGE_INFO = 183
MAGIC_AMOUNT_JOIN_TOKEN = 11
MAGIC_AMOUNT_JOIN_VALUE = 22
MAGIC_DATETIME = 33
MAGIC_RAW = 72

KINDS = {
    "mandate": (sm.FILTERS, lambda vault: sm.build_mandate(vault, sm.WETH_BASE, 0, 0, 0, 0)),
    "exception": (sm.EXCEPTION_FILTERS,
                  lambda vault: sm.build_exception(vault, sm.WETH_BASE, "0x" + "00" * 32, 0, 0, 0, 0)),
}


def schema_hash_device(types: dict) -> bytes:
    """Le hash que l'APP calcule : sha224 du JSON des types, champs triés, sans espaces (InputData)."""
    t = {tn: [dict(sorted(f.items())) for f in fields] for tn, fields in types.items()}
    return hashlib.sha224(json.dumps(t).replace(" ", "").encode()).digest()


def schema_hash_kit(types: dict) -> str:
    """Le hash que le SIGNER KIT calcule pour interroger la CAL (getSchemaHash) : types triés."""
    t = {tn: [{"name": f["name"], "type": f["type"]} for f in types[tn]] for tn in sorted(types)}
    return hashlib.sha224(json.dumps(t, separators=(",", ":")).encode()).hexdigest()


def _ctx(vault: str, chain_id: int, types: dict) -> bytes:
    return int(chain_id).to_bytes(8, "big") + bytes.fromhex(vault[2:]) + schema_hash_device(types)


def _sign(magic: int, ctx: bytes, *parts: bytes) -> str:
    payload = bytes([magic]) + ctx + b"".join(parts)
    return keychain.sign_data(keychain.Key.CAL, payload).hex()


def token_payload(ticker: str, addr: str, decimals: int, chain_id: int) -> str:
    """Le blob `PROVIDE_ERC20_TOKEN_INFORMATION`, signé comme le client officiel le signe.

    Le client construit d'abord la commande avec une signature vide, signe `tmp[6:]` (après l'en-tête
    APDU de 5 octets et l'octet de longueur du ticker), puis la reconstruit avec la signature. Le Signer
    Kit envoie ce blob tel quel (`ProvideTokenInformationCommand({payload})`).
    """
    from ledger_app_clients.ethereum.command_builder import CommandBuilder

    cb = CommandBuilder()
    raw_addr = bytes.fromhex(addr[2:])
    tmp = cb.provide_erc20_token_information(ticker, raw_addr, decimals, chain_id, bytes())
    sig = keychain.sign_data(keychain.Key.CAL, tmp[6:])
    full = cb.provide_erc20_token_information(ticker, raw_addr, decimals, chain_id, sig)
    assert full[4] == len(full) - 5, "en-tête APDU inattendu"
    body = full[5:]
    # Ce que la puce lira, pour mémoire : len(ticker) || ticker || addr || decimals || chainId || sig.
    assert body[0] == len(ticker) and body[1 + len(ticker):1 + len(ticker) + 20] == raw_addr
    assert struct.unpack(">I", body[21 + len(ticker):25 + len(ticker)])[0] == decimals
    return body.hex()


def compile_descriptor(kind: str, vault: str, chain_id: int = sm.CHAIN_ID) -> dict:
    filters, template = KINDS[kind]
    data = template(vault)
    types = data["types"]
    ctx = _ctx(vault, chain_id, types)
    fields = filters["fields"]

    kit_filters: dict[str, dict] = {}
    cal_instr: list[dict] = [{
        "display_name": filters["name"],
        "field_mappers_count": len(fields),
        "signatures": {"test": _sign(MAGIC_MESSAGE_INFO, ctx, bytes([len(fields)]), filters["name"].encode())},
    }]
    for path, f in fields.items():
        name = f.get("name", "")
        if f["type"] == "raw":
            sig = _sign(MAGIC_RAW, ctx, path.encode(), name.encode())
            kit_filters[path] = {"type": "raw", "displayName": name, "path": path, "signature": sig}
            cal_instr.append({"display_name": name, "field_path": path, "format": "raw", "signatures": {"test": sig}})
        elif f["type"] == "datetime":
            sig = _sign(MAGIC_DATETIME, ctx, path.encode(), name.encode())
            kit_filters[path] = {"type": "datetime", "displayName": name, "path": path, "signature": sig}
            cal_instr.append({"display_name": name, "field_path": path, "format": "datetime", "signatures": {"test": sig}})
        elif f["type"] == "amount_join_token":
            idx = f["token"]
            sig = _sign(MAGIC_AMOUNT_JOIN_TOKEN, ctx, path.encode(), bytes([idx]))
            kit_filters[path] = {"type": "token", "displayName": "", "tokenIndex": idx, "path": path, "signature": sig}
            cal_instr.append({"display_name": "", "field_path": path, "format": "token", "coin_ref": idx,
                              "signatures": {"test": sig}})
        elif f["type"] == "amount_join_value":
            idx = f["token"]
            sig = _sign(MAGIC_AMOUNT_JOIN_VALUE, ctx, path.encode(), name.encode(), bytes([idx]))
            kit_filters[path] = {"type": "amount", "displayName": name, "tokenIndex": idx, "path": path, "signature": sig}
            cal_instr.append({"display_name": name, "field_path": path, "format": "amount", "coin_ref": idx,
                              "signatures": {"test": sig}})
        else:
            raise SystemExit(f"type de filtre non pris en charge ici : {f['type']}")

    tokens = {str(i): token_payload(t["ticker"], t["addr"], t["decimals"], t["chain_id"])
              for i, t in enumerate(filters.get("tokens", []))}

    khash = schema_hash_kit(types)
    return {
        "kind": kind,
        "primaryType": data["primaryType"],
        "verifyingContract": vault,
        "chainId": chain_id,
        "schemaHashDevice": schema_hash_device(types).hex(),
        "schemaHashKit": khash,
        "types": types,
        "signedWith": "cal.pem (clé de TEST du client officiel ; app compilée avec CAL_TEST_KEY=1)",
        "kit": {
            "messageInfo": {"displayName": filters["name"], "filtersCount": len(fields),
                            "signature": cal_instr[0]["signatures"]["test"]},
            "filters": kit_filters,
            "tokens": tokens,
        },
        "cal": [{"descriptors_eip712": {vault.lower(): {khash: {"instructions": cal_instr}}}}],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--kind", choices=sorted(KINDS), required=True)
    ap.add_argument("--vault", required=True, help="adresse du contrat ExitVault (verifyingContract)")
    ap.add_argument("--chain-id", type=int, default=sm.CHAIN_ID)
    ap.add_argument("--out", help="fichier de sortie (défaut : stdout)")
    a = ap.parse_args()

    d = compile_descriptor(a.kind, a.vault, a.chain_id)
    text = json.dumps(d, indent=1)
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(text)
        n = len(d["kit"]["filters"])
        print(f"{a.kind} : {n} filtres + {len(d['kit']['tokens'])} jeton(s), signés cal.pem -> {a.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
