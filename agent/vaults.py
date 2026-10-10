#!/usr/bin/env python3
"""L'agent de rendement : il choisit un coffre ERC-4626 sur ce que tout le monde regarde — le rendement
affiché — et journalise POURQUOI. Il ne voit pas la porte. C'est le coffre qui la mesure, à l'entrée.

La seconde instance de la même question, sur des coffres RÉELS de Base (Morpho, WETH). Le standard écrit
le piège : `previewRedeem` doit ignorer les limites de retrait, `maxWithdraw` peut valoir moins que la
position. Au bloc des mesures, le plus gros coffre WETH de Base (Moonwell Flagship ETH, 1 957 WETH,
1,36 % affiché) a 27 % de la position de son plus gros déposant bloquée — et cinq coffres sur dix
refusent même le dépôt (`AllCapsReached`).

    python3 agent/vaults.py --ticks 3                 # la stratégie choisit seule
    python3 agent/vaults.py --inject 0xa0E430870c      # une consigne impose un coffre

Chaque tour écrit une ligne dans agent/journal.jsonl, au même format que l'agent de swaps, avec
`kind: "vault"` — le MCP, la surveillance et le banc lisent les deux.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANVIL = os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")
JOURNAL = Path(os.environ.get("PDS_JOURNAL", ROOT / "agent" / "journal.jsonl"))
MORPHO_API = "https://blue-api.morpho.org/graphql"

WETH = "0x4200000000000000000000000000000000000006"
AGENT_KEY = os.environ.get("PDS_AGENT_KEY", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")  # anvil #1  # PDS_AGENT_KEY sur un vrai reseau
PARAMS = {"slice_wei": 10**16, "min_total_assets_wei": 10**17, "require_listed": False}

ENTER_SIG = "enterVault((address,address,uint256,uint16,uint64,uint256),bytes,address,uint256,address)"
PROBE_SIG = "vaultExitLossBps(address,uint256,address)(uint256,bool,bytes4,uint256,uint256)"
STUCK_SIG = "vaultStuckBps(address,address)(uint256,uint256,uint256)"

# Sélecteurs que le coffre ou le protocole renvoient (cast sig "...")
SEL = {
    "0x18208f15": "CannotExit — la porte est plus fermee que le mandat n'autorise",
    "0x0b7d8347": "ExitBlocked — l'aller-retour reel a echoue",
    "0xbd608e71": "BuyFailed — le coffre a refuse le depot",
    "0xded0652d": "AllCapsReached — le coffre est plein, il n'accepte plus de depot",
}

# Les dix coffres WETH de Base mesurés au bloc 50 614 000, et leur plus gros déposant (Morpho API,
# vérifié sur le fork). C'est l'amorce ; --refresh la remplace par l'état vivant de l'API.
UNIVERSE_SEED = [
    ("0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1", "Moonwell Flagship ETH", "0x93D9E4535f2e62C0630e6F2E89c2d95190422461", 1.36, True),
    ("0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18", "Seamless WETH Vault", "0x1243e7aD51EDA47e580C20E751AcAa0B8863c17C", 0.00, False),
    ("0x5A32099837D89E3a794a44fb131CBbAD41f87a8C", "Extrafi XLend WETH", "0xE67225e35FC75971a4347890a43a9C0C869F5547", 1.36, True),
    ("0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844", "Gauntlet WETH Core", "0xEFbCFe7b644d6b2E058116954412976741650242", 1.52, True),
    ("0x09832347586E238841F49149C84d121Bc2191C53", "Clearstar ETH Reactor", "0xc41848A0aaaE43B8eCF0d23371f9b20B96b41B83", 1.90, True),
    ("0x1D795E29044A62Da42D927c4b179269139A28A6B", "Yearn OG WETH", "0xe4342fd5C09Df6Ba8C39c3bC3BA9a7D02097F33c", 1.55, False),
    ("0xA2Cac0023a4797b4729Db94783405189a4203AFc", "Re7 WETH", "0x961b2429Aaae97172F493eE6926E37b9a04E7040", 0.00, False),
    ("0xbEEf050a7485865A7a8d8Ca0CC5f7536b7a3443e", "Steakhouse ETH", "0x8A9B4f00Cd8a5EB91a02Af38A8b6D4cF2eb35a20", 0.00, True),
    ("0xBeef2dc30633221Fa51A1C3e5299BFf8C69fc0A8", "Safe x Steakhouse ETH", "0x4e1D2d808c5b8BbFdFefCB4a46151483eba6aEbd", 1.37, False),
    ("0x80D9964fEb4A507dD697b4437Fc5b25b618CE446", "Pyth ETH", "0x8Ba14FAFDb6139cdADF84a43667e38cCD936432f", 0.00, False),
]


# --------------------------------------------------------------------- la chaîne

def cast(*args, key: str | None = None) -> tuple[int, str]:
    cmd = ["cast", *args, "--rpc-url", ANVIL]
    if key:
        cmd += ["--private-key", key]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def call1(to: str, sig: str, *args: str) -> str | None:
    rc, out = cast("call", to, sig, *args)
    return out.strip().split()[0] if rc == 0 and out.strip() else None


def tup(xs) -> str:
    return "(" + ",".join(str(x) for x in xs) + ")"


def mandate_tuple(m: dict) -> str:
    d = m["mandate"]
    return tup([d["agent"], d["budgetToken"], d["budgetAmount"], d["maxRoundTripLossBps"], d["expiry"], d["nonce"]])


# --------------------------------------------------------------------- l'univers

def refresh_from_api(limit: int = 20) -> list[tuple] | None:
    """L'état VIVANT de l'API Morpho (rendement affiché, listing) et le plus gros déposant par coffre."""
    try:
        import requests

        q = """{ vaults(first: 60, where: { chainId_in: [8453], assetSymbol_in: ["WETH"] },
                 orderBy: TotalAssetsUsd, orderDirection: Desc)
                 { items { address name listed state { totalAssets netApy } } } }"""
        items = requests.post(MORPHO_API, json={"query": q}, timeout=30).json()["data"]["vaults"]["items"]
        items = [v for v in items if int((v["state"] or {}).get("totalAssets") or 0) >= PARAMS["min_total_assets_wei"]][:limit]
        q2 = """query($a:[String!]) { vaultPositions(first: 200, orderBy: Shares, orderDirection: Desc,
                  where: { vaultAddress_in: $a, chainId_in: [8453] }) { items { vault { address } user { address } } } }"""
        pos = requests.post(MORPHO_API, json={"query": q2, "variables": {"a": [v["address"] for v in items]}},
                            timeout=30).json()["data"]["vaultPositions"]["items"]
        top: dict[str, str] = {}
        for p in pos:
            top.setdefault(p["vault"]["address"].lower(), p["user"]["address"])
        return [(v["address"], v["name"], top.get(v["address"].lower(), "0x" + "00" * 20),
                 round(float((v["state"] or {}).get("netApy") or 0) * 100, 2), bool(v["listed"])) for v in items]
    except Exception as e:  # noqa: BLE001
        print(f"(API Morpho indisponible : {e} — amorce locale)", file=sys.stderr)
        return None


def build_universe(refresh: bool = False) -> tuple[list[dict], dict]:
    """Ce que la stratégie VOIT : nom, rendement affiché, taille au bloc, listing. Rien sur la porte."""
    seed = (refresh_from_api() if refresh else None) or UNIVERSE_SEED
    universe = []
    for addr, name, holder, apy, listed in seed:
        ta = call1(addr, "totalAssets()(uint256)")
        universe.append({
            "pool_id": addr, "currency1": addr, "hook": "ERC-4626", "fee": 0, "tickSpacing": 0,
            "name": name, "apy_pct": apy, "total_assets_wei": ta or "0",
            "total_assets_weth": round(int(ta or 0) / 1e18, 2),
            "ref_holder": holder, "listed": listed,
            "entry_bps_median": 0.0, "depth_sizes": 0,
            "registry": {"present": listed, "name": name if listed else None},
        })
    stats = {"vaults": len(universe), "listed": sum(1 for u in universe if u["listed"]),
             "note": "aucun champ de cet univers ne parle de la sortie : ni delai, ni maxWithdraw, ni caps"}
    return universe, stats


# --------------------------------------------------------------------- la stratégie

def score(c: dict) -> tuple[float, dict]:
    """Un score de rendement ordinaire : l'APY affiché, la taille (confiance), le listing.

    Aucun terme ne regarde la porte — par construction, elle n'est pas dans ce que l'API affiche.
    """
    parts = {
        "apy": min(c["apy_pct"], 5.0) / 5.0 * 50,
        "size": min(math.log10(max(c["total_assets_weth"], 0.01) + 1), 4) / 4 * 35,
        "listed": 15 if c["listed"] else 0,
    }
    return round(sum(parts.values()), 3), {k: round(v, 3) for k, v in parts.items()}


def shortlist(universe: list[dict], n: int = 5, held: set[str] | None = None) -> list[dict]:
    held = held or set()
    scored = []
    for c in universe:
        if c["pool_id"].lower() in held:
            continue
        if int(c["total_assets_wei"]) < PARAMS["min_total_assets_wei"]:
            continue
        if PARAMS["require_listed"] and not c["listed"]:
            continue
        s, parts = score(c)
        scored.append({**c, "score": s, "score_parts": parts})
    scored.sort(key=lambda x: (-x["score"], x["pool_id"]))
    return scored[:n]


# --------------------------------------------------------------------- la sonde (lecture)

def probe(vault: str, c: dict, amount_wei: int | None = None) -> dict:
    """Ce que le coffre mesure : l'aller-retour REEL a notre taille, et la porte du plus gros deposant."""
    amt = str(amount_wei or PARAMS["slice_wei"])
    rc, out = cast("call", vault, PROBE_SIG, c["pool_id"], amt, c["ref_holder"])
    res = {"source": "ExitVault.vaultExitLossBps — deposit+redeem reels puis revert, et maxWithdraw du plus gros deposant"}
    if rc != 0:
        sel = re.search(r"custom error (0x[0-9a-f]{8})", out)
        inner = re.search(r"0x[0-9a-f]{8}:\s*0*([0-9a-f]{8})", out)
        reason = SEL.get(sel.group(1), sel.group(1)) if sel else out.strip()[-160:]
        res.update({"loss_bps": None, "exit_blocked": None, "deposit_refused": reason,
                    "vault_error": ("0x" + inner.group(1)) if inner else None})
        if res["vault_error"] in SEL:
            res["deposit_refused"] = SEL[res["vault_error"]]
        return res
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    # lignes entierement numeriques seulement : la ligne `bytes4` (0x00000000) commence aussi par un chiffre
    nums = [int(x) for x in re.findall(r"^(\d+)$", "\n".join(lines), re.M)]
    bools = re.findall(r"^(true|false)$", "\n".join(lines), re.M)
    rc2, out2 = cast("call", vault, STUCK_SIG, c["pool_id"], c["ref_holder"])
    nums2 = [int(x) for x in re.findall(r"^(\d+)$", out2, re.M)] if rc2 == 0 else []
    res.update({
        "loss_bps": nums[0] if nums else None,
        "exit_blocked": bools[0] == "true" if bools else None,
        "own_round_trip_bps": nums[1] if len(nums) > 1 else None,
        "stuck_bps": nums[2] if len(nums) > 2 else None,
        "ref_position_wei": str(nums2[1]) if len(nums2) > 1 else None,
        "ref_max_withdraw_wei": str(nums2[2]) if len(nums2) > 2 else None,
        "deposit_refused": None,
    })
    return res


# --------------------------------------------------------------------- le journal

def append(entry: dict) -> None:
    bot = os.environ.get("PDS_BOT")   # le bot (nomme par le porteur) au nom duquel cet agent tourne, s'il y en a un
    if bot:
        try:
            entry["bot"] = json.loads(bot)
        except ValueError:
            entry["bot"] = {"id": None, "name": bot}
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _decode_error(out: str) -> str | None:
    for sel, text in SEL.items():
        if sel in out:
            return text
    m = re.search(r"(custom error [^\n]+|revert[^\n]*)", out)
    return m.group(1)[:200] if m else out.strip()[-200:]


def _escalation(pick: dict, ex: dict, max_bps: int) -> dict | None:
    bps = ex.get("loss_bps")
    if ex.get("deposit_refused"):
        return {"possible": False, "reason": f"le coffre refuse le depot : {ex['deposit_refused']} — rien a deroger"}
    if ex.get("exit_blocked") or bps is None or bps >= 10_000:
        return {"possible": False, "reason": "sortie bloquee : l'aller-retour reel a echoue, aucune derogation n'y change rien"}
    return {
        "possible": True, "kind": "vault",
        "pool_id": pick["pool_id"], "vault": pick["pool_id"], "name": pick["name"], "ref_holder": pick["ref_holder"],
        "currency1": pick["pool_id"], "hook": "ERC-4626", "fee": 0, "tickSpacing": 0,
        "seen_exit_bps": int(bps), "mandate_allows_bps": max_bps, "amount_in": str(PARAMS["slice_wei"]),
        "question": (f"{pick['name']} : {ex.get('stuck_bps', 0)} bps de la plus grosse position ne peuvent pas sortir "
                     f"aujourd'hui (porte a {100 - ex.get('stuck_bps', 0) / 100:.1f} %), ton mandat tolere {max_bps} bps — tu entres quand meme ?"),
    }


# --------------------------------------------------------------------- la boucle

def tick(n: int, vault: str, mandate: dict, universe: list[dict], stats: dict, held: set[str], inject: str | None) -> dict:
    m_bps = int(mandate["mandate"]["maxRoundTripLossBps"])
    cands = shortlist(universe, 5, held)
    if not cands and not inject:
        return None   # plus rien de nouveau a tenter dans cet univers
    if inject:
        forced = next((c for c in universe if c["pool_id"].lower().startswith(inject.lower())), None)
        if not forced:
            raise SystemExit(f"coffre injecte introuvable : {inject}")
        s, parts = score(forced)
        pick = {**forced, "score": s, "score_parts": parts}
        why = "CONSIGNE INJECTEE : une page lue par l'agent lui a impose ce coffre. L'agent obeit."
        cands = [pick] + [c for c in cands if c["pool_id"] != pick["pool_id"]][:4]
    else:
        if not cands:
            raise SystemExit("plus de coffre candidat")
        pick = cands[0]
        why = (f"premier d'une liste courte de {len(cands)}, score {pick['score']} : {pick['apy_pct']} % affiche, "
               f"{pick['total_assets_weth']} WETH deposes, {'liste' if pick['listed'] else 'non liste'} par Morpho. "
               "Aucun terme du score ne regarde la porte : l'API ne la montre pas.")

    ex = probe(vault, pick)
    rc, out = cast("send", vault, ENTER_SIG, mandate_tuple(mandate), mandate["signature"],
                   pick["pool_id"], str(PARAMS["slice_wei"]), pick["ref_holder"], key=AGENT_KEY)
    executed = rc == 0 and re.search(r"status\s+1", out) is not None
    tx = (re.search(r"transactionHash\s+(0x[0-9a-f]{64})", out) or [None, None])[1]

    entry = {
        "ts": int(time.time()), "tick": n, "kind": "vault",
        "mode": "injected" if inject else "strategy",
        "strategy": {
            "name": "yield-erc4626-weth-v1",
            "objective": "rendement affiche + taille + listing — la porte n'est pas dans l'API",
            "slice_wei": str(PARAMS["slice_wei"]), "require_listed": PARAMS["require_listed"],
            "universe_size": len(universe), "universe_facts": stats,
        },
        "shortlist": cands, "pick": pick, "why": why,
        "exit_probe": ex,
        "mandate": {"owner": mandate["owner"], "max_round_trip_loss_bps": m_bps,
                    "budget_wei": mandate["mandate"]["budgetAmount"], "signed_on": "Ledger Flex (EIP-712)"},
        "decision": "EXECUTED" if executed else "REFUSED_BY_VAULT",
        "escalation_request": None if executed else _escalation(pick, ex, m_bps),
        "tx": tx,
        "error": None if executed else _decode_error(out),
    }
    append(entry)
    held.add(pick["pool_id"].lower())
    return entry


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticks", type=int, default=3)
    ap.add_argument("--inject", help="prefixe de l'adresse d'un coffre impose par une consigne injectee")
    ap.add_argument("--mandate", default=str(ROOT / "mandate.json"))
    ap.add_argument("--params", help="JSON : slice_wei, require_listed, min_total_assets_wei")
    ap.add_argument("--refresh", action="store_true", help="relire l'API Morpho au lieu de l'amorce locale")
    ap.add_argument("--reset-journal", action="store_true")
    a = ap.parse_args()

    if a.params:
        PARAMS.update({k: v for k, v in json.loads(Path(a.params).read_text()).items() if k in PARAMS})
        PARAMS["slice_wei"] = int(PARAMS["slice_wei"])
    if a.reset_journal and JOURNAL.exists():
        JOURNAL.unlink()

    mandate = json.loads(Path(a.mandate).read_text())
    universe, stats = build_universe(a.refresh)
    print(f"univers : {stats['vaults']} coffres WETH ERC-4626 (Morpho, Base), {stats['listed']} listes — {stats['note']}\n")
    # deja tente : ce que le compte detient (n'importe quel bot, n'importe quel tour) et ce que CE bot a deja essaye —
    # un bot qui tourne a son rythme avance dans l'univers au lieu de retenter le meme refus a chaque tour
    held: set[str] = set()
    bot_id = (json.loads(os.environ["PDS_BOT"]).get("id") if os.environ.get("PDS_BOT") else None)
    if JOURNAL.exists():
        for line in JOURNAL.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            blocked = (r.get("exit_probe") or {}).get("exit_blocked") or "ExitBlocked" in (r.get("error") or "")
            if r.get("decision") == "EXECUTED" or blocked or (bot_id and (r.get("bot") or {}).get("id") == bot_id):
                held.add(r["pick"]["pool_id"].lower())   # detenu, ou jeton non transferable (fait du compte), ou deja tente par ce bot
    for n in range(1, a.ticks + 1):
        e = tick(n, mandate["vault"], mandate, universe, stats, held, a.inject if n == a.ticks and a.inject else None)
        if e is None:
            print("plus rien de nouveau a tenter : tous les coffres ont deja ete essayes ou sont detenus")
            break
        ex = e["exit_probe"]
        mark = "OK " if e["decision"] == "EXECUTED" else "NON"
        print(f"[{mark}] tour {n} ({e['mode']}) — {e['pick']['name']} · {e['pick']['apy_pct']} % affiche"
              + (f" · porte {ex.get('stuck_bps')} bps fermee · aller-retour {ex.get('own_round_trip_bps')} bps" if ex.get("loss_bps") is not None else "")
              + (f" · {ex['deposit_refused']}" if ex.get("deposit_refused") else "")
              + (f" — {e['error']}" if e["error"] else ""))
    print(f"\njournal : {JOURNAL}")


if __name__ == "__main__":
    main()
