# PRODUIT.md — ce que le site vend, et comment mieux le montrer

*Pour Florent, 11 octobre 2026. Le produit tel que ton coéquipier l'a construit (README.md, FRONT.md, FEEDBACK.md,
`web/`, `contracts/`), son narratif, puis ce que je changerais sur le site. Chaque nombre cité vient d'un de ces
fichiers ; aucun n'est inventé.*

---

## 1 · Le produit en une phrase

**Un agent ne peut pas entrer dans une position dont il ne sait pas sortir.**

Le porteur signe **une fois**, sur sa Ledger, ce qu'un agent a le droit de faire : un **budget**, une **perte de
sortie tolérée** (en points de base, aller-retour) et une **échéance**. C'est le **mandat**. Un contrat à son nom,
`ExitVault`, applique ce mandat **à chaque entrée** : il achète, puis simule la revente intégrale dans la même
transaction, et refuse si la sortie coûte plus que le mandat n'autorise. Ce qui déborde revient sur l'appareil
**avec le nombre** : une **demande hors bornes** que le porteur lit sur l'écran et signe (une **dérogation** à usage
unique) ou laisse refusée.

## 2 · Le trou que le produit comble

Tout le monde borne ce qu'un agent **engage** : plafond par jour, liste de contrats, glissement maximal. Les Agent
Policies de Ledger bornent exactement cela. Personne ne borne ce qu'il pourra **récupérer**. Deux portes fermées,
invisibles à l'entrée :

- **Les pools Uniswap v4.** Le hook d'un pool décide qui a le droit de vendre. Six pools réels de Base laissent
  entrer pour **0 bps** et prennent **9 990 bps** à la sortie. Le même hook fixe les deux prix ; l'agent ne voit
  jamais que le premier. Aucun signal disponible avant l'achat ne les distingue de 77 pools sains.
- **Les coffres ERC-4626.** Dix coffres Morpho WETH réels. Le standard écrit le piège lui-même : `previewRedeem`
  doit ignorer les limites de retrait ; la porte se lit dans `maxWithdraw`. Au bloc des mesures, Moonwell, le plus
  gros coffre WETH de Base, a **27 %** de la position de son plus gros déposant bloquée (porte à **2 693 bps**) et
  **cinq coffres sur dix** refusent même le dépôt.

Et le produit le dit honnêtement : l'outil `earn yields` de l'Agent Stack de Ledger rend le fournisseur, le jeton, le
rendement et un lien de dépôt, et **zéro champ** sur la sortie.

## 3 · Le mécanisme, et pourquoi il vit dans un contrat

L'appareil n'a ni réseau ni état : il ne peut pas mesurer le marché. Il **autorise** la règle, en clair (clear
signing, descripteurs EIP-712), et le contrat la **mesure** dans le bloc d'exécution, le seul endroit où le coût de
sortie se lit au moment où il compte. Pour un pool : achat puis revente simulée (le motif du `V4Quoter`, un
`unlock` dont le callback revert avec son résultat). Pour un coffre : dépôt puis retrait réels, annulés, plus la
porte du plus gros déposant. Si la sortie a empiré entre la lecture sur l'appareil et l'exécution, la dérogation ne
vaut plus rien (`ExitWorseThanSeen`).

Les fonds vont de la Ledger au coffre (un envoi d'ETH, la seule transaction que l'appareil signe) et en reviennent
sur une autorisation de retrait EIP-712 lue en clair, exécutée par le banc sans pouvoir y changer un chiffre.

## 4 · Les agents, et la frontière entre eux

| | Qui | Ce qu'il voit | Ce qu'il peut |
|---|---|---|---|
| **Les bots** | des agents d'exécution **sans LLM**, nommés, lancés, arrêtés par le porteur (`agent/agent.py` : DCA longue traîne v4 ; `agent/vaults.py` : rendement affiché) | la profondeur, l'entrée, le registre, le rendement affiché ; **jamais la sortie** | appeler le coffre du porteur, et rien d'autre : une clé de session, un tour à la fois par compte |
| **Le stratège** | Claude, une fois | une phrase en français | proposer des bornes, et écrire ce qu'elles ne protègent pas ; il n'achète rien |
| **L'analyste** | Claude, branché **uniquement** sur un MCP en lecture seule de dix outils (dont le `wallet-cli` de Ledger) | les données du compte, par une clé dérivée de l'adresse | répondre en citant l'outil derrière chaque nombre ; il ne peut ni signer, ni envoyer, ni arrêter |

La phrase qui résume la frontière : **celui qui agit n'a pas de LLM ; celui qui a un LLM ne peut pas agir.** Une
consigne injectée peut faire *choisir* un piège à un bot ; elle ne peut pas lui faire *dépasser* le mandat.

## 5 · Les briques Ledger, un rôle chacune

- **Signer Kit + DMK** (1.18.1 / 1.9.1), dans le navigateur du porteur (WebHID) ou sur la Flex émulée : connexion
  (Sign-In with Ethereum), mandat, dérogations, dépôt, retrait. Jamais un achat.
- **Clear signing** : nos descripteurs, compilés et signés avec la clé de test d'une compilation 1.22.4 de l'app
  officielle, parce que le registre de Ledger répond 403 sans jeton partenaire. Le mandat a été clear-signé sur une
  **vraie Flex** en USB (ecrecover concorde).
- **Agent Stack** : l'analyste, son MCP, `wallet-cli 2.1.0` comme outil, nos skills au format de Ledger.
- **Ring CLI / Key Ring** : le secret maître dont dérivent toutes les clés MCP des comptes (`HMAC-SHA256(maître,
  adresse)`, jamais stockée), scellé sous la graine de l'opérateur.

## 6 · Ce qui est prouvé

- Un fork de Base épinglé au bloc **50 614 000** ; 38 tests Foundry, 8 suites ; six pièges réels refusés, les
  témoins acceptés ; dix coffres sondés.
- Le parcours entier dans un vrai navigateur contre la Flex émulée : SIWE, mandat, bots, refus, dérogation, veille
  et vente, dérogation coffre, analyste, compte, reconnexion, dépôt et retrait. **124 s** de bout en bout, 2 achats,
  8 refus, l'analyste en 35 s.
- Cinq retours amont, sourcés (FEEDBACK.md) : clear signing fermé sans jeton ; un bug d'une ligne du client Python
  (chainId ≥ 256) ; le kit détecte le blind signing et ne le dit pas au développeur ; `signMessage` jette tout message
  contenant un caractère non ASCII et bloque l'app ; deux clients sur une app et tout répond `0x6901`.

## 7 · Ce que ça n'attrape pas (le produit le dit lui-même)

Un interrupteur basculé après l'achat se surveille (`watch.py` resonde et vend), il ne se prévient pas. Le prix du
jeton n'est pas mesuré. Le réseau principal demande un nœud, un déploiement, du gaz, et le clear signing sur l'app de
série (Ledger doit signer nos descripteurs). Révoquer un mandat avant son échéance reste à construire.

## 8 · Le narratif du site, tel qu'il est

Deux surfaces, un fil.

1. **La scène** (`/`). Le monolithe de *2001* : une Ledger plantée dans le sable sous un crépuscule martien ; trois
   scrolls l'arrachent ; en vol, elle s'arrête trois fois et dit un mot sur son propre écran : `SPENDING` (ce que
   les Agent Policies bornent), `THE EXIT` (0 → 9 990 bps, le compteur qui fait l'argument), `THE RULE` (une
   signature, un contrat, le nombre qui revient). Elle devient une Flex, atterrit devant un trou noir, et le nom
   s'allume. **Le trou noir est le sujet : une masse dont on ne ressort pas. Le produit est la porte de sortie.**
2. **La descente** : la caméra entre dans l'écran noir de la Flex, le monde s'éteint, le trou ressort, entier, et
   reste comme fond de tout ce qui suit.
3. **Le home** (`/home`), neuf bandes sur des feuilles de verre, dans l'ordre d'une thèse : la revendication, le
   piège (deux instances), l'agent qui y va quand même, une signature, quand ça déborde, mesuré de bout en bout (la
   frise des 124 s), ce qu'on a trouvé dans leur pile, trois briques trois rôles, l'appel (« Your Ledger stays with
   you »).
4. **Le schéma a rejoint le home** le 12 octobre : la carte du système, le principe, les deux sortes d'agents et les dix
   outils, une signature pas à pas, le compte, les limites et les clés, ce que le porteur garde. Il n'y a plus de page à part.
5. **Le compte** (`/app`, `/compte`, `/appareil`) : calme, dense, sans canvas. La Ledger est dans le navigateur ; le
   serveur ne la voit jamais.

Le vocabulaire est fixé par le produit : *mandat, bornes, coffre, bot, tour, tranche, demande hors bornes,
dérogation, porte, sortie, resonder, le porteur.*

---

## 9 · Ce qui a été fait depuis, pour mettre le produit en avant

Tout ce que ce document demandait les 11 et 12 octobre est en place : une seule langue sur le site (l'anglais), un nom
(**Net·Out**, écrit une fois partout), la scène et l'explication sur une même page, `/demo` qui montre le produit lui-même
(la carte vivante allumée par le banc, la carte NOW, le volet TARE pendant un tour, le volet Bots, la Flex en direct), les
pages du compte sur le registre du home (`/trades`, `/account`), le rapport du kit (`isBlindSign=false`) visible sous le
mandat et dans le tiroir replié, la porte en deux clics (Flex émulée ou vraie Ledger), le pied de page positionné, et un
site en une commande (`scripts/site.sh`). Les captures réelles du site sont dans `captures/site/`.

## 10 · Le 12 octobre au soir (Jean-Baptiste)

La branche est fusionnée telle quelle. Ce qui manquait au produit a été remis dans ta charte, sans toucher à la scène, à
l'accueil ni à la démo : `/trades` (les agents avec toutes leurs options, les demandes hors bornes, les positions, le
journal) et `/account` (le dépôt et le retrait signés sur la Ledger, l'analyste au complet, la clé MCP, l'historique).
Sur la carte, le nœud Ledger nomme ses quatre gestes et s'allume sur celui en cours ; le nœud des bots a quatre
emplacements qui se remplissent. Les tiroirs de la carte vivante portent la phrase des bornes, les fonds, les tranches,
l'analyste. La porte reste quand on est connecté (c'est là qu'on change d'appareil). Tout est rejoué sur la Flex
émulée : `front/APP.md`.
