#!/usr/bin/env python3
"""Le « porteur » automatique du banc : il approuve ce que l'appareil émulé lui présente (Maybe later, balayages,
Hold to sign, Reject transaction). Jamais contre un vrai appareil.

    python3 scripts/porteur.py [durée en s] [lenteur : secondes de lecture avant de signer]
"""
import requests, time, sys, json
U="http://127.0.0.1:5013"; T0=time.time(); LIMIT=float(sys.argv[1]) if len(sys.argv)>1 else 720
SLOW=float(sys.argv[2]) if len(sys.argv)>2 else 0  # un humain qui lit : attente avant de signer
REJECT=len(sys.argv)>3 and sys.argv[3]=="reject"  # un porteur qui refuse tout ce qu'on lui propose de signer
def ev():
    try: return requests.get(f"{U}/events?currentscreenonly=true", timeout=5).json()["events"]
    except Exception: return []
def tap(x,y,hold=0.2):
    requests.post(f"{U}/finger", json={"action":"press","x":x,"y":y}); time.sleep(hold)
    requests.post(f"{U}/finger", json={"action":"release","x":x,"y":y}); time.sleep(0.7)
def swipe():
    requests.post(f"{U}/finger", json={"action":"press","x":400,"y":300}); time.sleep(0.15)
    requests.post(f"{U}/finger", json={"action":"release","x":80,"y":300}); time.sleep(0.7)
last=None
while time.time()-T0 < LIMIT:
    e=ev(); tx=[x.get("text","") for x in e if x.get("text")]; low=" | ".join(tx).lower()
    if tx!=last and tx:
        last=tx; print(time.strftime("%H:%M:%S"), "|", " | ".join(tx)[:120], flush=True)
    hit=[x for x in e if "maybe later" in (x.get("text") or "").lower()]
    if hit: tap(240, hit[0]["y"]+10); continue
    hit=[x for x in e if (x.get("text") or "").strip().lower()=="yes, reject"]   # l'écran de confirmation d'un refus
    if hit: tap(hit[0]["x"]+20, hit[0]["y"]+10); continue
    if REJECT:
        hit=[x for x in e if (x.get("text") or "").strip().lower()=="reject"]
        if hit: tap(hit[0]["x"]+20, hit[0]["y"]+10); continue
    hit=[x for x in e if "hold to sign" in (x.get("text") or "").lower()]
    if hit:
        if SLOW:
            print(time.strftime("%H:%M:%S"), f"| (porteur lent : {SLOW:.0f} s de lecture)", flush=True); time.sleep(SLOW)
            e2=ev(); hit=[x for x in e2 if "hold to sign" in (x.get("text") or "").lower()]
            if not hit: print(time.strftime("%H:%M:%S"), "| (l'écran a changé pendant la lecture : pas de signature)", flush=True); continue
        tap(240, hit[0]["y"]+10, hold=2.2); continue
    hit=[x for x in e if "reject transaction" in (x.get("text") or "").lower()]   # « cannot be clear-signed » : on refuse
    if hit: tap(240, hit[0]["y"]+10); continue
    hit=[x for x in e if "accept risk" in (x.get("text") or "").lower()]
    if hit: tap(240, hit[0]["y"]+10); continue
    if "reject" in low or "swipe to review" in low:   # une revue est en cours : page suivante
        swipe(); continue
    time.sleep(0.4)
print("driver : fin", flush=True)
