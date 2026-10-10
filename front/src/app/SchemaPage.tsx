/**
 * /schema — who does what, as complete as we can make it: the principle, the agents, the site and the account, one signature
 * step by step, the analyst's ten tools, the bricks of the brief, the numbers, the limits, what it needs to run, the findings.
 * No diagram library: panels and one-turn hairlines, the grammar the hero established.
 */
import { AnchoredNote, Band, Panel, Row } from './ui'
import { SchemaMap } from './SchemaMap'

export function SchemaPage() {
  return (
    <>
      <Band
        index="00"
        eyebrow="Vue d’ensemble"
        title="Tout le système sur une feuille"
        lead="Qui signe, qui agit, qui mesure, qui comprend, qui garde le secret. Orange : ce que le porteur approuve. Vert : ce qui lit sans pouvoir agir. Bleu : le secret."
      >
        <SchemaMap />
        <AnchoredNote>
          Un seul chemin mène à un achat : un bot, sa clé de session, <b>le coffre</b>. Tout le reste lit, mesure ou signe
          une règle. Le modèle de langage est à droite, du côté qui ne peut rien faire.
        </AnchoredNote>
      </Band>
      <Band
        index="01"
        eyebrow="Le principe"
        title="Celui qui agit ne pense pas. Celui qui pense ne peut pas agir."
        lead="Un agent ne peut pas entrer dans une position dont il ne sait pas sortir. La règle naît sur votre Ledger, un contrat l’applique à chaque entrée, et ce qui déborde vous revient avec le nombre."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="Vous signez — le Signer" title="Une fois">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Votre Ledger signe trois choses : la connexion, le mandat, chaque dérogation. Jamais un achat. Le Signer Kit de Ledger
              tourne dans votre navigateur ; l’appareil affiche le budget, la perte de sortie tolérée et l’échéance, en clair.
            </p>
            <div className="mt-5">
              <Row label="Brique" value="Signer Kit · DMK" />
              <Row label="Standard" value="EIP-712 · EIP-4361" />
            </div>
          </Panel>
          <Panel kicker="Le contrat applique" title="À chaque entrée">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Le coffre achète et simule la revente dans la même transaction. Si la sortie coûte plus que votre mandat, il refuse.
              Pour un coffre à rendement, il fait le dépôt et le retrait réels, annulés, et lit la porte du plus gros déposant.
            </p>
            <div className="mt-5">
              <Row label="Contrat" value="ExitVault" />
              <Row label="Univers" value="Uniswap v4 · ERC-4626" />
            </div>
          </Panel>
          <Panel kicker="Ce qui déborde vous revient" title="Avec le nombre">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Un refus négociable devient une demande sur l’appareil. Vous lisez le coût réel de sortie et vous signez une dérogation
              à usage unique — ou vous laissez refusé. Si la sortie empire entre-temps, la dérogation ne vaut plus rien.
            </p>
            <div className="mt-5">
              <Row label="Écran" value="EXIT COST (BPS)" />
              <Row label="Portée" value="une position, une fois" />
            </div>
          </Panel>
        </div>
      </Band>

      <Band
        index="02"
        eyebrow="L’autre axe"
        title="Tout le monde borne la dépense. Personne ne borne la sortie."
        lead="Un plafond par jour, une liste de contrats, un glissement maximal : tout le monde borne ce qu’un agent engage. Personne ne vérifie ce qu’il pourra récupérer. Un jeton qu’un hook empêche de revendre, un coffre dont on ne sort qu’après une file d’attente : la même porte fermée."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="Le complément des Agent Policies" title="L’autre axe">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Les Agent Policies de Ledger bornent ce qu’un agent dépense. Nous bornons ce qu’il pourra récupérer. Ce n’est pas la
              même chose, et ça ne peut pas vivre au même endroit : leur borne vit dans l’appareil, la nôtre exige de mesurer le marché
              dans la transaction même.
            </p>
            <div className="mt-5">
              <Row label="Eux" value="ce que l’agent engage" />
              <Row label="Nous" value="ce qu’il peut ressortir" />
            </div>
          </Panel>
          <Panel kicker="La règle plutôt que le geste" title="Signer une fois">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Approuver chaque achat sur l’appareil tue l’autonomie et endort le porteur, qui finit par tout accepter. Ici le porteur
              approuve <b>la règle</b> une fois ; l’agent agit seul dedans ; seul ce qui déborde revient à l’appareil, avec le nombre.
            </p>
            <div className="mt-5">
              <Row label="Geste par geste" value="une signature par achat" />
              <Row label="Par la règle" value="une signature, puis les dérogations" />
            </div>
          </Panel>
          <Panel kicker="Pourquoi un contrat, et pas l’appareil" title="Il autorise, le contrat mesure">
            <p className="t-body-sm m-0 text-on-primary-mute">
              L’appareil n’a ni réseau ni état : il ne peut pas mesurer le marché. Il autorise la règle, en clair, et le contrat la
              mesure à chaque entrée, dans le bloc d’exécution. C’est la seule place où le coût de sortie se lit au moment où il compte.
            </p>
            <div className="mt-5">
              <Row label="L’appareil" value="lit, autorise" />
              <Row label="Le contrat" value="mesure, refuse" />
            </div>
          </Panel>
        </div>
      </Band>

      <Band
        index="03"
        eyebrow="Les agents"
        title="Deux sortes d’agents, une frontière"
        lead="La frontière est nommée : l’agent choisit quelle position prendre, quand et combien ; l’humain signe le budget, la sortie tolérée et l’échéance ; le contrat applique. L’agent ne peut ni relever le seuil, ni changer la règle, ni toucher à la clé."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="Ils agissent — sans modèle de langage" title="Les bots">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Des agents d’exécution que vous nommez, lancez et arrêtez. L’un fait du DCA sur la longue traîne Uniswap v4, l’autre
              cherche du rendement sur des coffres. Ils classent sur ce qu’ils voient et ne voient jamais la sortie : c’est le
              contrat qui la mesure. Leur clé ne peut appeler que votre coffre.
            </p>
            <div className="mt-5">
              <Row label="Rythme" value="un tour · 30 s · 60 s · 5 min" />
              <Row label="Ordonnancement" value="un tour à la fois par compte" />
              <Row label="Mémoire" value="le journal, ligne par ligne" />
            </div>
          </Panel>
          <Panel kicker="Il comprend — Agent Stack" title="L’analyste">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Claude, branché uniquement sur nos outils en lecture seule. Il répond par les données de votre compte, cite l’outil
              derrière chaque nombre, et ne peut rien signer, rien envoyer, rien arrêter. Le wallet-cli de Ledger est un de ses outils.
            </p>
            <div className="mt-5">
              <Row label="Outils" value="10 · lecture seule" />
              <Row label="Clé" value="dérivée de votre adresse" />
              <Row label="Exemple" value="bots() · vault_openness()" />
            </div>
          </Panel>
        </div>
        <AnchoredNote>
          Aucun modèle de langage ne touche une clé. Une consigne injectée dans une page que l’agent lit peut le faire
          <b> choisir</b> un piège ; elle ne peut pas lui faire <b>dépasser</b> votre mandat.
        </AnchoredNote>
      </Band>

      <Band
        index="04"
        eyebrow="Le site"
        title="Avant le compte, l’idée. Dans le compte, ce qui est à vous."
        lead="Un service comme un autre : on comprend d’abord, on se connecte avec sa Ledger, puis on retrouve son coffre, ses agents, son analyste et ses données."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="Ouvert à tous" title="La pub et l’idée">
            <Row label="/" value="le héros, le pitch, comment ça marche" />
            <Row label="/schema" value="tout le système — cette page" />
            <Row label="/connexion" value="choisir sa Ledger, signer le message" />
          </Panel>
          <Panel kicker="Avec votre Ledger" title="Votre espace">
            <Row label="/app" value="vue d’ensemble : coffre, mandat, demandes, positions" />
            <Row label="/app/agents" value="mes agents de trading" />
            <Row label="/app/analyste" value="mon agent d’analyse" />
            <Row label="/compte" value="mes infos, ma clé MCP, mon historique" />
            <Row label="/appareil" value="ma Ledger, son écran en direct" />
          </Panel>
        </div>
        <AnchoredNote>
          Une page du compte ouverte sans session renvoie vers la connexion, puis revient où vous alliez. Se déconnecter
          ramène à la porte : rien de votre compte ne reste à l’écran.
        </AnchoredNote>
      </Band>

      <Band
        index="05"
        eyebrow="Le compte"
        title="Une adresse prouvée, un dossier, une clé écrite nulle part"
        lead="Pas de base d’utilisateurs, pas de mot de passe : un compte, c’est l’adresse qui a signé le message de connexion. Tout ce qui lui appartient est rangé sous elle, et rien d’un autre compte ne lui est visible."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="Se connecter" title="Sign-In with Ethereum">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Un message EIP-4361 en ASCII pur — un seul caractère accentué et le Signer Kit jette tout, un bug que nous documentons — signé sur l’appareil dans le
              navigateur, vérifié par le serveur : nonce à usage unique, adresse, signature. Ensuite, une session par cookie.
              En banc, l’adresse peut aussi être lue sur la Flex émulée.
            </p>
            <div className="mt-5">
              <Row label="Standard" value="EIP-4361" />
              <Row label="Session" value="cookie HttpOnly" />
            </div>
          </Panel>
          <Panel kicker="Ce qui est à vous" title="accounts/‹adresse›/">
            <Row label="profile.json" value="arrivée, connexions, coffre" />
            <Row label="mandate.json" value="le mandat signé" />
            <Row label="bots.json" value="vos agents de trading" />
            <Row label="journal.jsonl" value="chaque décision, au nom du bot" />
            <Row label="notifications.jsonl" value="ce dont on vous a prévenu" />
            <Row label="events.jsonl" value="ce que vous avez fait" />
          </Panel>
          <Panel kicker="Votre clé MCP" title="Dérivée, jamais stockée">
            <p className="t-body-sm m-0 text-on-primary-mute">
              HMAC-SHA256(secret maître, adresse) : la clé se recalcule à chaque besoin et n’ouvre que vos fichiers. Un seul
              secret à garder pour tous les comptes — celui que le Ledger Key Ring scelle.
            </p>
            <div className="mt-5">
              <Row label="Votre clé" value="vos données, en lecture" />
              <Row label="Celle d’un autre" value="refusée" />
              <Row label="Aucune" value="refusée" />
            </div>
          </Panel>
        </div>
        <AnchoredNote>
          Ce que la connexion prouve, honnêtement : <b>une adresse</b>, pas un appareil — tout portefeuille sait signer ce message.
          La Ledger fait la différence au <b>mandat</b> : c’est sur son écran que la règle se lit en clair et se signe.
        </AnchoredNote>
      </Band>

      <Band
        index="06"
        eyebrow="Une signature, pas à pas"
        title="Le serveur demande, votre page fait signer, le contrat vérifie"
        lead="Le serveur ne voit jamais l’appareil. Il met une signature en attente ; seule la page qui l’a demandée la fait signer sur votre Ledger ; le contrat vérifie avant d’agir. Ici, une dérogation."
      >
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Étape</th><th>Qui</th><th>Ce qui se passe</th></tr></thead>
            <tbody>
              <tr><td className="num">1</td><td className="label text-text-050">Un agent de trading</td><td className="label is-mute">veut entrer ; le coffre mesure la sortie dans la transaction même et refuse : elle coûte plus que votre mandat</td></tr>
              <tr><td className="num">2</td><td className="label text-text-050">Le serveur</td><td className="label is-mute">prépare la dérogation (EIP-712 : position, montant, coût de sortie lu, échéance) et la met en attente avec un jeton</td></tr>
              <tr><td className="num">3</td><td className="label text-text-050">Votre page</td><td className="label is-mute">celle qui a demandé — elle tient le jeton — récupère le descripteur de clear signing de votre coffre</td></tr>
              <tr><td className="num">4</td><td className="label text-text-050">Le Signer Kit</td><td className="label is-mute">dans votre navigateur, envoie la dérogation à l’appareil : WebHID, ou la Flex émulée par le proxy</td></tr>
              <tr><td className="num">5</td><td className="label text-text-050">Votre Ledger</td><td className="label is-mute">affiche EXIT COST (BPS) et le reste en clair ; vous signez, ou vous refusez</td></tr>
              <tr><td className="num">6</td><td className="label text-text-050">Le contrat</td><td className="label is-mute">vérifie la signature et remesure la sortie : si elle a empiré depuis votre lecture, il refuse ; sinon il entre, une fois</td></tr>
            </tbody>
          </table>
        </div>
        <AnchoredNote>
          Un seul client à la fois sur l’appareil : deux pages qui lui parlent pendant que vous lisez cassent la signature
          (<span className="t-mono-data">0x6901</span>). Un second onglet ne signe donc jamais ce qu’il n’a pas demandé.
        </AnchoredNote>
      </Band>

      <Band
        index="07"
        eyebrow="Les outils de l’analyste"
        title="Dix outils, tous en lecture"
        lead="L’analyste est lancé avec ces dix outils et rien d’autre. Il répond en les appelant, et la page montre sous chaque réponse lesquels il a appelés, avec leurs arguments."
      >
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Outil</th><th>Ce qu’il rend</th></tr></thead>
            <tbody>
              <tr><td className="label t-mono-data text-text-050">bots</td><td className="label is-mute">vos agents de trading : actifs et arrêtés, univers, rythme, tours, achats et refus, dérogations, dépense, motifs de refus</td></tr>
              <tr><td className="label t-mono-data text-text-050">operations</td><td className="label is-mute">les opérations tentées, l’issue et son motif — par agent si on le demande</td></tr>
              <tr><td className="label t-mono-data text-text-050">decision</td><td className="label is-mute">tout ce qui a mené à une décision : univers, liste courte, scores et leur détail, sonde, issue</td></tr>
              <tr><td className="label t-mono-data text-text-050">positions</td><td className="label is-mute">ce que le coffre détient, quel agent l’a pris, ce qui reste du budget signé</td></tr>
              <tr><td className="label t-mono-data text-text-050">mandate</td><td className="label is-mute">le mandat signé sur la Ledger, et ce qu’il autorise</td></tr>
              <tr><td className="label t-mono-data text-text-050">compare_entry_exit</td><td className="label is-mute">l’entrée contre la sortie, opération par opération</td></tr>
              <tr><td className="label t-mono-data text-text-050">universe_facts</td><td className="label is-mute">pourquoi un piège est indiscernable avant l’achat, chiffres à l’appui</td></tr>
              <tr><td className="label t-mono-data text-text-050">hook_analysis</td><td className="label is-mute">ce que chaque hook prend, remesuré en direct par le contrefactuel de TARE, à l’entrée et à la sortie</td></tr>
              <tr><td className="label t-mono-data text-text-050">vault_openness</td><td className="label is-mute">la porte des coffres ERC-4626, mesurée maintenant : aller-retour réel, part bloquée du plus gros déposant, coffres pleins</td></tr>
              <tr><td className="label t-mono-data text-text-050">ledger_earn_yields</td><td className="label is-mute">ce que l’Agent Stack de Ledger (wallet-cli earn yields) dit d’une position à rendement — et ce qu’il n’en dit pas : la sortie</td></tr>
            </tbody>
          </table>
        </div>
        <AnchoredNote>
          Aucun de ces outils ne signe, n’envoie de transaction, ne lance ni n’arrête un agent. La clé qui les ouvre est celle
          de votre compte : l’analyste ne voit que vos données.
        </AnchoredNote>
      </Band>

      <Band
        index="08"
        eyebrow="Les briques du sujet"
        title="Trois briques, un rôle chacune"
        lead="Le sujet demande d’utiliser Ledger comme couche de confiance. Voici ce que chaque brique fait ici, et pas ailleurs."
      >
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Brique</th><th>Son rôle</th><th>Chez nous</th></tr></thead>
            <tbody>
              <tr><td className="label text-text-050">Signer · DMK</td><td className="label">Approuver</td><td className="label is-mute">Connexion, mandat et dérogations signés sur l’appareil, dans le navigateur du client (WebHID) ou sur la Flex émulée. Nos descripteurs affichent la règle en clair.</td></tr>
              <tr><td className="label text-text-050">Agent Stack</td><td className="label">Lire et comprendre</td><td className="label is-mute">L’analyste, son MCP en lecture seule, le wallet-cli de Ledger comme outil, nos skills au format de Ledger.</td></tr>
              <tr><td className="label text-text-050">Ring CLI · Key Ring</td><td className="label">Garder un secret</td><td className="label is-mute">Le secret maître dont dérivent toutes les clés MCP des comptes, scellé sous la graine de l’opérateur.</td></tr>
              <tr><td className="label text-text-050">Clear signing</td><td className="label">Afficher</td><td className="label is-mute">Le mandat lisible sur le Flex : budget, perte de sortie tolérée, échéance — et le coût de sortie d’une dérogation. Nos descripteurs sont signés avec la clé de test de Ledger, dans une compilation de leur app de série : Ledger ne signe que pour ses partenaires. Pour un vrai produit, Ledger signe nos descripteurs (ils sont déjà dans l’esprit d’ERC-7730) et l’app de série marche sans changement.</td></tr>
              <tr><td className="label text-text-050">Vraie Ledger</td><td className="label">Prouver</td><td className="label is-mute">Le mandat a été clear-signé sur un Flex réel en USB, par le Signer Kit, et la signature vérifiée par ecrecover. Dans le navigateur, la même page parle à une vraie Ledger en WebHID ou au Flex émulé.</td></tr>
            </tbody>
          </table>
        </div>
      </Band>

      <Band
        index="09"
        eyebrow="Ce qui est mesuré"
        title="Deux univers, le même refus"
        lead="Les nombres viennent de la chaîne, sur un fork de Base au bloc 50 614 000."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="Uniswap v4">
            <p className="t-numeral-hero m-0 text-text-050" style={{ fontSize: 'clamp(64px, 8vw, 112px)' }}>9 990</p>
            <p className="t-body-sm m-0 mt-2 text-on-primary-mute">points de base à la sortie, pour 0 à l’entrée. Six pools réels, le même hook, indiscernables avant d’acheter.</p>
          </Panel>
          <Panel kicker="Coffres ERC-4626">
            <p className="t-numeral-hero m-0 text-text-050" style={{ fontSize: 'clamp(64px, 8vw, 112px)' }}>27 %</p>
            <p className="t-body-sm m-0 mt-2 text-on-primary-mute">de la porte du plus gros coffre WETH de Base est fermée. Son API affiche un rendement, jamais la sortie.</p>
          </Panel>
          <Panel kicker="Coffres ERC-4626">
            <p className="t-numeral-hero m-0 text-text-050" style={{ fontSize: 'clamp(64px, 8vw, 112px)' }}>5 / 10</p>
            <p className="t-body-sm m-0 mt-2 text-on-primary-mute">coffres refusent même le dépôt au bloc des mesures. Le standard écrit le piège lui-même : la prévisualisation du retrait doit ignorer les limites.</p>
          </Panel>
        </div>
        <AnchoredNote>
          La mesure s’appelle TARE : on recote le pool avec <b>un hook inerte</b> de 89 octets, et l’écart entre les deux cotations est
          ce que le hook prend, à l’entrée comme à la sortie. Un contrefactuel, rejouable, sur un fork de la chaîne au bloc du moment.
        </AnchoredNote>
      </Band>

      <Band
        index="10"
        eyebrow="Ce que ça n’attrape pas"
        title="Dit avant qu’on nous le demande"
        lead="Pas « garanti ». La sonde regarde le bloc d’exécution : ce qui est vrai à l’entrée l’est à l’entrée. Voici les limites, et ce qu’il faudrait pour le réseau principal."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel kicker="La limite" title="Après l’achat">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Un interrupteur basculé après l’achat se surveille, il ne se prévient pas. Le veilleur resonde chaque position à intervalle
              et vend dès que la sortie dépasse le mandat ; entre deux sondes, la porte peut bouger. Et ces bornes mesurent la sortie,
              pas la valeur du jeton : un pool parfaitement liquide peut perdre toute sa valeur.
            </p>
          </Panel>
          <Panel kicker="Le réseau principal" title="Ce qui bloque, honnêtement">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Le coffre, la sonde, les coffres Morpho et les pools v4 sont les vrais, lus sur un fork épinglé pour que les nombres se
              rejouent. Passer en réseau principal, c’est un nœud, un déploiement et une clé d’agent avec du gaz — et trois choses à
              finir : le clear signing sur l’app de série (Ledger doit signer nos descripteurs), le dépôt et le retrait signés par la
              Ledger dans la page (le contrat les a, le bouton pas encore), et un nœud qui accepte les surcharges d’état pour TARE.
            </p>
          </Panel>
          <Panel kicker="En dollars" title="La même porte">
            <p className="t-body-sm m-0 text-on-primary-mute">
              Le rendement en stablecoin a la même porte. Un coffre USDC dont on ne sort pas est un dépôt à terme que personne n’a
              signé. Le mandat porte déjà un jeton de budget ; le standard ERC-4626 écrit le piège de la même façon quel que soit l’actif.
            </p>
          </Panel>
        </div>
      </Band>

      <Band
        index="11"
        eyebrow="Ce qu’il faut pour le faire tourner"
        title="Les clés, et ce qui se passe quand l’une manque"
        lead="Le banc tourne sur une machine : un fork de Base, une Flex émulée, un serveur. Voici ce qu’il lui faut, et ce qu’il dit quand ça manque."
      >
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Quoi</th><th>Son rôle</th><th>S’il manque</th></tr></thead>
            <tbody>
              <tr><td className="label t-mono-data text-text-050">BASE_RPC_URL</td><td className="label">le fork de Base au bloc 50 614 000</td><td className="label is-mute">obligatoire : le banc démarre, et l’ouverture de session dit « BASE_RPC_URL introuvable »</td></tr>
              <tr><td className="label t-mono-data text-text-050">claude</td><td className="label">le stratège et l’analyste (le CLI)</td><td className="label is-mute">le stratège retombe sur une règle de repli et la page le dit ; l’analyste refuse de répondre de mémoire</td></tr>
              <tr><td className="label t-mono-data text-text-050">mcp/.mcp-key</td><td className="label">le secret maître des clés de compte</td><td className="label is-mute">créé au premier appel ; scellable dans le Ledger Key Ring de l’opérateur</td></tr>
              <tr><td className="label t-mono-data text-text-050">PDS_NOTIFY_URL</td><td className="label">un webhook quand un achat déborde</td><td className="label is-mute">optionnel : la demande s’affiche quand même et s’écrit dans notifications.jsonl</td></tr>
              <tr><td className="label t-mono-data text-text-050">Speculos</td><td className="label">la Flex émulée, l’app Ethereum de test</td><td className="label is-mute">sans elle, seule une vraie Ledger branchée en USB signe ; la vue d’ensemble montre la Flex hors tension</td></tr>
            </tbody>
          </table>
        </div>
      </Band>

      <Band
        index="12"
        eyebrow="Trouvé chez Ledger, en construisant"
        title="Cinq retours, sourcés"
        lead="Chacun a une commande, un fichier ou une trace derrière lui. Le détail est dans FEEDBACK.md, avec ce qu’on changerait."
      >
        <div className="data-scroll">
          <table className="data-table">
            <thead><tr><th>Ce qu’on a trouvé</th><th>Où</th><th>Ce qu’on a fait</th></tr></thead>
            <tbody>
              <tr><td className="label text-text-050">Le clear signing est fermé sans jeton partenaire, et échoue en silence</td><td className="label">CAL, 403 sans origin token</td><td className="label is-mute">Compilé l’app de série avec sa clé de test et signé nos descripteurs nous-mêmes</td></tr>
              <tr><td className="label text-text-050">Un bug d’une ligne casse le filtrage EIP-712 sur toute chaîne ≥ 256</td><td className="label">client Python officiel</td><td className="label is-mute">Contourné ; correctif d’une ligne à proposer</td></tr>
              <tr><td className="label text-text-050">Le kit détecte le blind signing, le rapporte à Ledger, ne le rend pas au développeur</td><td className="label">Signer Kit, context module</td><td className="label is-mute">Notre propre context module : le rapport reste chez nous, et s’affiche</td></tr>
              <tr><td className="label text-text-050">signMessage jette tout message qui contient un caractère non ASCII et laisse l’app bloquée</td><td className="label">Signer Kit 1.18.1</td><td className="label is-mute">Reproduit en Node et dans le navigateur ; notre connexion tient en 217 octets</td></tr>
              <tr><td className="label text-text-050">Deux clients sur une app : une commande en attente est refusée (0x6901), puis tout l’est</td><td className="label">SDK sécurisé, Speculos</td><td className="label is-mute">Une signature est liée à l’onglet qui l’a demandée ; rafraîchisseur de session coupé</td></tr>
            </tbody>
          </table>
        </div>
      </Band>

      <Band
        index="13"
        eyebrow="En service"
        title="Ta Ledger reste chez toi"
        lead="Nous n’avons qu’un mandat, et il se révoque d’un geste. Le serveur ne tient aucun secret qui compte."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel kicker="Ce que le porteur garde">
            <div>
              <Row label="Sa clé" value="sur sa Ledger, jamais ailleurs" />
              <Row label="Sa connexion" value="Sign-In with Ethereum, signée dans sa page" />
              <Row label="Son coffre" value="un contrat à son nom, un par compte" />
              <Row label="Son mandat" value="lu et signé sur l’appareil, une fois" />
              <Row label="Ses données" value="un MCP en lecture seule, une clé dérivée de son adresse" />
            </div>
          </Panel>
          <Panel kicker="Ce que nous tenons">
            <div>
              <Row label="Une clé de session" value="elle ne peut appeler que son coffre, dans son mandat" />
              <Row label="Un secret maître" value="scellé dans le Ledger Key Ring de l’opérateur" />
              <Row label="Rien d’autre" value="ni clé, ni fonds, ni droit d’en sortir" />
            </div>
            <p className="t-caption m-0 mt-5 is-faint">
              Le coffre sait rendre les fonds et révoquer le mandat (prouvé par les tests) ; le bouton dans la page, signé par la Ledger, est le prochain geste à construire.
            </p>
          </Panel>
        </div>
      </Band>
    </>
  )
}
