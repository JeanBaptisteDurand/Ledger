#!/usr/bin/env python3
"""La surveillance des positions — la seule parade à la porte qui se ferme APRÈS l'entrée.

Un hook peut laisser vendre aujourd'hui et bloquer demain. Un coffre à rendement peut avoir la porte
ouverte à l'entrée (notre dépôt apporte de la liquidité) et fermée le lendemain, quand les emprunteurs
l'ont prise. La sonde regarde le bloc d'exécution, pas l'avenir : **elle ne peut pas l'empêcher**.

Ce qu'on peut faire, et qui est réel : **resonder les positions détenues, et sortir tant qu'on peut
encore**. La sonde est gratuite (elle revert), donc on peut la relancer aussi souvent qu'on veut.

    python3 agent/watch.py                 # un passage, rapport (pools v4 ET coffres ERC-4626)
    python3 agent/watch.py --sell-if 500   # sort de ce qui a empiré au-dela de 500 bps

Ce n'est pas une garantie : entre deux passages, la porte peut se fermer. C'est une réduction de
fenêtre, et on le dit comme tel.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANVIL = os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")
WETH = "0x4200000000000000000000000000000000000006"
AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
JOURNAL = Path(os.environ.get("PDS_JOURNAL", ROOT / "agent" / "journal.jsonl"))
WATCHLOG = ROOT / "agent" / "watch.jsonl"

PROBE_SIG = "exitLossBps((address,address,uint24,int24,address),uint256)(uint256,bool,bytes4)"
SELL_SIG = "sell((address,address,uint256,uint16,uint64,uint256),bytes,(address,address,uint24,int24,address),uint256,uint256)"
VPROBE_SIG = "vaultExitLossBps(address,uint256,address)(uint256,bool,bytes4,uint256,uint256)"
VSTUCK_SIG = "vaultStuckBps(address,address)(uint256,uint256,uint256)"
VEXIT_SIG = "exitVault((address,address,uint256,uint16,uint64,uint256),bytes,address,uint256,uint256)"


def cast(*args, key=None):
    cmd = ["cast", *args, "--rpc-url", ANVIL]
    if key:
        cmd += ["--private-key", key]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def call1(to, sig, *args):
    rc, out = cast("call", to, sig, *args)
    return out.strip().split()[0].replace(",", "") if rc == 0 and out.strip() else None


def nums(out: str) -> list[int]:
    # lignes entierement numeriques : la ligne `bytes4` (0x00000000) commence aussi par un chiffre
    return [int(x) for x in re.findall(r"^(\d+)$", out, re.M)]


def tup(xs):
    return "(" + ",".join(str(x) for x in xs) + ")"


def positions(mandate: dict) -> list[dict]:
    """Ce que le coffre détient vraiment, lu sur la chaîne — pas ce que le journal croit."""
    out = []
    seen = set()
    for line in (JOURNAL.read_text().splitlines() if JOURNAL.exists() else []):
        if not line.strip():
            continue
        r = json.loads(line)
        p = r["pick"]
        if p["pool_id"].lower() in seen:
            continue
        seen.add(p["pool_id"].lower())
        held = int(call1(p["currency1"], "balanceOf(address)(uint256)", mandate["vault"]) or 0)
        if held == 0:
            continue
        out.append({"kind": r.get("kind", "pool"), "pool_id": p["pool_id"], "name": p.get("name"),
                    "currency1": p["currency1"], "fee": p.get("fee", 0), "tickSpacing": p.get("tickSpacing", 0),
                    "hook": p.get("hook"), "ref_holder": p.get("ref_holder"), "held": held,
                    "exit_bps_at_buy": r["exit_probe"].get("loss_bps"),
                    "slice_wei": int(r["strategy"]["slice_wei"])})
    return out


def probe_pool(vault: str, pos: dict) -> dict:
    key = tup([WETH, pos["currency1"], pos["fee"], pos["tickSpacing"], pos["hook"]])
    rc, out = cast("call", vault, PROBE_SIG, key, str(pos["slice_wei"]))
    n = nums(out)
    b = re.findall(r"^(true|false)", out, re.M)
    return {"exit_bps_now": n[0] if n else None, "blocked": b[0] == "true" if b else None}


def probe_vault(vault: str, pos: dict) -> dict:
    """Deux portes : la nôtre (ce que NOUS pourrions retirer maintenant) et celle du plus gros déposant."""
    v = pos["pool_id"]
    ours_assets = int(call1(v, "convertToAssets(uint256)(uint256)", str(pos["held"])) or 0)
    ours_max = int(call1(v, "maxWithdraw(address)(uint256)", vault) or 0)
    our_stuck = 0 if ours_assets == 0 or ours_max >= ours_assets else (ours_assets - ours_max) * 10_000 // ours_assets
    rc, out = cast("call", vault, VPROBE_SIG, v, str(pos["slice_wei"]), pos["ref_holder"] or "0x" + "00" * 20)
    n = nums(out) if rc == 0 else []
    door = n[2] if len(n) > 2 else None
    now = max(our_stuck, door or 0)
    return {"exit_bps_now": now, "blocked": rc != 0, "our_position_wei": str(ours_assets),
            "our_max_withdraw_wei": str(ours_max), "our_stuck_bps": our_stuck, "door_stuck_bps": door,
            "deposit_refused_now": rc != 0}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mandate", default=str(ROOT / "mandate.json"))
    ap.add_argument("--sell-if", type=int, help="sortir si la sortie depasse ce seuil, en bps")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    mandate = json.loads(Path(a.mandate).read_text())
    vault = mandate["vault"]
    mt = tup([mandate["mandate"][k] for k in ("agent", "budgetToken", "budgetAmount", "maxRoundTripLossBps", "expiry", "nonce")])

    rows = []
    for pos in positions(mandate):
        now = probe_vault(vault, pos) if pos["kind"] == "vault" else probe_pool(vault, pos)
        before = pos["exit_bps_at_buy"]
        delta = (now["exit_bps_now"] - before) if (now["exit_bps_now"] is not None and before is not None) else None
        row = {"ts": int(time.time()), **{k: pos[k] for k in ("kind", "pool_id", "name", "hook", "held")},
               "exit_bps_at_buy": before, **now, "delta_bps": delta, "action": "aucune"}

        if a.sell_if is not None and now["exit_bps_now"] is not None and now["exit_bps_now"] >= a.sell_if:
            if pos["kind"] == "vault":
                rc, out = cast("send", vault, VEXIT_SIG, mt, mandate["signature"], pos["pool_id"], str(pos["held"]), "0", key=AGENT_KEY)
            else:
                rc, out = cast("send", vault, SELL_SIG, mt, mandate["signature"],
                               tup([WETH, pos["currency1"], pos["fee"], pos["tickSpacing"], pos["hook"]]), str(pos["held"]), "0", key=AGENT_KEY)
            ok = rc == 0 and re.search(r"status\s+1", out)
            row["action"] = "SORTI" if ok else "sortie refusee"
        rows.append(row)

        if not a.json:
            d = "" if delta is None else (f"  ({delta:+d} bps depuis l'entree)" if delta else "  (inchangee)")
            state = "BLOQUEE" if now["blocked"] else f"{now['exit_bps_now']} bps"
            label = (pos["name"] or pos["pool_id"][:12]) if pos["kind"] == "vault" else pos["pool_id"][:12]
            extra = (f"  [notre porte {now['our_stuck_bps']} bps · plus gros deposant {now['door_stuck_bps']} bps]"
                     if pos["kind"] == "vault" else "")
            print(f"  {label:<24} sortie a l'entree {before} bps  ->  maintenant {state}{d}{extra}"
                  + (f"   [{row['action']}]" if row["action"] != "aucune" else ""))

    WATCHLOG.parent.mkdir(parents=True, exist_ok=True)
    with WATCHLOG.open("a") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    if a.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
    elif not rows:
        print("  aucune position detenue")
    else:
        worse = [r for r in rows if (r["delta_bps"] or 0) > 0 or r["blocked"]]
        print(f"\n  {len(rows)} position(s) · {len(worse)} dont la sortie s'est degradee")
        print("  la sonde est gratuite : on peut la relancer aussi souvent qu'on veut.")
        print("  ce n'est PAS une garantie — entre deux passages, la porte peut se fermer.")


if __name__ == "__main__":
    sys.exit(main())
