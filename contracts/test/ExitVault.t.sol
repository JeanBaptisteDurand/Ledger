// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// Fork Base au bloc 50 614 000 — le bloc des mesures TARE. Chaque chiffre affiché ici se rejoue.
contract ExitVaultTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    uint256 constant AMOUNT_IN = 1e14; // 0,0001 ETH — la taille des mesures

    ExitVault vault;
    uint256 ownerPk = 0xA11CE;
    address ownerAddr;
    address agent = address(0xA9E4);
    address constant WETH = 0x4200000000000000000000000000000000000006;

    function _oneWay() internal pure returns (PoolKey[6] memory k, string[6] memory n) {
        k[0] = PoolKey(address(uint160(0x004200000000000000000000000000000000000006)), address(uint160(0x00b20000000000000000000090aa1082ce28905f01)), 100, 1, address(uint160(0x009ce0e33e68c7bfc035b31961e4f1ddc55f0c0145))); n[0] = "one-way 0xbbe6d857";
        k[1] = PoolKey(address(uint160(0x000000000000000000000000000000000000000000)), address(uint160(0x00b2000000000000000000000518f4215d5615bfb8)), 3000, 60, address(uint160(0x00d7b5de859876c8c2748271c2f5f7b765d24340cc))); n[1] = "one-way 0x59c65b1a";
        k[2] = PoolKey(address(uint160(0x000000000000000000000000000000000000000000)), address(uint160(0x00b20000000000000000000046b0841444caecc9cf)), 3000, 60, address(uint160(0x00376b786aa1c1deaae37ad6976784eb12988980cc))); n[2] = "one-way 0xafb6c01f";
        k[3] = PoolKey(address(uint160(0x000000000000000000000000000000000000000000)), address(uint160(0x00b20000000000000000000047d907610d48a4e658)), 3000, 60, address(uint160(0x00a4b8ceab9b8663394d48f1df0fdcc1e7237680cc))); n[3] = "one-way 0x8397fa99";
        k[4] = PoolKey(address(uint160(0x000000000000000000000000000000000000000000)), address(uint160(0x00b2000000000000000000007c2d92da45af966425)), 3000, 60, address(uint160(0x0013b399b5c738a591ae23039ee1ebbb7f660f80cc))); n[4] = "one-way 0xa5a63da4";
        k[5] = PoolKey(address(uint160(0x000000000000000000000000000000000000000000)), address(uint160(0x00b20000000000000000000035f24d6ca214698b37)), 3000, 60, address(uint160(0x00f52c1d5f3b0e985248870b648dc374a3c77c80cc))); n[5] = "one-way 0x8289b4e5";
    }

    function _controls() internal pure returns (PoolKey[4] memory k, string[4] memory n) {
        k[0] = PoolKey(address(uint160(0x004200000000000000000000000000000000000006)), address(uint160(0x0069df254076b8a0360ea1180b58aaf1749fe97786)), 8388608, 200, address(uint160(0x000469a4bd3724dc86c9542f4694c976da13c450c0))); n[0] = "temoin 0x010d0023";
        k[1] = PoolKey(address(uint160(0x004200000000000000000000000000000000000006)), address(uint160(0x00a5a6e8de490d5a9d4b5d35edf76e6236aa52d179)), 8388608, 200, address(uint160(0x000469a4bd3724dc86c9542f4694c976da13c450c0))); n[1] = "temoin 0x0457d44f";
        k[2] = PoolKey(address(uint160(0x004200000000000000000000000000000000000006)), address(uint160(0x0075c28c1f0302fec6de27dfed1d8c5646943faf8e)), 8388608, 200, address(uint160(0x000469a4bd3724dc86c9542f4694c976da13c450c0))); n[2] = "temoin 0x19dde945";
        k[3] = PoolKey(address(uint160(0x004200000000000000000000000000000000000006)), address(uint160(0x0049e1b9996dbe1e1310514fa064754e293d19b405)), 8388608, 200, address(uint160(0x000469a4bd3724dc86c9542f4694c976da13c450c0))); n[3] = "temoin 0x928d331e";
    }

    function setUp() public {
        ownerAddr = vm.addr(ownerPk);
        vault = new ExitVault(ownerAddr, PM);
        vm.deal(address(vault), 10 ether);
        deal(WETH, address(vault), 10 ether);
        vm.deal(agent, 1 ether);
    }

    function _mandate() internal view returns (ExitVault.Mandate memory m) {
        m = ExitVault.Mandate({
            agent: agent,
            budgetToken: WETH,
            budgetAmount: 1 ether,
            maxRoundTripLossBps: 300,
            expiry: uint64(block.timestamp + 7 days),
            nonce: 1
        });
    }

    function _sign(ExitVault.Mandate memory m) internal view returns (bytes memory) {
        ExitVault.Mandate[1] memory box = [m];
        bytes32 digest = this.hashFor(box[0]);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function hashFor(ExitVault.Mandate calldata m) external view returns (bytes32) {
        return vault.hashMandate(m);
    }

    /* --------------------------------------------- la sonde voit la sortie */

    function test_1_probe_oneWayPools_areTraps() public {
        (PoolKey[6] memory k, string[6] memory n) = _oneWay();
        for (uint256 i = 0; i < k.length; i++) {
            (uint256 bps, bool reverted, bytes4 why) = vault.exitLossBps(k[i], AMOUNT_IN);
            if (reverted) {
                console.log("%s : la revente REVERT (hook %s) -> sortie impossible", n[i], vm.toString(why));
            } else {
                console.log("%s : perte aller-retour %s bps", n[i], bps);
            }
            assertGe(bps, 4000, "un pool one-way doit couter tres cher a la sortie");
        }
    }

    function test_2_probe_controls_areFine() public {
        (PoolKey[4] memory k, string[4] memory n) = _controls();
        for (uint256 i = 0; i < k.length; i++) {
            (uint256 bps, bool reverted,) = vault.exitLossBps(k[i], AMOUNT_IN);
            console.log("%s : perte aller-retour %s bps (revert: %s)", n[i], bps, reverted);
        }
    }

    /* --------------------------------------------- le coffre refuse ou laisse passer */

    function test_3_buy_refusesOneWayPools() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sig = _sign(m);
        (PoolKey[6] memory k, string[6] memory n) = _oneWay();
        for (uint256 i = 0; i < k.length; i++) {
            if (k[i].currency0 != WETH) continue; // le mandat de demo a un budget en WETH
            vm.prank(agent);
            try vault.buy(m, sig, k[i], AMOUNT_IN) returns (uint256, uint256) {
                fail();
            } catch (bytes memory err) {
                bytes4 sel = bytes4(err);
                assertTrue(
                    sel == ExitVault.CannotExit.selector || sel == ExitVault.ExitBlocked.selector,
                    "doit refuser pour cause de sortie"
                );
                console.log("%s : ACHAT REFUSE (%s)", n[i], vm.toString(sel));
            }
            assertEq(vault.spent(this.hashFor(m)), 0, "un refus ne consomme pas le budget");
        }
    }

    function test_4_buy_allowsHealthyPool() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sig = _sign(m);
        (PoolKey[4] memory k, string[4] memory n) = _controls();
        bool bought = false;
        for (uint256 i = 0; i < k.length && !bought; i++) {
            (uint256 bps, bool rev,) = vault.exitLossBps(k[i], AMOUNT_IN);
            if (rev || bps > m.maxRoundTripLossBps) continue;
            vm.prank(agent);
            (uint256 got, uint256 exitBps) = vault.buy(m, sig, k[i], AMOUNT_IN);
            console.log("%s : ACHAT ACCEPTE, recu %s jetons, sortie %s bps", n[i], got, exitBps);
            assertGt(got, 0);
            assertEq(vault.spent(this.hashFor(m)), AMOUNT_IN);
            assertEq(IERC20Minimal(k[i].currency1).balanceOf(address(vault)), got, "les jetons sont dans le coffre");
            bought = true;
        }
        assertTrue(bought, "aucun temoin sous le seuil : ajuster le mandat de demo");
    }

    /* --------------------------------------------- le mandat borne l'agent */

    function test_5_mandate_rejectsStranger() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sig = _sign(m);
        (PoolKey[4] memory k,) = _controls();
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ExitVault.NotTheAgent.selector, address(0xBAD), agent));
        vault.buy(m, sig, k[0], AMOUNT_IN);
    }

    function test_6_mandate_rejectsForgedSignature() public {
        ExitVault.Mandate memory m = _mandate();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(0xBADBAD), this.hashFor(m));
        (PoolKey[4] memory k,) = _controls();
        vm.prank(agent);
        vm.expectRevert();
        vault.buy(m, abi.encodePacked(r, s, v), k[0], AMOUNT_IN);
    }

    function test_7_mandate_expires() public {
        ExitVault.Mandate memory m = _mandate();
        bytes memory sig = _sign(m);
        (PoolKey[4] memory k,) = _controls();
        vm.warp(uint256(m.expiry) + 1);
        vm.prank(agent);
        vm.expectRevert();
        vault.buy(m, sig, k[0], AMOUNT_IN);
    }

    function test_8_mandate_capsTheBudget() public {
        ExitVault.Mandate memory m = _mandate();
        m.budgetAmount = AMOUNT_IN / 2;
        bytes memory sig = _sign(m);
        (PoolKey[4] memory k,) = _controls();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.BudgetExceeded.selector, AMOUNT_IN, m.budgetAmount));
        vault.buy(m, sig, k[0], AMOUNT_IN);
    }
}
