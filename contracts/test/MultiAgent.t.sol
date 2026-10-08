// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// Plusieurs agents, plusieurs mandats, un seul coffre : ce qui est isole et ce qui ne l'est pas.
contract MultiAgentTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    uint256 constant AMOUNT_IN = 1e14;

    PoolKey healthy = PoolKey(
        WETH,
        address(uint160(0x0069df254076b8A0360ea1180b58AAF1749fe97786)),
        8388608, 200,
        address(uint160(0x000469a4Bd3724DC86C9542F4694c976DA13C450c0))
    );

    ExitVault vault;
    uint256 ownerPk = 0xA11CE;
    address ownerAddr;
    address alice = address(0xA11);
    address bob = address(0xB0B);

    function setUp() public {
        ownerAddr = vm.addr(ownerPk);
        vault = new ExitVault(ownerAddr, PM);
        deal(WETH, address(vault), 10 ether);
    }

    function _m(address agent, uint256 budget, uint16 bps, uint256 nonce)
        internal view returns (ExitVault.Mandate memory)
    {
        return ExitVault.Mandate({
            agent: agent, budgetToken: WETH, budgetAmount: budget,
            maxRoundTripLossBps: bps, expiry: uint64(block.timestamp + 7 days), nonce: nonce
        });
    }

    function hashFor(ExitVault.Mandate calldata m) external view returns (bytes32) {
        return vault.hashMandate(m);
    }

    function _sign(ExitVault.Mandate memory m) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, this.hashFor(m));
        return abi.encodePacked(r, s, v);
    }

    /// Deux agents, deux mandats signes sur le meme Ledger, deux budgets separes.
    function test_two_agents_have_separate_budgets() public {
        ExitVault.Mandate memory ma = _m(alice, AMOUNT_IN, 300, 1); // Alice : une seule tranche
        ExitVault.Mandate memory mb = _m(bob, 5 * AMOUNT_IN, 300, 2); // Bob : cinq
        bytes memory sa = _sign(ma);
        bytes memory sb = _sign(mb);

        vm.prank(alice);
        vault.buy(ma, sa, healthy, AMOUNT_IN);
        console.log("Alice a achete : budget consomme %s / %s", vault.spent(this.hashFor(ma)), ma.budgetAmount);

        // Alice est au bout du sien
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.BudgetExceeded.selector, 2 * AMOUNT_IN, ma.budgetAmount));
        vault.buy(ma, sa, healthy, AMOUNT_IN);
        console.log("Alice est bloquee : son budget est epuise");

        // Bob ne l'est pas : son mandat est un autre mandat
        vm.prank(bob);
        vault.buy(mb, sb, healthy, AMOUNT_IN);
        console.log("Bob achete quand meme : budget consomme %s / %s", vault.spent(this.hashFor(mb)), mb.budgetAmount);
        assertEq(vault.spent(this.hashFor(ma)), AMOUNT_IN);
        assertEq(vault.spent(this.hashFor(mb)), AMOUNT_IN);
    }

    /// Un agent ne peut pas se servir du mandat d'un autre.
    function test_agent_cannot_use_another_mandate() public {
        ExitVault.Mandate memory mb = _m(bob, 5 * AMOUNT_IN, 300, 2);
        bytes memory sb = _sign(mb);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.NotTheAgent.selector, alice, bob));
        vault.buy(mb, sb, healthy, AMOUNT_IN);
        console.log("Alice ne peut pas emprunter le mandat de Bob");
    }

    /// Chaque agent a SON seuil de sortie : le porteur peut etre plus prudent avec l'un.
    function test_per_agent_exit_threshold() public {
        ExitVault.Mandate memory strict = _m(alice, 10 * AMOUNT_IN, 100, 3); // 1 % max
        bytes memory ss = _sign(strict);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.CannotExit.selector, 198, uint256(100)));
        vault.buy(strict, ss, healthy, AMOUNT_IN);
        console.log("Alice, seuil 100 bps : refusee sur un pool a 198 bps");

        ExitVault.Mandate memory loose = _m(bob, 10 * AMOUNT_IN, 300, 4); // 3 % max
        bytes memory sl = _sign(loose);
        vm.prank(bob);
        vault.buy(loose, sl, healthy, AMOUNT_IN);
        console.log("Bob, seuil 300 bps : acceptee sur le meme pool");
    }

    /// Le porteur coupe UN mandat sans toucher aux autres.
    function test_revoke_one_mandate_only() public {
        ExitVault.Mandate memory ma = _m(alice, 10 * AMOUNT_IN, 300, 5);
        ExitVault.Mandate memory mb = _m(bob, 10 * AMOUNT_IN, 300, 6);
        bytes memory sa = _sign(ma);
        bytes memory sb = _sign(mb);

        bytes32 ha = this.hashFor(ma);
        vm.prank(ownerAddr);
        vault.revoke(ha);

        vm.prank(alice);
        vm.expectRevert(ExitVault.MandateRevoked.selector);
        vault.buy(ma, sa, healthy, AMOUNT_IN);
        console.log("le mandat d'Alice est revoque depuis le Ledger");
        assertTrue(vault.revoked(ha));

        vm.prank(bob);
        vault.buy(mb, sb, healthy, AMOUNT_IN);
        console.log("celui de Bob continue de fonctionner");
    }

    /// CE QUI N'EST PAS ISOLE : le coffre est une bourse commune.
    function test_LIMITE_shared_treasury() public {
        deal(WETH, address(vault), AMOUNT_IN); // juste une tranche dans le coffre
        ExitVault.Mandate memory ma = _m(alice, 10 * AMOUNT_IN, 300, 7);
        ExitVault.Mandate memory mb = _m(bob, 10 * AMOUNT_IN, 300, 8);

        bytes memory sa = _sign(ma);
        bytes memory sb = _sign(mb);

        vm.prank(alice);
        vault.buy(ma, sa, healthy, AMOUNT_IN);

        // Bob est dans son mandat, mais le coffre est vide : il echoue sur les fonds, pas sur la regle.
        vm.prank(bob);
        vm.expectRevert();
        vault.buy(mb, sb, healthy, AMOUNT_IN);
        console.log("LIMITE : les budgets sont separes, la tresorerie ne l'est pas");
        console.log("   -> un coffre par agent, ou un plafond global, si on veut l'isolation des fonds");
    }
}
