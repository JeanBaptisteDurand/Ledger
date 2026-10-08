#!/usr/bin/env python3
"""Fait signer le mandat ExitVault sur un Ledger Flex (Speculos), avec NOS filtres EIP-712.

Ce que ça prouve : le clear signing du mandat — « Budget : 1 WETH », « Expires : <date> » — sans
`originToken`, sans partenariat, sans passer par les serveurs de Ledger. Les filtres et les
métadonnées du jeton sont signés par la clé de TEST de l'app (`cal.pem`), que l'app compilée avec
`CAL_TEST_KEY=1` accepte.

    python3 sign_mandate.py --vault 0x... --agent 0x... --out mandate.json

Sortie : mandate.json — l'adresse du porteur (celle du Ledger), les champs du mandat, la signature.
C'est ce fichier que le contrat vérifie ensuite : `ecrecover(digest) == owner`.
"""

import argparse
import json
import os
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import requests
from ledgered.devices import Devices, DeviceType
from ragger.backend.interface import BackendInterface
from ragger.utils import RAPDU

import ledger_app_clients.ethereum as _eth_pkg

sys.modules.setdefault("client", _eth_pkg)  # InputData fait `from client import keychain`

from ledger_app_clients.ethereum.client import EthAppClient  # noqa: E402
from ledger_app_clients.ethereum import response_parser as ResponseParser  # noqa: E402
from ledger_app_clients.ethereum.eip712 import InputData  # noqa: E402

WETH_BASE = "0x4200000000000000000000000000000000000006"
CHAIN_ID = 8453
BIP32 = "m/44'/60'/0'/0/0"


class SpeculosHttp(BackendInterface):
    """Adaptateur minimal : APDU par HTTP vers un Speculos déjà lancé (Docker)."""

    def __init__(self, url: str):
        super().__init__(Devices.get_by_type(DeviceType.FLEX))
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def exchange_raw(self, data: bytes, tick_timeout: int = 0) -> RAPDU:
        r = requests.post(f"{self.url}/apdu", json={"data": data.hex()}, timeout=600).json()
        raw = bytes.fromhex(r["data"])
        return RAPDU(int.from_bytes(raw[-2:], "big"), raw[:-2])

    @contextmanager
    def exchange_async_raw(self, data: bytes, tick_timeout: int = 0):
        box = {}
        t = threading.Thread(target=lambda: box.__setitem__("r", self.exchange_raw(data)))
        t.start()
        yield
        t.join()
        self._last_async_response = box["r"]

    def send_raw(self, data: bytes):
        self._last_async_response = self.exchange_raw(data)

    def receive(self) -> RAPDU:
        return self._last_async_response

    # L'écran est piloté directement par HTTP plus bas : ces méthodes ne servent pas ici.
    def right_click(self): pass
    def left_click(self): pass
    def both_click(self): pass
    def finger_touch(self, x=0, y=0, delay=0.5): pass
    def finger_swipe(self, x=0, y=0, direction="left", delay=0.5): pass
    def compare_screen_with_snapshot(self, *a, **k): return True
    def wait_for_screen_change(self, *a, **k): pass
    def wait_for_home_screen(self, *a, **k): pass
    def compare_screen_with_text(self, *a, **k): return True
    def wait_for_text_on_screen(self, *a, **k): pass
    def wait_for_text_not_on_screen(self, *a, **k): pass
    def get_current_screen_content(self): return _events()
    def pause_ticker(self): pass
    def resume_ticker(self): pass
    def send_tick(self): pass


URL = os.environ.get("SPECULOS_URL", "http://127.0.0.1:5013")
SHOTS = Path(os.environ.get("SHOTS_DIR", "captures"))


def _events():
    return requests.get(f"{URL}/events?currentscreenonly=true", timeout=10).json()


def screen_texts():
    return [e.get("text", "") for e in _events().get("events", []) if e.get("text")]


def shot(name: str):
    SHOTS.mkdir(parents=True, exist_ok=True)
    (SHOTS / f"{name}.png").write_bytes(requests.get(f"{URL}/screenshot", timeout=10).content)


def finger(action: str, x: int, y: int):
    requests.post(f"{URL}/finger", json={"action": action, "x": x, "y": y}, timeout=10)


def tap(x: int, y: int, hold: float = 0.2):
    finger("press", x, y)
    time.sleep(hold)
    finger("release", x, y)
    time.sleep(0.6)


def swipe_left():
    finger("press", 400, 300)
    time.sleep(0.15)
    finger("release", 80, 300)
    time.sleep(0.7)


def patch_chainid_bug():
    """Correctif du bug du client Ledger : tout chainId >= 256 casse le filtrage EIP-712.

    `InputData.init_signature_context` l. 580 fait `append(chainid & (0xff << (i*8)))` sans
    redécaler l'octet, donc `bytearray.append` reçoit p. ex. 0x2100 pour Base (8453).
    Correctif amont proposé : `bytearray(chainid.to_bytes(8, "big"))`.
    """
    import hashlib
    import json as _json

    def fixed(sig_ctx, types, domain, filters):
        InputData.handle_optional_domain_values(domain)
        caddr = filters.get("address", domain["verifyingContract"])
        sig_ctx["caddr"] = bytearray.fromhex(caddr[2:] if caddr.startswith("0x") else caddr)
        sig_ctx["chainid"] = bytearray(int(domain["chainId"]).to_bytes(8, "big"))
        for tn in types:
            for i in range(len(types[tn])):
                types[tn][i] = dict(sorted(types[tn][i].items()))
        schema = _json.dumps(types).replace(" ", "").encode()
        sig_ctx["schema_hash"] = bytearray.fromhex(hashlib.sha224(schema).hexdigest())

    InputData.init_signature_context = fixed


def build_mandate(vault: str, agent: str, budget_wei: int, max_bps: int, expiry: int, nonce: int):
    return {
        "domain": {"name": "ExitVault", "version": "1", "chainId": CHAIN_ID, "verifyingContract": vault},
        "primaryType": "ExitMandate",
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "ExitMandate": [
                {"name": "agent", "type": "address"},
                {"name": "budgetToken", "type": "address"},
                {"name": "budgetAmount", "type": "uint256"},
                {"name": "maxRoundTripLossBps", "type": "uint16"},
                {"name": "expiry", "type": "uint64"},
                {"name": "nonce", "type": "uint256"},
            ],
        },
        "message": {
            "agent": agent,
            "budgetToken": WETH_BASE,
            "budgetAmount": str(budget_wei),
            "maxRoundTripLossBps": max_bps,
            "expiry": expiry,
            "nonce": nonce,
        },
    }


def build_exception(vault: str, agent: str, pool_key_hash: str, amount_in: int,
                    seen_exit_bps: int, expiry: int, nonce: int, budget_token: str = WETH_BASE):
    """La derogation a usage unique : UN pool, UN montant, et le nombre que l'humain a vu."""
    return {
        "domain": {"name": "ExitVault", "version": "1", "chainId": CHAIN_ID, "verifyingContract": vault},
        "primaryType": "ExitException",
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "ExitException": [
                {"name": "agent", "type": "address"},
                {"name": "budgetToken", "type": "address"},
                {"name": "poolKeyHash", "type": "bytes32"},
                {"name": "amountIn", "type": "uint256"},
                {"name": "seenExitBps", "type": "uint16"},
                {"name": "expiry", "type": "uint64"},
                {"name": "nonce", "type": "uint256"},
            ],
        },
        "message": {
            "agent": agent, "budgetToken": budget_token, "poolKeyHash": pool_key_hash,
            "amountIn": str(amount_in), "seenExitBps": seen_exit_bps, "expiry": expiry, "nonce": nonce,
        },
    }


EXCEPTION_FILTERS = {
    "name": "Exit exception",
    "tokens": [{"addr": WETH_BASE, "ticker": "WETH", "decimals": 18, "chain_id": CHAIN_ID}],
    "fields": {
        "agent": {"type": "raw", "name": "Agent"},
        "budgetToken": {"type": "amount_join_token", "token": 0},
        "amountIn": {"type": "amount_join_value", "name": "Amount", "token": 0},
        "poolKeyHash": {"type": "raw", "name": "Position"},  # un pool v4, ou un coffre ERC-4626
        "seenExitBps": {"type": "raw", "name": "EXIT COST (bps)"},
        "expiry": {"type": "datetime", "name": "Valid until"},
    },
}


FILTERS = {
    "name": "Exit mandate",
    "tokens": [{"addr": WETH_BASE, "ticker": "WETH", "decimals": 18, "chain_id": CHAIN_ID}],
    "fields": {
        "agent": {"type": "raw", "name": "Agent"},
        "budgetToken": {"type": "amount_join_token", "token": 0},
        "budgetAmount": {"type": "amount_join_value", "name": "Budget", "token": 0},
        "maxRoundTripLossBps": {"type": "raw", "name": "Max round-trip loss (bps)"},
        "expiry": {"type": "datetime", "name": "Expires"},
    },
}


def send_and_sign(data: dict, filters: dict):
    """Envoie structs + filtres signes, puis rend la main : le porteur approuve sur l'ecran.

    Renvoie (client, contexte) ; l'appel bloque jusqu'a l'approbation, donc on le lance dans un fil.
    """
    patch_chainid_bug()
    client = EthAppClient(SpeculosHttp(URL))
    InputData.process_data(client, data, filters)
    with client.eip712_sign_new(BIP32):
        pass
    rapdu = client.response()
    if rapdu.status != 0x9000:
        raise RuntimeError(f"refuse sur l'appareil : status 0x{rapdu.status:04x}")
    v, r, s = ResponseParser.signature(rapdu.data)
    return "0x" + r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex() + bytes([v]).hex()


def device_address(bip32: str = BIP32) -> str:
    """Lit l'adresse du porteur sur l'appareil (sans rien afficher)."""
    client = EthAppClient(SpeculosHttp(URL))
    with client.get_public_addr(display=False, bip32_path=bip32):
        pass
    _, raw_addr, _ = ResponseParser.pk_addr(client.response().data)
    if isinstance(raw_addr, (bytes, bytearray)):
        hexs = raw_addr.hex() if len(raw_addr) == 20 else raw_addr.decode("ascii")
    else:
        hexs = str(raw_addr)
    return "0x" + hexs.removeprefix("0x")


def navigate_and_sign(client, prefix: str) -> RAPDU:
    """Fait défiler la revue, capture chaque page, maintient pour signer."""
    pages = []
    with client.eip712_sign_new(BIP32):
        time.sleep(1.5)
        last = None
        for i in range(20):
            texts = screen_texts()
            if texts == last:  # le balayage n'a pas pris : on repousse et on reessaie
                swipe_left()
                texts = screen_texts()
                if texts == last:
                    continue
            last = texts
            print(f"    écran {len(pages)}: {' | '.join(texts)}")
            shot(f"{prefix}-{len(pages):02d}")
            pages.append(texts)
            if any("signed" in t.lower() for t in texts):
                break
            hold_btn = [e for e in _events()["events"] if "hold to sign" in e.get("text", "").lower()]
            if hold_btn:
                tap(240, hold_btn[0]["y"] + 10, hold=2.2)
                continue
            accept = [e for e in _events()["events"] if "accept risk and continue" in e.get("text", "").lower()]
            if accept:
                tap(240, accept[0]["y"])
                continue
            swipe_left()
    return client.response(), pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", required=True, help="adresse du contrat ExitVault (verifyingContract)")
    ap.add_argument("--agent", default="0x70997970C51812dc3A010C7d01b50e0d17dc79C8")
    ap.add_argument("--budget", type=int, default=10**18, help="budget en wei (défaut : 1 WETH)")
    ap.add_argument("--max-bps", type=int, default=300)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--nonce", type=int, default=1)
    ap.add_argument("--out", default="mandate.json")
    ap.add_argument("--prefix", default="mandat")
    ap.add_argument("--signer", choices=("dmk", "python"), default=None,
                    help="dmk = Signer Kit de Ledger sur le DMK (défaut si installé) ; python = client officiel en APDU")
    ap.add_argument("--usb", action="store_true", help="un Flex en USB plutôt que Speculos (dmk seulement)")
    args = ap.parse_args()

    import signers

    signer = args.signer or signers.default_signer()
    print(f"1. adresse de l'appareil… (chemin : {signer})")
    device_addr = None if args.usb else device_address()
    if device_addr:
        print(f"   porteur (Ledger) = {device_addr}")

    expiry = int(time.time()) + args.days * 86400
    data = build_mandate(args.vault, args.agent, args.budget, args.max_bps, expiry, args.nonce)

    if signer == "dmk":
        print("2. Signer Kit Ethereum + DMK : NOTRE context module sert les filtres compilés (signés cal.pem)…")
    else:
        print("2. client officiel : envoi des structs, des métadonnées WETH et de NOS filtres (signés cal.pem)…")
    print("   aucun serveur Ledger contacté")

    print("3. revue sur l'appareil :")
    try:
        r = signers.sign("mandate", data, FILTERS, signer, speculos=URL, usb=args.usb,
                         auto=not args.usb, shots=str(SHOTS))
    except RuntimeError as e:
        print(f"   REFUS/ERREUR : {e}")
        sys.exit(1)
    if r.get("screens") and signer == "dmk":
        for i, texts in enumerate(r["screens"]):
            print(f"    écran {i}: {' | '.join(texts)}")
    print(f"   SIGNÉ sur l'appareil — v={int(r['signature'][-2:], 16)}")
    if r.get("report"):
        rep = r["report"]
        print(f"   rapport du Signer Kit : isBlindSign={rep.get('isBlindSign')} · {rep.get('ethContext')}")

    out = {
        "owner": r.get("owner") or device_addr,
        "vault": args.vault,
        "chainId": CHAIN_ID,
        "signature": r["signature"],
        "signer": signer,
        "mandate": {
            "agent": args.agent,
            "budgetToken": WETH_BASE,
            "budgetAmount": str(args.budget),
            "maxRoundTripLossBps": args.max_bps,
            "expiry": expiry,
            "nonce": args.nonce,
        },
        "screens": r.get("screens"),
    }
    Path(args.out).write_text(json.dumps(out, indent=1))
    print(f"4. écrit dans {args.out} — captures dans {SHOTS}/")


if __name__ == "__main__":
    main()
