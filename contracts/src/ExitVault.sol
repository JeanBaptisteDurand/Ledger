// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ExitVault — un agent ne peut pas acheter ce qu'il ne peut pas revendre.
/// @notice Le propriétaire signe UNE FOIS un mandat sur son Ledger. L'agent achète seul dans ce cadre.
///         À chaque achat, le coffre SIMULE la revente de tout ce qu'il vient d'acheter, dans la même
///         transaction, et annule si la sortie perd plus que le mandat n'autorise.
///
///         La simulation est gratuite et n'écrit rien : c'est le motif du `V4Quoter` d'Uniswap
///         (`try poolManager.unlock(...) {} catch` — le callback revert avec son résultat).

/* ---------------------------------------------------------------------- Uniswap v4, strict minimum */

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified; // < 0 : montant d'entrée exact
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 delta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/* ------------------------------------------------------------------- ERC-4626, strict minimum */

/// @dev La seconde instance de la meme question : un coffre a rendement. Le standard ecrit le piege
///      lui-meme — `previewRedeem` DOIT ignorer les limites de retrait, pendant que `maxWithdraw`
///      peut valoir zero (marche de pret utilise a 100 %, file d'attente, cooldown, pause).
interface IWETH9 {
    function deposit() external payable;
}

interface IERC4626 {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/* ------------------------------------------------------------------------------------- Le contrat */

contract ExitVault {
    /* --- le mandat, tel qu'il s'affiche sur l'appareil --- */

    struct Mandate {
        address agent; // qui a le droit d'acheter
        address budgetToken; // la monnaie du budget (address(0) = ETH natif)
        uint256 budgetAmount; // ce que l'agent peut dépenser en tout
        uint16 maxRoundTripLossBps; // la perte aller-retour tolérée
        uint64 expiry; // au-delà, plus rien ne passe
        uint256 nonce; // pour révoquer en signant un nouveau mandat
    }

    /// @notice Une dérogation à usage unique, signée sur l'appareil, pour UN achat hors mandat.
    ///         Elle est liée au nombre que l'humain a vu : si la sortie a empiré depuis, elle ne vaut plus.
    struct Exception {
        address agent;
        address budgetToken; // la monnaie, pour que l'ecran ecrive « 0.05 WETH » et non 18 chiffres
        bytes32 poolKeyHash; // le pool exact, pas un autre
        uint256 amountIn; // le montant exact
        uint16 seenExitBps; // ce que l'ecran a montre a l'humain
        uint64 expiry;
        uint256 nonce;
    }

    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "ExitMandate(address agent,address budgetToken,uint256 budgetAmount,uint16 maxRoundTripLossBps,uint64 expiry,uint256 nonce)"
    );
    bytes32 public constant EXCEPTION_TYPEHASH = keccak256(
        "ExitException(address agent,address budgetToken,bytes32 poolKeyHash,uint256 amountIn,uint16 seenExitBps,uint64 expiry,uint256 nonce)"
    );
    /// @notice Un retrait que le porteur autorise par une signature sur son Ledger, et que n'importe qui
    ///         peut executer pour lui (le banc paie le gaz). A usage unique, dans un delai.
    struct Withdrawal {
        address token; // address(0) = ETH natif
        uint256 amount;
        address to;
        uint64 expiry;
        uint256 nonce;
    }

    bytes32 public constant WITHDRAWAL_TYPEHASH =
        keccak256("ExitWithdrawal(address token,uint256 amount,address to,uint64 expiry,uint256 nonce)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @dev Le WETH des chaines OP Stack (Base, Base Sepolia) : l'ETH que le porteur envoie au coffre devient du WETH,
    ///      la monnaie des mandats.
    address public constant WETH9 = 0x4200000000000000000000000000000000000006;

    address public immutable owner; // l'adresse du Ledger
    IPoolManager public immutable poolManager;
    bytes32 public immutable domainSeparator;

    mapping(bytes32 => uint256) public spent; // hash du mandat => déjà dépensé
    mapping(bytes32 => bool) public revoked;
    mapping(bytes32 => bool) public exceptionUsed; // une derogation ne sert qu'une fois
    mapping(bytes32 => bool) public withdrawalUsed; // un retrait autorise ne sert qu'une fois

    uint160 private constant MIN_SQRT_PRICE = 4295128739 + 1;
    uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342 - 1;

    uint8 private constant MODE_PROBE = 1;
    uint8 private constant MODE_BUY = 2;
    uint8 private constant MODE_PROBE_TAKE = 3;
    uint8 private constant MODE_SELL = 4;

    /* --- ce que le coffre refuse, et pourquoi --- */

    error NotTheAgent(address caller, address agent);
    error BadMandateSignature(address recovered, address owner);
    error MandateExpired(uint64 expiry, uint256 nowTs);
    error MandateRevoked();
    error BudgetExceeded(uint256 wouldSpend, uint256 budget);
    error WrongBudgetToken(address key, address mandate);

    /// @notice La sortie coûte plus cher que le mandat ne l'autorise.
    error CannotExit(uint256 lossBps, uint256 maxBps);
    /// @notice Le hook a REFUSÉ la revente : on n'entre pas.
    error ExitBlocked(bytes4 hookError);
    /// @notice L'achat lui-même ne passe pas.
    error BuyFailed(bytes reason);
    /// @notice La derogation ne correspond pas a ce qui est demande.
    error ExceptionMismatch();
    /// @notice La derogation a deja servi, ou elle est perimee.
    error ExceptionSpent();
    /// @notice La sortie a empire depuis que l'humain a vu le nombre : sa decision ne vaut plus.
    error ExitWorseThanSeen(uint256 nowBps, uint16 seenBps);
    /// @notice Sortie interne de la simulation (jamais une vraie erreur).
    error ProbeResult(uint256 bought, uint256 returned, bool sellReverted, bytes sellReason);
    /// @notice Sortie interne de l'aller-retour dans un coffre ERC-4626 (jamais une vraie erreur).
    error VaultProbeResult(uint256 shares, uint256 previewOut, uint256 redeemed, bool redeemReverted, bytes reason);

    event Entered(bytes32 indexed mandateHash, address indexed vault4626, uint256 amountIn, uint256 shares, uint256 exitBps);
    event EnteredUnderException(bytes32 indexed exceptionHash, address indexed vault4626, uint256 exitBps, uint16 seenBps);
    event Exited(address indexed vault4626, uint256 shares, uint256 received);

    event Bought(bytes32 indexed mandateHash, address indexed token, uint256 amountIn, uint256 bought, uint256 exitBps);
    event BoughtUnderException(bytes32 indexed exceptionHash, address indexed token, uint256 exitBps, uint16 seenBps);
    event Refused(bytes32 indexed mandateHash, address indexed token, uint256 exitBps, bool sellReverted);
    event Sold(address indexed token, uint256 amountIn, uint256 received);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Deposited(address indexed from, uint256 amount);

    error WithdrawalExpired(uint64 expiry, uint256 nowTs);
    error WithdrawalUsed();

    constructor(address _owner, IPoolManager _poolManager) {
        owner = _owner;
        poolManager = _poolManager;
        domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256(bytes("ExitVault")), keccak256(bytes("1")), block.chainid, address(this)
            )
        );
    }

    /// @notice Le depot du porteur : un simple envoi d'ETH depuis sa Ledger — la seule transaction qu'elle signe,
    ///         lisible par n'importe quelle app Ethereum. Le coffre le garde en WETH, la monnaie des mandats.
    ///         L'ETH que le PoolManager ou WETH9 renvoient au coffre n'est pas touche.
    receive() external payable {
        if (msg.sender == owner && msg.value > 0) {
            IWETH9(WETH9).deposit{value: msg.value}();
            emit Deposited(msg.sender, msg.value);
        }
    }

    /* ------------------------------------------------------------------- le mandat */

    function hashMandate(Mandate calldata m) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                MANDATE_TYPEHASH, m.agent, m.budgetToken, m.budgetAmount, m.maxRoundTripLossBps, m.expiry, m.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _checkMandate(Mandate calldata m, bytes calldata sig) internal view returns (bytes32 digest) {
        digest = hashMandate(m);
        if (revoked[digest]) revert MandateRevoked();
        if (block.timestamp > m.expiry) revert MandateExpired(m.expiry, block.timestamp);

        _requireOwnerSig(digest, sig);
    }

    function _requireOwnerSig(bytes32 digest, bytes calldata sig) internal view {
        require(sig.length == 65, "sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        address rec = ecrecover(digest, v, r, s);
        if (rec != owner) revert BadMandateSignature(rec, owner);
    }

    function hashPoolKey(PoolKey calldata key) public pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks));
    }

    function _checkException(
        Exception calldata e,
        bytes calldata sig,
        address agent,
        PoolKey calldata key,
        uint256 amountIn
    ) internal view returns (bytes32 eh) {
        eh = hashException(e);
        if (exceptionUsed[eh] || block.timestamp > e.expiry) revert ExceptionSpent();
        if (e.agent != agent || e.amountIn != amountIn || e.poolKeyHash != hashPoolKey(key)
            || e.budgetToken != key.currency0) {
            revert ExceptionMismatch();
        }
        _requireOwnerSig(eh, sig);
    }

    function hashException(Exception calldata e) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(EXCEPTION_TYPEHASH, e.agent, e.budgetToken, e.poolKeyHash, e.amountIn, e.seenExitBps,
                       e.expiry, e.nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @notice Le propriétaire peut couper un mandat sans attendre son expiration.
    function revoke(bytes32 mandateHash) external {
        require(msg.sender == owner, "not owner");
        revoked[mandateHash] = true;
    }

    /* --------------------------------------------------------- la sonde de sortie */

    /// @notice Simule achat + revente intégrale et rend le résultat. N'écrit rien, ne coûte rien.
    /// @return bought ce que l'achat rapporterait, returned ce que la revente intégrale rendrait,
    ///         sellReverted vrai si le hook a refusé la vente, sellReason les 4 octets de son erreur.
    function probeExit(PoolKey calldata key, uint256 amountIn)
        public
        returns (uint256 bought, uint256 returned, bool sellReverted, bytes4 sellReason)
    {
        try poolManager.unlock(abi.encode(MODE_PROBE, key, amountIn)) {
            revert("probe: unlock returned");
        } catch (bytes memory ret) {
            if (ret.length >= 4 && bytes4(ret) == ProbeResult.selector) {
                bytes memory body = _tail(ret);
                bytes memory reason;
                (bought, returned, sellReverted, reason) = abi.decode(body, (uint256, uint256, bool, bytes));
                if (reason.length >= 4) sellReason = bytes4(reason);
            } else {
                revert BuyFailed(ret);
            }
        }
    }

    /// @notice Le jeton peut-il seulement sortir du PoolManager vers le coffre ?
    ///         Certains jetons refusent le transfert : on ne pourrait ni les detenir ni les vendre.
    function probeHoldable(PoolKey calldata key, uint256 amountIn)
        public
        returns (bool holdable, bytes4 reasonSel)
    {
        try poolManager.unlock(abi.encode(MODE_PROBE_TAKE, key, amountIn)) {
            revert("probe: unlock returned");
        } catch (bytes memory ret) {
            if (ret.length >= 4 && bytes4(ret) == ProbeResult.selector) {
                (,, bool takeReverted, bytes memory reason) =
                    abi.decode(_tail(ret), (uint256, uint256, bool, bytes));
                holdable = !takeReverted;
                if (reason.length >= 4) reasonSel = bytes4(reason);
            } else {
                revert BuyFailed(ret);
            }
        }
    }

    /// @notice Le coût aller-retour, en points de base. 10 000 = tout est perdu.
    function exitLossBps(PoolKey calldata key, uint256 amountIn)
        public
        returns (uint256 lossBps, bool sellReverted, bytes4 sellReason)
    {
        (bool holdable, bytes4 holdSel) = probeHoldable(key, amountIn);
        if (!holdable) return (10_000, true, holdSel); // pas meme detenable : on n'entre pas

        uint256 returned;
        (, returned, sellReverted, sellReason) = probeExit(key, amountIn);
        if (sellReverted) return (10_000, true, sellReason);
        lossBps = returned >= amountIn ? 0 : ((amountIn - returned) * 10_000) / amountIn;
    }

    /* ------------------------------------------------------------------- l'achat */

    /// @notice L'agent achète, dans le mandat, si et seulement si la sortie tient.
    function buy(Mandate calldata m, bytes calldata sig, PoolKey calldata key, uint256 amountIn)
        external
        returns (uint256 bought, uint256 exitBps)
    {
        if (msg.sender != m.agent) revert NotTheAgent(msg.sender, m.agent);
        bytes32 digest = _checkMandate(m, sig);
        if (key.currency0 != m.budgetToken) revert WrongBudgetToken(key.currency0, m.budgetToken);

        uint256 after_ = spent[digest] + amountIn;
        if (after_ > m.budgetAmount) revert BudgetExceeded(after_, m.budgetAmount);

        // 1. La sortie, AVANT d'engager quoi que ce soit.
        (uint256 lossBps, bool sellReverted, bytes4 sellReason) = exitLossBps(key, amountIn);
        if (sellReverted) {
            emit Refused(digest, key.currency1, 10_000, true);
            revert ExitBlocked(sellReason);
        }
        if (lossBps > m.maxRoundTripLossBps) {
            emit Refused(digest, key.currency1, lossBps, false);
            revert CannotExit(lossBps, m.maxRoundTripLossBps);
        }

        // 2. Elle tient : on achète pour de vrai.
        spent[digest] = after_;
        bytes memory out = poolManager.unlock(abi.encode(MODE_BUY, key, amountIn));
        bought = abi.decode(out, (uint256));
        exitBps = lossBps;
        emit Bought(digest, key.currency1, amountIn, bought, lossBps);
    }

    /// @notice L'achat que le mandat refuse, autorise par une dérogation lue et signée sur l'appareil.
    /// @dev    C'est le « renvoyé à l'humain pour approbation » du modèle Ledger : hors bornes ne veut
    ///         pas dire non, ça veut dire *demande*. La dérogation est liée au nombre que l'écran a
    ///         montré : si la sortie a empiré entre-temps, elle ne vaut plus.
    function buyUnderException(
        Mandate calldata m,
        bytes calldata mandateSig,
        Exception calldata e,
        bytes calldata exceptionSig,
        PoolKey calldata key,
        uint256 amountIn
    ) external returns (uint256 bought, uint256 exitBps) {
        if (msg.sender != m.agent) revert NotTheAgent(msg.sender, m.agent);
        bytes32 digest = _checkMandate(m, mandateSig);
        if (key.currency0 != m.budgetToken) revert WrongBudgetToken(key.currency0, m.budgetToken);

        // --- la derogation : signee par le porteur, pour CE pool, CE montant, une seule fois ---
        bytes32 eh = _checkException(e, exceptionSig, m.agent, key, amountIn);

        // --- le budget du mandat s'applique quand meme : une derogation n'est pas un blanc-seing ---
        uint256 after_ = spent[digest] + amountIn;
        if (after_ > m.budgetAmount) revert BudgetExceeded(after_, m.budgetAmount);

        // --- la sortie, maintenant : elle ne doit pas etre PIRE que ce que l'humain a lu ---
        (uint256 lossBps, bool sellReverted, bytes4 sellReason) = exitLossBps(key, amountIn);
        if (sellReverted) revert ExitBlocked(sellReason);
        if (lossBps > e.seenExitBps) revert ExitWorseThanSeen(lossBps, e.seenExitBps);

        exceptionUsed[eh] = true;
        spent[digest] = after_;
        bought = abi.decode(poolManager.unlock(abi.encode(MODE_BUY, key, amountIn)), (uint256));
        exitBps = lossBps;
        _emitException(eh, key.currency1, lossBps, e.seenExitBps);
    }

    function _emitException(bytes32 eh, address token, uint256 exitBps, uint16 seenBps) private {
        emit BoughtUnderException(eh, token, exitBps, seenBps);
    }

    /* ------------------------------------------------------------------- la sortie */

    /// @notice Sortir d'une position. L'agent peut vendre ce que le coffre detient ; il ne peut pas
    ///         sortir les fonds du coffre, seul le porteur le peut (`withdraw`).
    /// @dev    Pas de sonde ici : on VEND, on ne s'engage pas. `minOut` protege du glissement.
    function sell(Mandate calldata m, bytes calldata sig, PoolKey calldata key, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 received)
    {
        if (msg.sender != m.agent && msg.sender != owner) revert NotTheAgent(msg.sender, m.agent);
        _checkMandate(m, sig);
        received = abi.decode(poolManager.unlock(abi.encode(MODE_SELL, key, amountIn)), (uint256));
        require(received >= minOut, "sell: minOut");
        emit Sold(key.currency1, amountIn, received);
    }

    /// @notice Le porteur reprend ses fonds, quand il veut, sans mandat ni agent.
    function withdraw(address token, uint256 amount, address to) external {
        require(msg.sender == owner, "not owner");
        _payOut(token, amount, to);
    }

    function hashWithdrawal(Withdrawal calldata w) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(WITHDRAWAL_TYPEHASH, w.token, w.amount, w.to, w.expiry, w.nonce));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @notice Le meme retrait, autorise par une signature du porteur (EIP-712, lue en clair sur son Ledger) et
    ///         execute par n'importe qui — le banc, qui paie le gaz. Le porteur ne signe qu'un message, jamais une
    ///         transaction ; l'autorisation ne vaut qu'une fois, pour ce montant, vers cette adresse, avant l'echeance.
    function withdrawWithAuthorization(Withdrawal calldata w, bytes calldata sig) external {
        bytes32 digest = hashWithdrawal(w);
        if (withdrawalUsed[digest]) revert WithdrawalUsed();
        if (block.timestamp > w.expiry) revert WithdrawalExpired(w.expiry, block.timestamp);
        _requireOwnerSig(digest, sig);
        withdrawalUsed[digest] = true;
        _payOut(w.token, w.amount, w.to);
    }

    function _payOut(address token, uint256 amount, address to) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "eth send");
        } else {
            require(IERC20Minimal(token).transfer(to, amount), "transfer");
        }
        emit Withdrawn(token, to, amount);
    }

    /* ------------------------------------------------- la seconde instance : un coffre ERC-4626 */

    /// @notice L'aller-retour REEL a notre taille, annule : deposit -> previewRedeem -> redeem -> revert.
    ///         Externe pour etre appele par le coffre lui-meme (`try this.vaultRoundTrip`) : tout ce qui
    ///         s'y passe est defait par le revert, y compris le depot.
    function vaultRoundTrip(IERC4626 v, uint256 amountIn) external {
        require(msg.sender == address(this), "only self");
        IERC20Minimal(v.asset()).approve(address(v), amountIn);
        uint256 shares = v.deposit(amountIn, address(this));
        uint256 previewOut = v.previewRedeem(shares);
        uint256 redeemed;
        bool reverted;
        bytes memory reason;
        // Gaz borne, comme pour les jetons : un coffre piege peut bruler tout ce qu'on lui donne.
        try v.redeem{gas: 5_000_000}(shares, address(this), address(this)) returns (uint256 a) {
            redeemed = a;
        } catch (bytes memory r) {
            reverted = true;
            reason = r;
        }
        revert VaultProbeResult(shares, previewOut, redeemed, reverted, reason);
    }

    /// @notice Ce que l'aller-retour rend vraiment — pas ce que `previewRedeem` promet.
    function probeVault(IERC4626 v, uint256 amountIn)
        public
        returns (uint256 shares, uint256 previewOut, uint256 redeemed, bool redeemReverted, bytes4 reasonSel)
    {
        try this.vaultRoundTrip(v, amountIn) {
            revert("probe: returned");
        } catch (bytes memory ret) {
            if (ret.length >= 4 && bytes4(ret) == VaultProbeResult.selector) {
                bytes memory reason;
                (shares, previewOut, redeemed, redeemReverted, reason) =
                    abi.decode(_tail(ret), (uint256, uint256, uint256, bool, bytes));
                if (reason.length >= 4) reasonSel = bytes4(reason);
            } else {
                revert BuyFailed(ret);
            }
        }
    }

    /// @notice La porte : la part de la plus grosse position qui ne peut PAS sortir aujourd'hui, en bps.
    /// @dev    Notre propre depot est toujours retirable a l'instant ou on le fait (il apporte de la
    ///         liquidite). La question honnete est : celui qui a le plus a sortir, peut-il sortir ?
    ///         `maxWithdraw(ref)` contre `convertToAssets(balanceOf(ref))` — deux vues du standard.
    ///         refHolder = address(0) : pas de reference, on ne mesure que notre aller-retour.
    function vaultStuckBps(IERC4626 v, address refHolder)
        public
        view
        returns (uint256 stuckBps, uint256 refAssets, uint256 refMaxOut)
    {
        if (refHolder == address(0)) return (0, 0, 0);
        refAssets = v.convertToAssets(v.balanceOf(refHolder));
        refMaxOut = v.maxWithdraw(refHolder);
        if (refAssets == 0) return (0, 0, 0);
        stuckBps = refMaxOut >= refAssets ? 0 : ((refAssets - refMaxOut) * 10_000) / refAssets;
    }

    /// @notice Le cout de sortie d'un coffre, en bps : le pire de notre aller-retour reel et de la porte.
    function vaultExitLossBps(IERC4626 v, uint256 amountIn, address refHolder)
        public
        returns (uint256 lossBps, bool blocked, bytes4 reason, uint256 ownLossBps, uint256 stuckBps)
    {
        (uint256 shares,, uint256 redeemed, bool rev, bytes4 sel) = probeVault(v, amountIn);
        if (shares == 0 || rev) return (10_000, true, sel, 10_000, 0);
        ownLossBps = redeemed >= amountIn ? 0 : ((amountIn - redeemed) * 10_000) / amountIn;
        (stuckBps,,) = vaultStuckBps(v, refHolder);
        lossBps = ownLossBps > stuckBps ? ownLossBps : stuckBps;
    }

    function hashVault(IERC4626 v) public pure returns (bytes32) {
        return keccak256(abi.encode(address(v)));
    }

    /// @notice L'agent entre dans un coffre, dans le mandat, si et seulement si la sortie tient.
    ///         Meme mandat, meme champ (`maxRoundTripLossBps`), meme refus (`CannotExit`) que pour un swap.
    function enterVault(Mandate calldata m, bytes calldata sig, IERC4626 v, uint256 amountIn, address refHolder)
        external
        returns (uint256 shares, uint256 exitBps)
    {
        if (msg.sender != m.agent) revert NotTheAgent(msg.sender, m.agent);
        bytes32 digest = _checkMandate(m, sig);
        address a = v.asset();
        if (a != m.budgetToken) revert WrongBudgetToken(a, m.budgetToken);
        uint256 after_ = spent[digest] + amountIn;
        if (after_ > m.budgetAmount) revert BudgetExceeded(after_, m.budgetAmount);

        (uint256 lossBps, bool blocked, bytes4 reason,,) = vaultExitLossBps(v, amountIn, refHolder);
        if (blocked) {
            emit Refused(digest, address(v), 10_000, true);
            revert ExitBlocked(reason);
        }
        if (lossBps > m.maxRoundTripLossBps) {
            emit Refused(digest, address(v), lossBps, false);
            revert CannotExit(lossBps, m.maxRoundTripLossBps);
        }

        spent[digest] = after_;
        IERC20Minimal(a).approve(address(v), amountIn);
        shares = v.deposit(amountIn, address(this));
        exitBps = lossBps;
        emit Entered(digest, address(v), amountIn, shares, lossBps);
    }

    /// @notice L'entree que le mandat refuse, autorisee par une derogation lue et signee sur l'appareil.
    ///         `poolKeyHash` porte ici `hashVault(v)` : une position, un montant, le nombre lu.
    function enterVaultUnderException(
        Mandate calldata m,
        bytes calldata mandateSig,
        Exception calldata e,
        bytes calldata exceptionSig,
        IERC4626 v,
        uint256 amountIn,
        address refHolder
    ) external returns (uint256 shares, uint256 exitBps) {
        if (msg.sender != m.agent) revert NotTheAgent(msg.sender, m.agent);
        bytes32 digest = _checkMandate(m, mandateSig);
        address a = v.asset();
        if (a != m.budgetToken) revert WrongBudgetToken(a, m.budgetToken);

        bytes32 eh = hashException(e);
        if (exceptionUsed[eh] || block.timestamp > e.expiry) revert ExceptionSpent();
        if (e.agent != m.agent || e.amountIn != amountIn || e.poolKeyHash != hashVault(v) || e.budgetToken != a) {
            revert ExceptionMismatch();
        }
        _requireOwnerSig(eh, exceptionSig);

        uint256 after_ = spent[digest] + amountIn;
        if (after_ > m.budgetAmount) revert BudgetExceeded(after_, m.budgetAmount);

        (uint256 lossBps, bool blocked, bytes4 reason,,) = vaultExitLossBps(v, amountIn, refHolder);
        if (blocked) revert ExitBlocked(reason);
        if (lossBps > e.seenExitBps) revert ExitWorseThanSeen(lossBps, e.seenExitBps);

        exceptionUsed[eh] = true;
        spent[digest] = after_;
        IERC20Minimal(a).approve(address(v), amountIn);
        shares = v.deposit(amountIn, address(this));
        exitBps = lossBps;
        emit EnteredUnderException(eh, address(v), lossBps, e.seenExitBps);
    }

    /// @notice Sortir d'un coffre : l'agent (dans le mandat) ou le porteur. Pas de sonde : on sort.
    function exitVault(Mandate calldata m, bytes calldata sig, IERC4626 v, uint256 shares, uint256 minOut)
        external
        returns (uint256 received)
    {
        if (msg.sender != m.agent && msg.sender != owner) revert NotTheAgent(msg.sender, m.agent);
        _checkMandate(m, sig);
        received = v.redeem(shares, address(this), address(this));
        require(received >= minOut, "exit: minOut");
        emit Exited(address(v), shares, received);
    }

    /* ------------------------------------------------- le callback du PoolManager */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (uint8 mode, PoolKey memory key, uint256 amountIn) = abi.decode(data, (uint8, PoolKey, uint256));

        if (mode == MODE_PROBE) {
            // --- acheter ---
            int256 d = poolManager.swap(key, SwapParams(true, -int256(amountIn), MIN_SQRT_PRICE), "");
            uint256 bought = _pos(int128(d));

            // --- revendre TOUT, tout de suite : un seuil de taille ne sauve pas le piege ---
            uint256 returned;
            bool sellReverted;
            bytes memory reason;
            if (bought > 0) {
                try poolManager.swap(key, SwapParams(false, -int256(bought), MAX_SQRT_PRICE), "") returns (int256 d2) {
                    returned = _pos(int128(d2 >> 128));
                } catch (bytes memory r) {
                    sellReverted = true;
                    reason = r;
                }
            } else {
                sellReverted = true;
            }
            // Tout est annule en sortant par ici : aucun etat, aucun frais.
            revert ProbeResult(bought, returned, sellReverted, reason);
        }

        if (mode == MODE_PROBE_TAKE) {
            int256 dt = poolManager.swap(key, SwapParams(true, -int256(amountIn), MIN_SQRT_PRICE), "");
            uint256 got = _pos(int128(dt));
            bool takeReverted;
            bytes memory why;
            if (got == 0) {
                takeReverted = true;
            } else {
                // Gaz borne : un jeton piege peut bruler tout ce qu'on lui donne en revertant.
                (bool ok, bytes memory r) =
                    address(this).call{gas: 400_000}(abi.encodeCall(this.takeTo, (key.currency1, got)));
                if (!ok) {
                    takeReverted = true;
                    why = r;
                }
            }
            revert ProbeResult(got, 0, takeReverted, why);
        }

        if (mode == MODE_SELL) {
            // on vend currency1 pour recuperer currency0 : sens inverse de l'achat
            int256 ds = poolManager.swap(key, SwapParams(false, -int256(amountIn), MAX_SQRT_PRICE), "");
            uint256 owedTok = _neg(int128(ds));
            uint256 got0 = _pos(int128(ds >> 128));
            _settle(key.currency1, owedTok);
            if (got0 > 0) poolManager.take(key.currency0, address(this), got0);
            return abi.encode(got0);
        }

        if (mode == MODE_BUY) {
            int256 d = poolManager.swap(key, SwapParams(true, -int256(amountIn), MIN_SQRT_PRICE), "");
            uint256 owed = _neg(int128(d >> 128));
            uint256 bought = _pos(int128(d));

            _settle(key.currency0, owed);
            if (bought > 0) {
                // Certains jetons refusent le transfert vers un contrat : on n'en serait pas sorti
                // non plus. L'echec est nomme, et la transaction entiere est annulee.
                (bool tookOk, bytes memory tr) =
                    address(this).call{gas: 400_000}(abi.encodeCall(this.takeTo, (key.currency1, bought)));
                if (!tookOk) revert ExitBlocked(tr.length >= 4 ? bytes4(tr) : bytes4(0));
            }
            return abi.encode(bought);
        }

        revert("unknown mode");
    }

    /* ------------------------------------------------------------------- outillage */

    /// @notice Sort les jetons du PoolManager vers le coffre. Externe pour etre annulable seule :
    ///         si le jeton refuse le transfert, l'echec est nomme au lieu d'etre un revert nu.
    function takeTo(address currency, uint256 amount) external {
        require(msg.sender == address(this), "only self");
        poolManager.take(currency, address(this), amount);
    }

    function _settle(address currency, uint256 amount) internal {
        if (amount == 0) return;
        if (currency == address(0)) {
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            IERC20Minimal(currency).transfer(address(poolManager), amount);
            poolManager.settle();
        }
    }

    function _pos(int128 v) private pure returns (uint256) {
        return v > 0 ? uint256(uint128(v)) : 0;
    }

    function _neg(int128 v) private pure returns (uint256) {
        return v < 0 ? uint256(uint128(-v)) : 0;
    }

    function _tail(bytes memory data) private pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = data[i + 4];
        }
    }
}
