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

## 9 · Ce que je changerais pour mieux mettre le produit en avant

Par ordre d'effet sur un jury qui a une minute par page.

1. **Une langue.** Fait le 11 octobre : tout le front est en anglais (scène, home, schéma, nav, pied de page, pages du
   compte). Reste en français ce que le serveur envoie et que la page affiche tel quel : les messages `msg` des POST,
   les textes du stratège et de l'analyste, les motifs d'arrêt des bots (`web/server.py`, `web/strategist.py`,
   `agent/*.py`). C'est le prochain chantier si le jury lit les toasts.
2. **Un nom.** L'appareil écrit `MONOLITH`, le site s'appelle *Porte de sortie*, le README dit « PORTE DE SORTIE ».
   Le ring du home dit MONOLITH, celui du schéma dit SCHÉMA. Choisir le nom du produit et l'écrire une fois partout
   (ring, nav, titre de l'onglet, description).
3. **Montrer le produit, pas seulement la preuve.** Le home prouve (chiffres, frise, retours) mais ne **montre**
   jamais une page du compte. Le jury ne branchera pas de Ledger : il faut une bande « ce que vous verrez » avec
   trois écrans réels en image, pris par `scripts/parcours-app.mjs` : le mandat à côté du miroir de l'appareil, une
   demande hors bornes avec ses deux issues (signer / laisser refusé), les positions avec un `BLOCKED`. Même grammaire
   que les miroirs actuels, mais des captures, pas des maquettes.
4. **La dérogation est le moment du produit.** « Ça revient sur l'appareil avec le nombre » est la phrase que
   personne d'autre ne peut dire. Je lui donnerais la place du compteur : une bande où l'écran de la Flex émulée
   affiche `EXIT COST (BPS) 2693` et où les deux issues ont le même poids. Aujourd'hui elle est au milieu du home,
   en texte.
5. **Deux portes au bout, pas une.** « Open your account » exige le banc et une Ledger. À côté, « Voir la
   démonstration » : la vidéo du parcours de 124 s (ou la frise, déjà là, mais nommée comme telle), pour quelqu'un qui
   lit depuis un lien.
6. **Relier le home au schéma par bande.** Chaque bande du home a sa bande jumelle sur le schéma (le piège ↔ « Ce qui
   est mesuré », une signature ↔ « Une signature, pas à pas », les briques ↔ « Les briques du sujet »). Un lien
   discret vers la section jumelle du home (`/home#the-overflow`), dans le style de `Source`. Devenu sans objet le 12 octobre : les deux sont sur la même page.
7. **Le rapport du kit, visible.** DESIGN.md le demande (« `isBlindSign=false · eip7730` est la preuve que l'appareil
   a lu des champs et non un blob ») ; il n'apparaît que dans la frise. Je l'écrirais sous le miroir du mandat, sur
   le home comme dans `/app`.
8. **Le compte sur le registre du home.** Les pages du compte utilisent encore le registre du premier brief (titres
   en capitales condensées, bandeaux pleins, trois cartes égales). Sans canvas, par choix (three.js ne s'y
   télécharge pas), elles peuvent prendre le registre que le schéma vient d'adopter : takeaway, titre en bas de casse,
   rangées à filets (`rows`, `kv`, `bricks-list`, `stats`), une seule couleur d'accent par écran. C'est la suite
   logique de « le reste du frontend sur les règles de test4 ».
9. **Le coût du schéma.** Il paie la scène entière (three.js 270 kB gzip, le FBX de 5,4 MB, le GLB) pour montrer le
   trou seul. Une entrée « finie » qui ne charge pas les appareils demanderait de rouvrir `src/scene/` ; à décider.
10. **Les métadonnées.** `index.html` : description en français, pas d'`og:image`, pas d'`og:title`. Mettre
    `poster-home-landscape.jpg` en image de partage et la phrase du produit en description, dans la langue choisie.
11. **Le « trusted by » qui manque, version honnête.** Une bande courte « mesuré sur » : Base, bloc 50 614 000,
    Uniswap v4, Morpho, Ledger Flex (émulée et réelle), avec les versions des briques. Les versions sont déjà dans
    `state.ledger_stack`.
12. **Le pied de page**. Il passait sous le canvas sur le home (corrigé le 11 octobre : il est positionné). Y mettre
    les trois liens qui manquent : README, FEEDBACK, le dépôt.

---

## 10 · Pour un jury de hackathon : le visuel d'abord (11 octobre, après le passage en anglais)

Classé par ce que le jury retient en une minute, puis par coût.

1. **Fait le 12 octobre : la page `/demo` en trois modes.** Le rejeu (huit scènes, les vraies captures de la Flex), la carte du schéma allumée en direct par le banc (option A), le cockpit du présentateur (option B). Vérifié en direct : mandat clear-signé sur la Flex émulée, bots pools et coffres, la demande hors bornes sur Moonwell signée sur la Flex. Reste : la vidéo de repli pour un lien froid. L'idée d'origine : À gauche la Flex émulée en direct (le flux `/api/screen` et le
   doigt existent déjà sur `/appareil`), à droite les panneaux du compte qui se remplissent, en bas la frise des
   124 s qui avance. Un bouton « Play » lance `scripts/parcours-app.mjs` côté banc, ou rejoue un enregistrement
   (événements + captures d'écran de la Flex en JSON) pour tourner sans appareil et sans réseau. Le moment clé : la
   demande hors bornes, l'écran `EXIT COST (BPS) 2693`, les deux issues avec le même poids. Un fichier vidéo en
   repli pour un lien froid.
2. **La dérogation en plein écran.** C'est la phrase que personne d'autre ne peut dire : « ça revient sur l'appareil
   avec le nombre ». Une bande du home où la Flex occupe le cadre devant le trou noir, l'écran affiche le coût lu, et
   « read and sign » / « leave refused » sont deux vrais boutons. La version banc fait signer pour de vrai sur
   l'émulateur, la version statique joue l'écran.
3. **Un compte « jury » pré-rempli.** `?jury=1` (ou un compte de démonstration) avec des bots qui ont tourné, deux
   achats, huit refus, une demande hors bornes en attente et une position bloquée : chaque page du compte montre
   d'emblée son état le plus riche. Aujourd'hui un compte neuf affiche surtout des états vides.
4. **L'explorateur de pièges.** Les six pools et les dix coffres en une table vivante : survoler un pool fait rouler
   son `0 → 9 990`, la colonne « ce que l'agent voit » contre « ce que le contrat mesure ». Les données existent
   (`universe_facts`, `vault_openness`, `hook_analysis` via le MCP).
5. **Ce que vous verrez.** Trois captures réelles du compte sur le home (le mandat à côté du miroir, la demande hors
   bornes, les positions), dans la grammaire des miroirs actuels. Le jury ne branchera pas de Ledger.
6. **La carte du schéma, cliquable.** Un nœud cliqué allume ses arêtes et ouvre sa description (quatre portes :
   pointeur, tape, clavier, patience), sans bibliothèque de diagramme.
7. **Le trou sous le compte, sans WebGL.** Les pages du compte restent sans three.js par règle. Une image fixe du
   ring (`poster-home-landscape.jpg`, déjà dans `public/`) sous les mêmes feuilles de verre leur donne la continuité
   visuelle du home pour zéro kilo-octet de script.
8. **Des compteurs vivants sur le home.** « Mesuré sur le fork, maintenant » : nombre de refus, de dérogations, de
   positions, lus sur `/api/state` quand le banc tourne, les valeurs du 25 septembre sinon. Un seul compteur qui
   roule par bande, jamais dans un tableau.
9. **La porte de démonstration.** Sur `/connexion`, un bouton « Try it on the emulated Flex » qui fait tout en un
   clic (appareil du banc, session, coffre), à côté du parcours réel en WebHID.
10. **L'état de l'appareil dans la barre.** Un point incandescent à côté de l'adresse quand la Flex est allumée,
    éteint sinon : le vocabulaire du hero (l'emphase par la luminosité) porté dans le chrome.
11. **Un nom.** `MONOLITH` sur l'appareil et dans le ring, « Porte de sortie » dans la barre et l'onglet. Choisir, et
    l'écrire une fois partout.
12. **Le reste du français.** Ce que le serveur envoie s'affiche tel quel : « appareil du banc (adresse lue sur la
    Ledger) » sur la page du compte et dans l'historique, les messages des POST, le stratège, l'analyste, les motifs
    d'arrêt des bots. À traduire dans `web/server.py`, `web/strategist.py`, `web/accounts.py` et `agent/*.py`.

---

## 11 · Le 12 octobre au soir (Jean-Baptiste)

La branche est fusionnée telle quelle. Ce qui manquait au produit a été remis dans ta charte, sans toucher à la scène, à
l'accueil ni à la démo : `/trades` (les agents avec toutes leurs options, les demandes hors bornes, les positions, le
journal) et `/account` (le dépôt et le retrait signés sur la Ledger, l'analyste au complet, la clé MCP, l'historique).
Sur la carte, le nœud Ledger nomme ses quatre gestes et s'allume sur celui en cours ; le nœud des bots a quatre
emplacements qui se remplissent. Les tiroirs de la carte vivante portent la phrase des bornes, les fonds, les tranches,
l'analyste. La porte reste quand on est connecté (c'est là qu'on change d'appareil). Tout est rejoué sur la Flex
émulée : `front/APP.md`.
