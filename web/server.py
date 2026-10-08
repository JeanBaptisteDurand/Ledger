#!/usr/bin/env python3
"""Le banc : un compte, un chat, un mandat signé sur l'appareil, un agent en direct.

    python3 web/server.py          ->  http://127.0.0.1:8099

Le serveur ne fait rien de magique : il lance anvil et Speculos, relaie l'écran de l'appareil (et
tes doigts), demande une stratégie au CLI `claude`, et exécute chaque étape avec `forge` et `cast`.
Tout ce qu'il affiche vient d'un vrai fork de Base et d'un vrai flux APDU.
"""

from __future__ import annotations

import json
import os
import secrets
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

ROOT = Path(__file__).resolve().parent.parent
TARE = Path(os.environ.get("TARE_ROOT", ROOT.parent / "ETH_Online_2026"))
SPECULOS = os.environ.get("SPECULOS_URL", "http://127.0.0.1:5013")
PROXY_LOG = os.environ.get("PDS_PROXY_LOG")  # trace des échanges navigateur ↔ émulateur, pour diagnostiquer


def plog(msg: str) -> None:
    if PROXY_LOG:
        with open(PROXY_LOG, "a") as f:
            f.write(f"{time.strftime('%H:%M:%S')}.{int(time.time() * 1000) % 1000:03d} {msg}\n")

ANVIL = os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")
FORK_BLOCK = os.environ.get("FORK_BLOCK", "50614000")
PORT = int(os.environ.get("PORT", "8099"))

sys.path.insert(0, str(ROOT / "ledger"))
sys.path.insert(0, str(Path(__file__).parent))
import strategist  # noqa: E402
import signers  # noqa: E402  (deux chemins vers l'appareil : Signer Kit/DMK, ou client officiel en APDU)
import walletcli  # noqa: E402  (le wallet-cli de l'Agent Stack : Key Ring, lectures Earn)
import accounts  # noqa: E402  (un compte = une adresse prouvée par la Ledger ; un dossier ; une clé MCP dérivée)

WETH = "0x4200000000000000000000000000000000000006"
POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b"
DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # anvil #0
AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"  # anvil #1
AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

BUY_EXC_SIG = (
    "buyUnderException((address,address,uint256,uint16,uint64,uint256),bytes,"
    "(address,address,bytes32,uint256,uint16,uint64,uint256),bytes,(address,address,uint24,int24,address),uint256)"
)
ENTER_EXC_SIG = (
    "enterVaultUnderException((address,address,uint256,uint16,uint64,uint256),bytes,"
    "(address,address,bytes32,uint256,uint16,uint64,uint256),bytes,address,uint256,address)"
)

BASE_RPC = os.environ.get("BASE_RPC_URL") or next(
    (l.split("=", 1)[1].strip() for l in (TARE / ".env").read_text().splitlines() if l.startswith("BASE_RPC_URL=")),
    "",
)

# ------------------------------------------------------------------ l'état : le banc, et un état par compte

# Ce qui est commun à tout le monde : le fork, l'émulateur, les briques installées, le Key Ring de l'opérateur.
G = {"anvil": False, "speculos": False, "ledger_stack": signers.stack_versions(), "ring": None}
_PROBED = [0.0]


def probe_services(force: bool = False) -> None:
    """anvil et Speculos tournent-ils deja ? (lances a la main, ou par une session precedente du banc)"""
    if not force and time.time() - _PROBED[0] < 5:
        return
    _PROBED[0] = time.time()
    if not G["anvil"]:
        try:
            r = requests.post(ANVIL, json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []}, timeout=1)
            G["anvil"] = bool(r.ok and r.json().get("result"))
        except Exception:  # noqa: BLE001
            pass
    try:
        G["speculos"] = requests.get(f"{SPECULOS}/events?currentscreenonly=true", timeout=1).ok
    except Exception:  # noqa: BLE001
        G["speculos"] = False
NOTIFY_URL = os.environ.get("PDS_NOTIFY_URL")  # webhook prevenu quand un achat deborde


def default_state(address: str | None = None) -> dict:
    """L'état d'un compte (ou de l'invité, avant connexion)."""
    return {
        "address": address, "dir": (str(accounts.paths(address)["dir"]) if address else None),
        "owner": None, "vault": None, "weth": "0", "deployer": None, "deploy_nonce": None,
        "chat": [], "proposal": None,
        "signing": None,            # "mandate" | "exception" | None
        "mandate": None, "signed": False,
        "running": False, "journal": [], "spent": "0", "positions": [],
        "bots": [], "bot_running": None,   # les bots du compte (agents d'execution nommes, dans le meme mandat)
        "escalation": None, "escalation_queue": [], "refused_escalations": [], "exception_buys": [], "watch": None, "watching": False,
        "log": [],
        # le chemin de signature choisi, les descripteurs compilés pour ce coffre, le dernier rapport du Signer Kit
        "signer": signers.default_signer(), "descriptors": {}, "last_report": None,
        # l'univers de l'agent de demonstration (pools v4 | coffres ERC-4626) et la conversation avec l'analyste
        "universe": "pools", "analysis": None, "analyses": [],
        # le chemin « navigateur » : ce que la page doit faire signer, et qui est connecté (Sign-In with Ethereum)
        "pending": None, "user": None, "siwe_nonce": None,
    }


ACCOUNTS: dict[str, dict] = {}       # adresse (minuscules) -> état
GUEST = default_state()              # avant connexion : choisir un chemin, lire les briques, demander un nonce
SESSIONS: dict[str, str] = accounts.load_sessions()   # cookie -> adresse
_TLS = threading.local()


def bind(state: dict) -> None:
    _TLS.state = state


def current() -> dict:
    return getattr(_TLS, "state", GUEST)


class _Proxy:
    """`S` : l'état du compte lié à la requête (ou au fil de travail) en cours."""

    def __getitem__(self, k):
        return current()[k]

    def __setitem__(self, k, v):
        current()[k] = v

    def get(self, k, d=None):
        return current().get(k, d)

    def pop(self, k, d=None):
        return current().pop(k, d)

    def update(self, *a, **kw):
        current().update(*a, **kw)

    def items(self):
        return current().items()

    def __contains__(self, k):
        return k in current()


S = _Proxy()


def state_for(address: str, via: str | None = None) -> dict:
    """L'état du compte de cette adresse — créé au premier passage. `via` note une connexion."""
    a = address.lower()
    st = ACCOUNTS.get(a)
    if st is None:
        st = default_state(address)
        pth = accounts.paths(address)
        # une session de banc precedente ? on la rouvre si son coffre existe encore sur le fork
        if pth["mandate"].exists():
            try:
                m = json.loads(pth["mandate"].read_text())
                rc, code = cast("code", m["vault"])
                if rc == 0 and len(code.strip()) > 4:
                    st.update({"mandate": m, "signed": True, "vault": m["vault"], "owner": m["owner"],
                               "deployer": m.get("deployer"), "deploy_nonce": m.get("deployNonce")})
                    st["descriptors"] = {k: str(signers.descriptor_path(k, m["vault"])) for k in ("mandate", "exception")}
                    # et ce que la session avait fait : le journal du compte, les positions encore detenues (relues
                    # sur le fork), les entrees sous derogation — pour qu'un redemarrage du banc ne les efface pas
                    prev = current()
                    try:
                        bind(st)
                        st["journal"] = read_journal()
                        st["exception_buys"] = [
                            {"pool": r["pick"]["pool_id"], "token": r["pick"]["currency1"], "name": r["pick"].get("name"),
                             "kind": r.get("kind", "pool"), "exit_bps": r["exit_probe"]["loss_bps"], "tick": "déro.",
                             "under_exception": True}
                            for r in st["journal"] if r.get("under_exception") and r["decision"] == "EXECUTED"]
                        refresh_positions()
                        rc3, bal = cast("call", WETH, "balanceOf(address)(uint256)", m["vault"])
                        if rc3 == 0:
                            st["weth"] = bal.strip().split()[0]
                        st["refused_escalations"] = [ev["pool_id"].lower() for ev in accounts.events(address, limit=10**6)
                                                     if ev.get("kind") == "exception_refused" and ev.get("pool_id")]
                        st["log"].append(f"session retrouvée : coffre {m['vault'][:10]}…, {len(st['journal'])} lignes de "
                                         f"journal, {len(st['positions'])} position(s) encore détenue(s)")
                    finally:
                        bind(prev)
            except Exception:  # noqa: BLE001
                pass
        st["user"] = address
        if not st["vault"]:
            st["owner"] = address
        st["bots"] = load_bots(st)
        for b in st["bots"]:
            if b["status"] == "running" and not st["signed"]:
                b.update({"status": "stopped", "stopped": int(time.time()), "stop_reason": "mandat absent au redémarrage du banc"})
        ACCOUNTS[a] = st
        if any(b["status"] == "running" for b in st["bots"]):
            ensure_scheduler(st)
    if via:  # une connexion : ce que l'invite avait choisi avant de se connecter le suit, une fois
        g = current()
        if g is GUEST:
            st["signer"], st["universe"] = g["signer"], g["universe"]
        accounts.open_account(address, via)
    return st


def jpath() -> Path:
    return Path(S["dir"]) / "journal.jsonl" if S["dir"] else ROOT / "agent" / "journal.jsonl"


def mpath() -> Path:
    return Path(S["dir"]) / "mandate.json" if S["dir"] else ROOT / "mandate.json"


def npath() -> Path:
    return Path(S["dir"]) / "notifications.jsonl" if S["dir"] else ROOT / "agent" / "notifications.jsonl"


def event(kind: str, **data) -> None:
    """Ce que l'utilisateur fait, dans son dossier."""
    if S["address"]:
        accounts.record(S["address"], kind, **data)


def account_env() -> dict:
    """L'environnement du MCP pour CE compte : ses fichiers, SA clé (dérivée du secret maître, jamais stockée)."""
    if not S["address"]:
        return {}
    return {"PDS_ACCOUNT": S["address"], "PDS_MCP_KEY": accounts.user_key(S["address"]),
            "PDS_JOURNAL": str(jpath()), "PDS_MANDATE": str(mpath()), "PDS_BOTS": str(bots_path())}


P: dict = {}
LOCK = threading.Lock()


# ------------------------------------------------------------------ outillage

def say(msg: str) -> None:
    S["log"] = (S["log"] + [msg])[-40:]


def run(cmd, cwd=None, timeout=900):
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd or ROOT, timeout=timeout)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def cast(*args, key=None):
    cmd = ["cast", *args, "--rpc-url", ANVIL]
    if key:
        cmd += ["--private-key", key]
    return run(cmd, timeout=300)


def tup(xs):
    return "(" + ",".join(str(x) for x in xs) + ")"


def mandate_tuple():
    d = S["mandate"]["mandate"]
    return tup([d["agent"], d["budgetToken"], d["budgetAmount"], d["maxRoundTripLossBps"], d["expiry"], d["nonce"]])


def read_journal():
    f = jpath()
    if not f.exists():
        return []
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()]


def refresh_positions():
    if not S["mandate"]:
        return
    v = S["vault"]
    rc, h = cast("call", v, "hashMandate((address,address,uint256,uint16,uint64,uint256))(bytes32)", mandate_tuple())
    if rc == 0:
        rc2, sp = cast("call", v, "spent(bytes32)(uint256)", h.strip().split()[0])
        if rc2 == 0:
            S["spent"] = sp.strip().split()[0]
    lines = [{"pool": r["pick"]["pool_id"], "token": r["pick"]["currency1"], "kind": r.get("kind", "pool"),
              "name": r["pick"].get("name"), "bot": (r.get("bot") or {}).get("name"),
              "exit_bps": r["exit_probe"]["loss_bps"], "tick": ("déro." if r.get("under_exception") else r["tick"]),
              "under_exception": bool(r.get("under_exception"))}
             for r in read_journal() if r["decision"] == "EXECUTED"]
    pos = []
    for l in lines:
        rc3, bal = cast("call", l["token"], "balanceOf(address)(uint256)", v)
        held = bal.strip().split()[0] if rc3 == 0 else "?"
        if held == "0":  # vendue ou sortie depuis : ce n'est plus une position
            continue
        pos.append({**l, "pool": l["pool"][:12], "balance": held})
    S["positions"] = pos


# ------------------------------------------------------------------ les étapes

def a_boot():
    if not BASE_RPC:
        return False, "BASE_RPC_URL introuvable"
    if not G["anvil"]:
        P["anvil"] = subprocess.Popen(
            ["anvil", "--fork-url", BASE_RPC, "--fork-block-number", FORK_BLOCK, "--silent"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            if cast("block-number")[0] == 0:
                break
            time.sleep(0.5)
        else:
            return False, "anvil n'a pas démarré"
        G["anvil"] = True
        say(f"anvil : fork de Base au bloc {FORK_BLOCK}")
    if not G["speculos"]:
        rc, out = run([str(ROOT / "ledger" / "speculos.sh"), "up"])
        if rc != 0:
            return False, "Speculos : " + out[-300:]
        G["speculos"] = True
        say("Speculos : un Ledger Flex, app Ethereum 1.22.4 compilée avec les clés de test")

    if not S["address"]:
        return False, "connecte-toi d'abord — ta Ledger dans le navigateur (Sign-In with Ethereum), ou l'appareil du banc"
    if S["signer"] == "browser":
        S["owner"] = S["address"]
        say(f"compte du porteur, prouvé par une signature sur sa Ledger : {S['owner']}")
    else:
        import sign_mandate as sm
        sm.URL = SPECULOS
        dev = sm.device_address()
        if dev.lower() != S["address"].lower():
            return False, f"l'appareil branché ({dev[:10]}…) n'est pas le compte connecté ({S['address'][:10]}…)"
        S["owner"] = dev
        say(f"compte lu sur l'appareil : {S['owner']}")

    rc, nb = cast("nonce", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
    deploy_nonce = int(nb.strip() or 0)
    rc, out = run(["forge", "create", "src/ExitVault.sol:ExitVault", "--rpc-url", ANVIL,
                   "--private-key", DEPLOYER_KEY, "--broadcast",
                   "--constructor-args", S["owner"], POOL_MANAGER], cwd=ROOT / "contracts")
    m = re.search(r"Deployed to:\s*(0x[0-9a-fA-F]{40})", out)
    if not m:
        return False, "déploiement : " + out[-400:]
    S["vault"] = m.group(1)
    jpath().write_text("")   # nouvelle session, nouveau journal (le compte, lui, garde son historique)
    S["journal"] = []
    S["positions"], S["escalation"], S["exception_buys"], S["watch"] = [], None, [], None
    accounts.save_profile(S["address"], vault=S["vault"], vaults=list({*json.loads(accounts.paths(S["address"])["profile"].read_text()).get("vaults", []), S["vault"]}))
    event("session", vault=S["vault"], signer=S["signer"])
    S["deployer"] = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    S["deploy_nonce"] = deploy_nonce
    say(f"coffre déployé au nom de ce compte : {S['vault']}")

    # Les descripteurs de clear signing de CE coffre (mandat, dérogation), compilés et signés ici même
    # avec la clé de test : c'est ce que notre context module servira au Signer Kit.
    try:
        S["descriptors"] = {k: str(signers.descriptor_path(k, S["vault"])) for k in ("mandate", "exception")}
        say("descripteurs EIP-712 compilés pour ce coffre (mandat : 5 filtres, dérogation : 6) — signés cal.pem")
    except Exception as e:  # noqa: BLE001
        say(f"descripteurs : {e} — le chemin Python reste disponible")
        S["signer"] = "python"
    G["ring"] = walletcli.ring_status()
    if G["ring"].get("initialised"):
        say("Ledger Key Ring : initialisé sur cette machine (la clé du MCP peut être scellée)")
    else:
        say("Ledger Key Ring : non initialisé ici (`wallet-cli ring init` demande un Flex en USB)")

    cast("send", WETH, "deposit()", "--value", "5ether", key=DEPLOYER_KEY)
    cast("send", WETH, "transfer(address,uint256)", S["vault"], str(5 * 10**18), key=DEPLOYER_KEY)
    rc, bal = cast("call", WETH, "balanceOf(address)(uint256)", S["vault"])
    S["weth"] = bal.strip().split()[0] if rc == 0 else "?"
    say("coffre approvisionné — raccourci de banc : les fonds viennent d'un compte anvil, pas du Ledger")
    return True, "prêt"


def a_chat(prompt: str):
    S["chat"].append({"role": "user", "text": prompt})
    prop = strategist.propose(prompt)
    S["proposal"] = prop
    S["chat"].append({"role": "assistant", "text": prop["rationale"], "warning": prop["warning"],
                      "source": prop.get("_source", "")})
    say("stratégie proposée — à lire et à valider sur l'appareil")
    event("strategy", prompt=prompt[:200], max_round_trip_loss_bps=prop["max_round_trip_loss_bps"], budget_weth=prop["budget_weth"])
    return True, "ok"


def _mandate_typed(p: dict):
    import sign_mandate as sm

    expiry = int(time.time()) + int(p["days"]) * 86400
    return sm.build_mandate(S["vault"], AGENT, int(p["budget_wei"]), int(p["max_round_trip_loss_bps"]), expiry, 1), expiry


def _finish_mandate(sig: str, owner: str | None, signer: str, expiry: int, report=None):
    p = S["proposal"]
    S["last_report"] = report
    S["mandate"] = {"owner": owner or S["owner"], "vault": S["vault"], "chainId": 8453, "signature": sig,
                    "signer": signer, "deployer": S.get("deployer"), "deployNonce": S.get("deploy_nonce"),
                    "mandate": {"agent": AGENT, "budgetToken": WETH, "budgetAmount": p["budget_wei"],
                                "maxRoundTripLossBps": int(p["max_round_trip_loss_bps"]), "expiry": expiry, "nonce": 1}}
    mpath().write_text(json.dumps(S["mandate"], indent=1))
    S["signed"] = True
    event("mandate_signed", signer=signer, vault=S["vault"], max_round_trip_loss_bps=int(p["max_round_trip_loss_bps"]),
          budget_wei=p["budget_wei"], expiry=expiry)
    via = {"dmk": "Signer Kit + DMK, notre context module", "python": "client officiel en APDU direct",
           "browser": "Signer Kit dans le navigateur du porteur, sa Ledger à lui"}.get(signer, signer)
    say(f"mandat signé sur l'appareil ({via}) — l'agent peut travailler seul dans ces bornes")
    if report:
        say(f"rapport du Signer Kit : isBlindSign={report.get('isBlindSign')} · "
            f"{(report.get('ethContext') or {}).get('clearSigningType')} — ce rapport partirait chez Ledger ; ici il reste")


def a_sign_mandate():
    if not (S["vault"] and S["proposal"]):
        return False, "il faut un compte et une stratégie"
    import sign_mandate as sm
    sm.URL = SPECULOS
    data, expiry = _mandate_typed(S["proposal"])

    if S["signer"] == "browser":
        # la Ledger est chez le porteur : la page fait signer (Signer Kit + WebHID) et nous rend la signature
        S["pending"] = {"kind": "mandate", "typedData": data, "expiry": expiry, "token": secrets.token_urlsafe(8), "ts": int(time.time())}
        S["signing"] = "mandate"
        return True, "ta Ledger, dans ton navigateur : lis les champs, puis maintiens « Hold to sign »"

    st = current()

    def worker():
        bind(st)
        try:
            r = signers.sign("mandate", data, sm.FILTERS, S["signer"], speculos=SPECULOS)
            _finish_mandate(r["signature"], r.get("owner"), r["signer"], expiry, r.get("report"))
        except Exception as e:  # noqa: BLE001
            say(f"mandat refusé ou erreur : {e}")
        finally:
            S["signing"] = None

    S["signing"] = "mandate"
    threading.Thread(target=worker, daemon=True).start()
    return True, "l'appareil attend : lis les champs, puis maintiens « Hold to sign »"

# ------------------------------------------------------------------ les bots : des agents nommes, dans le meme mandat
#
# Un bot = un agent d'execution (sans LLM) que le porteur nomme, choisit (pools v4 ou coffres ERC-4626), rythme
# (un tour, ou toutes les N secondes) et arrete quand il veut. Tous les bots d'un compte travaillent dans LE MEME
# coffre, sous LE MEME mandat signe une fois : le budget, la perte de sortie toleree et l'echeance sont communs,
# c'est le contrat qui les tient. Les tours sont executes un a la fois par compte (une seule cle de session, un
# seul journal), par un ordonnanceur ; chaque ligne du journal porte le nom du bot.

SCHED: dict[str, threading.Thread] = {}      # un ordonnanceur par compte, tant qu'un bot tourne
BOT_PROC: dict[str, subprocess.Popen] = {}   # le processus du tour en cours, pour pouvoir l'arreter


def bots_path() -> Path:
    return Path(S["dir"]) / "bots.json" if S["dir"] else ROOT / "agent" / "bots.json"


def load_bots(st: dict) -> list[dict]:
    d = st.get("dir")
    f = Path(d) / "bots.json" if d else None
    try:
        return json.loads(f.read_text()) if f and f.exists() else []
    except (OSError, ValueError):
        return []


def save_bots() -> None:
    if S["dir"]:
        bots_path().write_text(json.dumps(S["bots"], indent=1, ensure_ascii=False))


def bot_stats(b: dict) -> dict:
    """Le bilan d'un bot, relu dans le journal du compte : achats, refus, derogations, positions, depense."""
    rows = [r for r in S["journal"] if (r.get("bot") or {}).get("id") == b["id"]]
    executed = [r for r in rows if r["decision"] == "EXECUTED"]
    spent = sum(int((r.get("strategy") or {}).get("slice_wei") or 0) for r in executed)
    return {"executed": len(executed), "refused": len(rows) - len(executed),
            "exceptions": sum(1 for r in executed if r.get("under_exception")),
            "positions": sum(1 for p in S["positions"] if p.get("bot") == b["name"]),
            "spent_wei": str(spent), "last_ts": rows[-1]["ts"] if rows else None}


def bots_view() -> list[dict]:
    return [{**b, **bot_stats(b)} for b in S["bots"]]


def new_bot(name: str, universe: str, ticks: int, interval_s: int, slice_wei: int | None = None) -> dict:
    p = S["proposal"] or {}
    if slice_wei is None:
        slice_wei = int(p.get("slice_wei") or 5 * 10**15)
    if universe == "vaults":
        slice_wei = max(slice_wei, 10**16)    # une tranche de coffre n'est pas une miette de memecoin : au moins 0,01 WETH
        ticks = min(ticks, 5)
    return {"id": secrets.token_hex(3), "name": name.strip()[:40] or f"bot {len(S['bots']) + 1}", "universe": universe,
            "ticks": max(1, min(int(ticks), 12)), "interval_s": max(0, int(interval_s)), "slice_wei": str(slice_wei),
            "created": int(time.time()), "started": int(time.time()), "stopped": None, "status": "running",
            "rounds": 0, "next_run": time.time(), "stop_reason": None}


def run_round(b: dict) -> None:
    """Un tour d'un bot : l'agent (sans LLM) tente `ticks` entrees dans le coffre, sous le mandat du compte."""
    vaults_mode = b["universe"] == "vaults"
    params = Path(S["dir"]) / f"params-{b['id']}.json"
    p = S["proposal"] or {}
    if vaults_mode:
        params.write_text(json.dumps({"slice_wei": b["slice_wei"], "require_listed": p.get("require_registry", True)}))
        script = "vaults.py"
    else:
        params.write_text(json.dumps({"slice_wei": b["slice_wei"], "min_depth_sizes": p.get("min_depth_sizes", 6),
                                      "require_registry": p.get("require_registry", True)}))
        script = "agent.py"
    mpath().write_text(json.dumps(S["mandate"], indent=1))     # l'agent lit le mandat et ecrit le journal DU COMPTE
    start_len = len(read_journal())                             # on ne relit que ce que CE tour ajoute
    event("run", bot=b["name"], universe=b["universe"], ticks=b["ticks"], round=b["rounds"] + 1)
    S["running"], S["bot_running"] = True, b["id"]
    try:
        say(f"bot « {b['name']} » — tour {b['rounds'] + 1} ({'coffres ERC-4626, Morpho' if vaults_mode else 'pools Uniswap v4'}) : "
            f"{b['ticks']} tranches de {int(b['slice_wei']) / 1e18:.4f} WETH")
        proc = subprocess.Popen(
            [sys.executable, str(ROOT / "agent" / script), "--ticks", str(b["ticks"]), "--params", str(params),
             "--mandate", str(mpath())],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=ROOT,
            env={**os.environ, "PDS_JOURNAL": str(jpath()), "PDS_BOT": json.dumps({"id": b["id"], "name": b["name"]})})
        BOT_PROC[b["id"]] = proc
        for line in proc.stdout:
            line = line.strip()
            if line:
                say(f"[{b['name']}] {line}")
            S["journal"] = read_journal()
        proc.wait()
        BOT_PROC.pop(b["id"], None)
        S["journal"] = read_journal()
        refresh_positions()
        b["rounds"] += 1
        # une demande ne vient que des refus de CE tour, et jamais d'une position deja acquise
        # (sous derogation ou non) — sinon on ressortirait une derogation deja consommee
        held = {r["pick"]["pool_id"].lower() for r in S["journal"] if r["decision"] == "EXECUTED"}
        pending = [r for r in S["journal"][start_len:] if r["decision"] != "EXECUTED"
                   and (r.get("escalation_request") or {}).get("possible")
                   and r["pick"]["pool_id"].lower() not in held]
        batch = []
        for r in pending:
            req = {**r["escalation_request"], "bot": {"id": b["id"], "name": b["name"]}}
            known = {(S["escalation"] or {}).get("pool_id")} | {q["pool_id"] for q in S["escalation_queue"]} | {q["pool_id"] for q in batch}
            if req["pool_id"] in known or req["pool_id"].lower() in S["refused_escalations"]:
                continue   # deja en attente, ou le porteur a deja dit non pour cette position : on ne redemande pas
            batch.append(req)
        if batch:
            # une demande a la fois sur l'appareil : celles du tour qu'on vient de voir passent devant, dans l'ordre du tour ;
            # celles qui attendaient reculent — sauf la demande en cours de signature, qui garde sa place
            if S["escalation"] and (S["signing"] or S["pending"]):
                S["escalation_queue"] = batch + S["escalation_queue"]
            else:
                S["escalation_queue"] = batch[1:] + ([S["escalation"]] if S["escalation"] else []) + S["escalation_queue"]
                S["escalation"] = batch[0]
        new = S["journal"][start_len:]
        event("run_done", bot=b["name"], universe=b["universe"], executed=sum(1 for r in new if r["decision"] == "EXECUTED"),
              refused=sum(1 for r in new if r["decision"] != "EXECUTED"), escalation=(S["escalation"] or {}).get("question"))
        if pending and S["escalation"] and S["escalation"].get("bot", {}).get("id") == b["id"] and not S["escalation"].get("_notified"):
            S["escalation"]["_notified"] = True
            say(f"[{b['name']}] un achat est hors bornes : il attend ta décision sur l'appareil"
                + (f" ({len(S['escalation_queue'])} autre(s) en attente)" if S["escalation_queue"] else ""))
            _notify(S["escalation"])
        # fin naturelle : un seul tour demande, budget epuise, mandat echu
        budget = int(S["mandate"]["mandate"]["budgetAmount"])
        spent = int((S["spent"] or "0").split()[0]) if str(S["spent"]).strip() else 0
        expired = int(S["mandate"]["mandate"]["expiry"]) <= time.time()
        if b["interval_s"] == 0:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "un seul tour demandé"})
        elif not new:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "plus rien de nouveau à tenter dans cet univers"})
        elif spent >= budget:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "budget du mandat consommé"})
        elif expired:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "mandat échu"})
        if b["status"] == "done":
            event("bot_done", bot=b["name"], reason=b["stop_reason"], rounds=b["rounds"])
            say(f"bot « {b['name']} » : terminé — {b['stop_reason']}")
    except Exception as e:  # noqa: BLE001
        say(f"[{b['name']}] agent : {e}")
    finally:
        S["running"], S["bot_running"] = False, None
        save_bots()


def ensure_scheduler(st: dict) -> None:
    """Un fil par compte : il execute les tours des bots qui tournent, un a la fois, quand leur heure vient."""
    a = (st.get("address") or "invité").lower()
    t = SCHED.get(a)
    if t and t.is_alive():
        return

    def loop():
        bind(st)
        while True:
            running = [b for b in S["bots"] if b["status"] == "running"]
            if not running:
                break
            if S["running"] or S["signing"] or S["pending"]:   # jamais deux envois avec la meme cle ; jamais pendant qu'on signe
                time.sleep(1)
                continue
            due = [b for b in running if b.get("next_run", 0) <= time.time()]
            if not due:
                time.sleep(1)
                continue
            b = min(due, key=lambda x: x.get("next_run", 0))
            run_round(b)
            b["next_run"] = time.time() + b["interval_s"]
            save_bots()
        SCHED.pop(a, None)

    t = threading.Thread(target=loop, daemon=True)
    SCHED[a] = t
    t.start()


def a_bot_add(body: dict | None = None):
    body = body or {}
    if not S["signed"]:
        return False, "il faut d'abord un mandat signé : les bots travaillent dedans"
    universe = body.get("universe") or S["universe"]
    if universe not in ("pools", "vaults"):
        return False, f"univers inconnu : {universe}"
    try:
        ticks = int(body.get("ticks") or (S["proposal"] or {}).get("ticks") or 3)
        interval = int(body.get("interval_s") or 0)
        slice_wei = int(float(body["slice_weth"]) * 1e18) if body.get("slice_weth") else None
    except (TypeError, ValueError):
        return False, "paramètres invalides"
    b = new_bot(body.get("name") or "", universe, ticks, interval, slice_wei)
    S["bots"].append(b)
    save_bots()
    event("bot_added", bot=b["name"], universe=universe, ticks=b["ticks"], interval_s=b["interval_s"])
    say(f"bot « {b['name']} » ajouté : {'coffres ERC-4626' if universe == 'vaults' else 'pools v4'}, {b['ticks']} tranches par tour, "
        + ("un seul tour" if b["interval_s"] == 0 else f"un tour toutes les {b['interval_s']} s"))
    ensure_scheduler(current())
    return True, f"bot « {b['name']} » lancé"


def a_bot_stop(body: dict | None = None):
    body = body or {}
    b = next((x for x in S["bots"] if x["id"] == body.get("id")), None)
    if not b:
        return False, "bot inconnu"
    if b["status"] != "running":
        return False, "ce bot ne tourne plus"
    b.update({"status": "stopped", "stopped": int(time.time()), "stop_reason": "arrêté par le porteur"})
    proc = BOT_PROC.get(b["id"])
    if proc and proc.poll() is None:
        proc.terminate()      # le tour en cours s'arrete la ; ce qui est achete reste dans le coffre, sous le mandat
    save_bots()
    event("bot_stopped", bot=b["name"], rounds=b["rounds"])
    say(f"bot « {b['name']} » arrêté par le porteur après {b['rounds']} tour(s) — ses positions restent dans le coffre")
    return True, f"bot « {b['name']} » arrêté"


def a_bot_restart(body: dict | None = None):
    body = body or {}
    b = next((x for x in S["bots"] if x["id"] == body.get("id")), None)
    if not b:
        return False, "bot inconnu"
    if not S["signed"]:
        return False, "il faut un mandat signé"
    if b["status"] == "running":
        return False, "ce bot tourne déjà"
    b.update({"status": "running", "started": int(time.time()), "stopped": None, "stop_reason": None, "next_run": time.time()})
    if b["interval_s"] == 0:
        b["interval_s"] = 60   # relancer un bot d'un tour, c'est le faire tourner
    save_bots()
    event("bot_restarted", bot=b["name"])
    ensure_scheduler(current())
    return True, f"bot « {b['name']} » relancé"


def a_run():
    """« Lancer un tour » : un bot d'un seul tour, dans l'univers choisi — le geste simple de la demo."""
    if not S["signed"]:
        return False, "il faut d'abord un mandat signé"
    p = S["proposal"] or {}
    label = "coffres" if S["universe"] == "vaults" else "pools"
    n = 1 + sum(1 for b in S["bots"] if b["name"].startswith("tour unique"))
    return a_bot_add({"name": f"tour unique {n} · {label}", "universe": S["universe"], "ticks": p.get("ticks") or 3, "interval_s": 0})


def _exception_prepare(e: dict):
    """La position : un pool v4 (cle complete) ou un coffre ERC-4626 (son adresse) — meme derogation."""
    is_vault = e.get("kind") == "vault"
    key = None
    if is_vault:
        rc, kh = cast("call", S["vault"], "hashVault(address)(bytes32)", e["vault"])
    else:
        key = tup([WETH, e["currency1"], e["fee"], e["tickSpacing"], e["hook"]])
        rc, kh = cast("call", S["vault"], "hashPoolKey((address,address,uint24,int24,address))(bytes32)", key)
    if rc != 0:
        raise RuntimeError("hachage de la position : " + kh[-200:])
    return is_vault, key, kh.strip().split()[0]


def _finish_exception(e: dict, sig: str, is_vault: bool, key, pool_hash: str, expiry: int, nonce: int, report=None):
    S["last_report"] = report
    say("dérogation signée sur l'appareil — l'agent réessaie, une seule fois")
    exc = tup([AGENT, WETH, pool_hash, e["amount_in"], e["seen_exit_bps"], expiry, nonce])
    if is_vault:
        rc2, out = cast("send", S["vault"], ENTER_EXC_SIG, mandate_tuple(), S["mandate"]["signature"],
                        exc, sig, e["vault"], e["amount_in"], e["ref_holder"], key=AGENT_KEY)
    else:
        rc2, out = cast("send", S["vault"], BUY_EXC_SIG, mandate_tuple(), S["mandate"]["signature"],
                        exc, sig, key, e["amount_in"], key=AGENT_KEY)
    if rc2 == 0 and re.search(r"status\s+1", out):
        say(f"ACHAT AUTORISÉ sous dérogation — sortie {e['seen_exit_bps']} bps, assumée")
        S["exception_buys"].append({"pool": e["pool_id"], "token": e["currency1"], "name": e.get("name"),
                                    "kind": e.get("kind", "pool"), "exit_bps": e["seen_exit_bps"], "tick": "déro.",
                                    "under_exception": True, "bot": (e.get("bot") or {}).get("name")})
        # la position existe : elle entre au journal, au meme format que les tours de l'agent, pour que la
        # surveillance (watch.py) et le MCP la voient — sans le journal, une position acquise sous derogation
        # serait invisible a la resonde
        journal = read_journal()
        entry = {
            "ts": int(time.time()), "tick": (max([r["tick"] for r in journal if isinstance(r.get("tick"), int)] or [0]) + 1),
            "kind": e.get("kind", "pool"), "mode": "exception", "under_exception": True,
            "strategy": {"name": "derogation", "objective": "decision humaine, lue et signee sur l'appareil",
                         "slice_wei": str(e["amount_in"])},
            "shortlist": [],
            "pick": {"pool_id": e["pool_id"], "currency1": e["currency1"], "hook": e.get("hook"), "fee": e.get("fee", 0),
                     "tickSpacing": e.get("tickSpacing", 0), "name": e.get("name"), "ref_holder": e.get("ref_holder"),
                     "entry_bps_median": 0.0, "depth_sizes": 0, "registry": {"present": None}},
            "why": (f"le coffre avait refuse ({e['seen_exit_bps']} bps de sortie, mandat a {e['mandate_allows_bps']}) ; "
                    "le porteur a lu ce nombre sur son appareil et a signe une derogation a usage unique"),
            "exit_probe": {"loss_bps": int(e["seen_exit_bps"]), "exit_blocked": False,
                           "source": "le nombre lu et signe sur l'appareil (ExitWorseThanSeen si la sortie a empire)"},
            "mandate": {"owner": S["owner"], "max_round_trip_loss_bps": e["mandate_allows_bps"],
                        "budget_wei": S["mandate"]["mandate"]["budgetAmount"], "signed_on": "Ledger Flex (EIP-712)"},
            "decision": "EXECUTED", "escalation_request": None, "bot": e.get("bot"),
            "tx": (re.search(r"transactionHash\s+(0x[0-9a-f]{64})", out) or [None, None])[1], "error": None,
        }
        with jpath().open("a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        S["journal"] = read_journal()
        _next_escalation()
        event("exception_signed", position=e.get("name") or e["pool_id"], seen_exit_bps=e["seen_exit_bps"],
              mandate_allows_bps=e["mandate_allows_bps"], position_kind=e.get("kind", "pool"), bot=(e.get("bot") or {}).get("name"))
        refresh_positions()
    else:
        say("le coffre a refusé la dérogation : " + (out.strip()[-200:] or "?"))


def _next_escalation() -> None:
    """La demande courante est tranchée : la suivante, s'il y en a une, prend sa place."""
    S["escalation"] = S["escalation_queue"].pop(0) if S["escalation_queue"] else None
    if S["escalation"]:
        say(f"demande suivante : {S['escalation'].get('question')}")
        _notify(S["escalation"])


def a_escalate_no():
    """Le porteur laisse le refus du coffre : la demande est close, sans signature."""
    e = S["escalation"]
    if not e:
        return False, "aucune demande en attente"
    S["refused_escalations"].append(e["pool_id"].lower())
    event("exception_refused", position=e.get("name") or e["pool_id"], pool_id=e["pool_id"], seen_exit_bps=e.get("seen_exit_bps"),
          bot=(e.get("bot") or {}).get("name"))
    say(f"le porteur laisse le refus : {e.get('name') or e['pool_id'][:12]} ({e.get('seen_exit_bps')} bps) reste hors du coffre")
    _next_escalation()
    return True, "refus maintenu"


def a_escalate():
    """Le porteur lit sur son Flex le coût réel de la sortie, et signe — ou non — une dérogation."""
    e = S["escalation"]
    if not e:
        return False, "aucune demande en attente"
    import sign_mandate as sm
    sm.URL = SPECULOS
    try:
        is_vault, key, pool_hash = _exception_prepare(e)
    except RuntimeError as ex:
        return False, str(ex)
    expiry = int(time.time()) + 3600
    nonce = int(time.time())
    data = sm.build_exception(S["vault"], AGENT, pool_hash, int(e["amount_in"]), int(e["seen_exit_bps"]), expiry, nonce, WETH)

    if S["signer"] == "browser":
        S["pending"] = {"kind": "exception", "typedData": data, "expiry": expiry, "nonce": nonce, "token": secrets.token_urlsafe(8), "ts": int(time.time()),
                        "is_vault": is_vault, "key": key, "pool_hash": pool_hash, "escalation": e}
        S["signing"] = "exception"
        return True, "ta Ledger, dans ton navigateur : lis le coût de sortie, puis signe — ou refuse"

    st = current()

    def worker():
        bind(st)
        try:
            r = signers.sign("exception", data, sm.EXCEPTION_FILTERS, S["signer"], speculos=SPECULOS)
            _finish_exception(e, r["signature"], is_vault, key, pool_hash, expiry, nonce, r.get("report"))
        except Exception as ex:  # noqa: BLE001
            say(f"dérogation : {ex}")
        finally:
            S["signing"] = None

    S["signing"] = "exception"
    threading.Thread(target=worker, daemon=True).start()
    return True, "l'appareil montre le coût de sortie : à toi de trancher"


def _notify(esc: dict) -> None:
    """Prevenir le porteur qu'un achat deborde : un fichier, et un webhook s'il est configure."""
    payload = {"event": "escalation", "ts": int(time.time()), "owner": S["owner"], "vault": S["vault"],
               "position": esc.get("name") or esc.get("pool_id"), "seen_exit_bps": esc.get("seen_exit_bps"),
               "mandate_allows_bps": esc.get("mandate_allows_bps"), "question": esc.get("question"),
               "bot": (esc.get("bot") or {}).get("name"), "url": f"http://127.0.0.1:{PORT}/"}
    npath().open("a").write(json.dumps(payload, ensure_ascii=False) + "\n")
    event("notified", position=payload["position"], seen_exit_bps=payload["seen_exit_bps"])
    if NOTIFY_URL:
        try:
            requests.post(NOTIFY_URL, json=payload, timeout=5)
            say("le porteur est prévenu (webhook) : il peut venir lire le nombre et trancher")
        except Exception as ex:  # noqa: BLE001
            say(f"notification : {ex}")

def a_watch():
    """Resonde les positions detenues : la sortie s'est-elle refermee depuis l'achat ?"""
    if not S["signed"]:
        return False, "il faut un mandat signé"
    if S["watching"]:
        return False, "surveillance déjà en cours"

    st = current()

    def worker(sell_if=None):
        bind(st)
        try:
            cmd = [sys.executable, str(ROOT / "agent" / "watch.py"), "--json", "--mandate", str(mpath())]
            if sell_if is not None:
                cmd += ["--sell-if", str(sell_if)]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=600, cwd=ROOT,
                               env={**os.environ, "PDS_JOURNAL": str(jpath())})
            rc, out = p.returncode, (p.stdout or "") + (p.stderr or "")
            rows = []
            try:
                rows = json.loads(out[out.index("["):out.rindex("]") + 1]) if "[" in out else []
            except (ValueError, json.JSONDecodeError):
                pass
            S["watch"] = {"ts": int(time.time()), "rows": rows, "sell_if": sell_if}
            worse = [r for r in rows if (r.get("delta_bps") or 0) > 0 or r.get("blocked")]
            sold = [r for r in rows if r.get("action") == "VENDU"]
            if not rows:
                say("surveillance : aucune position détenue")
            else:
                say(f"surveillance : {len(rows)} position(s), {len(worse)} dont la sortie s'est refermée"
                    + (f", {len(sold)} vendue(s)" if sold else ""))
            event("watch", positions=len(rows), worse=len(worse), sold=len(sold), sell_if=sell_if)
            if sold:
                refresh_positions()
        except Exception as e:  # noqa: BLE001
            say(f"surveillance : {e}")
        finally:
            S["watching"] = False

    S["watching"] = True
    threading.Thread(target=worker, kwargs={"sell_if": S.pop("_sell_if", None)}, daemon=True).start()
    return True, "la sonde est gratuite : on la relance autant qu'on veut"


def a_watch_sell():
    """Meme chose, mais on SORT de ce qui a trop empire. Seuil = le mandat + une marge."""
    if not S["signed"]:
        return False, "il faut un mandat signé"
    S["_sell_if"] = int(S["mandate"]["mandate"]["maxRoundTripLossBps"])
    return a_watch()


def a_reset():
    """Remet CE compte a zero. Le banc (anvil, Speculos) est partage : il continue de tourner."""
    st = current()
    keep = {k: st[k] for k in ("address", "dir", "signer", "universe", "user")}
    st.clear()
    st.update(default_state(keep["address"]))
    st.update(keep)
    if st["address"]:
        event("reset")
        for f in ("mandate",):
            try:
                accounts.paths(st["address"])[f].unlink()
            except OSError:
                pass
        try:
            (accounts.paths(st["address"])["dir"] / "bots.json").unlink()
        except OSError:
            pass
    return True, "compte remis à zéro — le banc continue de tourner"


ACTIONS = {"boot": a_boot, "sign_mandate": a_sign_mandate, "run": a_run,
           "escalate": a_escalate, "escalate_no": a_escalate_no, "watch": a_watch, "watch_sell": a_watch_sell, "reset": a_reset}


# ------------------------------------------------------------------ le serveur

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json", cookie=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        try:
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # la page a été rechargée ou a renoncé (délai du client) pendant qu'on lui répondait : rien à tracer

    def _bind(self):
        """Le cookie de session dit quel compte parle ; sinon, l'invité."""
        m = re.search(r"pds_session=([A-Za-z0-9_\-]+)", self.headers.get("Cookie", "") or "")
        addr = SESSIONS.get(m.group(1)) if m else None
        bind(state_for(addr) if addr else GUEST)

    def _login(self, addr: str, via: str):
        try:   # la forme en somme de controle, quelle que soit la casse donnee par l'appareil ou par SIWE
            cs = subprocess.run(["cast", "to-check-sum-address", addr], capture_output=True, text=True, timeout=10).stdout.strip()
            if cs.startswith("0x") and len(cs) == 42:
                addr = cs
        except Exception:  # noqa: BLE001
            pass
        st = state_for(addr, via=via)
        bind(st)
        token = secrets.token_urlsafe(24)
        SESSIONS[token] = addr
        accounts.save_sessions(SESSIONS)
        return f"pds_session={token}; Path=/; HttpOnly; SameSite=Lax"

    def do_GET(self):
        self._bind()
        path = urlparse(self.path).path
        if path == "/schema.html":
            return self._send(200, (Path(__file__).parent / "schema.html").read_bytes(), "text/html; charset=utf-8")
        if path == "/api/account":
            if not S["address"]:
                return self._send(200, {"ok": False, "msg": "pas de compte : connecte-toi"})
            reveal = parse_qs(urlparse(self.path).query).get("reveal", ["0"])[0] == "1"
            pth = accounts.paths(S["address"])
            prof = json.loads(pth["profile"].read_text()) if pth["profile"].exists() else {"address": S["address"]}
            key = accounts.user_key(S["address"])
            return self._send(200, {"ok": True, "profile": prof, "events": accounts.events(S["address"], 80),
                                    "mcp_key": key if reveal else (key[:4] + "…" + key[-4:]),
                                    "mcp_config": accounts.mcp_config(S["address"], reveal),
                                    "dir": str(pth["dir"]), "key_note": (
                                        "dérivée du secret maître par HMAC(maître, adresse) — jamais stockée ; le secret "
                                        "maître est celui que scripts/ring-seal.sh scelle dans le Ledger Key Ring")})
        if path.startswith("/dist/") and ".." not in path:
            f = Path(__file__).parent / path.lstrip("/")
            if f.is_file():
                return self._send(200, f.read_bytes(), "application/javascript; charset=utf-8")
            return self._send(404, {"error": "bundle absent : cd ledger/dmk && npm run build:web"})
        if path.startswith("/speculos/"):
            # le proxy vers l'emulateur, meme origine : le DMK du navigateur lui parle comme a une Ledger
            upstream = SPECULOS + self.path[len("/speculos"):]
            plog(f"GET  {self.path}")
            if "stream=true" in (urlparse(self.path).query or ""):
                # le flux d'evenements (SSE) que le transport ecoute pour detecter une deconnexion : on le relaie
                # tel quel, morceau par morceau, sans le mettre en tampon
                try:
                    with requests.get(upstream, stream=True, timeout=(10, None)) as r:
                        self.send_response(r.status_code)
                        self.send_header("Content-Type", r.headers.get("content-type", "text/event-stream"))
                        self.send_header("Cache-Control", "no-cache")
                        self.end_headers()
                        for chunk in r.iter_content(chunk_size=None):
                            if chunk:
                                self.wfile.write(chunk)
                                self.wfile.flush()
                except Exception:  # noqa: BLE001  (le navigateur a ferme, ou Speculos est parti)
                    pass
                plog(f"GET  {self.path} : flux SSE ferme")
                return None
            try:
                r = requests.get(upstream, timeout=30)
                return self._send(r.status_code, r.content, r.headers.get("content-type", "application/json"))
            except Exception as e:  # noqa: BLE001
                return self._send(502, {"error": str(e)})
        if path == "/api/descriptor":
            kind = parse_qs(urlparse(self.path).query).get("kind", ["mandate"])[0]
            if kind not in ("mandate", "exception") or not S["vault"]:
                return self._send(400, {"error": "kind=mandate|exception, et une session ouverte"})
            return self._send(200, Path(signers.descriptor_path(kind, S["vault"])).read_bytes())
        if path == "/api/siwe/nonce":
            S["siwe_nonce"] = secrets.token_hex(4)  # court : le message SIWE doit tenir dans une APDU (Signer Kit, FEEDBACK § 8)
            return self._send(200, {"nonce": S["siwe_nonce"], "domain": self.headers.get("Host", f"127.0.0.1:{PORT}"),
                                    "chainId": 8453, "statement": "Porte de sortie — je me connecte avec ma Ledger."})
        if path in ("/", "/index.html"):
            return self._send(200, (Path(__file__).parent / "index.html").read_bytes(), "text/html; charset=utf-8")
        if path == "/api/screen":
            try:
                return self._send(200, requests.get(f"{SPECULOS}/screenshot", timeout=5).content, "image/png")
            except Exception:
                return self._send(503, b"", "image/png")
        if path == "/api/events":
            try:
                return self._send(200, requests.get(f"{SPECULOS}/events?currentscreenonly=true", timeout=5).json())
            except Exception:
                return self._send(200, {"events": []})
        if path == "/api/state":
            probe_services()
            return self._send(200, {
                **G,
                **{k: v for k, v in S.items() if k not in ("journal", "bots")},
                "bots": bots_view(),
                "journal": [{
                    "tick": r["tick"], "pool": r["pick"]["pool_id"][:12], "hook": r["pick"]["hook"][:12],
                    "bot": (r.get("bot") or {}).get("name"),
                    "kind": r.get("kind", "pool"), "name": r["pick"].get("name"), "apy_pct": r["pick"].get("apy_pct"),
                    "under_exception": bool(r.get("under_exception")),
                    "own_bps": r["exit_probe"].get("own_round_trip_bps"), "stuck_bps": r["exit_probe"].get("stuck_bps"),
                    "deposit_refused": r["exit_probe"].get("deposit_refused"),
                    "entry": r["pick"]["entry_bps_median"], "exit": r["exit_probe"]["loss_bps"],
                    "hook_in": (r.get("hook_analysis", {}).get("live_counterfactual_entry") or {}).get("bps"),
                    "hook_out": (r.get("hook_analysis", {}).get("live_counterfactual_exit") or {}).get("bps"),
                    "registry": r["pick"]["registry"]["present"],
                    "decision": r["decision"], "error": r["error"], "why": r["why"],
                } for r in S["journal"]],
            })
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        self._bind()
        path = urlparse(self.path).path
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        if path == "/api/login_device":
            # le chemin du banc : l'appareil branché (ou émulé) dit qui est le compte
            if not G["speculos"]:
                rc, out = run([str(ROOT / "ledger" / "speculos.sh"), "up"])
                if rc != 0:
                    return self._send(200, {"ok": False, "msg": "Speculos : " + out[-200:]})
                G["speculos"] = True
            import sign_mandate as sm
            sm.URL = SPECULOS
            try:
                addr = sm.device_address()
            except Exception as e:  # noqa: BLE001
                return self._send(200, {"ok": False, "msg": f"appareil : {e}"})
            with LOCK:
                cookie = self._login(addr, "appareil du banc (adresse lue sur la Ledger)")
                say(f"connecté : {S['address']} — adresse lue sur l'appareil")
            return self._send(200, {"ok": True, "address": S["address"]}, cookie=cookie)
        if path == "/api/logout":
            m = re.search(r"pds_session=([A-Za-z0-9_\-]+)", self.headers.get("Cookie", "") or "")
            if m:
                SESSIONS.pop(m.group(1), None)
                accounts.save_sessions(SESSIONS)
            return self._send(200, {"ok": True}, cookie="pds_session=; Path=/; Max-Age=0")
        if path.startswith("/speculos/"):
            t0 = time.time()
            try:
                r = requests.post(SPECULOS + self.path[len("/speculos"):], json=body, timeout=600)
                plog(f"POST {path} {json.dumps(body)[:80]} -> {r.status_code} {r.text[:70]} ({time.time() - t0:.2f}s)")
                return self._send(r.status_code, r.content, r.headers.get("content-type", "application/json"))
            except Exception as e:  # noqa: BLE001
                plog(f"POST {path} {json.dumps(body)[:80]} -> 502 {type(e).__name__}: {e} ({time.time() - t0:.2f}s)")
                return self._send(502, {"error": f"{type(e).__name__}: {e}"})
        if path == "/api/siwe/verify":
            # Sign-In with Ethereum (EIP-4361) : le message porte notre nonce et l'adresse ; la signature est
            # un personal_sign (EIP-191) fait sur la Ledger ; `cast wallet verify` retrouve le signataire.
            msg, sig, addr = body.get("message", ""), body.get("signature", ""), (body.get("address") or "")
            if not (S["siwe_nonce"] and f"Nonce: {S['siwe_nonce']}" in msg):
                return self._send(200, {"ok": False, "msg": "nonce absent ou périmé : redemande /api/siwe/nonce"})
            if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr) or addr.lower() not in msg.lower():
                return self._send(200, {"ok": False, "msg": "l'adresse ne figure pas dans le message"})
            p = subprocess.run(["cast", "wallet", "verify", "--address", addr, msg, sig], capture_output=True, text=True, timeout=60)
            if p.returncode != 0:
                return self._send(200, {"ok": False, "msg": "signature refusée : " + (p.stderr or p.stdout).strip()[-160:]})
            with LOCK:
                S["siwe_nonce"] = None
                cookie = self._login(addr, "Sign-In with Ethereum (Ledger dans le navigateur)")
                say(f"connecté : {addr} — prouvé par une signature sur sa Ledger (Sign-In with Ethereum)")
            return self._send(200, {"ok": True, "address": addr}, cookie=cookie)
        if path == "/api/signed":
            # la page a fait signer la Ledger du porteur : elle nous rend la signature (ou le refus)
            pend = S.get("pending")
            if not pend or pend["kind"] != body.get("kind"):
                return self._send(200, {"ok": False, "msg": "rien à signer de ce genre"})
            if body.get("error"):
                with LOCK:
                    S["pending"] = None
                    S["signing"] = None
                    err = str(body["error"])[:160]
                    say(f"{pend['kind']} : refusé ou erreur côté porteur — {err}")
                    if "InvalidStatusWord" in err or "6980" in err:
                        say("l'app Ethereum est peut-être restée « en cours de signature » : sur Speculos, "
                            "`ledger/speculos.sh up` ; sur un Flex, quitte et rouvre l'app (FEEDBACK § 8)")
                return self._send(200, {"ok": True, "msg": "refus noté"})
            sig = body.get("signature") or ""
            if not re.fullmatch(r"0x[0-9a-fA-F]{130}", sig):
                return self._send(200, {"ok": False, "msg": "signature mal formée"})
            owner = body.get("owner") or S["owner"]
            if S["owner"] and owner.lower() != S["owner"].lower():
                return self._send(200, {"ok": False, "msg": f"signé par {owner[:10]}…, la session est à {S['owner'][:10]}…"})
            with LOCK:
                S["pending"] = None
                try:
                    if pend["kind"] == "mandate":
                        _finish_mandate(sig, owner, "browser", pend["expiry"], body.get("report"))
                    else:
                        _finish_exception(pend["escalation"], sig, pend["is_vault"], pend["key"], pend["pool_hash"],
                                          pend["expiry"], pend["nonce"], body.get("report"))
                except Exception as e:  # noqa: BLE001
                    say(f"{pend['kind']} : {e}")
                finally:
                    S["signing"] = None
            return self._send(200, {"ok": True})
        if path == "/api/finger":
            try:
                requests.post(f"{SPECULOS}/finger", json=body, timeout=5)
                return self._send(200, {"ok": True})
            except Exception as e:  # noqa: BLE001
                return self._send(200, {"ok": False, "error": str(e)})
        if path == "/api/chat":
            with LOCK:
                ok, msg = a_chat(body.get("prompt", ""))
            return self._send(200, {"ok": ok, "msg": msg, "proposal": S["proposal"]})
        if path == "/api/universe":
            # l'univers de l'agent de demonstration : pools Uniswap v4, ou coffres ERC-4626 (Morpho)
            want = body.get("universe")
            if want not in ("pools", "vaults"):
                return self._send(200, {"ok": False, "msg": f"univers inconnu : {want}"})
            with LOCK:
                S["universe"] = want
                say("univers de l'agent : " + ("coffres ERC-4626 (Morpho, WETH, Base)" if want == "vaults" else "pools Uniswap v4 (WETH, Base)"))
            return self._send(200, {"ok": True, "universe": want})
        if path == "/api/analyze":
            # l'analyste : le VRAI agent — il repond par les outils du MCP en lecture seule, jamais de memoire
            q = (body.get("question") or "").strip()
            if not q:
                return self._send(200, {"ok": False, "msg": "pose une question"})
            if (S["analysis"] or {}).get("pending"):
                return self._send(200, {"ok": False, "msg": "l'analyste travaille déjà"})
            entry = {"question": q, "pending": True, "answer": "", "tools_used": [], "error": None, "ts": int(time.time())}
            history = [a for a in S["analyses"] if not a.get("pending") and a.get("answer")]
            S["analyses"].append(entry)
            S["analysis"] = entry
            say(f"analyste : « {q} » — il interroge le MCP")

            st = current()
            env = account_env()

            def worker():
                bind(st)
                sys.path.insert(0, str(ROOT / "agent"))
                import analyst
                try:
                    r = analyst.ask(q, history=history, env=env)
                    entry.update({**r, "question": q, "pending": False})
                    used = ", ".join(sorted({t["tool"] for t in r["tools_used"]})) or "aucun outil"
                    say(f"analyste : réponse par {used}" + (f" — {r['error']}" if r["error"] else ""))
                    event("analysis", question=q[:200], tools=sorted({t["tool"] for t in r["tools_used"]}))
                except Exception as ex:  # noqa: BLE001
                    entry.update({"pending": False, "answer": "", "error": repr(ex)})
                    say(f"analyste : {ex}")

            threading.Thread(target=worker, daemon=True).start()
            return self._send(200, {"ok": True, "msg": "l'analyste interroge les outils"})
        if path == "/api/signer":
            # le chemin vers l'appareil : « dmk » (Signer Kit de Ledger) ou « python » (client officiel)
            want = body.get("signer")
            if want not in (*signers.SIGNERS, "browser"):
                return self._send(200, {"ok": False, "msg": f"signer inconnu : {want}"})
            if want == "dmk" and not signers.dmk_available():
                return self._send(200, {"ok": False, "msg": "Signer Kit absent : cd ledger/dmk && npm i"})
            with LOCK:
                S["signer"] = want
                say("chemin de signature : " + {"dmk": "Signer Kit Ethereum 1.18.1 sur le DMK 1.9.1 (côté banc)",
                                                "python": "client officiel d'app-ethereum, APDU direct",
                                                "browser": "Signer Kit dans TON navigateur — ta Ledger, chez toi"}[want])
            return self._send(200, {"ok": True, "signer": want})
        if path in ("/api/bots", "/api/bots/stop", "/api/bots/restart"):
            fn = {"/api/bots": a_bot_add, "/api/bots/stop": a_bot_stop, "/api/bots/restart": a_bot_restart}[path]
            with LOCK:
                try:
                    ok, msg = fn(body)
                except Exception as e:  # noqa: BLE001
                    ok, msg = False, repr(e)
            return self._send(200, {"ok": ok, "msg": msg, "bots": bots_view()})
        m = re.match(r"^/api/(\w+)$", path)
        if m and m.group(1) in ACTIONS:
            with LOCK:
                try:
                    ok, msg = ACTIONS[m.group(1)]()
                except Exception as e:  # noqa: BLE001
                    ok, msg = False, repr(e)
            # le jeton de la signature en attente : seule la page qui l'a demandée la fera signer
            return self._send(200, {"ok": ok, "msg": msg, "pending_token": (S.get("pending") or {}).get("token")})
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    print(f"\n  PORTE DE SORTIE — http://127.0.0.1:{PORT}\n")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
