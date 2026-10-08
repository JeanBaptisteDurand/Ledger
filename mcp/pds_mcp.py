#!/usr/bin/env python3
"""MCP « Porte de sortie » — LECTURE SEULE.

Il ne lance rien, ne signe rien, n'envoie aucune transaction. Il sert les données qui ont mené aux
décisions de l'agent, et de quoi analyser les positions : l'univers considéré, la liste courte avec
toutes ses caractéristiques, le score et son détail, le pourquoi du choix, la sonde de sortie, la
décision du coffre et son motif, le mandat signé sur le Ledger, et l'état des positions.

Protocole : MCP sur stdio (JSON-RPC 2.0). Une clé est exigée à chaque appel d'outil.

    python3 mcp/pds_mcp.py --print-key        # affiche la clé (la crée au premier appel)

Dans la configuration de Claude :

    {
      "mcpServers": {
        "porte-de-sortie": {
          "command": "python3",
          "args": ["/chemin/porte-de-sortie/mcp/pds_mcp.py"],
          "env": {"PDS_MCP_KEY": "<la clé>"}
        }
      }
    }
"""

from __future__ import annotations

import argparse
import hmac
import json
import os
import secrets
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Par defaut, les fichiers du banc ; un COMPTE passe les siens par l'environnement (web/accounts.py).
JOURNAL = Path(os.environ.get("PDS_JOURNAL", ROOT / "agent" / "journal.jsonl"))
MANDATE = Path(os.environ.get("PDS_MANDATE", ROOT / "mandate.json"))
KEYFILE = Path(os.environ.get("PDS_MCP_KEYFILE", ROOT / "mcp" / ".mcp-key"))   # le secret MAITRE (scellable par ring)
ACCOUNT = os.environ.get("PDS_ACCOUNT")   # une adresse : la cle attendue est alors derivee du maitre, jamais stockee
BOTS = Path(os.environ.get("PDS_BOTS", str(JOURNAL.parent / "bots.json")))   # les bots du compte (nommes par le porteur)
RINGFILE = ROOT / "mcp" / ".mcp-key.ring"   # la même clé, scellée par le Ledger Key Ring (ring CLI)
ANVIL = os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")

sys.path.insert(0, str(ROOT / "ledger"))
import walletcli  # noqa: E402


# --------------------------------------------------------------------- la clé

_KEY_SOURCE = "?"


def load_key() -> str:
    """La clé du serveur — de préférence déchiffrée du Ledger Key Ring, sinon le fichier en clair.

    `scripts/ring-seal.sh` scelle `.mcp-key` en `.mcp-key.ring` avec `wallet-cli ring encrypt` : la
    clé de lecture de l'agent est alors adossée à la graine du porteur (LKRP), révocable depuis
    l'appareil. Le déchiffrement ne demande pas d'appareil, mais le ring doit être initialisé sur
    cette machine (une fois, en USB) et joignable. Sinon on le dit, et on lit le fichier en clair.
    """
    global _KEY_SOURCE
    if RINGFILE.exists():
        plain = walletcli.ring_decrypt(RINGFILE)
        if plain:
            _KEY_SOURCE = "Ledger Key Ring (.mcp-key.ring déchiffré par wallet-cli ring decrypt)"
            return plain.decode().strip()
        print("[pds-mcp] .mcp-key.ring présent mais indéchiffrable ici (ring non initialisé, ou hors ligne) "
              "— repli sur .mcp-key en clair", file=sys.stderr)
    if not KEYFILE.exists():
        KEYFILE.parent.mkdir(parents=True, exist_ok=True)
        KEYFILE.write_text(secrets.token_urlsafe(24))
        KEYFILE.chmod(0o600)
    _KEY_SOURCE = "fichier en clair (.mcp-key)"
    return KEYFILE.read_text().strip()


def account_key(address: str) -> str:
    """La cle d'un compte : HMAC-SHA256(maitre, adresse), 32 caracteres URL-safe — meme formule que web/accounts.py."""
    import base64
    import hashlib

    mac = hmac.new(load_key().encode(), address.lower().encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")[:32]


def key_ok(given: str | None) -> bool:
    if not given:
        return False
    expected = account_key(ACCOUNT) if ACCOUNT else load_key()
    return hmac.compare_digest(given, expected)


# --------------------------------------------------------------------- lecture

def read_journal() -> list[dict]:
    if not JOURNAL.exists():
        return []
    return [json.loads(l) for l in JOURNAL.read_text().splitlines() if l.strip()]


def read_mandate() -> dict | None:
    return json.loads(MANDATE.read_text()) if MANDATE.exists() else None


def cast_call(*args) -> str | None:
    try:
        p = subprocess.run(["cast", *args, "--rpc-url", ANVIL], capture_output=True, text=True, timeout=30)
        return p.stdout.strip() if p.returncode == 0 else None
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------- les outils

def _bot_name(r: dict) -> str | None:
    return (r.get("bot") or {}).get("name")


def t_operations(decision: str | None = None, limit: int = 50, bot: str | None = None) -> dict:
    """La liste des opérations tentées, avec leur issue et son motif."""
    rows = [dict(r, seq=i + 1) for i, r in enumerate(read_journal())]  # seq : le rang dans le journal, unique
    if decision:
        rows = [r for r in rows if r["decision"] == decision]
    if bot:
        rows = [r for r in rows if (_bot_name(r) or "").lower() == bot.lower() or (r.get("bot") or {}).get("id") == bot]
    rows = rows[-limit:]
    return {
        "count": len(rows),
        "note": "les ticks repartent a 1 a chaque tour de l'agent (pools, puis coffres) : pour designer une operation "
                "sans ambiguite, utilise `seq` (rang dans le journal) ou `tick` + `kind`",
        "operations": [
            {
                "seq": r["seq"], "tick": r["tick"], "ts": r["ts"], "mode": r["mode"], "bot": _bot_name(r),
                "kind": r.get("kind", "pool"), "name": r["pick"].get("name"),
                "pool_id": r["pick"]["pool_id"], "token": r["pick"]["currency1"], "hook": r["pick"]["hook"],
                "entry_bps_median": r["pick"]["entry_bps_median"],
                "exit_loss_bps": r["exit_probe"]["loss_bps"],
                "exit_blocked": r["exit_probe"].get("exit_blocked"),
                "decision": r["decision"], "error": r["error"], "tx": r["tx"],
                "why": r["why"],
            }
            for r in rows
        ],
    }


def _pick_rows(tick: int | None, kind: str | None, seq: int | None, what: str) -> tuple[list[dict], dict | None]:
    """Les lignes du journal visées : par `seq` (rang, unique), ou par `tick` (+ `kind` si les deux univers ont tourné)."""
    rows = [dict(r, seq=i + 1) for i, r in enumerate(read_journal())]
    if seq is not None:
        hit = [r for r in rows if r["seq"] == seq]
        return hit, (None if hit else {"error": f"aucune opération de rang {seq} (journal : {len(rows)} lignes)"})
    if tick is None:
        return [], {"error": f"{what} : donne `tick` (avec `kind` si pools et coffres ont tourné) ou `seq`"}
    hit = [r for r in rows if r["tick"] == tick and (kind is None or r.get("kind", "pool") == kind)]
    if not hit:
        return [], {"error": f"aucune opération au tour {tick}" + (f" ({kind})" if kind else "")}
    return hit, None


def t_decision(tick: int | None = None, kind: str | None = None, seq: int | None = None) -> dict:
    """Tout ce qui a mené à une décision : univers, liste courte, scores, sonde, mandat, issue."""
    hit, err = _pick_rows(tick, kind, seq, "decision")
    if err:
        return err
    out = dict(hit[-1])
    out.setdefault("kind", "pool")
    if len(hit) > 1:  # meme tick dans deux tours (pools puis coffres) : on rend le dernier, et on le dit
        out["note"] = ("plusieurs opérations portent ce tick : " + ", ".join(f"seq {r['seq']} = {r.get('kind', 'pool')} "
                       f"{(r['pick'].get('name') or r['pick']['pool_id'][:12])}" for r in hit) + " — celle-ci est la dernière ; "
                       "précise `kind` ou `seq`")
    return out


def read_bots() -> list[dict]:
    try:
        return json.loads(BOTS.read_text()) if BOTS.exists() else []
    except (OSError, ValueError):
        return []


def t_bots(status: str | None = None) -> dict:
    """Les bots du compte — ceux qui tournent et ceux qui sont arrêtés — avec leur bilan relu dans le journal."""
    bots = read_bots()
    if not bots:
        return {"count": 0, "bots": [], "note": "aucun bot : le porteur n'en a pas encore lancé (ou le compte a été remis à zéro)"}
    rows = read_journal()
    out = []
    for b in bots:
        if status and b.get("status") != status:
            continue
        mine = [r for r in rows if (r.get("bot") or {}).get("id") == b["id"]]
        ex = [r for r in mine if r["decision"] == "EXECUTED"]
        refused = [r for r in mine if r["decision"] != "EXECUTED"]
        out.append({
            "id": b["id"], "name": b["name"], "universe": b["universe"], "status": b["status"],
            "ticks_per_round": b["ticks"], "interval_s": b["interval_s"], "slice_wei": b["slice_wei"],
            "started": b.get("started"), "stopped": b.get("stopped"), "stop_reason": b.get("stop_reason"), "rounds": b.get("rounds", 0),
            "executed": len(ex), "refused": len(refused), "under_exception": sum(1 for r in ex if r.get("under_exception")),
            "spent_wei": str(sum(int((r.get("strategy") or {}).get("slice_wei") or 0) for r in ex)),
            "refusal_reasons": sorted({(r.get("error") or "?").split(" — ")[0] for r in refused}),
            "positions": [{"kind": r.get("kind", "pool"), "name": r["pick"].get("name") or r["pick"]["pool_id"][:12],
                           "exit_loss_bps_at_entry": r["exit_probe"]["loss_bps"], "under_exception": bool(r.get("under_exception"))} for r in ex],
        })
    return {"count": len(out), "bots": out,
            "note": "tous les bots d'un compte travaillent dans le même coffre, sous le même mandat signé une fois : "
                    "le budget et la perte de sortie tolérée sont communs ; `operations(bot=<nom>)` donne le détail d'un bot"}


def t_positions() -> dict:
    """Ce que le coffre détient, et ce qui reste du budget signé."""
    m = read_mandate()
    if not m:
        return {"error": "aucun mandat : lance d'abord le banc"}
    vault = m["vault"]
    held = []
    for r in read_journal():
        if r["decision"] != "EXECUTED":
            continue
        tok = r["pick"]["currency1"]
        bal = cast_call("call", tok, "balanceOf(address)(uint256)", vault)
        held.append({
            "pool_id": r["pick"]["pool_id"], "token": tok, "hook": r["pick"]["hook"],
            "kind": r.get("kind", "pool"), "name": r["pick"].get("name"), "bot": _bot_name(r),
            "under_exception": bool(r.get("under_exception")), "acquired_at_tick": r["tick"],
            "entry_bps": r["pick"]["entry_bps_median"],
            "exit_loss_bps_at_buy": r["exit_probe"]["loss_bps"],
            "balance_now": (bal or "?").split()[0],
            "tx": r["tx"],
        })
    h = cast_call("call", vault, "hashMandate((address,address,uint256,uint16,uint64,uint256))(bytes32)",
                  "(" + ",".join(str(m["mandate"][k]) for k in
                                 ("agent", "budgetToken", "budgetAmount", "maxRoundTripLossBps", "expiry", "nonce")) + ")")
    spent = cast_call("call", vault, "spent(bytes32)(uint256)", h.split()[0]) if h else None
    budget = int(m["mandate"]["budgetAmount"])
    spent_wei = int((spent or "0").split()[0].replace(",", "")) if spent else 0
    return {
        "vault": vault,
        "owner_device": m["owner"],
        "budget_wei": str(budget),
        "spent_wei": str(spent_wei),
        "remaining_wei": str(budget - spent_wei),
        "max_round_trip_loss_bps": m["mandate"]["maxRoundTripLossBps"],
        "positions": held,
    }


def t_mandate() -> dict:
    """Le mandat signé sur le Ledger, et ce qu'il autorise."""
    m = read_mandate()
    if not m:
        return {"error": "aucun mandat"}
    return {
        "owner_device": m["owner"], "vault": m["vault"], "chainId": m["chainId"],
        "signature": m["signature"], "fields": m["mandate"],
        "signed_on": "Ledger Flex, EIP-712, affiché champ par champ",
        "enforced_by": "ExitVault.buy — ecrecover(digest) == owner, budget, expiration",
    }


def t_universe_facts() -> dict:
    """Pourquoi un piège est indiscernable AVANT l'achat — les chiffres de l'univers."""
    rows = read_journal()
    if not rows:
        return {"error": "aucune opération"}
    # le dernier tour d'un agent (une entree sous derogation n'a pas de faits d'univers : elle vient du porteur)
    last = next((r for r in reversed(rows) if (r.get("strategy") or {}).get("universe_facts")), None)
    if last is None:
        return {"error": "aucun tour d'agent au journal (seulement des entrées sous dérogation)"}
    facts = last["strategy"]["universe_facts"]
    refused = [r for r in rows if r["decision"] != "EXECUTED"]
    return {
        **facts,
        "universe": last.get("kind", "pool"),
        "strategy": last["strategy"]["name"],
        "objective": last["strategy"]["objective"],
        "observed": {
            "operations": len(rows),
            "refused_by_vault": len(refused),
            "refused_entry_bps": sorted({r["pick"]["entry_bps_median"] for r in refused}),
            "refused_exit_bps": sorted({r["exit_probe"]["loss_bps"] for r in refused if r["exit_probe"]["loss_bps"]}),
        },
        "reading": (
            "Le coût d'entrée ne sépare rien : les pièges coûtent à l'achat ce que coûtent des pools sains. "
            "Le registre de hooks d'Uniswap ne les connaît pas. Seule la sortie les distingue, et elle "
            "n'est visible qu'en la simulant."
        ),
    }


def t_compare_entry_exit() -> dict:
    """Entrée contre sortie, pour chaque opération : la seule colonne qui discrimine."""
    rows = read_journal()
    table = [
        {
            "tick": r["tick"], "pool_id": r["pick"]["pool_id"][:12],
            "entry_bps": r["pick"]["entry_bps_median"],
            "exit_bps": r["exit_probe"]["loss_bps"],
            "registry_known": r["pick"]["registry"]["present"],
            "decision": r["decision"],
        }
        for r in rows
    ]
    ent = [t["entry_bps"] for t in table]
    return {
        "table": table,
        "entry_spread": {"min": min(ent), "max": max(ent), "median": statistics.median(ent)} if ent else None,
        "note": "trie sur `entry_bps` : rien ne sépare accepté et refusé. Trie sur `exit_bps` : tout se sépare.",
    }


def t_hook_analysis(tick: int | None = None, seq: int | None = None) -> dict:
    """Ce que chaque hook PREND, remesure en direct par le contrefactuel de TARE, dans les deux sens."""
    rows = [r for r in (dict(r, seq=i + 1) for i, r in enumerate(read_journal())) if r.get("hook_analysis")]
    if seq is not None:
        rows = [r for r in rows if r["seq"] == seq]
    elif tick is not None:
        rows = [r for r in rows if r["tick"] == tick]
    if not rows:
        return {"error": "aucune analyse de hook au journal" + (f" pour ce tour ({tick})" if tick is not None else "")
                + " — les coffres ERC-4626 n'ont pas de hook : ce sont des swaps v4 qui en ont"}
    out = []
    for r in rows:
        h = r["hook_analysis"]
        ent = h["live_counterfactual_entry"] or {}
        ext = h["live_counterfactual_exit"] or {}
        out.append({
            "seq": r["seq"], "tick": r["tick"], "pool_id": r["pick"]["pool_id"], "hook": r["pick"]["hook"],
            "hook_takes_entering_bps": ent.get("bps"), "entering_label": ent.get("label"),
            "hook_takes_exiting_bps": ext.get("bps"), "exiting_label": ext.get("label"),
            "permissions_from_address": h["permissions_from_address"],
            "registry_known": r["pick"]["registry"]["present"],
            "vault_decision": r["decision"], "vault_reason": r["error"],
            "measured_at_block": ent.get("block"),
        })
    return {
        "method": rows[0]["hook_analysis"]["method"],
        "permissions_note": rows[0]["hook_analysis"]["permissions_note"],
        "rows": out,
        "reading": (
            "Deux familles de pieges apparaissent : le hook qui prend tout a la sortie (0 bps a "
            "l'entree, ~9990 a la sortie), et le jeton qui refuse d'etre transfere (le hook prend 0 "
            "dans les deux sens, mais on ne peut pas le detenir). Le coffre attrape les deux."
        ),
    }


def t_ledger_earn_yields(network: str = "ethereum", limit: int = 15) -> dict:
    """Ce que l'Agent Stack de Ledger montre d'une position à rendement — et ce qu'il n'en montre pas.

    `wallet-cli earn yields` (2.1.0) rend, pour chaque opportunité : fournisseur, jeton déposé, type et
    valeur du rendement, lien de dépôt. Aucun champ ne parle de la SORTIE : délai de retrait, file,
    `maxWithdraw`, coût. On le constate, ligne par ligne — sans appareil, lecture seule.
    """
    d = walletcli.earn_yields(network, limit)
    if not d.get("ok"):
        return {"ok": False, "error": d.get("error") or d.get("raw"), "note": "wallet-cli indisponible ou hors ligne"}
    data = d.get("data", {})
    ys = data.get("yields", [])
    exit_fields = {"withdrawalDelay", "cooldown", "maxWithdraw", "exitCost", "unbonding", "queue", "lockup"}
    rows = []
    for y in ys:
        keys = set(y.keys())
        rows.append({
            "provider": y.get("provider"), "deposit_token": y.get("depositToken"),
            "interest": f"{y.get('interestType')} {y.get('interestValue')}",
            "category": y.get("category"), "deeplink": y.get("deeplink"),
            "fields_returned": sorted(keys),
            "exit_information": sorted(keys & exit_fields) or "aucune",
        })
    return {
        "source": f"wallet-cli {walletcli.version() or '?'} — `earn yields --network {network}` (Agent Stack, sans appareil)",
        "network": data.get("network"),
        "count": len(rows),
        "rows_with_exit_information": sum(1 for r in rows if r["exit_information"] != "aucune"),
        "rows": rows,
        "reading": (
            "La brique Earn de l'Agent Stack décrit l'ENTRÉE d'une position (fournisseur, jeton, rendement) et mène "
            "au dépôt (`earn deposit --product <id>`, signé sur l'appareil). Rien n'y décrit la sortie. C'est la "
            "question que Porte de sortie pose avant chaque entrée — sur les swaps aujourd'hui, sur ces coffres ensuite."
        ),
    }


def t_vault_openness(vault: str | None = None, amount_wei: int | None = None) -> dict:
    """La porte des coffres ERC-4626 (Morpho, WETH, Base), mesuree MAINTENANT sur le fork par le coffre.

    Pour chaque coffre : l'aller-retour reel a la taille de la tranche (deposit+redeem puis revert), et la
    part de la position du plus gros deposant qui ne peut PAS sortir aujourd'hui (`maxWithdraw` contre
    `convertToAssets(balanceOf)`). Lecture seule : tout est annule par le revert.
    """
    sys.path.insert(0, str(ROOT / "agent"))
    import vaults as va

    if not MANDATE.exists():
        return {"error": "pas de mandate.json : le coffre n'est pas deploye (ouvre une session dans le banc)"}
    ev = json.loads(MANDATE.read_text())["vault"]
    universe, stats = va.build_universe(False)
    if vault:
        universe = [u for u in universe if u["pool_id"].lower().startswith(vault.lower())]
    rows = []
    for u in universe:
        ex = va.probe(ev, u, amount_wei)
        rows.append({
            "vault": u["pool_id"], "name": u["name"], "advertised_apy_pct": u["apy_pct"],
            "total_assets_weth": u["total_assets_weth"], "listed_by_morpho": u["listed"],
            "deposit_refused": ex.get("deposit_refused"),
            "own_round_trip_bps": ex.get("own_round_trip_bps"),
            "door_stuck_bps": ex.get("stuck_bps"),
            "top_holder": u["ref_holder"],
            "top_holder_position_wei": ex.get("ref_position_wei"), "top_holder_max_withdraw_wei": ex.get("ref_max_withdraw_wei"),
            "exit_loss_bps_for_mandate": ex.get("loss_bps"),
        })
    return {
        "measured_by": "ExitVault.vaultExitLossBps / vaultStuckBps sur le fork de Base (bloc epingle)",
        "universe_note": stats["note"],
        "count": len(rows),
        "full_vaults": sum(1 for r in rows if r["deposit_refused"]),
        "rows": rows,
        "reading": (
            "Le rendement affiche ne dit rien de la porte. Au bloc des mesures, le plus gros coffre WETH de Base a plus "
            "d'un quart de la position de son plus gros deposant bloquee, et cinq coffres sur dix refusent le depot. "
            "`previewRedeem` ne le montre pas : le standard lui impose d'ignorer les limites de retrait."
        ),
    }


TOOLS = {
    "vault_openness": (t_vault_openness,
                       "La porte des coffres ERC-4626 (Morpho WETH, Base), mesuree maintenant : aller-retour reel, "
                       "part bloquee du plus gros deposant, coffres pleins.",
                       {"vault": {"type": "string"}, "amount_wei": {"type": "integer"}}),
    "ledger_earn_yields": (t_ledger_earn_yields,
                           "Ce que l'Agent Stack de Ledger (wallet-cli earn yields) dit d'une position à rendement — "
                           "et ce qu'il n'en dit pas : la sortie.",
                           {"network": {"type": "string"}, "limit": {"type": "integer"}}),
    "operations": (t_operations, "Les opérations de l'agent, avec l'issue et son motif.",
                   {"decision": {"type": "string", "enum": ["EXECUTED", "REFUSED_BY_VAULT"]},
                    "limit": {"type": "integer"}, "bot": {"type": "string"}}),
    "decision": (t_decision, "Tout ce qui a mené à une décision : univers, liste courte, scores, sonde, issue. "
                 "Les ticks repartent à 1 à chaque tour (pools, puis coffres) : donne `kind` (pool|vault) ou `seq` (rang, cf. operations).",
                 {"tick": {"type": "integer"}, "kind": {"type": "string", "enum": ["pool", "vault"]}, "seq": {"type": "integer"}}),
    "positions": (t_positions, "Ce que le coffre détient (et quel bot l'a pris), et ce qui reste du budget signé.", {}),
    "bots": (t_bots, "Les bots du compte : actifs et arrêtés, univers, rythme, tours, achats/refus, dérogations, dépense, "
             "motifs de refus, positions prises. Lecture seule : rien ici ne lance ni n'arrête un bot.",
             {"status": {"type": "string", "enum": ["running", "stopped", "done"]}}),
    "mandate": (t_mandate, "Le mandat signé sur le Ledger et ce qu'il autorise.", {}),
    "universe_facts": (t_universe_facts, "Pourquoi un piège est indiscernable avant l'achat.", {}),
    "compare_entry_exit": (t_compare_entry_exit, "Entrée contre sortie, opération par opération.", {}),
    "hook_analysis": (t_hook_analysis,
                      "Ce que chaque hook prend, remesuré en direct par le contrefactuel TARE, dans les deux sens (pools v4 ; "
                      "`seq` = rang dans le journal, cf. operations).",
                      {"tick": {"type": "integer"}, "seq": {"type": "integer"}}),
}


# --------------------------------------------------------------------- MCP stdio

def handle(msg: dict) -> dict | None:
    mid, method = msg.get("id"), msg.get("method")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "porte-de-sortie", "version": "1.0.0"},
        }}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    # La cle est un secret de LANCEMENT (env du serveur, pose par la config MCP), pas un mot que le
    # modele devrait taper : si elle est dans l'environnement, elle prime et n'est pas demandee.
    env_key = os.environ.get("PDS_MCP_KEY")
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": [
            {
                "name": name,
                "description": desc + (" (lecture seule)" if env_key else " (lecture seule ; exige `key`)"),
                "inputSchema": {
                    "type": "object",
                    "properties": ({} if env_key else {"key": {"type": "string", "description": "clé du serveur (PDS_MCP_KEY)"}}) | props,
                    **({} if env_key else {"required": ["key"]}),
                },
            }
            for name, (_, desc, props) in TOOLS.items()
        ]}}
    if method == "tools/call":
        params = msg.get("params", {})
        name = params.get("name")
        args = dict(params.get("arguments") or {})
        passed = args.pop("key", None)
        given = env_key or passed
        if name not in TOOLS:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"outil inconnu : {name}"}}
        if not key_ok(given):
            return {"jsonrpc": "2.0", "id": mid, "result": {
                "content": [{"type": "text", "text": "clé refusée — passe `key`, ou PDS_MCP_KEY dans l'environnement."}],
                "isError": True,
            }}
        try:
            out = TOOLS[name][0](**args)
        except TypeError as e:
            out = {"error": f"arguments : {e}"}
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False, indent=1)}]
        }}
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"méthode inconnue : {method}"}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print-key", action="store_true", help="la cle maitre, ou celle d'un compte avec --account")
    ap.add_argument("--account", help="adresse d'un compte : sa cle derivee")
    ap.add_argument("--key-status", action="store_true", help="d'où vient la clé : Key Ring ou fichier en clair")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.print_key:
        print(account_key(a.account) if a.account else load_key())
        return
    if a.key_status:
        load_key()
        print(json.dumps({"source": _KEY_SOURCE, "sealed_file": RINGFILE.exists(),
                          "ring": walletcli.ring_status()}, indent=1, ensure_ascii=False))
        return
    if a.selftest:
        k = account_key(ACCOUNT) if ACCOUNT else load_key()
        for name in TOOLS:
            r = handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                        "params": {"name": name, "arguments": {"key": k}}})
            body = r["result"]["content"][0]["text"]
            print(f"  {name:20} {'ERREUR' if r['result'].get('isError') else 'ok'}  {body[:110].replace(chr(10),' ')}")
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            out = handle(json.loads(line))
        except Exception as e:  # noqa: BLE001
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": repr(e)}}
        if out is not None:
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
