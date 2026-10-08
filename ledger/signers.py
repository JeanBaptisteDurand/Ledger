#!/usr/bin/env python3
"""Deux chemins vers le même appareil, une même signature.

  - ``dmk``    : le Signer Kit Ethereum de Ledger sur le DMK (ledger/dmk/sign_typed_data.cjs) — le
                 chemin « Signer » du brief, littéralement, avec NOTRE context module : des descripteurs
                 compilés et signés localement (compile_descriptor.py), aucun serveur de Ledger ;
  - ``python`` : le client officiel d'app-ethereum en APDU direct (sign_mandate.py) — le chemin qui a
                 trouvé le bug chainId ≥ 256, et qui tourne sans Node.

Les deux produisent la même signature EIP-712 (r||s||v), que le coffre vérifie par ``ecrecover``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "ledger"
DMK_DIR = LEDGER / "dmk"
DESCRIPTORS = DMK_DIR / "descriptors"

sys.path.insert(0, str(LEDGER))

SIGNERS = ("dmk", "python")


def dmk_available() -> bool:
    return bool(shutil.which("node")) and (DMK_DIR / "node_modules" / "@ledgerhq" / "device-signer-kit-ethereum").exists()


def default_signer() -> str:
    return os.environ.get("PDS_SIGNER") or ("dmk" if dmk_available() else "python")


def stack_versions() -> dict:
    """Les versions des paquets Ledger réellement installés — pour l'afficher, pas pour le promettre."""
    out = {}
    for short, pkg in (("dmk", "device-management-kit"), ("signer_kit", "device-signer-kit-ethereum"),
                       ("context_module", "context-module"), ("transport_speculos", "device-transport-kit-speculos"),
                       ("transport_usb", "device-transport-kit-node-hid"), ("wallet_cli", "wallet-cli")):
        try:
            out[short] = json.loads((DMK_DIR / "node_modules" / "@ledgerhq" / pkg / "package.json").read_text())["version"]
        except (OSError, KeyError, ValueError):
            out[short] = None
    return out


def descriptor_path(kind: str, vault: str) -> Path:
    """Le descripteur compilé pour (kind, coffre) ; compilé à la demande, une fois."""
    p = DESCRIPTORS / f"{kind}-{vault.lower()}.json"
    if not p.exists():
        import compile_descriptor as cd

        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(cd.compile_descriptor(kind, vault), indent=1))
    return p


def sign(kind: str, data: dict, filters: dict, signer: str | None = None, *, speculos: str | None = None,
         usb: bool = False, auto: bool = False, shots: str | None = None, blind: bool = False) -> dict:
    """Fait signer ``data`` (EIP-712) sur l'appareil. Rend {signature, owner, signer, screens?, report?}.

    ``auto`` pilote l'écran de Speculos (défilement, « Hold to sign ») ; sans lui, c'est le porteur qui
    touche l'écran — depuis le banc web, par exemple. ``blind`` (dmk seulement) signe SANS descripteur,
    pour montrer ce qu'une intégration ordinaire obtient : des hachages à l'écran, une signature quand même.
    """
    signer = signer or default_signer()
    if signer not in SIGNERS:
        raise ValueError(f"signer inconnu : {signer}")
    vault = data["domain"]["verifyingContract"]

    if signer == "dmk":
        if not dmk_available():
            raise RuntimeError("Signer Kit indisponible : `cd ledger/dmk && npm i` (et node dans le PATH)")
        with tempfile.NamedTemporaryFile("w", suffix=".typed.json", delete=False) as f:
            json.dump(data, f)
            typed = f.name
        out = typed.replace(".typed.json", ".sig.json")
        cmd = ["node", str(DMK_DIR / "sign_typed_data.cjs"), "--typed-data", typed, "--out", out]
        if blind:
            cmd.append("--blind")
        else:
            cmd += ["--descriptor", str(descriptor_path(kind, vault))]
        if usb:
            cmd.append("--usb")
        elif speculos:
            cmd += ["--speculos", speculos]
        if auto:
            cmd.append("--auto")
        if shots:
            cmd += ["--shots", shots]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        try:
            r = json.loads(Path(out).read_text())
        except (OSError, ValueError):
            raise RuntimeError("Signer Kit : " + (p.stderr or p.stdout)[-600:]) from None
        finally:
            for x in (typed, out):
                try:
                    os.unlink(x)
                except OSError:
                    pass
        if not r.get("signature"):
            raise RuntimeError("Signer Kit : " + (r.get("error") or p.stderr[-400:] or "refus"))
        return {"signature": r["signature"], "owner": r.get("owner"), "signer": "dmk",
                "screens": r.get("screens"), "report": r.get("blindSigningReport"), "steps": r.get("steps"),
                "log": p.stderr}

    # ---- python : le client officiel, APDU par APDU
    import sign_mandate as sm

    if speculos:
        sm.URL = speculos
    if shots:
        sm.SHOTS = Path(shots)
    if auto:
        from ledger_app_clients.ethereum.client import EthAppClient
        from ledger_app_clients.ethereum import response_parser as RP
        from ledger_app_clients.ethereum.eip712 import InputData

        sm.patch_chainid_bug()
        client = EthAppClient(sm.SpeculosHttp(sm.URL))
        InputData.process_data(client, data, filters)
        rapdu, pages = sm.navigate_and_sign(client, kind)
        if rapdu.status != 0x9000:
            raise RuntimeError(f"refusé sur l'appareil : status 0x{rapdu.status:04x}")
        v, r, s = RP.signature(rapdu.data)
        sig = "0x" + r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex() + bytes([v]).hex()
        return {"signature": sig, "owner": sm.device_address(), "signer": "python", "screens": pages}
    return {"signature": sm.send_and_sign(data, filters), "owner": sm.device_address(), "signer": "python"}


if __name__ == "__main__":
    print(json.dumps({"default": default_signer(), "dmk_available": dmk_available(), "versions": stack_versions()}, indent=1))
