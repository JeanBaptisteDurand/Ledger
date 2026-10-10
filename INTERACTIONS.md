# PORTE DE SORTIE — toutes les interactions de l'utilisateur, à relire

*10 octobre 2026, mis à jour le soir (dépôt et retrait). Ce que la personne fait sur le site, ce que le site fait pour elle, ce qui part sur la chaîne, et ce que
son appareil affiche. Ce fichier est la liste de référence des gestes du produit ; chaque ligne dit comment elle a été vérifiée.*

## En quelques phrases

On se connecte à son compte avec sa Ledger. Deux appareils possibles : **la Flex émulée** (Speculos, un Ledger Flex
fictif qui fait tourner la vraie app Ethereum, avec une graine de test, donc toujours la même adresse `0xDad7…`), ou
**sa vraie Ledger** branchée en USB dans Chrome. Dans les deux cas, aujourd'hui, **la chaîne est un fork de Base tenu par
anvil** : les contrats, les pools Uniswap v4 et les coffres Morpho sont les vrais, figés au bloc 50 614 000, mais
l'argent est fictif, et personne ne paie de gaz avec sa Ledger. Le réseau réel n'est pas branché (ce qu'il faudrait est
dans `MAINNET.md`).

Avec sa Ledger, la personne signe **la connexion** (un message Sign-In with Ethereum), **le mandat** (une fois : budget,
perte de sortie tolérée, échéance), **chaque dérogation** (quand un agent veut entrer là où la sortie coûte plus que le
mandat, avec le coût réel affiché sur l'écran), **son dépôt** (un envoi d'ETH à son coffre, la seule transaction) et
**ses retraits** (une autorisation lue en clair). Elle ne signe jamais un achat ni une vente : c'est le coffre à son nom
qui agit, dans le mandat, avec une clé d'agent qui ne peut appeler que ce coffre.

Légende des colonnes : **Le site** = la page et le serveur du banc · **Web3** = ce qui part sur le fork, et qui paie ·
**Ledger / Speculos** = ce que l'appareil affiche et ce que le porteur y fait · **Vérifié** = comment on le sait.

---

## 0. Avant d'avoir un compte

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| Ouvrir `/` | Le héros de Florent (scène 3D, deux modèles Ledger), le pitch en trois temps, la porte « Se connecter » dans la barre | rien | rien | émulateur, 10 oct. |
| Ouvrir `/schema` | La page d'explication : vue d'ensemble, l'autre axe, les agents, le site, le compte, une signature pas à pas, les outils, les briques, les mesures, les limites, les trouvailles, le SaaS | rien | rien | 10 oct. |
| Cliquer « Se connecter » ou une page du compte sans être connecté | Renvoi vers `/connexion` ; la page demandée est mémorisée et rouverte après la connexion | rien | rien | 10 oct. |

## 1. L'appareil et la connexion (`/connexion`, puis `/appareil`)

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| Choisir l'appareil : **Flex émulée (banc)** ou **Vraie Ledger (USB)** | Le choix est gardé dans le navigateur (`localStorage`) ; il ne vaut que pour le chemin « Ma Ledger · ce navigateur » | rien | Vraie Ledger : la brancher, la déverrouiller, ouvrir l'app Ethereum, fermer Ledger Wallet ; Chrome, Edge ou Brave seulement, et le navigateur ouvre son sélecteur d'appareil USB au premier contact. Émulée : son écran est affiché à droite, en direct | émulée 10 oct. ; vraie : USB depuis le banc le 2 oct., **jamais depuis la page** |
| Choisir **où se fait la signature** : « Ma Ledger · ce navigateur » / « Signer Kit · banc » / « Client APDU · banc » | `/api/signer`. Navigateur : le Signer Kit tourne dans la page, le serveur ne voit jamais l'appareil, il reçoit une signature. Banc : le serveur signe lui-même sur la Flex émulée (Signer Kit, ou client Python en APDU) | rien | Les deux chemins « banc » signent toujours sur la Flex émulée, même si « Vraie Ledger » est coché | les trois : démo et parcours, 10 oct. |
| « Tester la connexion » | Ouvre une session DMK vers l'appareil choisi et affiche l'adresse lue | rien | L'app Ethereum doit être ouverte ; rien à approuver | émulée 10 oct. |
| **« Se connecter avec ma Ledger »**, chemin navigateur | `GET /api/siwe/nonce` ; la page construit un message EIP-4361 en ASCII pur (sans `statement`, 217 octets) ; après signature, `POST /api/siwe/verify` : le serveur retrouve le signataire (`cast wallet verify`), ouvre la session (cookie), crée `accounts/<adresse>/` au premier passage, puis renvoie vers la page demandée | rien : une signature de message, pas une transaction | Trois écrans : « Review message » (1/3), le texte du message avec l'adresse (2/3), « Sign message ? » et **Hold to sign** (3/3), puis « Message signed » | émulée 10 oct. (24 s avec un porteur lent) |
| **« Se connecter avec ma Ledger »**, chemins banc | `/api/login_device` : le serveur lit l'adresse sur la Flex émulée et ouvre la session ; si l'émulateur est éteint, il le relance | rien | Rien à approuver, rien de signé : l'adresse est lue | 10 oct. |
| Refuser la connexion sur l'appareil | La page dit « Refusé sur l'appareil. » et reste sur `/connexion` | rien | « Reject » puis « Yes, reject », « Message rejected » | émulée (même mécanique que le refus du mandat, testé) |
| **L'écran de la Flex en direct** (`/appareil` et `/connexion`) | La capture de l'écran de l'émulateur, rafraîchie ; un clic est un appui, un glisser est un balayage, un appui maintenu est un « Hold » : on peut approuver depuis le site | rien | C'est l'écran de Speculos, relayé par le banc (`/speculos/*`) ; il n'existe pas pour une vraie Ledger, qui a son propre écran | 10 oct. (le porteur automatique passe par la même API) |
| Se déconnecter | `/api/logout` : le cookie est effacé ; les fichiers du compte restent | rien | rien | 10 oct. |
| Changer d'appareil pour la démo | Se déconnecter, changer l'appareil, se reconnecter : une adresse = un compte, donc la vraie Ledger ouvre **un autre compte** que la Flex émulée | rien | rien | émulée ; deux comptes séparés testés le 10 oct. avec une seconde graine |

## 2. La session et le mandat (`/app`)

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| **« Ouvrir une session »** | Démarre anvil et Speculos s'ils manquent ; déploie **un coffre à ton nom** ; compile et signe (clé de test) les descripteurs de clear signing de ce coffre ; événement `session` | `forge create ExitVault(owner = ton adresse)` par le déployeur du banc (compte anvil n° 0), puis `WETH.deposit` de 5 ETH et `WETH.transfer` de **5 WETH au coffre** — le banc paie tout, toi rien | rien | 10 oct. |
| **« Déposer depuis ma Ledger »** (un montant en ETH) | `/api/deposit` prépare l'enveloppe (nonce, frais, gaz 120 000, destinataire = ton coffre) ; la page la sérialise (EIP-1559) et la fait signer ; `POST /api/signed` : le serveur publie la transaction signée et attend le reçu ; événement `deposited` | **La seule transaction que ta Ledger signe** : un envoi d'ETH de ton adresse à ton coffre, qui le garde en WETH (le coffre enveloppe ce qui vient de son propriétaire, et seulement ça). Sur le fork, le banc a mis 5 ETH fictifs sur ton adresse pour ça ; sur un vrai réseau, ce sont tes ETH | Quatre écrans de l'app Ethereum, **sans aucun descripteur à nous** — n'importe quelle app Ethereum les lit : « Review transaction » (1/4) ; **Amount 0.5 ETH · To 0x…(ton coffre)** (2/4) ; **Max fees … ETH · Network Base** (3/4) ; « Sign transaction ? » **Hold to sign** (4/4) ; « Transaction signed » | émulée 10 oct. (3,7 s ; reçu : succès, 38 894 gaz) ; vraie Flex : jamais |
| **« Retirer vers ma Ledger »** (un montant en WETH, ou « tout ») | `/api/withdraw` : demande EIP-712 `ExitWithdrawal` (jeton, montant, destinataire = ton adresse, valable une heure, nonce) ; signée dans la page avec notre descripteur ; `POST /api/signed` | Le banc envoie, avec sa clé d'agent, `withdrawWithAuthorization(retrait, signature)` : le contrat vérifie que c'est toi (`ecrecover`), l'échéance, l'usage unique, et rend le WETH à ton adresse. Le banc paie le gaz et ne peut changer ni le montant, ni le destinataire (6 tests) | Quatre écrans : « Review typed message » (1/4) ; **Contract Exit withdrawal · Network Base · Withdraw 0.1 WETH** (2/4) ; **To 0xDad7… · Valid until …** (3/4) ; **Hold to sign** (4/4) ; « Message signed » | émulée 10 oct. (écrans vus) ; vraie Flex : jamais |
| **Demander des bornes** : une phrase (ou un des trois exemples) | `/api/chat` : le stratège (CLI `claude` ; sans lui, un repli par mots-clés qui le dit) traduit l'intention en bornes : budget, perte de sortie tolérée en bps, échéance en jours, tranche, nombre de tranches, profil ; la page montre les bornes, l'explication, ce que ces bornes **ne** protègent **pas**, et un miroir de ce que l'appareil affichera | rien | rien | 10 oct. |
| **« Signer sur Ledger »** (le mandat) | `/api/sign_mandate` crée la demande (EIP-712 `ExitMandate` : agent, jeton de budget, budget, perte max en bps, échéance, nonce ; domaine « Exit mandate », Base, l'adresse de ton coffre). Chemin navigateur : la page va chercher le descripteur (`/api/descriptor`) et fait signer le Signer Kit ; seul l'onglet qui a demandé signe. À la réponse, `POST /api/signed` : le serveur vérifie que le signataire est bien le compte, écrit `mandate.json`, événement `mandate_signed` ; le rapport dit `isBlindSign = false` | rien n'est envoyé : le contrat vérifiera la signature (`ecrecover`) **à chaque entrée** | Au premier message signé après un démarrage : « Enable Transaction Check ? » → « Maybe later ». Puis quatre écrans : « Review typed message » (1/4) ; **Contract Exit mandate · Network Base · Agent 0x7099…** (2/4) ; **Budget 0.5 WETH · Max round-trip loss (bps) 200 · Expires 2026-10-18 …** (3/4) ; « Sign typed message ? » **Hold to sign** (4/4) ; « Message signed » | émulée 10 oct. (28 s avec un porteur lent) ; **vraie Flex en USB le 2 oct.**, clear-signé, `ecrecover` juste |
| Refuser le mandat sur l'appareil | La page dit « Refusé sur l'appareil. », rien n'est signé, le formulaire reste tel quel, on peut recommencer | rien | « Reject » (sur n'importe quel écran) → « Reject message ? » → **Yes, reject** → « Message rejected » | émulée 10 oct. (tests appareil) |
| Deux onglets du même compte | Seul l'onglet qui a demandé la signature parle à l'appareil ; un onglet ouvert à côté ne fait rien ; un onglet rechargé reprend la demande en cours | rien | un seul client sur l'app | 10 oct. |
| Lire « Vos agents, d'un coup d'œil », les positions, le journal | Lecture : bots actifs et arrêtés, demandes en attente, positions tenues, les lignes du banc | lecture seule du fork (soldes, positions) | rien | 10 oct. |

## 3. Les agents de trading (`/app/agents`)

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| **« Ajouter et lancer »** un bot : nom, univers (**Pools v4** ou **Coffres 4626**), tranches (1 à 12), rythme (**un seul tour**, **30 s**, **60 s**, **5 min**) | `/api/bots` : le bot est enregistré (`bots.json`) et l'ordonnanceur du compte lance ses tours, **un tour à la fois par compte**. Le navigateur demande la permission d'afficher des notifications | À chaque tranche, le bot choisit un pool (ou un coffre) sur ce qu'il voit, et appelle **ton coffre** avec la clé d'agent (compte anvil n° 1, qui paie le gaz). Pools : `buy(mandat, signature, pool, montant)` — le contrat vérifie le mandat, achète, **simule la revente intégrale dans la même transaction**, et **refuse** si la sortie coûte plus que ta tolérance (`REFUSED_BY_VAULT`, motif) ; sinon la position est prise. Coffres : `enterVault(mandat, signature, coffre, montant, plus gros déposant)` — dépôt et retrait réels puis annulés, lecture de la porte du plus gros déposant, refus si elle est fermée au-delà du mandat (Moonwell : 2 693 bps) | **rien : un achat ne passe jamais par l'appareil** | 10 oct. (2 entrées, 8 refus sur les pools ; 2 entrées, 3 refus sur les coffres) |
| « Ou lancer un seul tour maintenant » | `/api/universe` puis `/api/run` : un bot d'un seul tour, nommé « tour unique » | idem | rien | 10 oct. |
| « Arrêter » un bot, « Relancer » un bot de l'historique | `/api/bots/stop`, `/api/bots/restart` ; l'historique garde le bilan (tours, entrées, refus, dépense, motifs) | rien | rien | 10 oct. |
| Filtrer le journal : Tout / Entrées / Refus ; lire le journal par bot | lecture | rien | rien | 10 oct. |
| **Une demande « hors bornes »** apparaît (un refus **négociable** : la sortie est mesurable mais dépasse le mandat) | La page montre le pool, le coût de sortie **vu** par le contrat, ce que le mandat tolère ; une notification du navigateur ; le webhook `PDS_NOTIFY_URL` si configuré ; `notifications.jsonl`. Les demandes du dernier tour passent en premier, les autres attendent en file | rien tant que tu ne décides pas | rien | 10 oct. (file de 3) |
| **« Lire et signer sur Ledger »** (la dérogation) | `/api/escalate` : demande EIP-712 `ExitException` (position, montant, **le coût de sortie lu**, valable une heure, nonce) ; signature dans la page comme le mandat ; `POST /api/signed` | Le banc envoie, avec la clé d'agent, `buyWithException(mandat, sig, dérogation, sig2, …)` (ou `enterWithException` pour un coffre) : le contrat **remesure** ; si la sortie a empiré depuis le nombre lu, la dérogation ne vaut plus rien et il refuse ; sinon l'entrée se fait « sous dérogation », à usage unique | Cinq écrans : « Review typed message » (1/5) ; **Contract Exit exception · Network Base · Agent** (2/5) ; **Position 0x… · Amount 0.05 WETH · EXIT COST (BPS) 263** (3/5) ; **Valid until …** (4/5) ; **Hold to sign** (5/5) ; « Message signed » | 10 oct. (pools 9 s, coffre Moonwell 2 691 bps) ; vraie Flex : jamais |
| **« Laisser refusé »** | `/api/escalate_no` : la demande est close sans signature, le pool est mémorisé comme refusé, le bot ne redemandera pas pour lui ; la demande suivante de la file monte | rien | rien | 10 oct. |
| **« Resonder »** (une porte peut se refermer) | `/api/watch` : chaque position tenue est resondée | lecture seule : simulation de la sortie intégrale, position par position (coût à l'achat → maintenant) | rien | 10 oct. (349 → 784 bps) |
| **« Resonder et sortir »** | `/api/watch_sell` : même chose, et on vend ce qui a empiré au-delà du mandat | `sell(…)` sur ton coffre par la clé d'agent, pour les positions qui dépassent | rien : la sortie est dans le mandat | 10 oct. (vendu) |
| Lire « Positions tenues » | lecture : jeton, quantité, sortie à l'achat, sortie maintenant, quel bot | lecture seule du fork | rien | 10 oct. |

## 4. L'agent d'analyse (`/app/analyste`)

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| **Poser une question** (ou cliquer un des quatre exemples) | `/api/analyze` : Claude (CLI `claude`) lancé avec **la configuration MCP de ton compte et rien d'autre** (dix outils en lecture seule : bots, operations, decision, positions, mandate, universe_facts, compare_entry_exit, hook_analysis, ledger_earn_yields, vault_openness) ; la réponse arrive dans la conversation, avec sous elle **la trace des outils appelés et leurs arguments** ; l'historique est gardé (« et le tour d'avant ? » marche). Sans le CLI, la page dit qu'il manque | lecture seule : les outils relisent le fork (positions, portes des coffres, contrefactuel TARE) ; rien n'est envoyé | rien : il ne peut ni signer, ni envoyer, ni arrêter un bot | 10 oct. (18 à 33 s) |

## 5. Mon compte (`/compte`)

| Geste | Le site | Web3 | Ledger / Speculos | Vérifié |
|---|---|---|---|---|
| Lire « Prouvé par votre Ledger » | l'adresse, comment elle a été prouvée (SIWE ou lue sur l'appareil), le nombre de connexions, le coffre, les bots en un coup d'œil | rien | rien | 10 oct. |
| « Se déconnecter » | `/api/logout` | rien | rien | 10 oct. |
| « Remettre à zéro » (avec confirmation) | `/api/reset` : le mandat, les bots, le journal et les dérogations **de ce compte** sont effacés ; la prochaine session déploie un nouveau coffre | rien n'est envoyé ; l'ancien coffre reste sur la chaîne avec ce qu'il tient | rien | 10 oct. |
| « Révéler » / « Masquer » la clé MCP, « Copier la clé », « Configuration Claude », « Copier la configuration » | La clé est **dérivée** (HMAC du secret maître et de ton adresse), jamais écrite ; la configuration est à coller dans Claude ; elle n'ouvre **que ton coffre** (la clé d'un autre compte est refusée) | rien | rien (le secret maître peut être scellé dans le Ledger Key Ring de l'opérateur, une fois, avec une Flex en USB : pas fait) | 10 oct. (deux comptes, clé croisée refusée ; config collée dans un `claude -p`) |
| Lire « Ce que vous avez fait » | la liste des événements du compte, du plus récent au plus ancien : connexions, session, stratégie, mandat signé, bots ajoutés ou arrêtés, dérogations signées ou refusées, analyses… | rien | rien | 10 oct. (80 événements relus) |

## 6. Ce que l'utilisateur ne fait jamais, et pourquoi

- **Il ne signe jamais un achat ni une vente.** Le coffre agit, dans le mandat, avec la clé d'agent du banc qui ne peut appeler que ce coffre.
- **Il ne paie de gaz que pour son dépôt.** Le déploiement, les achats, les ventes, les dérogations et les retraits sont payés par le déployeur et la clé d'agent du banc. Sa Ledger ne signe que des messages, et une seule transaction : l'envoi d'ETH à son coffre.
- **Il dépose et retire lui-même, depuis la page** (depuis le 10 oct. au soir). Le dépôt est un envoi d'ETH signé sur la Ledger, le retrait une autorisation EIP-712 lue en clair et exécutée par le banc. Il n'y a pas encore de bouton pour **révoquer** un mandat avant son échéance (le contrat le permet). Sur le fork, le banc crédite aussi 5 WETH de démonstration au coffre et 5 ETH fictifs à ton adresse ; sur un vrai réseau, rien n'est crédité.
- **Rien ne touche le réseau réel.** Même avec une vraie Ledger, le coffre est sur le fork. Ce qu'il faudrait pour Base : `MAINNET.md`.

## 7. Vraie Ledger et Flex émulée : ce qui diffère

| | Flex émulée (Speculos) | Vraie Ledger Flex |
|---|---|---|
| Adresse | toujours la même, graine de test (`0xDad7…`) ; une autre graine donne un autre compte | la tienne |
| App Ethereum | la 1.22.4 compilée avec la clé de test : nos descripteurs sont acceptés, le mandat s'affiche formaté | **notre compilation chargée par `load-flex.sh`** (fait le 2 oct.) : idem ; avec l'app de série réinstallée par Ledger Wallet, le mandat s'affiche **en brut** (six pages de champs, après avoir activé « Raw messages »), précédé de « Blind signing ahead » |
| Écran | affiché sur le site, cliquable | sur l'appareil seulement |
| Déverrouillage, PIN | aucun | PIN sur l'appareil ; l'app Ethereum à ouvrir ; Ledger Wallet fermé |
| Premier message signé après un démarrage | « Enable Transaction Check ? » → « Maybe later » (à chaque relance de l'émulateur) | une fois pour toutes |
| Depuis la page (WebHID) | — | même code, même bundle ; **jamais essayé à la main** |
| Depuis le banc (USB) | — | mandat clear-signé le 2 oct., signature vérifiée |

## 8. Ce qui a été vérifié le 10 octobre, sans toi

Depuis un clone vide du dépôt : compilation de l'app, `demo.sh` avec les deux signers (Signer Kit et client Python), les
32 tests, le parcours du banc, le parcours du front (porteur rapide, puis **porteur lent : 20 s par écran, 307 s**), les
tests appareil (refus sur l'écran, deux onglets, banc redémarré), deux comptes sur le même banc avec deux graines, la
configuration MCP d'un compte collée dans un vrai `claude`, le banc sans RPC et sans le CLI `claude` (il le dit), le
Flex éteint (la page dit « hors tension », la connexion le relance), toutes les pages à 390 px sans débordement
(un débordement de 3 px sur `/connexion` corrigé). Et une correction importante : le bug `signMessage` du Signer Kit
n'est pas une limite de 229 octets mais **un caractère non ASCII** (vérifié, FEEDBACK § 7 réécrit).

Pas vérifié, parce qu'il faut toi et l'appareil : la vraie Ledger depuis la page (WebHID dans Chrome), le refus sur la
vraie Flex, le Key Ring, l'app de série sur la vraie Flex.
