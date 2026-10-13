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
import os
import re
import shutil
import subprocess

WETH = "0x4200000000000000000000000000000000000006"

SYSTEM = """You design mandates for an autonomous DCA investment agent on Base (Uniswap v4).
You NEVER pick a token and you promise no return: you translate an intention into BOUNDS that a human will read on
their Ledger's screen and sign once and for all.
Answer ONLY with a JSON object, with no text around it, with exactly these keys:
{
 "budget_weth": <number, between 0.01 and 5>,          // the mandate's total budget, in WETH
 "max_round_trip_loss_bps": <integer, 50 to 2000>,    // the round-trip loss tolerated, in basis points
 "slice_weth": <number, between 0.0001 and 0.05>,      // the size of one DCA slice
 "ticks": <integer, 2 to 12>,                         // how many slices the agent places
 "days": <integer, 1 to 30>,                          // how long the mandate is valid
 "min_depth_sizes": <integer, 3 to 8>,                // how many sizes the measurement must cover
 "require_registry": <true|false>,                    // only buy hooks known to the Uniswap registry
 "risk": "prudent" | "balanced" | "aggressive",
 "rationale": "<two plain sentences, in the language of the intention, that explain THESE bounds>",
 "warning": "<one sentence, in the language of the intention, on what these bounds do NOT protect>"
}
Useful marks: an ordinary pool costs 100 to 250 bps for a round trip; below 100 bps of tolerance the agent buys almost
nothing; above 1000 bps it accepts pools that are very hard to leave. Use exactly 150 bps for a prudent, cautious or
careful intention, 300 for a balanced one or when nothing is said, and 600 for an aggressive one.
"""

FALLBACK_WORDS = {
    "prudent": ("prudent", 150, 4), "prudente": ("prudent", 150, 4), "sûr": ("prudent", 150, 4),
    "sur": ("prudent", 150, 4), "conservateur": ("prudent", 150, 4), "doucement": ("prudent", 150, 4),
    "offensif": ("aggressive", 600, 8), "agressif": ("aggressive", 600, 8), "risqué": ("aggressive", 600, 8),
    "risque": ("aggressive", 600, 8), "memecoin": ("aggressive", 600, 8), "memecoins": ("aggressive", 600, 8),
    # the same words in English, for the site's sentences
    "cautious": ("prudent", 150, 4), "careful": ("prudent", 150, 4), "safe": ("prudent", 150, 4),
    "conservative": ("prudent", 150, 4), "gently": ("prudent", 150, 4),
    "aggressive": ("aggressive", 600, 8), "risky": ("aggressive", 600, 8), "offensive": ("aggressive", 600, 8),
}


def _fallback(prompt: str) -> dict:
    p = prompt.lower()
    risk, bps, ticks = "balanced", 300, 6
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
        "rationale": ("Read from keywords, without a model: no language model is available on this bench. "
                      f"Profile {risk}, exit tolerance {bps} bps, {ticks} slices."),
        "warning": "These bounds limit the cost of the exit, not the value of the token bought.",
        "_source": "deterministic fallback (no language model)",
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


def llm_backend() -> str:
    """Who proposes: `claude` (the CLI) or `openai` (the API). PDS_LLM decides; by default the claude CLI when it is
    on the PATH, otherwise OpenAI when a key is set (the same rule as agent/analyst.py)."""
    b = (os.environ.get("PDS_LLM") or "").strip().lower()
    if b in ("claude", "openai"):
        return b
    if shutil.which("claude"):
        return "claude"
    return "openai" if os.environ.get("OPENAI_API_KEY") else "claude"


def _propose_openai(prompt: str, timeout: int) -> dict | None:
    import requests
    api = os.environ.get("OPENAI_API_KEY")
    if not api:
        raise RuntimeError("no OPENAI_API_KEY")
    url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
    r = requests.post(url, headers={"Authorization": f"Bearer {api}"}, timeout=timeout, json={
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"), "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]})
    if r.status_code != 200:
        raise RuntimeError(f"OpenAI answered {r.status_code}")
    return _extract_json(r.json()["choices"][0]["message"].get("content") or "")


def propose(prompt: str, timeout: int = 120) -> dict:
    """Une intention en français -> des bornes chiffrées, prêtes à signer."""
    if llm_backend() == "openai":
        try:
            data = _propose_openai(prompt, timeout)
        except Exception as e:  # noqa: BLE001
            data, why = None, f"{type(e).__name__}: {str(e)[:80]}"
        else:
            why = "unusable model output"
        if data:
            data["_source"] = f"OpenAI {os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')}"
        else:
            data = _fallback(prompt)
            data["_source"] += f" — {why}"
    else:
        try:
            p = subprocess.run(
                ["claude", "-p", "--append-system-prompt", SYSTEM, prompt],
                capture_output=True, text=True, timeout=timeout,
            )
            data = _extract_json(p.stdout or "") if p.returncode == 0 else None
            if data:
                data["_source"] = "claude CLI (Claude Agent SDK, print mode)"
            else:
                data = _fallback(prompt)
                data["_source"] += f" — unusable model output (rc={p.returncode})"
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
    data["risk"] = data.get("risk") if data.get("risk") in ("prudent", "balanced", "aggressive") else "balanced"
    data["rationale"] = _trim(str(data.get("rationale", "")), 620)
    data["warning"] = _trim(str(data.get("warning", "")), 300)
    data["budget_wei"] = str(int(round(data["budget_weth"] * 10**18)))
    data["slice_wei"] = str(int(round(data["slice_weth"] * 10**18)))
    data["budget_token"] = WETH
    return data


if __name__ == "__main__":
    import sys

    print(json.dumps(propose(" ".join(sys.argv[1:]) or "500 USDC prudemment"), indent=1, ensure_ascii=False))
