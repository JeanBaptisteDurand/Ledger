// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// Les fonds vont de la Ledger au coffre, et en reviennent, sans que la Ledger signe autre chose qu'un envoi d'ETH
/// (le depot) et un message EIP-712 (le retrait). Le banc paie le gaz du retrait ; il ne peut ni changer le montant,
/// ni le destinataire, ni rejouer l'autorisation.
contract WithdrawalTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;

    ExitVault v;
    uint256 ownerPk = 0xA11CE;
    address ownerAddr;
    address bench = address(0xBE2C);   // celui qui execute et paie le gaz : n'importe qui
    address stranger = address(0x5712);
    uint256 strangerPk = 0x5712;

    function setUp() public {
        ownerAddr = vm.addr(ownerPk);
        v = new ExitVault(ownerAddr, PM);
        vm.deal(ownerAddr, 2 ether);
        vm.deal(bench, 1 ether);
    }

    function hashW(ExitVault.Withdrawal calldata w) external view returns (bytes32) { return v.hashWithdrawal(w); }

    function _w(uint256 amount, address to, uint64 expiry, uint256 nonce) internal pure returns (ExitVault.Withdrawal memory) {
        return ExitVault.Withdrawal({token: WETH, amount: amount, to: to, expiry: expiry, nonce: nonce});
    }

    function _sign(uint256 pk, ExitVault.Withdrawal memory w) internal view returns (bytes memory) {
        (uint8 v8, bytes32 r, bytes32 s) = vm.sign(pk, this.hashW(w));
        return abi.encodePacked(r, s, v8);
    }

    /// 1. Le depot : un envoi d'ETH du porteur devient du WETH dans le coffre.
    function test_1_depositFromOwner_becomesWeth() public {
        vm.prank(ownerAddr);
        (bool ok,) = address(v).call{value: 1 ether}("");
        assertTrue(ok, "l'envoi d'ETH doit passer");
        assertEq(IERC20Minimal(WETH).balanceOf(address(v)), 1 ether, "1 ETH depose = 1 WETH dans le coffre");
        assertEq(address(v).balance, 0, "plus d'ETH natif : tout est en WETH");
    }

    /// 2. L'ETH venu d'ailleurs (le PoolManager, WETH9) n'est pas enveloppe : il sert aux pools en ETH natif.
    function test_2_ethFromOthers_staysEth() public {
        vm.prank(bench);
        (bool ok,) = address(v).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(address(v).balance, 0.5 ether);
        assertEq(IERC20Minimal(WETH).balanceOf(address(v)), 0);
    }

    /// 3. Le retrait autorise : le porteur signe, le banc execute, le WETH part vers le porteur.
    function test_3_withdrawWithAuthorization_byAnyone() public {
        deal(WETH, address(v), 3 ether);
        ExitVault.Withdrawal memory w = _w(1 ether, ownerAddr, uint64(block.timestamp + 1 hours), 1);
        bytes memory sig = _sign(ownerPk, w);
        vm.prank(bench);
        v.withdrawWithAuthorization(w, sig);
        assertEq(IERC20Minimal(WETH).balanceOf(ownerAddr), 1 ether, "le porteur a recu 1 WETH");
        assertEq(IERC20Minimal(WETH).balanceOf(address(v)), 2 ether, "il en reste 2 dans le coffre");
    }

    /// 4. La meme autorisation ne sert pas deux fois.
    function test_4_noReplay() public {
        deal(WETH, address(v), 3 ether);
        ExitVault.Withdrawal memory w = _w(1 ether, ownerAddr, uint64(block.timestamp + 1 hours), 2);
        bytes memory sig = _sign(ownerPk, w);
        vm.prank(bench);
        v.withdrawWithAuthorization(w, sig);
        vm.prank(bench);
        vm.expectRevert(ExitVault.WithdrawalUsed.selector);
        v.withdrawWithAuthorization(w, sig);
    }

    /// 5. Ni un autre signataire, ni un montant ou un destinataire changes apres coup, ni une autorisation expiree.
    function test_5_wrongSigner_tampered_expired() public {
        deal(WETH, address(v), 3 ether);
        ExitVault.Withdrawal memory w = _w(1 ether, ownerAddr, uint64(block.timestamp + 1 hours), 3);

        bytes memory bad = _sign(strangerPk, w);
        vm.prank(bench);
        vm.expectRevert();
        v.withdrawWithAuthorization(w, bad);

        bytes memory sig = _sign(ownerPk, w);
        ExitVault.Withdrawal memory tampered = _w(2 ether, ownerAddr, w.expiry, 3);
        vm.prank(bench);
        vm.expectRevert();
        v.withdrawWithAuthorization(tampered, sig);

        ExitVault.Withdrawal memory elsewhere = _w(1 ether, stranger, w.expiry, 3);
        vm.prank(bench);
        vm.expectRevert();
        v.withdrawWithAuthorization(elsewhere, sig);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(bench);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.WithdrawalExpired.selector, w.expiry, block.timestamp));
        v.withdrawWithAuthorization(w, sig);
        assertEq(IERC20Minimal(WETH).balanceOf(address(v)), 3 ether, "rien n'est sorti");
    }

    /// 6. Le proprietaire garde son retrait direct, et personne d'autre.
    function test_6_directWithdraw_ownerOnly() public {
        deal(WETH, address(v), 1 ether);
        vm.prank(stranger);
        vm.expectRevert(bytes("not owner"));
        v.withdraw(WETH, 1 ether, stranger);
        vm.prank(ownerAddr);
        v.withdraw(WETH, 1 ether, ownerAddr);
        assertEq(IERC20Minimal(WETH).balanceOf(ownerAddr), 1 ether);
    }
}
