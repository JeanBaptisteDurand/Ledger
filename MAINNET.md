# Du fork au réseau réel

Tout ce que montre ce dépôt tourne sur **un fork de Base épinglé au bloc 50 614 000**, pour que chaque nombre se
rejoue à l'identique. Le contrat, la sonde, les pools Uniswap v4 et les coffres Morpho sont les vrais ; ce qui est
propre au banc, ce sont les clés, le financement et une mesure. Voici, ligne par ligne, ce qui change sur Base, et
dans quel ordre le faire — avec une vraie Ledger et des montants minuscules.

## Ce qui change

| sur le fork (le banc) | sur Base | où |
|---|---|---|
| le coffre est déployé par la clé n° 0 d'anvil | **ta Ledger** le déploie : `forge create --ledger` | commande 1 |
| le coffre est financé de 5 ETH emballés par cette clé | **toi** : un peu de WETH envoyé au coffre depuis ta Ledger | commande 3 |
| l'agent signe avec la clé n° 1 d'anvil — **publique** | une **clé de session neuve**, à toi seul, avec un peu d'ETH pour le gaz | commande 2 |
| le mandat s'affiche en clair : app de test, nos descripteurs signés avec la clé de test de Ledger | avec l'app de test (chargée sur ta Flex le 2 octobre) : **en clair, pareil** ; avec l'app de série, nos descripteurs ne sont pas reconnus : le mandat se signe en champs bruts (« Blind signing » et « Raw messages »), tant que Ledger ne signe pas nos descripteurs | commande 4 |
| la sonde de sortie (dans la transaction même) | **identique** | — |
| la dérogation à usage unique, la surveillance, la sortie | **identiques** — chaque geste coûte du gaz | — |
| le contrefactuel de TARE (`anvil_setCode` : le hook remplacé par 89 octets inertes) | **n'existe pas** sur la chaîne : il se lance sur un fork local du bloc courant, comme TARE le fait | — |

Pourquoi la clé de l'agent compte : le mandat nomme **une adresse d'agent**. Avec une clé publique, n'importe qui
pourrait agir comme cet agent — dans ton mandat, donc sans pouvoir sortir de tes bornes, mais en dépensant ton budget.
Sur le fork, c'est sans conséquence ; sur Base, jamais.

## Base Sepolia ou Base ?

Les six pools pièges et les dix coffres Morpho n'existent que sur Base. Sur Base Sepolia on ne vérifie que la
tuyauterie — déploiement, mandat signé, refus sur un pool qu'on crée soi-même. **Recommandation : Base, avec des
montants minuscules** (quelques millièmes de WETH) : c'est là que le refus a un sens.

## Les gestes, dans l'ordre

```bash
export BASE_RPC_URL=<ton RPC Base>
OWNER=<ton adresse, celle de ta Ledger>
WETH=0x4200000000000000000000000000000000000006
POOL_MANAGER=0x498581fF718922c3f8e6A244956aF099B2652b2b     # Uniswap v4, Base

# 1 · le coffre, déployé par ta Ledger (owner = toi) — une création de contrat : l'appareil demande « Blind signing »
cd contracts
forge create src/ExitVault.sol:ExitVault --ledger --rpc-url "$BASE_RPC_URL" --broadcast \
  --constructor-args "$OWNER" "$POOL_MANAGER"
VAULT=<l'adresse « Deployed to »>

# 2 · une clé d'agent neuve — hors du dépôt, avec ~0,0005 ETH pour le gaz
cast wallet new

# 3 · financer le coffre : 0,002 WETH
cast send --ledger --rpc-url "$BASE_RPC_URL" "$WETH" "deposit()" --value 0.002ether
cast send --ledger --rpc-url "$BASE_RPC_URL" "$WETH" "transfer(address,uint256)" "$VAULT" 2000000000000000

# 4 · le mandat, signé sur ta Flex en USB : cet agent, ce budget, 300 bps, 7 jours
cd .. && . .venv/bin/activate
python3 ledger/sign_mandate.py --usb --vault "$VAULT" --agent <adresse de l'agent> \
  --budget 2000000000000000 --max-bps 300 --days 7 --out mandate.json
```

Ensuite : un achat réel accepté (un pool sain), un refus réel (un pool piège : le coffre revert, rien n'est dépensé),
une sortie réelle. Ces trois gestes passent par l'agent — voir ci-dessous.

## Ce qui reste à faire dans le code

- **Le mode réseau** (10 oct.) : `PDS_NETWORK=live` avec `BASE_RPC_URL` (Base Sepolia d'abord, Base ensuite : le même
  code, l'autre RPC), `PDS_DEPLOYER_KEY`, `PDS_AGENT_KEY`, `PDS_AGENT_ADDRESS`. En « live » le banc ne lance pas anvil,
  ne crédite rien, et refuse d'avancer sans ces clés. Il reste à faire lire `PDS_AGENT_KEY` aux bots
  (`agent/agent.py`, `agent/vaults.py`, `agent/watch.py`, qui écrivent encore la clé n° 1 d'anvil) et à refuser une clé
  d'anvil hors d'un fork.
- **Le financement est désormais un geste de la Ledger, dans la page** (10 oct.) : le dépôt est un envoi d'ETH au
  coffre signé sur l'appareil (le coffre le garde en WETH), le retrait une autorisation EIP-712 lue en clair et exécutée
  par le banc. Sur le fork, le banc crédite encore 5 WETH de démonstration au coffre et 5 ETH fictifs au porteur
  (`PDS_FUND_VAULT=0` pour couper le premier) ; en « live », rien. Le déploiement du coffre reste payé par la clé de
  déployeur du banc : sur un réseau réel, c'est la nôtre, avec quelques milliers de gaz.
- **Le contrefactuel** : le lancer contre un fork local du bloc courant plutôt que contre le nœud.

Rien de tout cela ne touche au contrat : `ExitVault` est déjà celui du réseau réel.
