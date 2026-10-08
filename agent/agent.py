#!/usr/bin/env python3
"""L'agent : un DCA sur la longue traîne de Base, qui journalise POURQUOI il achète.

La stratégie est ordinaire et défendable — c'est tout l'intérêt. Elle cherche, parmi les pools
Uniswap v4 appariés au WETH, ceux qui sont profonds, bon marché à l'entrée, et que le registre de
hooks d'Uniswap ne signale pas. Puis elle y place une tranche fixe, tour après tour.

Ce que le corpus TARE dit, et qui fait la démonstration :

  * les six pools dont on ne ressort jamais coûtent **0,00 bps à l'achat** — exactement comme
    77 pools parfaitement sains ;
  * leurs six hooks sont **absents du registre Uniswap** : ni nom, ni drapeau, ni audit ;
  * donc **aucun signal disponible avant l'achat ne les distingue**.

La seule chose qui les sépare est la sortie, et on ne la voit qu'en la simulant. C'est ce que fait
le coffre, à chaque achat, dans la même transaction.

    python3 agent/agent.py --ticks 4              # la stratégie choisit seule
    python3 agent/agent.py --inject 0xbbe6…       # une consigne injectée impose un jeton

Chaque tour écrit une ligne dans agent/journal.jsonl : l'univers, la liste courte avec toutes les
caractéristiques, le choix, le pourquoi, la sonde de sortie, la décision, le résultat.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from counterfactual import measure as counterfactual  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARE = Path(os.environ.get("TARE_ROOT", ROOT.parent / "ETH_Online_2026"))
ANVIL = os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")
JOURNAL = Path(os.environ.get("PDS_JOURNAL", ROOT / "agent" / "journal.jsonl"))

WETH = "0x4200000000000000000000000000000000000006"
AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"  # anvil #1
AMOUNT_IN = 10**14  # 0,0001 WETH par tranche — valeur par defaut, la taille des mesures TARE

# Parametres que le mandat signe impose a la strategie (remplis par --params).
PARAMS = {"slice_wei": AMOUNT_IN, "min_depth_sizes": 3, "require_registry": False}

BUY_SIG = "buy((address,address,uint256,uint16,uint64,uint256),bytes,(address,address,uint24,int24,address),uint256)"
PROBE_SIG = "exitLossBps((address,address,uint24,int24,address),uint256)(uint256,bool,bytes4)"


# --------------------------------------------------------------------- l'univers

def build_universe() -> tuple[list[dict], dict]:
    """Les pools WETH mesurés par TARE, enrichis de ce que le registre Uniswap en dit."""
    registry = {
        h["hook"]["address"].lower(): h
        for h in json.loads((TARE / "docs/hooklist-live-20260905.json").read_text())
    }
    one_way = {p["pool_id"] for p in json.loads((TARE / "docs/dataset/one-way.json").read_text())["pools"]}

    agg: dict[str, dict] = defaultdict(lambda: {"entry": [], "meta": {}})
    for line in (TARE / "docs/dataset/measurements.jsonl").open():
        m = json.loads(line)
        if m["currency0"] != WETH or m.get("label") != "MEASURED" or m["bps"] is None:
            continue
        if not m["zero_for_one"]:  # sens ACHAT seulement : c'est tout ce qu'on voit avant d'entrer
            continue
        e = agg[m["pool_id"]]
        e["entry"].append(m["bps"])
        e["meta"] = {
            "hook": m["hook"], "currency1": m["currency1"],
            "fee": m["key_fee"], "tickSpacing": m["tick_spacing"], "block": m["block_number"],
        }

    universe = []
    for pool_id, e in agg.items():
        if len(e["entry"]) < 3:  # trop peu de tailles mesurées : on ne sait rien
            continue
        hook = e["meta"]["hook"]
        reg = registry.get(hook.lower())
        universe.append({
            "pool_id": pool_id,
            **e["meta"],
            "entry_bps_median": round(statistics.median(e["entry"]), 4),
            "depth_sizes": len(e["entry"]),
            "registry": {
                "present": reg is not None,
                "name": reg["hook"]["name"] if reg else None,
                "verifiedSource": bool(reg["hook"]["verifiedSource"]) if reg else None,
                "auditUrl": bool(reg["hook"]["auditUrl"]) if reg else None,
                **({k: reg["properties"][k] for k in ("vanillaSwap", "swapAccess", "upgradeable")} if reg else {}),
            },
            "_one_way": pool_id in one_way,  # vérité de terrain, JAMAIS lue par la stratégie
        })
    stats = {
        "pools": len(universe),
        "zero_entry_cost": sum(1 for u in universe if abs(u["entry_bps_median"]) < 1e-9),
        "zero_entry_and_trap": sum(1 for u in universe if abs(u["entry_bps_median"]) < 1e-9 and u["_one_way"]),
        "traps_absent_from_registry": sum(1 for u in universe if u["_one_way"] and not u["registry"]["present"]),
        "traps_total": sum(1 for u in universe if u["_one_way"]),
    }
    return universe, stats


# --------------------------------------------------------------------- la stratégie

def score(c: dict) -> tuple[float, dict]:
    """Un score de DCA ordinaire : profond, bon marché à l'entrée, connu du registre.

    Aucun terme ne regarde la sortie — par construction, elle n'est pas observable avant d'acheter.
    """
    parts = {
        "depth": min(c["depth_sizes"], 8) / 8 * 40,             # mesuré sur beaucoup de tailles
        "cheap_entry": max(0.0, 40 - abs(c["entry_bps_median"]) / 5),  # peu de frottement à l'achat
        "registry_known": 12 if c["registry"]["present"] else 0,
        "verified": 5 if c["registry"].get("verifiedSource") else 0,
        "audited": 3 if c["registry"].get("auditUrl") else 0,
    }
    return round(sum(parts.values()), 3), {k: round(v, 3) for k, v in parts.items()}


def shortlist(universe: list[dict], n: int = 5, held: set[str] | None = None) -> list[dict]:
    held = held or set()
    scored = []
    for c in universe:
        if c["pool_id"] in held:
            continue
        if c["depth_sizes"] < PARAMS["min_depth_sizes"]:
            continue
        if PARAMS["require_registry"] and not c["registry"]["present"]:
            continue
        s, parts = score(c)
        scored.append({**{k: v for k, v in c.items() if k != "_one_way"},
                       "score": s, "score_parts": parts, "_one_way": c["_one_way"]})
    scored.sort(key=lambda x: (-x["score"], x["pool_id"]))
    return scored[:n]


# --------------------------------------------------------------------- la chaîne

def cast(*args, key: str | None = None) -> tuple[int, str]:
    cmd = ["cast", *args, "--rpc-url", ANVIL]
    if key:
        cmd += ["--private-key", key]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def tup(xs) -> str:
    return "(" + ",".join(str(x) for x in xs) + ")"


def pool_key(c: dict) -> str:
    return tup([WETH, c["currency1"], c["fee"], c["tickSpacing"], c["hook"]])


def mandate_tuple(m: dict) -> str:
    d = m["mandate"]
    return tup([d["agent"], d["budgetToken"], d["budgetAmount"],
                d["maxRoundTripLossBps"], d["expiry"], d["nonce"]])


def hook_permissions(addr: str) -> list[str]:
    """Les pouvoirs d'un hook sont encodes dans les bits de sa propre ADRESSE (Uniswap v4).

    Gratuit, toujours disponible — meme pour un hook absent du registre. Et, mesure sur le corpus :
    NON DISCRIMINANT. `afterSwapReturnsDelta` (le pouvoir de prelever sur la sortie) est porte par
    780 pools sains sur 932 : c'est comme ca que tout hook de launchpad prend ses frais.
    """
    flags = [(13, "beforeInitialize"), (12, "afterInitialize"), (11, "beforeAddLiquidity"),
             (10, "afterAddLiquidity"), (9, "beforeRemoveLiquidity"), (8, "afterRemoveLiquidity"),
             (7, "beforeSwap"), (6, "afterSwap"), (5, "beforeDonate"), (4, "afterDonate"),
             (3, "beforeSwapReturnsDelta"), (2, "afterSwapReturnsDelta"),
             (1, "afterAddLiquidityReturnsDelta"), (0, "afterRemoveLiquidityReturnsDelta")]
    v = int(addr, 16) & 0x3FFF
    return sorted(n for b, n in flags if v >> b & 1)


def hook_analysis(c: dict) -> dict:
    """Ce que le hook PREND, remesure en direct par le contrefactuel de TARE, dans les deux sens."""
    key = {"currency0": WETH, "currency1": c["currency1"], "fee": c["fee"],
           "tickSpacing": c["tickSpacing"], "hooks": c["hook"]}
    entree = counterfactual(ANVIL, key, True, PARAMS["slice_wei"])
    sortie = None
    if entree.get("out_with"):
        # on revend ce que l'achat aurait rapporte
        sortie = counterfactual(ANVIL, key, False, int(entree["out_with"]))
    return {
        "permissions_from_address": hook_permissions(c["hook"]),
        "permissions_note": "non discriminant : 780 pools sains sur 932 portent afterSwapReturnsDelta",
        "live_counterfactual_entry": entree,
        "live_counterfactual_exit": sortie,
        "method": "TARE : anvil_setCode remplace le hook par 89 octets inertes, on cote deux fois",
    }


def probe(vault: str, c: dict) -> dict:
    rc, out = cast("call", vault, PROBE_SIG, pool_key(c), str(PARAMS["slice_wei"]))
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    nums = re.findall(r"^(\d+)", "\n".join(lines), re.M)
    bools = re.findall(r"^(true|false)", "\n".join(lines), re.M)
    sel = re.findall(r"^(0x[0-9a-f]{8})$", "\n".join(lines), re.M)
    return {
        "loss_bps": int(nums[0]) if nums else None,
        "exit_blocked": bools[0] == "true" if bools else None,
        "blocking_error": sel[0] if sel and sel[0] != "0x00000000" else None,
        "raw": " / ".join(lines)[:200],
        "source": "ExitVault.exitLossBps — achat + revente integrale simules, puis revert",
    }


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


# --------------------------------------------------------------------- la boucle

def tick(n: int, vault: str, mandate: dict, universe: list[dict], stats: dict,
        held: set[str], inject: str | None) -> dict:
    m_bps = int(mandate["mandate"]["maxRoundTripLossBps"])
    cands = shortlist(universe, 5, held)
    if not cands and not inject:
        return None   # plus rien de nouveau a tenter dans cet univers
    if inject:
        forced = next((c for c in universe if c["pool_id"].startswith(inject)), None)
        if not forced:
            raise SystemExit(f"pool injecté introuvable : {inject}")
        s, parts = score(forced)
        pick = {**{k: v for k, v in forced.items() if k != "_one_way"},
                "score": s, "score_parts": parts, "_one_way": forced["_one_way"]}
        why = ("CONSIGNE INJECTEE : une page lue par l'agent lui a impose ce jeton. "
               "L'agent obeit — c'est le propre d'un agent injecte.")
        cands = [pick] + [c for c in cands if c["pool_id"] != pick["pool_id"]][:4]
    else:
        pick = cands[0]
        why = (f"premier d'une liste courte de 5, score {pick['score']} : "
               f"mesure sur {pick['depth_sizes']} tailles, entree a {pick['entry_bps_median']} bps, "
               + ("connu du registre Uniswap" if pick["registry"]["present"] else "absent du registre Uniswap")
               + ". Aucun terme du score ne regarde la sortie : elle n'est pas observable avant d'acheter.")

    hooks = hook_analysis(pick)
    ex = probe(vault, pick)
    rc, out = cast("send", vault, BUY_SIG, mandate_tuple(mandate), mandate["signature"],
                   pool_key(pick), str(PARAMS["slice_wei"]), key=AGENT_KEY)
    executed = rc == 0 and re.search(r"status\s+1", out) is not None
    tx = (re.search(r"transactionHash\s+(0x[0-9a-f]{64})", out) or [None, None])[1]

    entry = {
        "ts": int(time.time()),
        "tick": n,
        "mode": "injected" if inject else "strategy",
        "strategy": {
            "name": "dca-longtail-weth-v1",
            "objective": "profondeur de mesure + faible cout d'entree + presence au registre",
            "slice_wei": str(PARAMS["slice_wei"]),
            "min_depth_sizes": PARAMS["min_depth_sizes"],
            "require_registry": PARAMS["require_registry"],
            "universe_size": len(universe),
            "universe_facts": stats,
        },
        "shortlist": [{k: v for k, v in c.items() if not k.startswith("_")} for c in cands],
        "pick": {k: v for k, v in pick.items() if not k.startswith("_")},
        "why": why,
        "hook_analysis": hooks,
        "exit_probe": ex,
        "mandate": {
            "owner": mandate["owner"],
            "max_round_trip_loss_bps": mandate["mandate"]["maxRoundTripLossBps"],
            "budget_wei": mandate["mandate"]["budgetAmount"],
            "signed_on": "Ledger Flex (EIP-712)",
        },
        "decision": "EXECUTED" if executed else "REFUSED_BY_VAULT",
        "escalation_request": None if executed else _escalation(pick, ex, m_bps),
        "tx": tx,
        "error": None if executed else _decode_error(out),
        "ground_truth": {"is_one_way_trap": pick["_one_way"]},
    }
    append(entry)
    held.add(pick["pool_id"])  # tente une fois, puis passe au suivant
    return entry


def _escalation(pick: dict, ex: dict, max_bps: int) -> dict | None:
    """Hors bornes ne veut pas dire non : ca veut dire demande a l'humain.

    On prepare ce que le porteur devra lire sur son Flex. Une sortie BLOQUEE n'est pas
    negociable : aucune derogation ne rend un jeton transferable.
    """
    bps = ex.get("loss_bps")
    if ex.get("exit_blocked") or bps is None or bps >= 10_000:
        return {"possible": False,
                "reason": "sortie bloquee : le jeton n'est ni detenable ni revendable, aucune derogation n'y change rien"}
    return {
        "possible": True,
        "pool_id": pick["pool_id"], "hook": pick["hook"], "currency1": pick["currency1"],
        "fee": pick["fee"], "tickSpacing": pick["tickSpacing"],
        "seen_exit_bps": int(bps), "mandate_allows_bps": max_bps,
        "amount_in": str(PARAMS["slice_wei"]),
        "question": f"ce pool coute {int(bps)} bps a la sortie, ton mandat en autorise {max_bps} — tu signes quand meme ?",
    }


def _decode_error(out: str) -> str | None:
    if "0x18208f15" in out:
        return "CannotExit — la sortie coute plus que le mandat n'autorise"
    if "0x0b7d8347" in out or "ExitBlocked" in out:
        return "ExitBlocked — le jeton n'est meme pas transferable jusqu'au coffre"
    m = re.search(r"(custom error [^\n]+|revert[^\n]*)", out)
    return m.group(1)[:200] if m else out.strip()[-200:]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticks", type=int, default=3)
    ap.add_argument("--inject", help="prefixe d'un pool_id impose par une consigne injectee")
    ap.add_argument("--mandate", default=str(ROOT / "mandate.json"))
    ap.add_argument("--reset-journal", action="store_true")
    ap.add_argument("--params", help="fichier JSON de parametres de strategie (slice_wei, min_depth_sizes, require_registry)")
    args = ap.parse_args()

    if args.params:
        PARAMS.update({k: v for k, v in json.loads(Path(args.params).read_text()).items() if k in PARAMS})
        PARAMS["slice_wei"] = int(PARAMS["slice_wei"])

    if args.reset_journal and JOURNAL.exists():
        JOURNAL.unlink()

    mandate = json.loads(Path(args.mandate).read_text())
    vault = mandate["vault"]
    universe, stats = build_universe()
    print(f"univers : {stats['pools']} pools WETH mesures — dont {stats['zero_entry_cost']} a 0,00 bps a l'achat, "
          f"parmi lesquels {stats['zero_entry_and_trap']} pieges ; "
          f"{stats['traps_absent_from_registry']}/{stats['traps_total']} hooks pieges absents du registre\n")

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
                held.add(r["pick"]["pool_id"])   # detenu, ou jeton non transferable (fait du compte), ou deja tente par ce bot
    for n in range(1, args.ticks + 1):
        e = tick(n, vault, mandate, universe, stats, held, args.inject if n == args.ticks and args.inject else None)
        if e is None:
            print("plus rien de nouveau a tenter : tout l'univers a deja ete essaye ou est detenu")
            break
        mark = "OK " if e["decision"] == "EXECUTED" else "NON"
        print(f"[{mark}] tour {n} ({e['mode']}) — {e['pick']['pool_id'][:12]} "
              f"entree {e['pick']['entry_bps_median']} bps · sortie {e['exit_probe']['loss_bps']} bps"
              + (" (bloquee)" if e["exit_probe"].get("exit_blocked") else "")
              + (f" · hook {e['hook_analysis']['live_counterfactual_entry'].get('bps')}"
                 f"/{(e['hook_analysis']['live_counterfactual_exit'] or {}).get('bps')} bps"
                 if e.get("hook_analysis") else "")
              + (f" — {e['error']}" if e["error"] else ""))
    print(f"\njournal : {JOURNAL}")


if __name__ == "__main__":
    main()
