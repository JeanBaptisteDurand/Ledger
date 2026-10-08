// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// « Hors bornes ne veut pas dire non, ca veut dire demande a l'humain. »
/// Le modele Ledger complet : le mandat borne la routine, la derogation traite l'exception.
contract EscalationTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    uint256 constant AMOUNT_IN = 1e14;

    // un pool sain a 198 bps de sortie : hors d'un mandat strict a 100 bps
    PoolKey pool = PoolKey(
        WETH,
        address(uint160(0x0069df254076b8A0360ea1180b58AAF1749fe97786)),
        8388608, 200,
        address(uint160(0x000469a4Bd3724DC86C9542F4694c976DA13C450c0))
    );

    ExitVault vault;
    uint256 ownerPk = 0xA11CE;
    address ownerAddr;
    address agent = address(0xA9E4);

    function setUp() public {
        ownerAddr = vm.addr(ownerPk);
        vault = new ExitVault(ownerAddr, PM);
        deal(WETH, address(vault), 10 ether);
    }

    function hashM(ExitVault.Mandate calldata m) external view returns (bytes32) { return vault.hashMandate(m); }
    function hashE(ExitVault.Exception calldata e) external view returns (bytes32) { return vault.hashException(e); }
    function hashK(PoolKey calldata k) external view returns (bytes32) { return vault.hashPoolKey(k); }

    function _mandate() internal view returns (ExitVault.Mandate memory) {
        return ExitVault.Mandate({
            agent: agent, budgetToken: WETH, budgetAmount: 10 * AMOUNT_IN,
            maxRoundTripLossBps: 100, // strict : 1 %
            expiry: uint64(block.timestamp + 7 days), nonce: 1
        });
    }

    function _signM(ExitVault.Mandate memory m) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, this.hashM(m));
        return abi.encodePacked(r, s, v);
    }

    function _signE(ExitVault.Exception memory e) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, this.hashE(e));
        return abi.encodePacked(r, s, v);
    }

    function _exception(uint16 seenBps, uint256 nonce) internal view returns (ExitVault.Exception memory) {
        return ExitVault.Exception({
            agent: agent, budgetToken: WETH, poolKeyHash: this.hashK(pool), amountIn: AMOUNT_IN,
            seenExitBps: seenBps, expiry: uint64(block.timestamp + 1 hours), nonce: nonce
        });
    }

    function test_1_refused_then_allowed_by_exception() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sm = _signM(m);

        // l'agent tente : le mandat refuse, et dit de combien
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.CannotExit.selector, 198, uint256(100)));
        vault.buy(m, sm, pool, AMOUNT_IN);
        console.log("1. mandat a 100 bps : REFUSE, la sortie coute 198 bps");

        // l'humain lit ce nombre sur son Flex et signe une derogation a usage unique
        ExitVault.Exception memory e = _exception(198, 1);
        bytes memory se = _signE(e);
        console.log("2. le porteur lit << sortie 198 bps, mandat 100 bps >> et signe la derogation");

        vm.prank(agent);
        (uint256 bought, uint256 exitBps) = vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);
        console.log("3. ACHAT AUTORISE sous derogation : %s jetons, sortie %s bps", bought, exitBps);
        assertGt(bought, 0);
    }

    function test_2_exception_is_single_use() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sm = _signM(m);
        ExitVault.Exception memory e = _exception(198, 2);
        bytes memory se = _signE(e);

        vm.prank(agent);
        vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);

        vm.prank(agent);
        vm.expectRevert(ExitVault.ExceptionSpent.selector);
        vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);
        console.log("une derogation ne sert qu'une fois");
    }

    function test_3_exception_is_bound_to_the_number_seen() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sm = _signM(m);
        // l'humain a cru voir 150 bps ; la sortie en coute 198 : sa decision ne vaut plus
        ExitVault.Exception memory e = _exception(150, 3);
        bytes memory se = _signE(e);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.ExitWorseThanSeen.selector, uint256(198), uint16(150)));
        vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);
        console.log("la sortie a empire depuis l'ecran : la derogation ne vaut plus");
    }

    function test_4_exception_is_bound_to_the_pool() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sm = _signM(m);
        ExitVault.Exception memory e = _exception(9999, 4);
        e.poolKeyHash = keccak256("un autre pool");
        bytes memory se = _signE(e);

        vm.prank(agent);
        vm.expectRevert(ExitVault.ExceptionMismatch.selector);
        vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);
        console.log("une derogation pour un pool ne vaut pas pour un autre");
    }

    function test_5_exception_still_respects_the_budget() public {
        ExitVault.Mandate memory m = _mandate();
        m.budgetAmount = AMOUNT_IN / 2; // budget minuscule
        bytes memory sm = _signM(m);
        ExitVault.Exception memory e = _exception(198, 5);
        bytes memory se = _signE(e);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.BudgetExceeded.selector, AMOUNT_IN, m.budgetAmount));
        vault.buyUnderException(m, sm, e, se, pool, AMOUNT_IN);
        console.log("une derogation n'est pas un blanc-seing : le budget s'applique toujours");
    }

    function test_6_exception_must_come_from_the_device() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sm = _signM(m);
        ExitVault.Exception memory e = _exception(198, 6);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(0xBADBAD), this.hashE(e));

        vm.prank(agent);
        vm.expectRevert();
        vault.buyUnderException(m, sm, e, abi.encodePacked(r, s, v), pool, AMOUNT_IN);
        console.log("une derogation signee par quelqu'un d'autre ne vaut rien");
    }
}
