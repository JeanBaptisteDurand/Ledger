# FRONT.md — tout ce qu'il faut au front, écran par écran

*Pour Florent. Ce document décrit ce que le front doit montrer et faire, ce que le serveur lui donne, et les
règles à respecter. Le front actuel (`web/index.html`, une page, vanilla JS, ~750 lignes) est une maquette
fonctionnelle : tout ce qui est décrit ici y existe et a été vérifié de bout en bout (`scripts/parcours.mjs`).
Tu peux le lire comme référence de comportement, pas comme référence de design.*

---

## 1 · Le produit en dix lignes

Un client branche sa Ledger, se connecte au site avec elle, et obtient un **compte** (une adresse prouvée) et un
**coffre** (un contrat déployé à son nom sur un fork de Base). Il décrit en français ce qu'il veut, un stratège
(Claude) lui propose des **bornes** — budget, perte de sortie tolérée, échéance — et il les **signe une fois** sur
sa Ledger : c'est le **mandat**. Ensuite il crée des **bots** (des agents d'exécution sans LLM : nom, univers,
rythme) qui achètent dans ce coffre, sous ce mandat ; le contrat mesure la **sortie** à chaque entrée et refuse ce
qui ne ressort pas. Un refus « négociable » devient une **demande hors bornes** que le client lit sur sa Ledger et
signe (dérogation à usage unique) ou laisse refusée. Il voit ses **positions**, les **resonde**, en **sort**. Il
parle à **l'analyste de son compte** (Claude, branché en lecture seule sur ses données) et lit dans **mon
compte** sa clé MCP, sa configuration Claude, l'historique de ses gestes et de ses bots.

Deux univers : **pools Uniswap v4** (la longue traîne WETH de Base, six pièges réels) et **coffres ERC-4626**
(dix coffres Morpho réels ; Moonwell a 27 % de sa porte fermée).

Vocabulaire à garder tel quel dans l'interface (c'est celui du pitch) : *mandat*, *bornes*, *coffre*, *bot*,
*tour*, *tranche*, *demande hors bornes*, *dérogation*, *porte* (d'un coffre), *sortie* (d'une position),
*resonder*, *le porteur* (le client, celui qui tient la Ledger).

---

## 2 · Le contrat avec le serveur

- **Un serveur Python** (`web/server.py`, port 8099), JSON partout. Toutes les routes sont sous `/api/`.
  Les POST prennent un corps JSON et répondent `{"ok": true|false, "msg": "…", …}` ; un `ok:false` est un
  message à montrer (toast), pas une exception.
- **Session** : un cookie `pds_session` (HttpOnly) posé par la connexion. Toute requête avec le cookie parle
  **du compte** ; sans cookie, de « l'invité » (on peut choisir le chemin de signature, pas plus).
- **État** : le front lit `GET /api/state` **en polling** (la maquette : toutes les 1,4 s) et redessine tout à
  partir de cet objet. C'est volontairement simple ; si tu veux du SSE, le serveur est à adapter (voir § 7).
- **La Ledger est dans le navigateur.** Le bundle `dist/ledger-web.js` expose `window.LedgerWeb` (Signer Kit
  de Ledger + transport WebHID, ou l'émulateur du banc par le proxy `/speculos/*`). Le serveur ne voit jamais
  l'appareil dans ce mode : il **met une signature en attente** (`state.pending`), la page la fait signer sur
  l'appareil, puis la rend à `POST /api/signed`. Deux autres chemins existent pour le banc (Signer Kit côté
  serveur, client APDU Python) : là c'est le serveur qui parle à l'émulateur, la page ne fait qu'afficher.
- **Un seul client sur l'appareil à la fois.** Une signature en attente porte un `token` ; seule la page qui a
  cliqué (elle a reçu le token dans la réponse du POST) la fait signer. Un second onglet du même compte ne doit
  jamais tenter de signer : deux clients pendant qu'un humain lit l'écran cassent la signature (`0x6901`).
- **Adresses** : toujours en somme de contrôle (`0xDad7…D8D`), telles que le serveur les rend.
- **Montants** : le serveur rend des wei en chaînes (`"500000000000000000"`). Afficher en WETH avec 4 décimales
  au-dessus de 0,001, sinon en wei. Les coûts de sortie sont en **bps** (points de base ; 100 bps = 1 %).

### 2.1 · `window.LedgerWeb` (bundle, déjà construit)

```js
await LedgerWeb.connect('webhid' | 'speculos', location.origin + '/speculos')  // -> adresse ; WebHID ouvre le sélecteur du navigateur
LedgerWeb.address()                      // adresse connectée, ou null
await LedgerWeb.signMessage(text, onStep) // -> { signature, address }  (Sign-In with Ethereum)
await LedgerWeb.signTypedData(typedData, descriptor, onStep) // -> { signature, address, report }  (mandat, dérogation)
await LedgerWeb.disconnect()
LedgerWeb.webHidSupported()              // false sur Firefox / Safari : proposer l'émulateur ou un autre navigateur
```
`onStep(iv)` reçoit les étapes du kit (`iv.requiredUserInteraction` : `'sign-typed-data'`, `'web3-checks-opt-in'`,
`'none'`) : afficher « ta Ledger : lis les champs, puis maintiens *Hold to sign* ». Si l'appareil demande
d'abord « Enable Transaction Check ? », c'est Ledger qui pose la question : le client répond *Maybe later*.
Une erreur de `connect` peut être transitoire (appareil pas prêt) : réessayer une fois après 1,5 s, sauf refus
explicite (`reject`, `6985`, `denied`).

### 2.2 · Le protocole d'une signature dans la page

1. Le client clique **valider sur le Ledger** (mandat) ou **lire et signer** (dérogation) → `POST /api/sign_mandate`
   ou `POST /api/escalate` → réponse `{ok, msg, pending_token}`. Retenir `pending_token`.
2. Au prochain `state`, `state.pending = {kind: 'mandate'|'exception', typedData, expiry, token, …}` et
   `state.signing = kind`. Si `pending.token === pending_token` : `GET /api/descriptor?kind=<kind>` (le descripteur
   de clear signing de ce coffre) puis `LedgerWeb.signTypedData(pending.typedData, descriptor, onStep)`.
3. Succès → `POST /api/signed {kind, signature, owner, report}`. Refus ou erreur → `POST /api/signed {kind, error}`.
4. Le serveur vérifie, exécute (déploie le mandat, ou achète sous dérogation), efface `pending`, met à jour l'état.

### 2.3 · Sign-In with Ethereum (connexion)

`GET /api/siwe/nonce` → `{nonce, domain, chainId, statement}`. Construire le message EIP-4361 **sans
`statement` et à la seconde**, en ASCII pur (un seul caractère non ASCII et le Signer Kit jette tout le message, FEEDBACK § 7) :

```
<domain> wants you to sign in with your Ethereum account:
<address>

URI: <origin>
Version: 1
Chain ID: 8453
Nonce: <nonce>
Issued At: 2026-09-25T10:00:00Z
```
`LedgerWeb.signMessage(msg)` puis `POST /api/siwe/verify {message, signature, address}` → `{ok, address}` + cookie.
L'autre chemin, pour le banc : `POST /api/login_device {}` (le serveur lit l'adresse sur l'émulateur).

---

## 3 · Les écrans

Chaque écran liste ses éléments, ses états et ses appels. « état » désigne `GET /api/state`.

### 3.1 · Connexion

Avant tout compte. Ce que la page montre :
- Le **chemin vers l'appareil** (trois choix, `POST /api/signer {signer}`) : `browser` (*ma Ledger · navigateur*,
  le chemin client), `dmk` (Signer Kit côté banc), `python` (client APDU officiel). Pour `browser`, le
  **transport** : `webhid` (USB, Chrome/Edge/Brave) ou `speculos` (émulateur du banc) — choix local
  (`localStorage`), pas envoyé au serveur.
- Le bouton **se connecter avec ma Ledger** : chemin `browser` → SIWE (§ 2.3) ; sinon `POST /api/login_device`.
  États : *connexion…*, *ta Ledger : lis le message de connexion, puis signe*, erreur (toast), connecté.
- Les **briques installées** (`state.ledger_stack` : versions du DMK, du Signer Kit, des transports, de
  wallet-cli) et l'état du **Key Ring** (`state.ring`) — informatif, petit.
- L'écran de l'appareil en direct (§ 3.8) est déjà visible ici : c'est sur lui que le client signe.

Après connexion, l'en-tête montre le compte (`state.address`, tronqué), un bouton **mon compte**, un lien
**schéma**, et **réinitialiser** (danger : `POST /api/reset`, remet le compte à zéro — mandat et bots supprimés).

### 3.2 · Mon compte (tableau de bord)

`GET /api/account` (ajouter `?reveal=1` pour la clé en clair) →
`{ok, profile, events, mcp_key, mcp_config, dir, key_note}`.
- **Adresse** (prouvée par la Ledger), **depuis** (`profile.created`), **connexions** (`profile.logins`),
  dernier chemin (`profile.last_via`), coffre courant (`profile.vault`).
- **Mes bots** : *N actifs (noms) · M arrêtés* depuis `state.bots` ; deux raccourcis : **gérer mes bots** (§ 3.4)
  et **parler à l'analyste** (§ 3.7).
- **Ta clé MCP** : masquée (`4y_w…RFW`), bouton **révéler / masquer** ; bouton **config Claude** qui montre
  `mcp_config` (JSON prêt à coller dans Claude : commande, arguments, `env` avec `PDS_ACCOUNT`, `PDS_MCP_KEY`,
  `PDS_JOURNAL`, `PDS_MANDATE`, `PDS_BOTS`, `ANVIL_URL`) avec un bouton **copier**. Texte : *« colle cette
  configuration dans ton Claude : il lira ton coffre, ton journal, tes bots, avec ta clé — en lecture seule »*.
- **Ce que tu as fait** : la liste `events` (les 80 derniers), du plus récent au plus ancien, une ligne par
  geste : heure, libellé, détails. Genres (`kind`) et libellés :
  `login` connexion · `session` session ouverte · `strategy` stratégie demandée · `mandate_signed` mandat signé ·
  `bot_added` bot ajouté · `run` tour lancé · `run_done` tour terminé · `bot_stopped` bot arrêté ·
  `bot_restarted` bot relancé · `bot_done` bot terminé · `notified` prévenu · `exception_signed` dérogation
  signée · `exception_refused` refus maintenu · `watch` surveillance · `analysis` question à l'analyste ·
  `reset` remise à zéro. Les autres champs de l'événement sont ses détails (bot, position, bps, outils…).
- **Déconnexion** : `POST /api/logout` (efface le cookie), puis `LedgerWeb.disconnect()`.

### 3.3 · Session, stratégie, mandat

**Le banc / la session.** Bouton **ouvrir une session** (`POST /api/boot`) : le serveur déploie un coffre au nom du
compte (et lance le fork et l'émulateur s'ils ne tournent pas). Désactivé sans compte, ou si `state.vault` existe.
Montrer `state.vault` (adresse du coffre), `state.weth` (budget disponible, wei), `state.anvil` / `state.speculos`
(le fork et l'appareil sont-ils là). Pour `dmk`/`python`, l'adresse lue sur l'appareil doit être celle du compte.

**1 · Demande une stratégie** (le chat du stratège). Un fil (`state.chat` : `{role:'user'|'assistant', text,
warning?}`), un champ, des suggestions (« 1 WETH prudemment sur des memecoins Base », « 0,5 WETH, profil offensif,
10 tranches »…). `POST /api/chat {prompt}` → `{ok, msg, proposal}`. La réponse de l'assistant montre
`rationale` et, en avertissement, `warning` (*ce que ces bornes ne protègent pas*) et la source (*claude CLI*).

**2 · Le mandat, à lire et à signer.** `state.proposal` : `budget_weth`, `max_round_trip_loss_bps`, `slice_weth`,
`ticks`, `days`, `risk` (`prudent`|`equilibre`|`offensif`), `min_depth_sizes`, `require_registry`, `rationale`,
`warning`. Afficher les bornes en cartes ; dire que **seuls budget, perte de sortie et échéance** partent sur
l'appareil (le reste guide les bots sans les lier). Bouton **valider sur le Ledger** → § 2.2 avec `kind:'mandate'`.
États : désactivé si `state.signed` ou `state.signing` ; *mandat signé ✓* ; le **dernier rapport du Signer Kit**
(`state.last_report` : `isBlindSign`, `clearSigningType`… — montrer *isBlindSign=false · eip7730*).
Après signature, `state.mandate` : `owner`, `vault`, `signature`, `signer`, `mandate{agent, budgetToken,
budgetAmount, maxRoundTripLossBps, expiry, nonce}`. Sur l'appareil, le client voit : *Exit mandate · Network Base ·
Agent · Budget 0.5 WETH · Max round-trip loss (bps) 150 · Expires*.

### 3.4 · Mes bots

Visible dès que `state.signed`.
- **Univers par défaut** : deux boutons *pools v4* / *coffres ERC-4626* (`POST /api/universe {universe:'pools'|'vaults'}`,
  lu dans `state.universe`), avec une phrase d'explication par univers (l'agent ne voit jamais la sortie / la porte).
- **Lancer un tour** : `POST /api/run` → crée un bot d'un seul tour dans l'univers courant (nommé « tour unique N ·
  pools/coffres »). Le geste simple de la démo.
- **Ajouter un bot** (formulaire) : **nom** (40 car. max, défaut « bot N »), **univers**, **tranches par tour**
  (1–12 ; les coffres plafonnent à 5), **rythme** (*un seul tour* = 0, *toutes les 30 s*, *60 s*, *5 min* ;
  libre côté API : `interval_s` en secondes), optionnel **taille de tranche** (`slice_weth`, sinon celle de la
  proposition ; minimum 0,01 WETH pour un coffre). `POST /api/bots {name, universe, ticks, interval_s, slice_weth?}`
  → `{ok, msg, bots}`. Demander la permission de notifier (Notification API) sur ce geste.
- **Bots actifs** (`state.bots` avec `status:'running'`) : nom + sous-ligne (*3 tranches · toutes les 60 s*),
  univers, **état** (*tour en cours* si `state.bot_running === bot.id`, sinon *actif · prochain tour dans N s*
  calculé depuis `next_run`, ou *en attente* pour un tour unique), **tours** (`rounds`), **achats / refus**
  (`executed` / `refused`), **dérog.** (`exceptions`), **positions**, **dépensé** (`spent_wei`), bouton **arrêter**
  (`POST /api/bots/stop {id}`). Un compte peut avoir plusieurs bots actifs ; leurs tours s'exécutent un à la fois.
- **Bots arrêtés — l'historique** (`status:'stopped'|'done'`, du plus récent au plus ancien) : nom, univers,
  **du → au** (`started` → `stopped`), tours, achats / refus, dérogations, dépensé, **fin** : badge *arrêté* ou
  *terminé* + `stop_reason` (*arrêté par le porteur*, *un seul tour demandé*, *budget du mandat consommé*, *mandat
  échu*, *plus rien de nouveau à tenter dans cet univers*, *mandat absent au redémarrage du banc*), bouton
  **relancer** (`POST /api/bots/restart {id}` ; un bot d'un tour relancé passe à 60 s).
- **Le journal** (`state.journal`, une ligne par décision, dans l'ordre) : colonnes *t* (tick, ou *déro.*),
  **bot**, position (`name` ou `pool` tronqué), hook →/← (`hook_in`/`hook_out`, pools seulement), *entrée · affiché*
  (`entry` bps pour un pool, `apy_pct` % pour un coffre, *décision humaine* sous dérogation), *sortie · porte*
  (`exit` bps ; pour un coffre `stuck_bps` ou `deposit_refused` ; *sortie lue N bps* sous dérogation), *décision*
  (`decision:'EXECUTED'` → *acheté* / *entré* ; sinon *refusé*, avec `error` en info-bulle ; sous dérogation
  *entré · dérogation ⚑*), et `why` (le pourquoi de l'agent) au survol ou dans un détail. Une ligne rouge/verte à
  gauche selon la décision. Sous le tableau, la **lecture** : *N achats, M refus* et deux phrases qui expliquent
  les colonnes (elles sont dans la maquette, à reprendre telles quelles).
- Souhaitables : filtrer le journal par bot, par univers, par décision ; une page de détail par bot (ses lignes,
  son bilan, sa courbe de dépense).

### 3.5 · Demandes hors bornes

`state.escalation` (la demande courante) et `state.escalation_queue` (celles qui attendent, dans l'ordre).
Une carte ou une modale, en or, seulement si `escalation && escalation.possible && !state.signing` :
- Le **bot** demandeur (`escalation.bot.name`), la **question** (`escalation.question` : *« ce pool coûte 354 bps à la
  sortie, ton mandat en autorise 150 — tu signes quand même ? »* ou, pour un coffre, *« Moonwell : 2 685 bps de la
  plus grosse position ne peuvent pas sortir aujourd'hui (porte à 73,2 %)… »*), `seen_exit_bps` contre
  `mandate_allows_bps`, la position (`name` ou `pool_id`), le montant (`amount_in`, wei), et *N autres demandes en
  attente* si la file n'est pas vide.
- Le texte : *hors bornes ne veut pas dire non — ça veut dire demande à l'humain. Une dérogation est à usage unique,
  liée à cette position, ce montant et au nombre que tu vas lire : si la sortie empire d'ici là, elle ne vaut plus rien.*
- **Lire et signer sur le Ledger** : `POST /api/escalate` → § 2.2 avec `kind:'exception'`. Sur l'appareil : *Exit
  exception · Position · Amount · EXIT COST (bps) · Valid until*. Pendant la signature : *ta Ledger : lis le coût de
  sortie, puis signe — ou refuse*. Après : la position apparaît avec ⚑ *acquis sous dérogation*, la demande suivante
  prend la place.
- **Laisser refusé** : `POST /api/escalate_no` → la demande est close, le refus retenu (aucun bot ne redemandera
  cette position), la suivante prend la place.
- Une **bannière** et une **notification du navigateur** quand une demande apparaît (le serveur envoie aussi un
  webhook si `PDS_NOTIFY_URL` est configuré — hors front).

### 3.6 · Positions et surveillance

- **Positions** (`state.positions`) : *budget consommé* (`state.spent`, wei) et le nombre de lignes ; tableau :
  tick (`tick`, ou *déro.*), position (`name` ou `pool`), **bot**, kind (pool / coffre), solde (`balance`, en
  notation courte), sortie à l'achat (`exit_bps`), ⚑ si `under_exception`. Note : *⚑ acquis sous dérogation : tu as
  lu le coût de sortie sur l'appareil et tu l'as assumé.*
- **Surveillance des sorties** : texte (*un hook peut laisser vendre aujourd'hui et bloquer demain… la seule parade
  est de resonder, et de sortir tant qu'on peut encore*), boutons **resonder** (`POST /api/watch`) et **resonder et
  sortir** (`POST /api/watch_sell` : sort de ce dont la sortie dépasse le mandat). `state.watching` pendant le
  sondage. Résultat `state.watch = {ts, rows, sell_if}` ; `rows[]` : `kind`, `pool_id`, `name`, `exit_bps_at_buy`,
  `exit_bps_now`, `blocked`, `delta_bps`, `action` (*aucune* | *SORTI* | *sortie refusee*). Colonnes : position,
  à l'achat, maintenant (*BLOQUÉE* si `blocked`), écart (signe et couleur), action. Phrase : *N position(s), M dont
  la sortie s'est refermée. Ce n'est pas une garantie : entre deux passages, la porte peut se fermer.*

### 3.7 · L'analyste du compte (chat)

Visible dès que `state.vault`. Un chat : champ, suggestions (*pourquoi le dernier tour a été refusé, et que
prenait le hook ?* · *quels coffres ont la porte fermée aujourd'hui, et de combien ?* · *que dit l'Earn de Ledger
d'une position, et que ne dit-il pas ?* · *que font mes bots, et lequel a le plus de refus ?*).
`POST /api/analyze {question}` → `{ok, msg}` ; une seule question à la fois (`state.analysis.pending`).
Le fil est `state.analyses[]` : `{question, pending, answer, tools_used[{tool, args}], error, ts}`. Sous chaque
réponse, la **trace des outils** : *MCP → operations() · vault_openness(vault=Moonwell) · decision(tick=1)*.
Pendant l'attente : *il interroge les outils du MCP…* (20 à 40 s). Texte d'intro : *le vrai agent, branché sur ton
compte avec ta clé ; il ne parle pas de mémoire, il interroge le MCP en lecture seule et cite l'outil derrière
chaque nombre ; il ne peut rien faire d'autre.* L'historique du fil est redonné au modèle : une question peut
renvoyer à la précédente.

### 3.8 · L'appareil

- **L'écran en direct** : `GET /api/screen?t=<horodatage>` (PNG de l'émulateur), rafraîchi ~2 fois par seconde
  quand `state.speculos`. Texte d'état : *sous tension* / *hors tension* / *en attente de toi* (`state.signing`).
- **Le doigt** : `POST /api/finger {action:'press'|'release', x, y}` sur le clic ; un glissement (press à un point,
  release à un autre) est un balayage ; un appui long (~2 s) est « Hold to sign ». Légende : *clic = appui ·
  glisse vers la gauche = balayage · appui long = Hold to sign*. Utile en banc ; avec une vraie Ledger, c'est
  l'appareil physique.
- **Le chemin de signature** (§ 3.1) et, quand il est côté serveur, le message d'attente pendant `state.signing`.
- **Le dernier rapport du Signer Kit** (`state.last_report`) et **les briques installées** (`state.ledger_stack`).

### 3.9 · Le reste

- **Schéma** : une page statique (`/schema.html`) qui montre qui fait quoi — à refaire dans le style du front.
- **Journal du banc** (`state.log[]`, chaînes) : le fil technique de tout ce qui se passe (utile en démo et en
  débogage ; peut être un panneau repliable).
- **Réinitialiser** (`POST /api/reset`) : confirmation obligatoire.
- **Notifications** : la permission se demande sur un geste (lancer un tour, ajouter un bot) ; notifier à chaque
  nouvelle demande hors bornes, et quand un bot se termine.

---

## 4 · Référence des routes

| route | corps | réponse | notes |
|---|---|---|---|
| `GET /api/state` | — | l'état complet (§ 5) | à poller ; le cookie choisit le compte |
| `GET /api/account[?reveal=1]` | — | `{ok, profile, events[], mcp_key, mcp_config, dir, key_note}` | compte requis |
| `GET /api/siwe/nonce` | — | `{nonce, domain, chainId, statement}` | nonce à usage unique |
| `POST /api/siwe/verify` | `{message, signature, address}` | `{ok, address}` + cookie | connexion, chemin navigateur |
| `POST /api/login_device` | `{}` | `{ok, address}` + cookie | connexion par l'appareil du banc |
| `POST /api/logout` | `{}` | `{ok}` (cookie effacé) | |
| `POST /api/signer` | `{signer:'browser'|'dmk'|'python'}` | `{ok, signer}` | |
| `POST /api/boot` | `{}` | `{ok, msg}` | ouvre la session : coffre au nom du compte |
| `POST /api/chat` | `{prompt}` | `{ok, msg, proposal}` | le stratège (10–30 s) |
| `POST /api/sign_mandate` | `{}` | `{ok, msg, pending_token}` | met le mandat en attente de signature |
| `GET /api/descriptor?kind=mandate|exception` | — | le descripteur JSON | pour `LedgerWeb.signTypedData` |
| `POST /api/signed` | `{kind, signature, owner, report}` ou `{kind, error}` | `{ok, msg}` | rend la signature faite dans la page |
| `POST /api/universe` | `{universe:'pools'|'vaults'}` | `{ok, universe}` | univers par défaut |
| `POST /api/run` | `{}` | `{ok, msg, pending_token}` | un bot d'un seul tour |
| `POST /api/bots` | `{name, universe, ticks, interval_s, slice_weth?}` | `{ok, msg, bots[]}` | ajoute et lance |
| `POST /api/bots/stop` | `{id}` | `{ok, msg, bots[]}` | |
| `POST /api/bots/restart` | `{id}` | `{ok, msg, bots[]}` | |
| `POST /api/escalate` | `{}` | `{ok, msg, pending_token}` | met la dérogation en attente de signature |
| `POST /api/escalate_no` | `{}` | `{ok, msg}` | laisser refusé |
| `POST /api/watch` / `POST /api/watch_sell` | `{}` | `{ok, msg}` | résultat dans `state.watch` |
| `POST /api/analyze` | `{question}` | `{ok, msg}` | réponse dans `state.analyses` |
| `POST /api/reset` | `{}` | `{ok, msg}` | remise à zéro du compte |
| `GET /api/screen?t=` | — | PNG | l'écran de l'appareil |
| `GET /api/events` | — | `{events[]}` | les textes affichés à l'écran (émulateur) |
| `POST /api/finger` | `{action, x, y}` | `{ok}` | le doigt sur l'émulateur |
| `GET /schema.html`, `GET /dist/ledger-web.js`, `/speculos/*` | — | — | statique ; proxy de l'émulateur pour le bundle |

Les actions (`boot`, `sign_mandate`, `run`, `escalate`, `escalate_no`, `watch`, `watch_sell`, `reset`) répondent
toutes `{ok, msg, pending_token}` (`pending_token` vaut `null` quand rien n'attend une signature).

---

## 5 · Le modèle de données (`GET /api/state`)

```
anvil, speculos          bool   le fork et l'appareil répondent
ledger_stack             {dmk, signer_kit, …: versions}      ring: statut du Key Ring ou null
address                  adresse du compte (somme de contrôle) ou null (invité)
owner, vault, weth       propriétaire du coffre, adresse du coffre, WETH disponible (wei, chaîne)
signer                   'browser' | 'dmk' | 'python'        universe: 'pools' | 'vaults'
chat[]                   {role, text, warning?}               proposal: § 3.3 ou null
signing                  'mandate' | 'exception' | null       pending: {kind, typedData, expiry, token, …} ou null
mandate, signed          § 3.3 ; bool                          last_report: rapport du Signer Kit ou null
running, bot_running     un tour est en cours ; l'id du bot
bots[]                   {id, name, universe, ticks, interval_s, slice_wei, created, started, stopped, status,
                          rounds, next_run, stop_reason, executed, refused, exceptions, positions, spent_wei, last_ts}
journal[]                {tick, bot, pool, hook, kind, name, apy_pct, under_exception, own_bps, stuck_bps,
                          deposit_refused, entry, exit, hook_in, hook_out, registry, decision, error, why}
spent                    wei dépensés (chaîne)                positions[]: {pool, token, kind, name, bot, exit_bps,
                                                                            tick, under_exception, balance}
escalation               {possible, pool_id, hook, currency1, fee, tickSpacing, seen_exit_bps, mandate_allows_bps,
                          amount_in, question, bot:{id,name}, name?, vault?, ref_holder?} ou null
escalation_queue[]       mêmes objets, en attente              refused_escalations[]: pool_ids refusés
exception_buys[]         {pool, token, name, kind, exit_bps, tick:'déro.', under_exception, bot}
watch, watching          {ts, rows[], sell_if} ou null ; bool
analysis, analyses[]     la question en cours ; le fil (§ 3.7)
log[]                    le journal du banc (chaînes)
```

Les événements du compte (`GET /api/account`) : `{ts, kind, …détails}` (§ 3.2).

---

## 6 · Règles et états à respecter

1. **Une seule chose à la fois avec l'appareil.** Pendant `state.signing`, tout ce qui signe est désactivé ; les
   tours des bots attendent ; les demandes hors bornes ne s'affichent pas.
2. **Une signature en attente n'est prise que par l'onglet qui l'a demandée** (le `pending_token`). Après un
   rechargement, l'onglet au premier plan peut la reprendre ; un onglet en arrière-plan, jamais.
3. **Le mandat d'abord** : pas de bots, pas de surveillance sans `state.signed` ; pas de session sans compte.
4. **Les bots partagent le mandat** : le budget consommé et la perte de sortie tolérée sont ceux du compte, pas du
   bot. Un bot s'arrête seul quand le budget est consommé, le mandat échu, ou l'univers épuisé.
5. **Les demandes hors bornes font la queue** : une à la fois, celles du dernier tour devant ; *laisser refusé*
   retient le refus.
6. **Les erreurs** : `ok:false` → toast avec `msg`. Trois messages de l'appareil à traduire pour le client :
   *0x6985* refusé sur l'appareil ; *0x6980* l'app est coincée après un message abandonné (quitter et rouvrir
   l'app Ethereum) ; *0x6901* un autre client parle à l'appareil (fermer les autres onglets, rouvrir l'app).
7. **WebHID** : Chrome, Edge, Brave seulement ; sans Ledger Live ouvert (il tient l'appareil). Proposer
   l'émulateur du banc sinon.
8. **Le redémarrage du serveur** rend le compte tel quel (coffre, mandat, journal, positions, bots) — sauf la
   conversation avec le stratège.

---

## 7 · Ce que le front peut préparer, mais que le serveur n'a pas encore

- **Reprendre ses fonds** et **révoquer le mandat** depuis la page (le contrat le permet : `withdraw`, `revoke`) :
  il faut une transaction signée par le porteur (`signTransaction` du Signer Kit, puis envoi) — prévoir les deux
  boutons et l'état *à venir*.
- **Une clé de session par compte** (aujourd'hui tous les comptes partagent la clé d'agent du banc).
- **Du SSE** à la place du polling ; **des filtres** sur le journal ; **une page par bot** ; **mobile**.
- **Plusieurs comptes** dans un même navigateur (un cookie = un compte aujourd'hui).

---

## 7 bis · Peut-être, pour le jury (6 octobre) — à prévoir dans la maquette, pas encore servi

- **Un univers « coffres USDC »** dans le sélecteur d'univers d'un bot, si le serveur le sert d'ici là (un juré
  vient de Circle). Rien d'autre à dessiner : même table, même refus, en dollars.

## 8 · Repères

- Captures de la maquette, pour le comportement, pas pour le style : `captures/front-a-z.png` (la page entière,
  après un parcours complet), `captures/front-compte.png` (mon compte), `captures/front-bots.png` (mes bots, actifs
  et historique), `captures/front-coffres-derogation.png`, `captures/front-schema.png`.
- La maquette est sombre, libellés en petites capitales monospace, trois couleurs qui veulent dire quelque chose :
  **or** = ce qui demande le porteur (mandat, dérogation), **vert** = entré / acheté / actif, **rouge** = refusé.
  Tu es libre du reste.
- Pour tester sans matériel : `python3 web/server.py`, `ledger/speculos.sh up` (l'émulateur), `python3
  scripts/porteur.py 3600 3 &` (un porteur automatique qui approuve les écrans), puis `node scripts/parcours.mjs`
  (le parcours complet en Chromium headless : ce que ton front doit permettre de refaire à la main).
- Le serveur, en une lecture : `web/server.py` (routes en bas, actions au milieu, bots dans `run_round` et
  `ensure_scheduler`) ; les comptes : `web/accounts.py`.
