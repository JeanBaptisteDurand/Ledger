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

# Le reseau : « fork » (anvil, un fork de Base epingle, des comptes de test, des credits fictifs — la demo) ou
# « live » (un vrai RPC : Base Sepolia d'abord, Base ensuite ; PDS_DEPLOYER_KEY et PDS_AGENT_KEY a toi ; rien n'est
# credite, le porteur depose depuis sa Ledger). Le reste du code est le meme.
NETWORK = os.environ.get("PDS_NETWORK", "fork")
LIVE = NETWORK == "live"
ANVIL = os.environ.get("ANVIL_URL") or (BASE_RPC if LIVE else "http://127.0.0.1:8545")
if LIVE:
    os.environ["ANVIL_URL"] = ANVIL                 # les bots parlent a la meme chaine
    os.environ["PDS_NO_COUNTERFACTUAL"] = "1"       # anvil_setCode n'existe pas sur un vrai noeud
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
DEPLOYER_KEY = os.environ.get("PDS_DEPLOYER_KEY") if LIVE else "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # anvil #0
AGENT_KEY = os.environ.get("PDS_AGENT_KEY") if LIVE else "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"  # anvil #1
AGENT = os.environ.get("PDS_AGENT_ADDRESS") if LIVE else "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
FUND_VAULT = (not LIVE) and os.environ.get("PDS_FUND_VAULT", "1") == "1"   # le raccourci de banc : 5 WETH au coffre

BUY_EXC_SIG = (
    "buyUnderException((address,address,uint256,uint16,uint64,uint256),bytes,"
    "(address,address,bytes32,uint256,uint16,uint64,uint256),bytes,(address,address,uint24,int24,address),uint256)"
)
ENTER_EXC_SIG = (
    "enterVaultUnderException((address,address,uint256,uint16,uint64,uint256),bytes,"
    "(address,address,bytes32,uint256,uint16,uint64,uint256),bytes,address,uint256,address)"
)

BASE_RPC = os.environ.get("BASE_RPC_URL") or next(
    (l.split("=", 1)[1].strip() for l in ((TARE / ".env").read_text().splitlines() if (TARE / ".env").exists() else [])
     if l.startswith("BASE_RPC_URL=")),
    "",
)  # absent : le banc demarre quand meme, et l'ouverture de session dit « BASE_RPC_URL introuvable »

# ------------------------------------------------------------------ l'état : le banc, et un état par compte

# Ce qui est commun à tout le monde : le fork, l'émulateur, les briques installées, le Key Ring de l'opérateur.
G = {"anvil": False, "speculos": False, "ledger_stack": signers.stack_versions(), "ring": None,
     "network": NETWORK, "chain_id": None, "fork_block": None if LIVE else int(FORK_BLOCK)}
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
        "owner": None, "vault": None, "weth": "0", "owner_eth": "0", "deployer": None, "deploy_nonce": None,
        "chat": [], "proposal": None,
        "signing": None,            # "mandate" | "exception" | "deposit" | "withdraw" | None
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
                             "kind": r.get("kind", "pool"), "exit_bps": r["exit_probe"]["loss_bps"], "tick": "exc.",
                             "under_exception": True}
                            for r in st["journal"] if r.get("under_exception") and r["decision"] == "EXECUTED"]
                        refresh_positions()
                        rc3, bal = cast("call", WETH, "balanceOf(address)(uint256)", m["vault"])
                        if rc3 == 0:
                            st["weth"] = bal.strip().split()[0]
                        st["refused_escalations"] = [ev["pool_id"].lower() for ev in accounts.events(address, limit=10**6)
                                                     if ev.get("kind") == "exception_refused" and ev.get("pool_id")]
                        st["log"].append(f"session restored: vault {m['vault'][:10]}…, {len(st['journal'])} journal "
                                         f"lines, {len(st['positions'])} position(s) still held")
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
                b.update({"status": "stopped", "stopped": int(time.time()), "stop_reason": "no mandate when the bench restarted"})
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
              "exit_bps": r["exit_probe"]["loss_bps"], "tick": ("exc." if r.get("under_exception") else r["tick"]),
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
        return False, "BASE_RPC_URL not found"
    if LIVE and not G["anvil"]:
        if not BASE_RPC:
            return False, "BASE_RPC_URL not found"
        if not (DEPLOYER_KEY and AGENT_KEY and AGENT):
            return False, "live network: PDS_DEPLOYER_KEY, PDS_AGENT_KEY and PDS_AGENT_ADDRESS are needed"
        if cast("block-number")[0] != 0:
            return False, "the chain does not answer"
        G["anvil"] = True
    if not G["anvil"]:
        P["anvil"] = subprocess.Popen(
            ["anvil", "--fork-url", BASE_RPC, "--fork-block-number", FORK_BLOCK, "--silent"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            if cast("block-number")[0] == 0:
                break
            time.sleep(0.5)
        else:
            return False, "anvil did not start"
        G["anvil"] = True
        say(f"anvil: Base fork at block {FORK_BLOCK}")
    if not G["speculos"]:
        rc, out = run([str(ROOT / "ledger" / "speculos.sh"), "up"])
        if rc != 0:
            return False, "Speculos : " + out[-300:]
        G["speculos"] = True
        say("Speculos: a Ledger Flex, Ethereum app 1.22.4 built with the test keys")

    rc, cid = cast("chain-id")
    if rc == 0 and cid.strip().isdigit():
        G["chain_id"] = int(cid.strip())
        import sign_mandate as _sm
        _sm.CHAIN_ID = G["chain_id"]
        for filt in (_sm.FILTERS, _sm.EXCEPTION_FILTERS, _sm.WITHDRAW_FILTERS):
            for tok in filt["tokens"]:
                tok["chain_id"] = G["chain_id"]
        if LIVE:
            say(f"live network: chain {G['chain_id']}, nothing is credited, the funds come from your Ledger")
    if not S["address"]:
        return False, "sign in first: your Ledger in the browser (Sign-In with Ethereum), or the bench device"
    if S["signer"] == "browser":
        S["owner"] = S["address"]
        say(f"the holder's account, proven by a signature on their Ledger: {S['owner']}")
    else:
        import sign_mandate as sm
        sm.URL = SPECULOS
        dev = sm.device_address()
        if dev.lower() != S["address"].lower():
            return False, f"the plugged device ({dev[:10]}…) is not the signed-in account ({S['address'][:10]}…)"
        S["owner"] = dev
        say(f"account read on the device: {S['owner']}")

    rc, nb = cast("nonce", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
    deploy_nonce = int(nb.strip() or 0)
    rc, out = run(["forge", "create", "src/ExitVault.sol:ExitVault", "--rpc-url", ANVIL,
                   "--private-key", DEPLOYER_KEY, "--broadcast",
                   "--constructor-args", S["owner"], POOL_MANAGER], cwd=ROOT / "contracts")
    m = re.search(r"Deployed to:\s*(0x[0-9a-fA-F]{40})", out)
    if not m:
        return False, "deployment: " + out[-400:]
    S["vault"] = m.group(1)
    jpath().write_text("")   # nouvelle session, nouveau journal (le compte, lui, garde son historique)
    S["journal"] = []
    S["positions"], S["escalation"], S["exception_buys"], S["watch"] = [], None, [], None
    accounts.save_profile(S["address"], vault=S["vault"], vaults=list({*json.loads(accounts.paths(S["address"])["profile"].read_text()).get("vaults", []), S["vault"]}))
    event("session", vault=S["vault"], signer=S["signer"])
    S["deployer"] = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    S["deploy_nonce"] = deploy_nonce
    say(f"vault deployed in this account's name: {S['vault']}")

    # Les descripteurs de clear signing de CE coffre (mandat, dérogation), compilés et signés ici même
    # avec la clé de test : c'est ce que notre context module servira au Signer Kit.
    try:
        S["descriptors"] = {k: str(signers.descriptor_path(k, S["vault"])) for k in ("mandate", "exception", "withdraw")}
        say("EIP-712 descriptors built for this vault (mandate: 5 filters, exception: 6, withdrawal: 4), signed with cal.pem")
    except Exception as e:  # noqa: BLE001
        say(f"descriptors: {e}; the Python path is still available")
        S["signer"] = "python"
    G["ring"] = walletcli.ring_status()
    if G["ring"].get("initialised"):
        say("Ledger Key Ring: initialised on this machine (the MCP key can be sealed)")
    else:
        say("Ledger Key Ring: not initialised here (`wallet-cli ring init` needs a Flex over USB)")

    if FUND_VAULT:
        cast("send", WETH, "deposit()", "--value", "5ether", key=DEPLOYER_KEY)
        cast("send", WETH, "transfer(address,uint256)", S["vault"], str(5 * 10**18), key=DEPLOYER_KEY)
        say("vault funded with 5 WETH, a bench shortcut: fictional money from an anvil account")
    if not LIVE:
        # et le porteur lui-meme recoit 5 ETH fictifs : c'est LUI qui depose dans son coffre, depuis sa Ledger
        cast("rpc", "anvil_setBalance", S["owner"], hex(5 * 10**18))
        say("your address received 5 fictional ETH (fork): deposit into your vault from your Ledger")
    refresh_funds()
    return True, "ready"


def refresh_funds() -> None:
    """Le WETH du coffre et l'ETH du porteur, relus sur la chaine."""
    if S["vault"]:
        rc, bal = cast("call", WETH, "balanceOf(address)(uint256)", S["vault"])
        S["weth"] = bal.strip().split()[0] if rc == 0 else S["weth"]
    if S["owner"]:
        rc, bal = cast("balance", S["owner"])
        S["owner_eth"] = bal.strip().split()[0] if rc == 0 else S["owner_eth"]


def _wei(x) -> int:
    v = float(str(x).replace(",", "."))
    if not (0 < v <= 1000):
        raise ValueError("montant")
    return int(round(v * 10**18))


def a_deposit(amount_eth) -> tuple[bool, str]:
    """Le depot : un envoi d'ETH du porteur a son coffre, que SA Ledger signe dans la page. Le banc ne prepare
    que l'enveloppe (nonce, frais, gaz) ; l'appareil affiche le montant et l'adresse du coffre, comme pour
    n'importe quel envoi. Le coffre le garde en WETH."""
    if not S["vault"]:
        return False, "a session is needed"
    if S["signer"] != "browser":
        return False, "the deposit is signed in this page: choose “My Ledger · this browser” at the door"
    if S["signing"] or S["pending"]:
        return False, "a signature is already waiting"
    try:
        wei = _wei(amount_eth)
    except ValueError:
        return False, "an amount in ETH, between 0 and 1000"
    rc, cid = cast("chain-id")
    rc2, nonce = cast("nonce", S["owner"])
    rc3, gp = cast("gas-price")
    if rc or rc2 or rc3:
        return False, "the chain does not answer"
    gas_price = int(gp.strip() or 0) or 10**6
    tx = {"chainId": int(cid.strip()), "nonce": int(nonce.strip()), "to": S["vault"], "value": str(wei), "data": "0x",
          "gas": 120000, "maxFeePerGas": str(gas_price * 2 + 10**6), "maxPriorityFeePerGas": str(min(gas_price, 10**6))}
    S["pending"] = {"kind": "deposit", "tx": tx, "amount_wei": str(wei), "token": secrets.token_urlsafe(8), "ts": int(time.time())}
    S["signing"] = "deposit"
    return True, "your Ledger, in your browser: read the amount and the vault's address, then press “Hold to sign”"


def _finish_deposit(raw: str) -> None:
    """La transaction signee revient de la page : on la publie, on attend le recu."""
    pend_amount = (S.get("_last_pending") or {}).get("amount_wei", "?")
    rc, out = cast("publish", raw)
    m = re.search(r"\"?transactionHash\"?\s*[:=]?\s*\"?(0x[0-9a-fA-F]{64})", out) or re.search(r"(0x[0-9a-fA-F]{64})", out)
    if rc != 0 or not m:
        say(f"deposit: the chain refused the transaction: {out[-160:]}")
        print(f"[deposit] publish rc={rc} : {out[-400:]}", file=sys.stderr, flush=True)
        return
    txh = m.group(1)
    rc2, rcpt = cast("receipt", txh, "--json")
    try:
        ok = rc2 == 0 and int(json.loads(rcpt).get("status", "0x0"), 16) == 1
    except (ValueError, AttributeError):
        ok = False
    refresh_funds()
    if ok:
        event("deposited", amount_wei=pend_amount, tx=txh)
        say(f"deposit signed on your Ledger and confirmed: {int(pend_amount) / 1e18 if pend_amount != '?' else '?'} ETH, "
            f"kept as WETH in your vault ({txh[:10]}…)")
    else:
        say(f"deposit: transaction published but failed ({txh[:10]}…)")


def a_withdraw(amount) -> tuple[bool, str]:
    """Le retrait : le porteur autorise, par une signature EIP-712 lue en clair, UN montant vers SON adresse,
    valable une heure, une fois. Le banc l'execute (il paie le gaz) ; il ne peut rien y changer."""
    if not S["vault"]:
        return False, "a session is needed"
    if S["signing"] or S["pending"]:
        return False, "a signature is already waiting"
    refresh_funds()
    have = int(S["weth"]) if str(S["weth"]).isdigit() else 0
    try:
        wei = have if str(amount).strip() in ("", "all", "tout") else _wei(amount)
    except ValueError:
        return False, "an amount in WETH, or “all”"
    if wei <= 0 or wei > have:
        return False, f"the vault holds {have / 1e18:.4f} WETH"
    import sign_mandate as sm
    sm.URL = SPECULOS
    expiry, nonce = int(time.time()) + 3600, int(time.time())
    data = sm.build_withdrawal(S["vault"], WETH, wei, S["owner"], expiry, nonce)
    try:
        S["descriptors"]["withdraw"] = str(signers.descriptor_path("withdraw", S["vault"]))
    except Exception as e:  # noqa: BLE001
        say(f"withdrawal descriptor: {e}")
    if S["signer"] == "browser":
        S["pending"] = {"kind": "withdraw", "typedData": data, "amount_wei": str(wei), "expiry": expiry, "nonce": nonce,
                        "token": secrets.token_urlsafe(8), "ts": int(time.time())}
        S["signing"] = "withdraw"
        return True, "your Ledger, in your browser: read the amount and the recipient, then press “Hold to sign”"

    st = current()

    def worker():
        bind(st)
        try:
            r = signers.sign("withdraw", data, sm.WITHDRAW_FILTERS, S["signer"], speculos=SPECULOS)
            _finish_withdraw(r["signature"], wei, expiry, nonce)
        except Exception as e:  # noqa: BLE001
            say(f"withdrawal refused or failed: {e}")
        finally:
            S["signing"] = None

    S["signing"] = "withdraw"
    threading.Thread(target=worker, daemon=True).start()
    return True, "the device is waiting: read the amount and the recipient, then press “Hold to sign”"


WITHDRAW_SIG = "withdrawWithAuthorization((address,uint256,address,uint64,uint256),bytes)"


def _finish_withdraw(sig: str, wei: int, expiry: int, nonce: int) -> None:
    rc, out = cast("send", S["vault"], WITHDRAW_SIG, tup([WETH, wei, S["owner"], expiry, nonce]), sig, key=AGENT_KEY)
    ok = rc == 0 and re.search(r"status\s+1", out)
    refresh_funds()
    if ok:
        event("withdrawn", amount_wei=str(wei))
        say(f"withdrawal authorised on your Ledger and executed: {wei / 1e18:.4f} WETH returned to your address")
    else:
        say(f"withdrawal: the vault refused: {out[-160:]}")


def a_chat(prompt: str):
    S["chat"].append({"role": "user", "text": prompt})
    prop = strategist.propose(prompt)
    S["proposal"] = prop
    S["chat"].append({"role": "assistant", "text": prop["rationale"], "warning": prop["warning"],
                      "source": prop.get("_source", "")})
    say("strategy proposed: to read and approve on the device")
    event("strategy", prompt=prompt[:200], max_round_trip_loss_bps=prop["max_round_trip_loss_bps"], budget_weth=prop["budget_weth"])
    return True, "ok"


def _mandate_typed(p: dict):
    import sign_mandate as sm

    expiry = int(time.time()) + int(p["days"]) * 86400
    return sm.build_mandate(S["vault"], AGENT, int(p["budget_wei"]), int(p["max_round_trip_loss_bps"]), expiry, 1), expiry


def _finish_mandate(sig: str, owner: str | None, signer: str, expiry: int, report=None):
    p = S["proposal"]
    S["last_report"] = report
    S["mandate"] = {"owner": owner or S["owner"], "vault": S["vault"], "chainId": G.get("chain_id") or 8453, "signature": sig,
                    "signer": signer, "deployer": S.get("deployer"), "deployNonce": S.get("deploy_nonce"),
                    "mandate": {"agent": AGENT, "budgetToken": WETH, "budgetAmount": p["budget_wei"],
                                "maxRoundTripLossBps": int(p["max_round_trip_loss_bps"]), "expiry": expiry, "nonce": 1}}
    mpath().write_text(json.dumps(S["mandate"], indent=1))
    S["signed"] = True
    event("mandate_signed", signer=signer, vault=S["vault"], max_round_trip_loss_bps=int(p["max_round_trip_loss_bps"]),
          budget_wei=p["budget_wei"], expiry=expiry)
    via = {"dmk": "Signer Kit + DMK, our context module", "python": "the official client, in direct APDUs",
           "browser": "Signer Kit in the holder's browser, on their own Ledger"}.get(signer, signer)
    say(f"mandate signed on the device ({via}): the agent can work alone within these bounds")
    if report:
        say(f"Signer Kit report: isBlindSign={report.get('isBlindSign')} · "
            f"{(report.get('ethContext') or {}).get('clearSigningType')} ; this report would go to Ledger, here it stays")


def a_sign_mandate():
    if not (S["vault"] and S["proposal"]):
        return False, "an account and a strategy are needed"
    import sign_mandate as sm
    sm.URL = SPECULOS
    data, expiry = _mandate_typed(S["proposal"])

    if S["signer"] == "browser":
        # la Ledger est chez le porteur : la page fait signer (Signer Kit + WebHID) et nous rend la signature
        S["pending"] = {"kind": "mandate", "typedData": data, "expiry": expiry, "token": secrets.token_urlsafe(8), "ts": int(time.time())}
        S["signing"] = "mandate"
        return True, "your Ledger, in your browser: read the fields, then press “Hold to sign”"

    st = current()

    def worker():
        bind(st)
        try:
            r = signers.sign("mandate", data, sm.FILTERS, S["signer"], speculos=SPECULOS)
            _finish_mandate(r["signature"], r.get("owner"), r["signer"], expiry, r.get("report"))
        except Exception as e:  # noqa: BLE001
            say(f"mandate refused or failed: {e}")
        finally:
            S["signing"] = None

    S["signing"] = "mandate"
    threading.Thread(target=worker, daemon=True).start()
    return True, "the device is waiting: read the fields, then press “Hold to sign”"

# ------------------------------------------------------------------ la Flex émulée, partagée : un écran abandonné
#
# Une seule Flex émulée sert tous les visiteurs. Une signature abandonnée en pleine revue (un visiteur parti avant
# « Hold to sign ») la laisserait attendre pour toujours, et toute autre connexion échouerait. Un écran de revue qui n'a
# pas changé, sans un doigt ni une APDU passés par le banc, pendant STALE_SCREEN_S secondes, est refusé sur l'appareil,
# comme un porteur le ferait. La vraie Ledger d'un visiteur n'est jamais touchée : seul l'émulateur l'est.
STALE_SCREEN_S = int(os.environ.get("PDS_STALE_SCREEN_S", "180"))
DEVICE_SEEN = {"screen": "", "since": time.time(), "touched": time.time()}


def device_touched() -> None:
    DEVICE_SEEN["touched"] = time.time()


def _screen_events() -> list[dict]:
    try:
        return requests.get(f"{SPECULOS}/events?currentscreenonly=true", timeout=2).json().get("events", [])
    except Exception:  # noqa: BLE001
        return []


def device_waiting(events: list[dict] | None = None) -> str | None:
    """The screen's text when the emulated Flex waits for a holder (a review, a signature, a prompt), else None."""
    ev = _screen_events() if events is None else events
    txt = " | ".join(e.get("text", "") for e in ev if e.get("text"))
    low = txt.lower()
    waiting = ("hold to sign" in low or "swipe to review" in low or "yes, reject" in low or "maybe later" in low
               or ("reject" in low and " of " in low))
    return txt if waiting else None


def _tap(e: dict) -> None:
    x, y = int(e["x"] + e.get("w", 40) / 2), int(e["y"] + e.get("h", 20) / 2)
    for action in ("press", "release"):
        requests.post(f"{SPECULOS}/finger", json={"action": action, "x": x, "y": y}, timeout=3)
        time.sleep(0.2)


def stale_screen_watchdog() -> None:
    while True:
        time.sleep(5)
        ev = _screen_events()
        txt = " | ".join(e.get("text", "") for e in ev if e.get("text"))
        now = time.time()
        if txt != DEVICE_SEEN["screen"]:
            DEVICE_SEEN.update(screen=txt, since=now)
            continue
        if not device_waiting(ev) or now - DEVICE_SEEN["since"] < STALE_SCREEN_S or now - DEVICE_SEEN["touched"] < STALE_SCREEN_S:
            continue
        print(f"[watchdog] the emulated Flex waited {int(now - DEVICE_SEEN['since'])} s on « {txt[:90]} » with no one "
              "touching it: rejected on the device", file=sys.stderr, flush=True)
        for _ in range(6):   # « Maybe later » if a prompt waits, then Reject, then « Yes, reject »
            ev = _screen_events()
            pick = lambda word: next((e for e in ev if (e.get("text") or "").strip().lower() == word), None)  # noqa: E731
            hit = pick("yes, reject") or pick("reject") or pick("maybe later")
            if not hit:
                break
            try:
                _tap(hit)
            except Exception:  # noqa: BLE001
                break
            time.sleep(1.0)
        DEVICE_SEEN.update(screen="", since=time.time(), touched=time.time())


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
        say(f"bot “{b['name']}”, round {b['rounds'] + 1} ({'ERC-4626 vaults, Morpho' if vaults_mode else 'Uniswap v4 pools'}): "
            f"{b['ticks']} slices of {int(b['slice_wei']) / 1e18:.4f} WETH")
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
            say(f"[{b['name']}] a purchase is out of bounds: it waits for your decision on the device"
                + (f" ({len(S['escalation_queue'])} more waiting)" if S["escalation_queue"] else ""))
            _notify(S["escalation"])
        # fin naturelle : un seul tour demande, budget epuise, mandat echu
        budget = int(S["mandate"]["mandate"]["budgetAmount"])
        spent = int((S["spent"] or "0").split()[0]) if str(S["spent"]).strip() else 0
        expired = int(S["mandate"]["mandate"]["expiry"]) <= time.time()
        if b["interval_s"] == 0:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "a single round was asked"})
        elif not new:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "nothing new left to try in this universe"})
        elif spent >= budget:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "the mandate's budget is spent"})
        elif expired:
            b.update({"status": "done", "stopped": int(time.time()), "stop_reason": "the mandate has expired"})
        if b["status"] == "done":
            event("bot_done", bot=b["name"], reason=b["stop_reason"], rounds=b["rounds"])
            say(f"bot “{b['name']}”: done, {b['stop_reason']}")
    except Exception as e:  # noqa: BLE001
        say(f"[{b['name']}] agent: {e}")
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
        return False, "a signed mandate comes first: the bots work inside it"
    universe = body.get("universe") or S["universe"]
    if universe not in ("pools", "vaults"):
        return False, f"univers inconnu : {universe}"
    try:
        ticks = int(body.get("ticks") or (S["proposal"] or {}).get("ticks") or 3)
        interval = int(body.get("interval_s") or 0)
        slice_wei = int(float(body["slice_weth"]) * 1e18) if body.get("slice_weth") else None
    except (TypeError, ValueError):
        return False, "invalid parameters"
    b = new_bot(body.get("name") or "", universe, ticks, interval, slice_wei)
    S["bots"].append(b)
    save_bots()
    event("bot_added", bot=b["name"], universe=universe, ticks=b["ticks"], interval_s=b["interval_s"])
    say(f"bot “{b['name']}” added: {'ERC-4626 vaults' if universe == 'vaults' else 'v4 pools'}, {b['ticks']} slices per round, "
        + ("a single round" if b["interval_s"] == 0 else f"a round every {b['interval_s']} s"))
    ensure_scheduler(current())
    return True, f"bot “{b['name']}” launched"


def a_bot_stop(body: dict | None = None):
    body = body or {}
    b = next((x for x in S["bots"] if x["id"] == body.get("id")), None)
    if not b:
        return False, "bot inconnu"
    if b["status"] != "running":
        return False, "this bot is no longer running"
    b.update({"status": "stopped", "stopped": int(time.time()), "stop_reason": "stopped by the holder"})
    proc = BOT_PROC.get(b["id"])
    if proc and proc.poll() is None:
        proc.terminate()      # le tour en cours s'arrete la ; ce qui est achete reste dans le coffre, sous le mandat
    save_bots()
    event("bot_stopped", bot=b["name"], rounds=b["rounds"])
    say(f"bot “{b['name']}” stopped by the holder after {b['rounds']} round(s); its positions stay in the vault")
    return True, f"bot “{b['name']}” stopped"


def a_bot_restart(body: dict | None = None):
    body = body or {}
    b = next((x for x in S["bots"] if x["id"] == body.get("id")), None)
    if not b:
        return False, "bot inconnu"
    if not S["signed"]:
        return False, "a signed mandate is needed"
    if b["status"] == "running":
        return False, "this bot is already running"
    b.update({"status": "running", "started": int(time.time()), "stopped": None, "stop_reason": None, "next_run": time.time()})
    if b["interval_s"] == 0:
        b["interval_s"] = 60   # relancer un bot d'un tour, c'est le faire tourner
    save_bots()
    event("bot_restarted", bot=b["name"])
    ensure_scheduler(current())
    return True, f"bot “{b['name']}” restarted"


def a_run():
    """« Lancer un tour » : un bot d'un seul tour, dans l'univers choisi — le geste simple de la demo."""
    if not S["signed"]:
        return False, "a signed mandate comes first"
    p = S["proposal"] or {}
    label = "coffres" if S["universe"] == "vaults" else "pools"
    n = 1 + sum(1 for b in S["bots"] if b["name"].startswith("single round"))
    return a_bot_add({"name": f"single round {n} · {label}", "universe": S["universe"], "ticks": p.get("ticks") or 3, "interval_s": 0})


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
        raise RuntimeError("position hash: " + kh[-200:])
    return is_vault, key, kh.strip().split()[0]


def _finish_exception(e: dict, sig: str, is_vault: bool, key, pool_hash: str, expiry: int, nonce: int, report=None):
    S["last_report"] = report
    say("exception signed on the device: the agent retries, once")
    exc = tup([AGENT, WETH, pool_hash, e["amount_in"], e["seen_exit_bps"], expiry, nonce])
    if is_vault:
        rc2, out = cast("send", S["vault"], ENTER_EXC_SIG, mandate_tuple(), S["mandate"]["signature"],
                        exc, sig, e["vault"], e["amount_in"], e["ref_holder"], key=AGENT_KEY)
    else:
        rc2, out = cast("send", S["vault"], BUY_EXC_SIG, mandate_tuple(), S["mandate"]["signature"],
                        exc, sig, key, e["amount_in"], key=AGENT_KEY)
    if rc2 == 0 and re.search(r"status\s+1", out):
        say(f"PURCHASE AUTHORISED under exception: exit {e['seen_exit_bps']} bps, accepted")
        S["exception_buys"].append({"pool": e["pool_id"], "token": e["currency1"], "name": e.get("name"),
                                    "kind": e.get("kind", "pool"), "exit_bps": e["seen_exit_bps"], "tick": "exc.",
                                    "under_exception": True, "bot": (e.get("bot") or {}).get("name")})
        # la position existe : elle entre au journal, au meme format que les tours de l'agent, pour que la
        # surveillance (watch.py) et le MCP la voient — sans le journal, une position acquise sous derogation
        # serait invisible a la resonde
        journal = read_journal()
        entry = {
            "ts": int(time.time()), "tick": (max([r["tick"] for r in journal if isinstance(r.get("tick"), int)] or [0]) + 1),
            "kind": e.get("kind", "pool"), "mode": "exception", "under_exception": True,
            "strategy": {"name": "derogation", "objective": "a human decision, read and signed on the device",
                         "slice_wei": str(e["amount_in"])},
            "shortlist": [],
            "pick": {"pool_id": e["pool_id"], "currency1": e["currency1"], "hook": e.get("hook"), "fee": e.get("fee", 0),
                     "tickSpacing": e.get("tickSpacing", 0), "name": e.get("name"), "ref_holder": e.get("ref_holder"),
                     "entry_bps_median": 0.0, "depth_sizes": 0, "registry": {"present": None}},
            "why": (f"the vault had refused ({e['seen_exit_bps']} bps exit, mandate at {e['mandate_allows_bps']}); "
                    "the holder read this number on their device and signed a single-use exception"),
            "exit_probe": {"loss_bps": int(e["seen_exit_bps"]), "exit_blocked": False,
                           "source": "the number read and signed on the device (ExitWorseThanSeen if the exit got worse)"},
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
        say("the vault refused the exception: " + (out.strip()[-200:] or "?"))


def _next_escalation() -> None:
    """La demande courante est tranchée : la suivante, s'il y en a une, prend sa place."""
    S["escalation"] = S["escalation_queue"].pop(0) if S["escalation_queue"] else None
    if S["escalation"]:
        say(f"next request: {S['escalation'].get('question')}")
        _notify(S["escalation"])


def a_escalate_no():
    """Le porteur laisse le refus du coffre : la demande est close, sans signature."""
    e = S["escalation"]
    if not e:
        return False, "no request waiting"
    S["refused_escalations"].append(e["pool_id"].lower())
    event("exception_refused", position=e.get("name") or e["pool_id"], pool_id=e["pool_id"], seen_exit_bps=e.get("seen_exit_bps"),
          bot=(e.get("bot") or {}).get("name"))
    say(f"the holder leaves it refused: {e.get('name') or e['pool_id'][:12]} ({e.get('seen_exit_bps')} bps) stays out of the vault")
    _next_escalation()
    return True, "left refused"


def a_escalate():
    """Le porteur lit sur son Flex le coût réel de la sortie, et signe — ou non — une dérogation."""
    e = S["escalation"]
    if not e:
        return False, "no request waiting"
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
        return True, "your Ledger, in your browser: read the exit cost, then sign, or refuse"

    st = current()

    def worker():
        bind(st)
        try:
            r = signers.sign("exception", data, sm.EXCEPTION_FILTERS, S["signer"], speculos=SPECULOS)
            _finish_exception(e, r["signature"], is_vault, key, pool_hash, expiry, nonce, r.get("report"))
        except Exception as ex:  # noqa: BLE001
            say(f"exception: {ex}")
        finally:
            S["signing"] = None

    S["signing"] = "exception"
    threading.Thread(target=worker, daemon=True).start()
    return True, "the device shows the exit cost: your call"


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
            say("the holder is notified (webhook): they can come, read the number and decide")
        except Exception as ex:  # noqa: BLE001
            say(f"notification: {ex}")

def a_watch():
    """Resonde les positions detenues : la sortie s'est-elle refermee depuis l'achat ?"""
    if not S["signed"]:
        return False, "a signed mandate is needed"
    if S["watching"]:
        return False, "a watch is already running"

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
                say("watch: no position held")
            else:
                say(f"watch: {len(rows)} position(s), {len(worse)} whose exit has closed"
                    + (f", {len(sold)} sold" if sold else ""))
            event("watch", positions=len(rows), worse=len(worse), sold=len(sold), sell_if=sell_if)
            if sold:
                refresh_positions()
        except Exception as e:  # noqa: BLE001
            say(f"watch: {e}")
        finally:
            S["watching"] = False

    S["watching"] = True
    threading.Thread(target=worker, kwargs={"sell_if": S.pop("_sell_if", None)}, daemon=True).start()
    return True, "the probe is free: run it as often as you like"


def a_watch_sell():
    """Meme chose, mais on SORT de ce qui a trop empire. Seuil = le mandat + une marge."""
    if not S["signed"]:
        return False, "a signed mandate is needed"
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
    return True, "account reset; the bench keeps running"


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

    def _mcp(self, body):
        """Le MCP en lecture seule servi en HTTP (MCP Streamable HTTP, réponses JSON) : la clé du compte, en
        `Authorization: Bearer`, ouvre les données de CE compte. Le même pds_mcp.py que l'analyste, lancé avec
        l'environnement du compte : un agent branché d'ailleurs a les dix outils, et rien pour signer."""
        m = re.match(r"Bearer\s+(\S+)", self.headers.get("Authorization", "") or "")
        addr = accounts.address_for_key(m.group(1)) if m else None
        if not addr:
            return self._send(403, {"jsonrpc": "2.0", "id": None, "error": {
                "code": -32001, "message": "unknown key: send Authorization: Bearer <your MCP key, on the account page>"}})
        msgs = [x for x in (body if isinstance(body, list) else [body]) if isinstance(x, dict)]
        calls = [x for x in msgs if "id" in x and x.get("method")]
        if not calls:  # des notifications seules (notifications/initialized) : rien à rendre
            self.send_response(202)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        p = accounts.paths(addr)
        env = {**os.environ, "PDS_ACCOUNT": addr, "PDS_MCP_KEY": accounts.user_key(addr),
               "PDS_JOURNAL": str(p["journal"]), "PDS_MANDATE": str(p["mandate"]), "PDS_BOTS": str(p["dir"] / "bots.json"),
               "ANVIL_URL": os.environ.get("ANVIL_URL", "http://127.0.0.1:8545")}
        try:
            r = subprocess.run([sys.executable, str(ROOT / "mcp" / "pds_mcp.py")], env=env, capture_output=True, text=True,
                               input="".join(json.dumps(c) + "\n" for c in calls), timeout=120)
            out = [json.loads(line) for line in r.stdout.splitlines() if line.strip()]
        except (subprocess.TimeoutExpired, ValueError) as e:
            return self._send(200, {"jsonrpc": "2.0", "id": calls[0].get("id"), "error": {"code": -32603, "message": repr(e)}})
        for c, o in zip(calls, out):   # la version du protocole : celle que le client demande, s'il en demande une connue
            asked = (c.get("params") or {}).get("protocolVersion")
            if c.get("method") == "initialize" and asked in ("2025-03-26", "2025-06-18", "2025-11-25") and "result" in o:
                o["result"]["protocolVersion"] = asked
        return self._send(200, out if isinstance(body, list) else (out[0] if out else {}))

    def do_GET(self):
        self._bind()
        path = urlparse(self.path).path
        if path == "/api/mcp":
            return self._send(405, {"error": "the MCP answers POST: JSON-RPC, MCP Streamable HTTP"})
        if path == "/schema.html":
            return self._send(200, (Path(__file__).parent / "schema.html").read_bytes(), "text/html; charset=utf-8")
        if path == "/api/account":
            if not S["address"]:
                return self._send(200, {"ok": False, "msg": "no account: sign in"})
            reveal = parse_qs(urlparse(self.path).query).get("reveal", ["0"])[0] == "1"
            pth = accounts.paths(S["address"])
            prof = json.loads(pth["profile"].read_text()) if pth["profile"].exists() else {"address": S["address"]}
            key = accounts.user_key(S["address"])
            return self._send(200, {"ok": True, "profile": prof, "events": accounts.events(S["address"], 80),
                                    "mcp_key": key if reveal else (key[:4] + "…" + key[-4:]),
                                    "mcp_config": accounts.mcp_config(S["address"], reveal),
                                    "dir": str(pth["dir"]), "key_note": (
                                        "derived from the master secret by HMAC(master, address), never stored; the master "
                                        "secret is the one scripts/ring-seal.sh seals in the Ledger Key Ring")})
        if path.startswith("/dist/") and ".." not in path:
            f = Path(__file__).parent / path.lstrip("/")
            if f.is_file():
                return self._send(200, f.read_bytes(), "application/javascript; charset=utf-8")
            return self._send(404, {"error": "bundle missing: cd ledger/dmk && npm run build:web"})
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
            if kind not in ("mandate", "exception", "withdraw") or not S["vault"]:
                return self._send(400, {"error": "kind=mandate|exception|withdraw, and an open session"})
            return self._send(200, Path(signers.descriptor_path(kind, S["vault"])).read_bytes())
        if path == "/api/siwe/nonce":
            S["siwe_nonce"] = secrets.token_hex(4)  # court : le message SIWE doit tenir dans une APDU (Signer Kit, FEEDBACK § 8)
            return self._send(200, {"nonce": S["siwe_nonce"], "domain": self.headers.get("Host", f"127.0.0.1:{PORT}"),
                                    "chainId": G.get("chain_id") or 8453, "statement": "Net-Out: I sign in with my Ledger."})
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
            if S["vault"] and time.time() - S.get("_funds_ts", 0) > 5:
                S["_funds_ts"] = time.time()
                try:
                    refresh_funds()
                except Exception:  # noqa: BLE001
                    pass
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
        if path == "/api/mcp":
            return self._mcp(body)
        if path == "/api/login_device":
            # le chemin du banc : l'appareil branché (ou émulé) dit qui est le compte
            if not G["speculos"]:
                rc, out = run([str(ROOT / "ledger" / "speculos.sh"), "up"])
                if rc != 0:
                    return self._send(200, {"ok": False, "msg": "Speculos: " + out[-200:]})
                G["speculos"] = True
            busy = device_waiting()
            if busy:
                return self._send(200, {"ok": False, "msg": f"The emulated Flex is busy: a signature waits on its screen ({busy[:60]}). "
                                        f"Finish or reject it on the Flex; an abandoned screen is rejected after "
                                        f"{f'{STALE_SCREEN_S // 60} minutes' if STALE_SCREEN_S >= 120 else f'{STALE_SCREEN_S} s'}."})
            import sign_mandate as sm
            sm.URL = SPECULOS
            try:
                addr = sm.device_address()
            except Exception as e:  # noqa: BLE001
                return self._send(200, {"ok": False, "msg": f"device: {e}"})
            with LOCK:
                cookie = self._login(addr, "the bench device (address read on the Ledger)")
                say(f"signed in: {S['address']}, address read on the device")
            return self._send(200, {"ok": True, "address": S["address"]}, cookie=cookie)
        if path == "/api/logout":
            m = re.search(r"pds_session=([A-Za-z0-9_\-]+)", self.headers.get("Cookie", "") or "")
            if m:
                SESSIONS.pop(m.group(1), None)
                accounts.save_sessions(SESSIONS)
            return self._send(200, {"ok": True}, cookie="pds_session=; Path=/; Max-Age=0")
        if path.startswith("/speculos/"):
            device_touched()
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
                return self._send(200, {"ok": False, "msg": "nonce missing or expired: ask /api/siwe/nonce again"})
            if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr) or addr.lower() not in msg.lower():
                return self._send(200, {"ok": False, "msg": "the address is not in the message"})
            p = subprocess.run(["cast", "wallet", "verify", "--address", addr, msg, sig], capture_output=True, text=True, timeout=60)
            if p.returncode != 0:
                return self._send(200, {"ok": False, "msg": "signature refused: " + (p.stderr or p.stdout).strip()[-160:]})
            with LOCK:
                S["siwe_nonce"] = None
                cookie = self._login(addr, "Sign-In with Ethereum (Ledger in the browser)")
                say(f"signed in: {addr}, proven by a signature on their Ledger (Sign-In with Ethereum)")
            return self._send(200, {"ok": True, "address": addr}, cookie=cookie)
        if path == "/api/signed":
            # la page a fait signer la Ledger du porteur : elle nous rend la signature (ou le refus)
            pend = S.get("pending")
            if not pend or pend["kind"] != body.get("kind"):
                return self._send(200, {"ok": False, "msg": "nothing of this kind to sign"})
            if body.get("error"):
                with LOCK:
                    S["pending"] = None
                    S["signing"] = None
                    err = str(body["error"])[:160]
                    say(f"{pend['kind']}: refused or failed on the holder's side: {err}")
                    print(f"[signed] {pend['kind']}: error on the holder's side: {err}", file=sys.stderr, flush=True)
                    if "InvalidStatusWord" in err or "6980" in err:
                        say("the Ethereum app may be stuck “signing”: on Speculos, "
                            "`ledger/speculos.sh up`; on a Flex, quit and reopen the app (FEEDBACK § 8)")
                return self._send(200, {"ok": True, "msg": "refusal noted"})
            if pend["kind"] == "deposit":
                raw = body.get("raw") or ""
                if not re.fullmatch(r"0x02[0-9a-fA-F]+", raw):
                    return self._send(200, {"ok": False, "msg": "malformed signed transaction"})
                with LOCK:
                    S["_last_pending"], S["pending"] = pend, None
                    try:
                        _finish_deposit(raw)
                    except Exception as e:  # noqa: BLE001
                        say(f"deposit: {e}")
                    finally:
                        S["signing"] = None
                return self._send(200, {"ok": True})
            sig = body.get("signature") or ""
            if not re.fullmatch(r"0x[0-9a-fA-F]{130}", sig):
                return self._send(200, {"ok": False, "msg": "malformed signature"})
            owner = body.get("owner") or S["owner"]
            if S["owner"] and owner.lower() != S["owner"].lower():
                return self._send(200, {"ok": False, "msg": f"signed by {owner[:10]}…, the session belongs to {S['owner'][:10]}…"})
            with LOCK:
                S["pending"] = None
                try:
                    if pend["kind"] == "mandate":
                        _finish_mandate(sig, owner, "browser", pend["expiry"], body.get("report"))
                    elif pend["kind"] == "withdraw":
                        _finish_withdraw(sig, int(pend["amount_wei"]), pend["expiry"], pend["nonce"])
                    else:
                        _finish_exception(pend["escalation"], sig, pend["is_vault"], pend["key"], pend["pool_hash"],
                                          pend["expiry"], pend["nonce"], body.get("report"))
                except Exception as e:  # noqa: BLE001
                    say(f"{pend['kind']}: {e}")
                finally:
                    S["signing"] = None
            return self._send(200, {"ok": True})
        if path == "/api/finger":
            device_touched()
            try:
                requests.post(f"{SPECULOS}/finger", json=body, timeout=5)
                return self._send(200, {"ok": True})
            except Exception as e:  # noqa: BLE001
                return self._send(200, {"ok": False, "error": str(e)})
        if path == "/api/deposit":
            with LOCK:
                ok, msg = a_deposit(body.get("amount_eth", ""))
            return self._send(200, {"ok": ok, "msg": msg, "pending_token": (S.get("pending") or {}).get("token")})
        if path == "/api/withdraw":
            with LOCK:
                ok, msg = a_withdraw(body.get("amount", ""))
            return self._send(200, {"ok": ok, "msg": msg, "pending_token": (S.get("pending") or {}).get("token")})
        if path == "/api/chat":
            with LOCK:
                ok, msg = a_chat(body.get("prompt", ""))
            return self._send(200, {"ok": ok, "msg": msg, "proposal": S["proposal"]})
        if path == "/api/universe":
            # l'univers de l'agent de demonstration : pools Uniswap v4, ou coffres ERC-4626 (Morpho)
            want = body.get("universe")
            if want not in ("pools", "vaults"):
                return self._send(200, {"ok": False, "msg": f"unknown universe: {want}"})
            with LOCK:
                S["universe"] = want
                say("the agent's universe: " + ("ERC-4626 vaults (Morpho, WETH, Base)" if want == "vaults" else "Uniswap v4 pools (WETH, Base)"))
            return self._send(200, {"ok": True, "universe": want})
        if path == "/api/analyze":
            # l'analyste : le VRAI agent — il repond par les outils du MCP en lecture seule, jamais de memoire
            q = (body.get("question") or "").strip()
            if not q:
                return self._send(200, {"ok": False, "msg": "ask a question"})
            if (S["analysis"] or {}).get("pending"):
                return self._send(200, {"ok": False, "msg": "the analyst is already working"})
            entry = {"question": q, "pending": True, "answer": "", "tools_used": [], "error": None, "ts": int(time.time())}
            history = [a for a in S["analyses"] if not a.get("pending") and a.get("answer")]
            S["analyses"].append(entry)
            S["analysis"] = entry
            say(f"analyst: “{q}”, querying the MCP")

            st = current()
            env = account_env()

            def worker():
                bind(st)
                sys.path.insert(0, str(ROOT / "agent"))
                import analyst
                try:
                    r = analyst.ask(q, history=history, env=env)
                    entry.update({**r, "question": q, "pending": False})
                    used = ", ".join(sorted({t["tool"] for t in r["tools_used"]})) or "no tool"
                    say(f"analyst: answered through {used}" + (f" — {r['error']}" if r["error"] else ""))
                    event("analysis", question=q[:200], tools=sorted({t["tool"] for t in r["tools_used"]}))
                except Exception as ex:  # noqa: BLE001
                    entry.update({"pending": False, "answer": "", "error": repr(ex)})
                    say(f"analyst: {ex}")

            threading.Thread(target=worker, daemon=True).start()
            return self._send(200, {"ok": True, "msg": "the analyst is querying the tools"})
        if path == "/api/signer":
            # le chemin vers l'appareil : « dmk » (Signer Kit de Ledger) ou « python » (client officiel)
            want = body.get("signer")
            if want not in (*signers.SIGNERS, "browser"):
                return self._send(200, {"ok": False, "msg": f"unknown signer: {want}"})
            if want == "dmk" and not signers.dmk_available():
                return self._send(200, {"ok": False, "msg": "Signer Kit missing: cd ledger/dmk && npm i"})
            with LOCK:
                S["signer"] = want
                say("signing path: " + {"dmk": "Signer Kit Ethereum 1.18.1 on DMK 1.9.1 (bench side)",
                                                "python": "app-ethereum's official client, direct APDUs",
                                                "browser": "Signer Kit in YOUR browser: your Ledger, at home"}[want])
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
    print(f"\n  NET-OUT — http://127.0.0.1:{PORT}\n")
    threading.Thread(target=stale_screen_watchdog, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
