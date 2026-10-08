#!/usr/bin/env python3
"""Les comptes : une adresse prouvée par la Ledger, un dossier, une clé MCP dérivée.

Un compte, c'est **une adresse Ethereum** — celle que le porteur a prouvée en signant sur sa Ledger
(Sign-In with Ethereum), ou celle lue sur l'appareil branché au banc. Tout ce qui lui appartient vit sous
`accounts/<adresse>/` :

    profile.json          quand il est arrivé, par quel chemin, son coffre courant
    mandate.json          le mandat signé (celui que l'agent et le MCP lisent)
    journal.jsonl         chaque décision de l'agent, et chaque entrée sous dérogation
    notifications.jsonl   ce dont on l'a prévenu
    events.jsonl          ce qu'il a fait : connexion, session, stratégie, signature, tours, dérogations, questions

**Sa clé MCP n'est écrite nulle part** : elle est dérivée d'un secret maître par HMAC — `HMAC(maître, adresse)`.
Le secret maître est `mcp/.mcp-key`, celui que `scripts/ring-seal.sh` scelle dans le Ledger Key Ring : le Ring
protège donc, en une seule clé, la clé de lecture de tous les comptes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACCOUNTS_DIR = Path(os.environ.get("PDS_ACCOUNTS_DIR", ROOT / "accounts"))
SESSIONS_FILE = ACCOUNTS_DIR / "sessions.json"

sys.path.insert(0, str(ROOT / "mcp"))


def is_address(a: str | None) -> bool:
    return bool(a) and re.fullmatch(r"0x[0-9a-fA-F]{40}", a) is not None


def master_key() -> str:
    """Le secret maître : déchiffré du Key Ring s'il est scellé, sinon le fichier (créé au premier appel)."""
    import pds_mcp  # noqa: WPS433  (le MCP sait deja lire la cle, scellee ou non)

    return pds_mcp.load_key()


def user_key(address: str) -> str:
    """La clé MCP d'un compte : HMAC-SHA256(maître, adresse), 32 caractères URL-safe. Jamais stockée."""
    mac = hmac.new(master_key().encode(), address.lower().encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")[:32]


def paths(address: str) -> dict[str, Path]:
    d = ACCOUNTS_DIR / address.lower()
    return {"dir": d, "profile": d / "profile.json", "mandate": d / "mandate.json", "journal": d / "journal.jsonl",
            "notifications": d / "notifications.jsonl", "events": d / "events.jsonl"}


def open_account(address: str, via: str) -> dict:
    """Crée le compte s'il n'existe pas, note la connexion, rend le profil."""
    p = paths(address)
    p["dir"].mkdir(parents=True, exist_ok=True)
    if p["profile"].exists():
        prof = json.loads(p["profile"].read_text())
    else:
        prof = {"address": address, "created": int(time.time()), "created_via": via, "logins": 0, "vaults": []}
    prof["address"] = address   # la forme en somme de controle, telle que le banc l'affiche
    prof["logins"] = prof.get("logins", 0) + 1
    prof["last_login"] = int(time.time())
    prof["last_via"] = via
    p["profile"].write_text(json.dumps(prof, indent=1))
    record(address, "login", via=via)
    return prof


def save_profile(address: str, **fields) -> dict:
    p = paths(address)
    prof = json.loads(p["profile"].read_text()) if p["profile"].exists() else {"address": address}
    prof.update(fields)
    p["profile"].write_text(json.dumps(prof, indent=1))
    return prof


def record(address: str, kind: str, **data) -> None:
    """Ce que l'utilisateur fait, une ligne par geste."""
    p = paths(address)
    p["dir"].mkdir(parents=True, exist_ok=True)
    with p["events"].open("a") as f:
        f.write(json.dumps({"ts": int(time.time()), "kind": kind, **data}, ensure_ascii=False) + "\n")


def events(address: str, limit: int = 40) -> list[dict]:
    p = paths(address)["events"]
    if not p.exists():
        return []
    rows = [json.loads(l) for l in p.read_text().splitlines() if l.strip()]
    return rows[-limit:]


def mcp_config(address: str, reveal: bool = False) -> dict:
    """La configuration à coller dans Claude pour lire SON coffre, en lecture seule, avec SA clé."""
    p = paths(address)
    key = user_key(address)
    return {
        "mcpServers": {
            "porte-de-sortie": {
                "command": sys.executable,
                "args": [str(ROOT / "mcp" / "pds_mcp.py")],
                "env": {
                    "PDS_ACCOUNT": address,
                    "PDS_MCP_KEY": key if reveal else (key[:4] + "…" + key[-4:]),
                    "PDS_JOURNAL": str(p["journal"]),
                    "PDS_MANDATE": str(p["mandate"]),
                    "PDS_BOTS": str(p["dir"] / "bots.json"),
                    "ANVIL_URL": os.environ.get("ANVIL_URL", "http://127.0.0.1:8545"),
                },
            }
        }
    }


# ------------------------------------------------------------------ les sessions (cookie -> adresse)

def load_sessions() -> dict[str, str]:
    try:
        return json.loads(SESSIONS_FILE.read_text())
    except (OSError, ValueError):
        return {}


def save_sessions(sessions: dict[str, str]) -> None:
    ACCOUNTS_DIR.mkdir(parents=True, exist_ok=True)
    SESSIONS_FILE.write_text(json.dumps(sessions, indent=1))
