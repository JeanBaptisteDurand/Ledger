#!/usr/bin/env python3
"""L'analyste : le VRAI agent. Il répond en interrogeant nos outils, jamais de mémoire.

C'est la moitié « Agent Stack » du brief, faite pour de vrai : un modèle (Claude, par le CLI `claude`
— le Claude Agent SDK) qui n'a accès qu'à notre MCP en LECTURE SEULE. Pour répondre à « pourquoi
l'agent a refusé le tour 2 ? » ou « Moonwell, on peut en sortir aujourd'hui ? », il appelle les outils
(`decision`, `hook_analysis`, `positions`, `vault_openness`, `ledger_earn_yields`…), cite ce qu'il en
a tiré, et dit quand la donnée manque.

Trois garanties, par construction :
  - il ne peut RIEN faire : le MCP ne signe pas, n'envoie pas, ne lance rien ;
  - il n'a que nos outils : `--strict-mcp-config`, rien d'autre n'est chargé ;
  - la clé qui ouvre le MCP peut être scellée dans le Ledger Key Ring (`scripts/ring-seal.sh`).

    python3 agent/analyst.py "pourquoi le tour 2 a ete refuse ?"
    python3 agent/analyst.py --json "quelles positions ont une sortie qui s'est degradee ?"
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MCP = ROOT / "mcp" / "pds_mcp.py"

SYSTEM = """Tu es l'analyste de « Porte de sortie » : un coffre on-chain qui n'autorise un agent a entrer
dans une position (pool Uniswap v4, coffre ERC-4626) que si la sortie tient dans le mandat que le porteur
a signe sur son Ledger.

Regles absolues :
1. Tu reponds UNIQUEMENT a partir des resultats des outils MCP `porte-de-sortie`. Jamais de memoire,
   jamais d'estimation. Si un outil ne donne pas la donnee, dis-le en une phrase et arrete-toi la.
2. Chaque nombre que tu cites vient d'un champ d'un resultat d'outil ; nomme l'outil entre parentheses
   la premiere fois, p. ex. « 2 693 bps (vault_openness) ».
3. Appelle les outils necessaires, pas plus : `operations` pour la liste (chaque ligne a un `seq`, son rang ;
   les ticks repartent a 1 a chaque tour, pools puis coffres), `decision(tick, kind)` ou `decision(seq)` pour un tour,
   `hook_analysis(tick)` pour ce que le hook prend, `positions` pour ce qu'on detient, `bots` pour les bots du
   compte (actifs, arretes, leur bilan) et `operations(bot=<nom>)` pour le detail d'un bot, `vault_openness`
   pour la porte des coffres, `compare_entry_exit` pour entree contre sortie, `ledger_earn_yields` pour ce
   que l'Agent Stack de Ledger montre d'une position a rendement.
4. Dans la langue de la question (francais ou anglais), sobre, sans emphase, 3 a 8 phrases. Pas de listes a puces sauf pour comparer des lignes.
5. Tu ne conseilles pas d'acheter ou de vendre. Tu expliques ce qui s'est passe et ce que les mesures disent.
"""


def mcp_key() -> str:
    k = os.environ.get("PDS_MCP_KEY")
    if k:
        return k
    p = subprocess.run([sys.executable, str(MCP), "--print-key"], capture_output=True, text=True, timeout=60)
    return p.stdout.strip()


OPENAI_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions"


def llm_backend() -> str:
    """Who answers: `claude` (the CLI, the Claude Agent SDK) or `openai` (the API, with the very same MCP tools).
    PDS_LLM decides; by default the claude CLI when it is on the PATH, otherwise OpenAI when a key is set."""
    b = (os.environ.get("PDS_LLM") or "").strip().lower()
    if b in ("claude", "openai"):
        return b
    if shutil.which("claude"):
        return "claude"
    return "openai" if os.environ.get("OPENAI_API_KEY") else "claude"


def _ask_openai(question: str, env: dict, key: str, timeout: int, max_turns: int) -> tuple[str, list[dict], int, str | None]:
    """The same analyst on OpenAI's API: our MCP server runs as a subprocess with the ACCOUNT's environment, exactly
    as the claude CLI runs it; we list its tools, hand them to the model as functions, and call them when it asks."""
    import requests
    api = os.environ.get("OPENAI_API_KEY")
    if not api:
        return "", [], 0, "no OpenAI key on this bench (OPENAI_API_KEY): the analyst cannot run"
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    menv = {**os.environ, **env, "PDS_MCP_KEY": key, "ANVIL_URL": os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")}
    proc = subprocess.Popen([sys.executable, str(MCP)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, env=menv)
    seq = 0

    def rpc(method: str, params: dict | None = None, notify: bool = False) -> dict | None:
        nonlocal seq
        msg: dict = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        if not notify:
            seq += 1
            msg["id"] = seq
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        return None if notify else json.loads(proc.stdout.readline() or "{}")

    used: list[dict] = []
    turns, t0 = 0, time.time()
    try:
        rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "analyst", "version": "1.0"}})
        rpc("notifications/initialized", notify=True)
        tools = (rpc("tools/list") or {}).get("result", {}).get("tools", [])
        functions = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                       "parameters": t["inputSchema"]}} for t in tools]
        messages: list[dict] = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]
        while turns < max_turns:
            left = timeout - (time.time() - t0)
            if left <= 5:
                return "", used, turns, f"timed out ({timeout}s)"
            r = requests.post(OPENAI_URL, headers={"Authorization": f"Bearer {api}"}, timeout=min(90, left),
                              json={"model": model, "messages": messages, "tools": functions, "temperature": 0.2})
            if r.status_code != 200:
                return "", used, turns, f"OpenAI answered {r.status_code}: {r.text[:240]}"
            m = r.json()["choices"][0]["message"]
            turns += 1
            calls = m.get("tool_calls") or []
            if not calls:
                return (m.get("content") or "").strip(), used, turns, None
            messages.append({"role": "assistant", "content": m.get("content"), "tool_calls": calls})
            for c in calls:
                name = c["function"]["name"]
                try:
                    args = json.loads(c["function"].get("arguments") or "{}")
                except ValueError:
                    args = {}
                used.append({"tool": name, "args": {k: v for k, v in args.items() if k != "key"}})
                res = rpc("tools/call", {"name": name, "arguments": args}) or {}
                text = "\n".join(x.get("text", "") for x in (res.get("result") or {}).get("content", [])) \
                    or json.dumps(res.get("error") or {"error": "no result"})
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": text[:12000]})
        return "", used, turns, f"no answer after {max_turns} turns"
    except Exception as e:  # noqa: BLE001
        return "", used, turns, f"OpenAI: {type(e).__name__}: {str(e)[:200]}"
    finally:
        proc.kill()


def ask(question: str, timeout: int = 240, max_turns: int = 12, history: list[dict] | None = None,
        env: dict | None = None) -> dict:
    """Une question -> {answer, tools_used, turns}. Le modele ne voit que notre MCP.

    `history` : les echanges precedents [{question, answer}], pour qu'une question puisse renvoyer a la
    precedente (« et le tour d'avant ? »). Le CLI est sans etat : on lui redonne un court transcript.
    """
    env = dict(env or {})
    key = env.get("PDS_MCP_KEY") or mcp_key()
    if history:
        transcript = "\n".join(
            f"Q : {h['question']}\nR : {(h.get('answer') or '')[:700]}" for h in history[-4:] if h.get("answer"))
        question = (f"Échanges précédents de cette conversation (pour le contexte ; ne les recopie pas, "
                    f"réinterroge les outils si la question y renvoie) :\n{transcript}\n\nNouvelle question : {question}")
    if llm_backend() == "openai":
        answer, tools_used, turns, error = _ask_openai(question, env, key, timeout, max_turns)
        model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        return {"question": question, "answer": answer, "tools_used": tools_used, "turns": turns, "error": error,
                "source": f"OpenAI {model} (function calling) + MCP porte-de-sortie, read only"}
    # le MCP tourne avec l'environnement du COMPTE : ses fichiers, sa cle (derivee, jamais stockee)
    cfg = {"mcpServers": {"porte-de-sortie": {"command": sys.executable, "args": [str(MCP)],
                                              "env": {**env, "PDS_MCP_KEY": key,
                                                      "ANVIL_URL": os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")}}}}
    with tempfile.NamedTemporaryFile("w", suffix=".mcp.json", delete=False) as f:
        json.dump(cfg, f)
        cfg_path = f.name
    cmd = ["claude", "-p", "--output-format", "stream-json", "--verbose",
           "--mcp-config", cfg_path, "--strict-mcp-config",
           "--allowedTools", "mcp__porte-de-sortie__*",
           "--disallowedTools", "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,NotebookEdit",
           "--max-turns", str(max_turns),
           "--append-system-prompt", SYSTEM, question]
    tools_used: list[dict] = []
    answer, turns, error = "", 0, None
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        for line in (p.stdout or "").splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") == "assistant":
                turns += 1
                for blk in (ev.get("message") or {}).get("content", []):
                    # on ne retient que NOS outils : le chargement de leurs schemas (ToolSearch) n'est pas une lecture
                    if blk.get("type") == "tool_use" and blk.get("name", "").startswith("mcp__porte-de-sortie__"):
                        tools_used.append({"tool": blk["name"].replace("mcp__porte-de-sortie__", ""),
                                           "args": {k: v for k, v in (blk.get("input") or {}).items() if k != "key"}})
            elif ev.get("type") == "result":
                answer = ev.get("result") or ""
                if ev.get("is_error"):
                    error = answer or "erreur du modele"
        if p.returncode != 0 and not answer:
            error = (p.stderr or p.stdout or "")[-600:]
    except FileNotFoundError:
        error = "le CLI `claude` est absent : l'analyste ne peut pas tourner (pas de repli : il ne parle qu'avec des donnees)"
    except subprocess.TimeoutExpired:
        error = f"delai depasse ({timeout}s)"
    finally:
        try:
            os.unlink(cfg_path)
        except OSError:
            pass
    return {"question": question, "answer": answer.strip(), "tools_used": tools_used, "turns": turns,
            "error": error, "source": "claude CLI (Claude Agent SDK) + MCP porte-de-sortie, lecture seule, --strict-mcp-config"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("question", nargs="*")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    q = " ".join(a.question) or "pourquoi le dernier tour a-t-il ete refuse, et qu'est-ce que le hook prenait ?"
    r = ask(q)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        print(r["answer"] or f"(pas de reponse : {r['error']})")
        print("\n— outils consultes : " + (", ".join(f"{t['tool']}({','.join(f'{k}={v}' for k, v in t['args'].items())})" for t in r["tools_used"]) or "aucun"))
