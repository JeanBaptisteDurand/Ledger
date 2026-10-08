// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// La boucle fermee : acheter, surveiller, VENDRE, reprendre ses fonds.
/// C'est aussi la seule parade disponible contre l'interrupteur bascule APRES l'achat :
/// on ne peut pas l'empecher, on peut le detecter vite et sortir tant qu'on peut encore.
contract ExitTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    uint256 constant AMOUNT_IN = 1e14;

    PoolKey pool = PoolKey(WETH, address(uint160(0x0069df254076b8A0360ea1180b58AAF1749fe97786)),
                           8388608, 200, address(uint160(0x000469a4Bd3724DC86C9542F4694c976DA13C450c0)));

    ExitVault v;
    uint256 pk = 0xA11CE;
    address ownerAddr;
    address agent = address(0xA9E4);

    function setUp() public {
        ownerAddr = vm.addr(pk);
        v = new ExitVault(ownerAddr, PM);
        deal(WETH, address(v), 10 ether);
    }

    function hashM(ExitVault.Mandate calldata m) external view returns (bytes32) { return v.hashMandate(m); }

    function _m() internal view returns (ExitVault.Mandate memory) {
        return ExitVault.Mandate({agent: agent, budgetToken: WETH, budgetAmount: 10 * AMOUNT_IN,
            maxRoundTripLossBps: 300, expiry: uint64(block.timestamp + 7 days), nonce: 1});
    }
    function _s(ExitVault.Mandate memory m) internal view returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(pk, this.hashM(m)); return abi.encodePacked(r, s, vv);
    }

    function test_1_buy_then_sell_then_withdraw() public {
        ExitVault.Mandate memory m = _m(); bytes memory sg = _s(m);
        vm.prank(agent);
        (uint256 bought,) = v.buy(m, sg, pool, AMOUNT_IN);
        console.log("1. achete : %s jetons", bought);

        vm.prank(agent);
        uint256 got = v.sell(m, sg, pool, bought, 0);
        console.log("2. revendu : %s wei de WETH (mise %s)", got, AMOUNT_IN);
        uint256 lossBps = got >= AMOUNT_IN ? 0 : (AMOUNT_IN - got) * 10000 / AMOUNT_IN;
        console.log("   perte aller-retour reelle : %s bps (la sonde annoncait 198)", lossBps);
        assertApproxEqAbs(lossBps, 198, 12, "la sonde doit dire la verite sur l'execution reelle");

        uint256 before = IERC20Minimal(WETH).balanceOf(ownerAddr);
        vm.prank(ownerAddr);
        v.withdraw(WETH, 1 ether, ownerAddr);
        console.log("3. le porteur a repris 1 WETH");
        assertEq(IERC20Minimal(WETH).balanceOf(ownerAddr) - before, 1 ether);
    }

    function test_2_only_owner_withdraws() public {
        vm.prank(agent);
        vm.expectRevert(bytes("not owner"));
        v.withdraw(WETH, 1, agent);
        console.log("l'agent ne peut pas sortir les fonds du coffre");
    }

    function test_3_sell_needs_a_valid_mandate() public {
        ExitVault.Mandate memory m = _m();
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(uint256(0xBADBAD), this.hashM(m));
        vm.prank(agent);
        vm.expectRevert();
        v.sell(m, abi.encodePacked(r, s, vv), pool, 1, 0);
        console.log("vendre exige un mandat signe par le porteur");
    }

    function test_4_sell_respects_minOut() public {
        ExitVault.Mandate memory m = _m(); bytes memory sg = _s(m);
        vm.prank(agent);
        (uint256 bought,) = v.buy(m, sg, pool, AMOUNT_IN);
        vm.prank(agent);
        vm.expectRevert(bytes("sell: minOut"));
        v.sell(m, sg, pool, bought, 10 ether);
        console.log("une vente sous le minimum demande est annulee");
    }

    function test_5_owner_can_always_sell() public {
        ExitVault.Mandate memory m = _m(); bytes memory sg = _s(m);
        vm.prank(agent);
        (uint256 bought,) = v.buy(m, sg, pool, AMOUNT_IN);
        vm.prank(ownerAddr);
        uint256 got = v.sell(m, sg, pool, bought, 0);
        console.log("le porteur peut vendre lui-meme, sans passer par l'agent : %s wei", got);
        assertGt(got, 0);
    }
}
