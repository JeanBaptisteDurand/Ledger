#!/usr/bin/env python3
"""Le stratège : une phrase en français, un mandat lisible sur un Ledger.

C'est la moitié « agents propose » du modèle de Ledger. Le modèle ne signe rien, ne touche à aucun
fonds, ne choisit aucun jeton : il **traduit une intention en règle**. La règle part ensuite sur
l'appareil, où un humain la lit et l'approuve — ou pas.

Le modèle tourne par le CLI `claude` en mode impression (`claude -p`), donc par le Claude Agent SDK
et la session de l'utilisateur : aucune clé d'API à poser. S'il est absent, un repli déterministe
lit les mêmes intentions avec des règles simples, pour que le banc tourne toujours.
"""

from __future__ import annotations

import json
import re
import subprocess

WETH = "0x4200000000000000000000000000000000000006"

SYSTEM = """Tu conçois des mandats pour un agent d'investissement DCA autonome sur Base (Uniswap v4).

Tu ne choisis JAMAIS de jeton et tu ne promets aucun rendement : tu traduis une intention en BORNES
qu'un humain va lire sur l'écran de son Ledger et signer une fois pour toutes.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec exactement ces clés :

{
 "budget_weth": <nombre, entre 0.01 et 5>,          // le budget total du mandat, en WETH
 "max_round_trip_loss_bps": <entier, 50 a 2000>,    // la perte aller-retour toleree, en points de base
 "slice_weth": <nombre, entre 0.0001 et 0.05>,      // la taille d'une tranche de DCA
 "ticks": <entier, 2 a 12>,                         // combien de tranches l'agent place
 "days": <entier, 1 a 30>,                          // duree de validite du mandat
 "min_depth_sizes": <entier, 3 a 8>,                // exigence de profondeur de mesure
 "require_registry": <true|false>,                  // n'acheter que des hooks connus du registre Uniswap
 "risk": "prudent" | "equilibre" | "offensif",
 "rationale": "<deux phrases en francais, sobres, qui expliquent CES bornes>",
 "warning": "<une phrase sur ce que ces bornes ne protegent PAS>"
}

Reperes utiles : un pool ordinaire coute 100 a 250 bps d'aller-retour ; en dessous de 100 bps de
tolerance l'agent n'achetera presque rien ; au-dessus de 1000 bps il accepte des pools dont on sort
tres mal. Prudent = 100-200 bps. Equilibre = 200-400. Offensif = 400-800.
"""

FALLBACK_WORDS = {
    "prudent": ("prudent", 150, 4), "prudente": ("prudent", 150, 4), "sûr": ("prudent", 150, 4),
    "sur": ("prudent", 150, 4), "conservateur": ("prudent", 150, 4), "doucement": ("prudent", 150, 4),
    "offensif": ("offensif", 600, 8), "agressif": ("offensif", 600, 8), "risqué": ("offensif", 600, 8),
    "risque": ("offensif", 600, 8), "memecoin": ("offensif", 600, 8), "memecoins": ("offensif", 600, 8),
}


def _fallback(prompt: str) -> dict:
    p = prompt.lower()
    risk, bps, ticks = "equilibre", 300, 6
    for w, (r, b, t) in FALLBACK_WORDS.items():
        if w in p:
            risk, bps, ticks = r, b, t
            break
    m = re.search(r"([\d.,]+)\s*(weth|eth)\b", p)
    budget = float(m.group(1).replace(",", ".")) if m else 1.0
    budget = max(0.01, min(budget, 5.0))
    return {
        "budget_weth": budget, "max_round_trip_loss_bps": bps,
        "slice_weth": round(budget / max(ticks, 1) / 10, 6), "ticks": ticks, "days": 7,
        "min_depth_sizes": 6, "require_registry": risk == "prudent", "risk": risk,
        "rationale": ("Lecture par mots-clés, sans modèle : le CLI `claude` n'est pas disponible. "
                      f"Profil {risk}, tolérance de sortie {bps} bps, {ticks} tranches."),
        "warning": "Ces bornes limitent le coût de sortie, pas la valeur du jeton acheté.",
        "_source": "repli deterministe (claude CLI absent)",
    }


def _trim(s: str, n: int) -> str:
    """Coupe sur une frontiere de phrase, jamais en plein mot."""
    s = s.strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    for sep in (". ", " ; ", ", "):
        i = cut.rfind(sep)
        if i > n * 0.6:
            return cut[:i + 1].strip()
    return cut.rsplit(" ", 1)[0].rstrip(",;") + "…"


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def propose(prompt: str, timeout: int = 120) -> dict:
    """Une intention en français -> des bornes chiffrées, prêtes à signer."""
    try:
        p = subprocess.run(
            ["claude", "-p", "--append-system-prompt", SYSTEM, prompt],
            capture_output=True, text=True, timeout=timeout,
        )
        data = _extract_json(p.stdout or "") if p.returncode == 0 else None
        if data:
            data["_source"] = "claude CLI (Claude Agent SDK, mode impression)"
        else:
            data = _fallback(prompt)
            data["_source"] += f" — sortie du modele inexploitable (rc={p.returncode})"
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        data = _fallback(prompt)
        data["_source"] += f" — {type(e).__name__}"

    # Bornes dures : ce que le modele propose ne sort jamais du raisonnable.
    def clamp(k, lo, hi, cast=float):
        try:
            data[k] = cast(max(lo, min(cast(data.get(k, lo)), hi)))
        except (TypeError, ValueError):
            data[k] = cast(lo)

    clamp("budget_weth", 0.01, 5.0)
    clamp("max_round_trip_loss_bps", 50, 2000, int)
    clamp("slice_weth", 0.0001, 0.05)
    clamp("ticks", 2, 12, int)
    clamp("days", 1, 30, int)
    clamp("min_depth_sizes", 3, 8, int)
    data["require_registry"] = bool(data.get("require_registry", False))
    data["risk"] = data.get("risk") if data.get("risk") in ("prudent", "equilibre", "offensif") else "equilibre"
    data["rationale"] = _trim(str(data.get("rationale", "")), 620)
    data["warning"] = _trim(str(data.get("warning", "")), 300)
    data["budget_wei"] = str(int(round(data["budget_weth"] * 10**18)))
    data["slice_wei"] = str(int(round(data["slice_weth"] * 10**18)))
    data["budget_token"] = WETH
    return data


if __name__ == "__main__":
    import sys

    print(json.dumps(propose(" ".join(sys.argv[1:]) or "500 USDC prudemment"), indent=1, ensure_ascii=False))
