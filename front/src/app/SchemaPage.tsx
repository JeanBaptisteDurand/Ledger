/**
 * /schema — who does what. The agents, the tools, and the three bricks of the brief, each with its role.
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
        index="05"
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
        index="06"
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
        index="07"
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
              <tr><td className="label text-text-050">signMessage perd tout message de plus de 229 octets et laisse l’app bloquée</td><td className="label">Signer Kit 1.18.1</td><td className="label is-mute">Reproduit en Node et dans le navigateur ; notre connexion tient en 217 octets</td></tr>
              <tr><td className="label text-text-050">Deux clients sur une app : une commande en attente est refusée (0x6901), puis tout l’est</td><td className="label">SDK sécurisé, Speculos</td><td className="label is-mute">Une signature est liée à l’onglet qui l’a demandée ; rafraîchisseur de session coupé</td></tr>
            </tbody>
          </table>
        </div>
      </Band>

      <Band
        index="08"
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
