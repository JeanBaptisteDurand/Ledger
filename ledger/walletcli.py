#!/usr/bin/env python3
"""Le `wallet-cli` de Ledger (Agent Stack, 2.1.0), appelé ici en LECTURE et pour le Key Ring.

Le binaire est natif (darwin-arm64…), il parle JSON, et ses lectures ne demandent pas d'appareil :
`earn yields`, `balances`, `operations`, `earn positions`. Seuls `account discover`, `send`,
`earn deposit/withdraw` et `ring init` veulent un Ledger en USB — on ne les appelle jamais ici.

Résolution du binaire : $WALLET_CLI, puis ledger/dmk/node_modules (installé avec le DMK), puis $PATH.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "ledger" / "dmk" / "node_modules" / "@ledgerhq" / "wallet-cli" / "bin" / "wallet-cli"
RING_KEY_NAME = "porte-de-sortie-mcp"


def binary() -> Path | None:
    env = os.environ.get("WALLET_CLI")
    if env and Path(env).exists():
        return Path(env)
    if LOCAL.exists():
        return LOCAL
    w = shutil.which("wallet-cli")
    return Path(w) if w else None


def version() -> str | None:
    pj = LOCAL.parent.parent / "package.json"
    try:
        return json.loads(pj.read_text())["version"]
    except (OSError, KeyError, ValueError):
        return None


def call(*args: str, timeout: int = 90, stdin: bytes | None = None) -> dict:
    """Lance `wallet-cli <args> --output json` ; rend toujours un dict {ok, data|error}."""
    b = binary()
    if not b:
        return {"ok": False, "error": {"message": "wallet-cli introuvable (npm i dans ledger/dmk, ou $WALLET_CLI)"}}
    try:
        p = subprocess.run([str(b), *args, "--output", "json"], capture_output=True, timeout=timeout, input=stdin)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": {"message": f"wallet-cli {' '.join(args)} : délai dépassé"}}
    raw = (p.stdout or b"").decode(errors="replace").strip()
    try:
        d = json.loads(raw)
    except ValueError:
        return {"ok": p.returncode == 0, "raw": raw[-2000:], "stderr": (p.stderr or b"").decode(errors="replace")[-800:]}
    if "ok" not in d:  # certaines commandes rendent le payload nu, avec un `status`
        d = {"ok": d.get("status", "success") == "success", "data": d}
    return d


# ------------------------------------------------------------------ lectures (sans appareil)

def earn_yields(network: str = "ethereum", limit: int = 15) -> dict:
    return call("earn", "yields", "--network", network, "--limit", str(limit))


def earn_positions(account: str) -> dict:
    return call("earn", "positions", "--account", account)


def balances(account: str) -> dict:
    return call("balances", "--account", account)


# ------------------------------------------------------------------ le Key Ring (LKRP)

def ring_status() -> dict:
    """Initialisé ou pas, sans toucher à l'appareil : `ring keys` lit un cache local."""
    if not binary():
        return {"available": False, "initialised": False, "message": "wallet-cli introuvable"}
    d = call("ring", "keys")
    if d.get("ok"):
        keys = d.get("data", {}).get("keys", d.get("data"))
        return {"available": True, "initialised": True, "keys": keys}
    return {"available": True, "initialised": False,
            "message": (d.get("error") or {}).get("message") or d.get("raw") or "?"}


def ring_decrypt(infile: Path, key_name: str = RING_KEY_NAME) -> bytes | None:
    """Déchiffre un fichier scellé par `ring encrypt` ; None si le ring n'est pas prêt (init, réseau)."""
    b = binary()
    if not b or not infile.exists():
        return None
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        out = Path(tmp.name)
    try:
        p = subprocess.run([str(b), "ring", "decrypt", "--key", key_name, "-i", str(infile), "-o", str(out)],
                           capture_output=True, timeout=120)
        if p.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            return None
        return out.read_bytes()
    except subprocess.TimeoutExpired:
        return None
    finally:
        try:
            out.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    import sys

    print(json.dumps({"binary": str(binary()), "version": version(), "ring": ring_status()}, indent=1, ensure_ascii=False))
    if "--yields" in sys.argv:
        print(json.dumps(earn_yields(), indent=1, ensure_ascii=False)[:3000])
