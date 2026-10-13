#!/usr/bin/env bash
# Le serveur du banc Net·Out (service systemd netout-banc), derrière le Caddy de netout.tech.
# Il écoute sur 127.0.0.1:8199 ; Caddy (en conteneur) le joint par la prise /home/ubuntu/netout/sock/banc.sock
# que relaie systemd-socket-proxyd (netout-banc-proxy.socket) : aucun port ouvert, pare-feu inchangé.
# En tête du PATH, deploy/bin/claude : le CLI claude quand il est connecté, une phrase claire sinon.
export PATH=/home/ubuntu/netout/bin:/home/ubuntu/.foundry/bin:/usr/bin:/bin
cd /home/ubuntu/Ledger
exec /home/ubuntu/Ledger/.venv/bin/python3 -u web/server.py
