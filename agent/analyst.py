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

SYSTEM = """You are the analyst of Net·Out: an on-chain vault that lets an agent enter a position (a Uniswap v4 pool,
an ERC-4626 vault) only if the exit fits within the mandate the holder signed on their Ledger.

Absolute rules:
1. You answer ONLY from the results of the `porte-de-sortie` MCP tools. Never from memory, never an estimate. If a
   tool does not give the data, say so in one sentence and stop there.
2. Every number you quote comes from a field of a tool result; name the tool in brackets the first time, for example
   "2 693 bps (vault_openness)".
3. Call the tools you need, no more: `operations` for the list (each row has a `seq`, its rank; ticks start again at 1
   on each round, pools then vaults), `decision(tick, kind)` or `decision(seq)` for one round, `hook_analysis(tick)`
   for what the hook takes, `positions` for what is held, `bots` for the account's bots (running, stopped, their
   record) and `operations(bot=<name>)` for one bot's detail, `vault_openness` for the vaults' door,
   `compare_entry_exit` for entry against exit, `ledger_earn_yields` for what Ledger's Agent Stack shows of a yield
   position.
4. Answer in the language of the question, English by default, plainly and without emphasis, in 3 to 8 sentences. No
   bullet lists, except to compare rows.
5. You do not advise buying or selling. You explain what happened and what the measurements say.
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
            f"Q: {h['question']}\nA: {(h.get('answer') or '')[:700]}" for h in history[-4:] if h.get("answer"))
        question = (f"Earlier exchanges in this conversation (for context; do not copy them, "
                    f"query the tools again if the question refers to them):\n{transcript}\n\nNew question: {question}")
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
                    error = answer or "model error"
        if p.returncode != 0 and not answer:
            error = (p.stderr or p.stdout or "")[-600:]
    except FileNotFoundError:
        error = "the `claude` CLI is missing: the analyst cannot run (no fallback: it only speaks from data)"
    except subprocess.TimeoutExpired:
        error = f"timed out ({timeout}s)"
    finally:
        try:
            os.unlink(cfg_path)
        except OSError:
            pass
    return {"question": question, "answer": answer.strip(), "tools_used": tools_used, "turns": turns,
            "error": error, "source": "claude CLI (Claude Agent SDK) + MCP porte-de-sortie, read only, --strict-mcp-config"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("question", nargs="*")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    q = " ".join(a.question) or "why was the last round refused, and what was the hook taking?"
    r = ask(q)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        print(r["answer"] or f"(no answer: {r['error']})")
        print("\n— tools consulted: " + (", ".join(f"{t['tool']}({','.join(f'{k}={v}' for k, v in t['args'].items())})" for t in r["tools_used"]) or "none"))
