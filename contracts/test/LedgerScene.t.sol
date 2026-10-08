// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// @notice La scène de démonstration, bout en bout, avec le mandat SIGNÉ SUR L'APPAREIL.
///
///  1. le porteur a lu et signé le mandat sur son Ledger Flex (ledger/sign_mandate.py)
///  2. l'agent achète seul un jeton sain — le Flex ne clignote pas
///  3. l'agent lit une page piégée et vise un pool dont on ne ressort pas
///  4. le coffre refuse AVANT d'engager quoi que ce soit ; le budget n'a pas bougé
///
/// Lancer : scripts/demo.sh (qui produit mandate.json puis appelle ce test)
contract LedgerSceneTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant DEPLOYER = 0x00000000000000000000000000000000Dec0dE01;
    uint256 constant AMOUNT_IN = 1e14;

    // Un pool sain (Zora, hook 0x0469a4bd…) et un piège (hook 0x9ce0e33e…), tous deux en WETH.
    PoolKey healthy = PoolKey(
        WETH,
        address(uint160(0x0069df254076b8a0360ea1180b58aaf1749fe97786)),
        8388608,
        200,
        address(uint160(0x000469a4bd3724dc86c9542f4694c976da13c450c0))
    );
    PoolKey trap = PoolKey(
        WETH,
        address(uint160(0x00b20000000000000000000090aa1082ce28905f01)),
        100,
        1,
        address(uint160(0x009ce0e33e68c7bfc035b31961e4f1ddc55f0c0145))
    );

    ExitVault vault;
    ExitVault.Mandate m;
    bytes sig;
    address owner;

    function setUp() public {
        string memory raw = vm.readFile(vm.envString("MANDATE_FILE"));

        owner = vm.parseJsonAddress(raw, ".owner");
        sig = vm.parseJsonBytes(raw, ".signature");
        m = ExitVault.Mandate({
            agent: vm.parseJsonAddress(raw, ".mandate.agent"),
            budgetToken: vm.parseJsonAddress(raw, ".mandate.budgetToken"),
            budgetAmount: vm.parseUint(vm.parseJsonString(raw, ".mandate.budgetAmount")),
            maxRoundTripLossBps: uint16(vm.parseJsonUint(raw, ".mandate.maxRoundTripLossBps")),
            expiry: uint64(vm.parseJsonUint(raw, ".mandate.expiry")),
            nonce: vm.parseJsonUint(raw, ".mandate.nonce")
        });

        // Le coffre doit renaitre a l'adresse EXACTE que l'appareil a vue dans le domaine EIP-712,
        // sinon le separateur de domaine differe et la signature ne se verifie pas. Le mandat peut
        // venir de scripts/demo.sh (deployeur fixe) ou du banc web (compte anvil #0, nonce libre) :
        // on retrouve le couple (deployeur, nonce) qui redonne cette adresse-la.
        address want = vm.parseJsonAddress(raw, ".vault");
        address dep = DEPLOYER;
        uint64 nonce = 0;
        if (vm.keyExistsJson(raw, ".deployer")) {
            // mandat produit par le banc web : il note qui a deploye, et a quel nonce
            dep = vm.parseJsonAddress(raw, ".deployer");
            nonce = uint64(vm.parseJsonUint(raw, ".deployNonce"));
        }
        vm.setNonce(dep, nonce);
        vm.prank(dep);
        vault = new ExitVault(owner, PM);
        require(address(vault) == want, "coffre introuvable a l'adresse signee : relance le banc ou scripts/demo.sh");

        deal(WETH, address(vault), 10 ether);
        vm.warp(m.expiry - 1 days); // on se place dans la fenetre du mandat
    }

    function test_scene() public {
        console.log("");
        console.log("=== 1. Le mandat vient du Ledger ===");
        console.log("   porteur (signature verifiee sur la chaine) :", owner);
        console.log("   agent autorise                             :", m.agent);
        console.log("   perte aller-retour maximale                : %s bps", m.maxRoundTripLossBps);

        console.log("");
        console.log("=== 2. L'agent achete seul, dans le mandat ===");
        // La scene s'adapte au mandat REELLEMENT signe : un mandat strict refuse meme un pool sain,
        // et c'est une demonstration aussi valable que l'achat.
        (uint256 healthyBps,,) = vault.exitLossBps(healthy, AMOUNT_IN);
        uint256 spentBefore;
        if (healthyBps <= m.maxRoundTripLossBps) {
            vm.prank(m.agent);
            (uint256 bought, uint256 exitBps) = vault.buy(m, sig, healthy, AMOUNT_IN);
            console.log("   pool sain  : ACHAT ACCEPTE, %s jetons recus, sortie %s bps", bought, exitBps);
            assertGt(bought, 0);
            spentBefore = AMOUNT_IN;
        } else {
            vm.prank(m.agent);
            vm.expectRevert(
                abi.encodeWithSelector(ExitVault.CannotExit.selector, healthyBps, m.maxRoundTripLossBps));
            vault.buy(m, sig, healthy, AMOUNT_IN);
            console.log("   pool sain  : REFUSE aussi - %s bps de sortie, le mandat en autorise %s",
                        healthyBps, m.maxRoundTripLossBps);
            console.log("               (mandat strict : il faudrait une derogation signee sur l'appareil)");
            spentBefore = 0;
        }
        assertEq(vault.spent(vault.hashMandate(m)), spentBefore);

        console.log("");
        console.log("=== 3. Injection : une page piegee dit a l'agent d'acheter ce jeton ===");
        (uint256 lossBps, bool blocked,) = vault.exitLossBps(trap, AMOUNT_IN);
        console.log("   la sonde regarde la sortie : %s bps (sortie bloquee : %s)", lossBps, blocked);

        vm.prank(m.agent);
        try vault.buy(m, sig, trap, AMOUNT_IN) returns (uint256, uint256) {
            fail();
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            // Deux familles de pieges, deux refus : le hook prend tout a la sortie (CannotExit),
            // ou le jeton n'est meme pas transferable jusqu'au coffre (ExitBlocked).
            assertTrue(sel == ExitVault.CannotExit.selector || sel == ExitVault.ExitBlocked.selector,
                       "doit refuser pour cause de sortie");
            console.log("   pool piege : ACHAT REFUSE (%s) - on n'entre pas la d'ou on ne sort pas",
                        sel == ExitVault.ExitBlocked.selector ? "jeton non transferable" : "sortie trop chere");
        }

        console.log("");
        console.log("=== 4. Rien n'a bouge ===");
        assertEq(vault.spent(vault.hashMandate(m)), spentBefore, "le refus ne consomme pas le budget");
        console.log("   budget consomme : %s wei (inchange). Le Flex n'a pas clignote.", vault.spent(vault.hashMandate(m)));
        console.log("");
    }
}
