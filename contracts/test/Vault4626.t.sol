// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// La seconde instance de la meme question, sur des coffres ERC-4626 REELS de Base (Morpho), au bloc
/// des mesures. Le standard ecrit le piege : `previewRedeem` doit ignorer les limites de retrait,
/// `maxWithdraw` peut valoir moins que la position. La sonde fait l'aller-retour pour de vrai, puis
/// demande si le plus gros deposant pourrait sortir aujourd'hui.
///
/// Adresses et deposants : Morpho API (vaults/vaultPositions, chainId 8453), verifies sur le fork.
contract Vault4626Test is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    uint256 constant AMOUNT_IN = 1e16; // 0,01 WETH : une tranche de tresorerie, pas une miette

    struct V {
        address vault;
        address topHolder;
        string name;
    }

    V[10] vaults;
    ExitVault ev;
    uint256 ownerPk = 0xA11CE;
    address ownerAddr;
    address agent = address(0xA9E4);

    function setUp() public {
        ownerAddr = vm.addr(ownerPk);
        ev = new ExitVault(ownerAddr, PM);
        deal(WETH, address(ev), 10 ether);

        vaults[0] = V(0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1, 0x93D9E4535f2e62C0630e6F2E89c2d95190422461, "Moonwell Flagship ETH");
        vaults[1] = V(0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18, 0x1243e7aD51EDA47e580C20E751AcAa0B8863c17C, "Seamless WETH Vault");
        vaults[2] = V(0x5A32099837D89E3a794a44fb131CBbAD41f87a8C, 0xE67225e35FC75971a4347890a43a9C0C869F5547, "Extrafi XLend WETH");
        vaults[3] = V(0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844, 0xEFbCFe7b644d6b2E058116954412976741650242, "Gauntlet WETH Core");
        vaults[4] = V(0x09832347586E238841F49149C84d121Bc2191C53, 0xc41848A0aaaE43B8eCF0d23371f9b20B96b41B83, "Clearstar ETH Reactor");
        vaults[5] = V(0x1D795E29044A62Da42D927c4b179269139A28A6B, 0xe4342fd5C09Df6Ba8C39c3bC3BA9a7D02097F33c, "Yearn OG WETH");
        vaults[6] = V(0xA2Cac0023a4797b4729Db94783405189a4203AFc, 0x961b2429Aaae97172F493eE6926E37b9a04E7040, "Re7 WETH");
        vaults[7] = V(0xbEEf050a7485865A7a8d8Ca0CC5f7536b7a3443e, 0x8A9B4f00Cd8a5EB91a02Af38A8b6D4cF2eb35a20, "Steakhouse ETH");
        vaults[8] = V(0xBeef2dc30633221Fa51A1C3e5299BFf8C69fc0A8, 0x4e1D2d808c5b8BbFdFefCB4a46151483eba6aEbd, "Safe x Steakhouse ETH");
        vaults[9] = V(0x80D9964fEb4A507dD697b4437Fc5b25b618CE446, 0x8Ba14FAFDb6139cdADF84a43667e38cCD936432f, "Pyth ETH");
    }

    function hashM(ExitVault.Mandate calldata m) external view returns (bytes32) { return ev.hashMandate(m); }
    function hashE(ExitVault.Exception calldata e) external view returns (bytes32) { return ev.hashException(e); }

    function _mandate(uint16 maxBps) internal view returns (ExitVault.Mandate memory) {
        return ExitVault.Mandate({
            agent: agent, budgetToken: WETH, budgetAmount: 1 ether,
            maxRoundTripLossBps: maxBps, expiry: uint64(block.timestamp + 7 days), nonce: 1
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

    /* --------------------------------------------- 1. la sonde, sur dix coffres reels */

    bytes4 constant ALL_CAPS_REACHED = 0xded0652d; // MetaMorpho : AllCapsReached()

    function test_1_scan_tenRealVaults() public {
        console.log("");
        console.log("coffre | aller-retour a 0,01 WETH | porte (part du plus gros deposant bloquee) | verdict a 300 bps");
        uint256 full;
        uint256 refused;
        uint256 accepted;
        for (uint256 i = 0; i < vaults.length; i++) {
            V memory v = vaults[i];
            try ev.vaultExitLossBps(IERC4626(v.vault), AMOUNT_IN, v.topHolder)
                returns (uint256 lossBps, bool blocked, bytes4, uint256 ownBps, uint256 stuckBps)
            {
                (, uint256 refAssets, uint256 refMaxOut) = ev.vaultStuckBps(IERC4626(v.vault), v.topHolder);
                console.log("%s : aller-retour %s bps, porte %s bps bloques", v.name, ownBps, stuckBps);
                console.log("    plus gros deposant : %s wei de position, %s wei retirables aujourd'hui", refAssets, refMaxOut);
                console.log("    -> %s", blocked ? "BLOQUE" : (lossBps > 300 ? "REFUSE a 300 bps" : "accepte a 300 bps"));
                assertFalse(blocked, "aucun de ces coffres ne devrait bloquer un aller-retour de 0,01 WETH");
                if (lossBps > 300) refused++;
                else accepted++;
            } catch (bytes memory err) {
                // le DEPOT lui-meme est refuse : BuyFailed(raison du coffre)
                bytes4 inner;
                if (bytes4(err) == ExitVault.BuyFailed.selector) {
                    bytes memory reason = abi.decode(_tail(err), (bytes));
                    if (reason.length >= 4) inner = bytes4(reason);
                }
                console.log("%s : DEPOT REFUSE par le coffre (%s)", v.name,
                            inner == ALL_CAPS_REACHED ? "AllCapsReached - le coffre est plein" : vm.toString(inner));
                full++;
            }
        }
        console.log("");
        console.log("sur 10 coffres : %s pleins (depot refuse), %s a porte trop fermee pour 300 bps, %s acceptes", full, refused, accepted);
        assertGe(refused, 1, "au bloc des mesures, au moins un grand coffre a une porte partiellement fermee");
        assertGe(accepted, 2, "et plusieurs coffres ont la porte ouverte");
    }

    function _tail(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i = 0; i < out.length; i++) out[i] = data[i + 4];
    }

    /* --------------------------------------------- 2. le plus gros coffre : la porte est a 73 % */

    function test_2_moonwell_topHolderCannotFullyExit() public {
        V memory v = vaults[0];
        (uint256 stuckBps, uint256 refAssets, uint256 refMaxOut) = ev.vaultStuckBps(IERC4626(v.vault), v.topHolder);
        console.log("Moonwell Flagship ETH : position %s wei, retirable %s wei, bloque %s bps", refAssets, refMaxOut, stuckBps);
        assertGt(stuckBps, 1000, "au bloc des mesures, plus de 10 % de la plus grosse position est bloquee");
        assertLt(stuckBps, 10_000);
    }

    /* --------------------------------------------- 3. le mandat refuse la porte fermee, accepte l'ouverte */

    function test_3_enterVault_refusesMoonwell_acceptsGauntlet() public {
        ExitVault.Mandate memory m = _mandate(300);
        bytes memory sig = _signM(m);

        // Moonwell : le plus gros, le plus visible, 1,36 % affiche — et 27 % de la porte fermee
        V memory moon = vaults[0];
        (uint256 lossBps,,,,) = ev.vaultExitLossBps(IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.CannotExit.selector, lossBps, uint256(300)));
        ev.enterVault(m, sig, IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);
        console.log("Moonwell : REFUSE, sortie %s bps pour un mandat a 300", lossBps);
        assertEq(ev.spent(ev.hashMandate(m)), 0, "le refus ne consomme pas le budget");

        // Gauntlet WETH Core : porte ouverte a 100 % (Seamless, lui, refuse meme le depot : caps atteints)
        V memory open = vaults[3];
        vm.prank(agent);
        (uint256 shares, uint256 exitBps) = ev.enterVault(m, sig, IERC4626(open.vault), AMOUNT_IN, open.topHolder);
        console.log("Gauntlet WETH Core : ENTRE, %s parts, sortie %s bps", shares, exitBps);
        assertGt(shares, 0);
        assertLe(exitBps, 300);
        assertEq(ev.spent(ev.hashMandate(m)), AMOUNT_IN);
        assertEq(IERC4626(open.vault).balanceOf(address(ev)), shares, "le coffre detient les parts");
    }

    /* --------------------------------------------- 4. sortir : ce qu'on recupere vraiment */

    function test_4_exitVault_returnsWhatWasPutIn() public {
        ExitVault.Mandate memory m = _mandate(300);
        bytes memory sig = _signM(m);
        V memory open = vaults[3];
        vm.prank(agent);
        (uint256 shares,) = ev.enterVault(m, sig, IERC4626(open.vault), AMOUNT_IN, open.topHolder);

        uint256 before = IERC20Minimal(WETH).balanceOf(address(ev));
        vm.prank(agent);
        uint256 got = ev.exitVault(m, sig, IERC4626(open.vault), shares, 0);
        console.log("Gauntlet WETH Core : sorti, %s wei recuperes sur %s deposes (%s bps de perte)",
                    got, AMOUNT_IN, got >= AMOUNT_IN ? 0 : ((AMOUNT_IN - got) * 10_000) / AMOUNT_IN);
        assertEq(IERC20Minimal(WETH).balanceOf(address(ev)), before + got);
        assertGe(got, AMOUNT_IN * 9_990 / 10_000, "moins de 10 bps perdus a l'aller-retour");
    }

    /* --------------------------------------------- 5. la derogation, liee au nombre lu */

    function test_5_exception_allowsMoonwell_onceAndOnlyAtSeenBps() public {
        ExitVault.Mandate memory m = _mandate(300);
        bytes memory sm = _signM(m);
        V memory moon = vaults[0];
        (uint256 lossBps,,,,) = ev.vaultExitLossBps(IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);

        // le porteur lit << porte fermee a X bps >> et signe pour CE coffre, CE montant, CE nombre
        ExitVault.Exception memory e = ExitVault.Exception({
            agent: agent, budgetToken: WETH, poolKeyHash: ev.hashVault(IERC4626(moon.vault)), amountIn: AMOUNT_IN,
            seenExitBps: uint16(lossBps), expiry: uint64(block.timestamp + 1 hours), nonce: 7
        });
        bytes memory se = _signE(e);

        // une derogation pour un nombre PLUS PETIT que la realite ne vaut rien
        // (struct construite a part : en Solidity, `tooLow = e` ne copierait que la reference)
        ExitVault.Exception memory tooLow = ExitVault.Exception({
            agent: agent, budgetToken: WETH, poolKeyHash: ev.hashVault(IERC4626(moon.vault)), amountIn: AMOUNT_IN,
            seenExitBps: uint16(lossBps - 1), expiry: uint64(block.timestamp + 1 hours), nonce: 8
        });
        bytes memory sLow = _signE(tooLow);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExitVault.ExitWorseThanSeen.selector, lossBps, uint16(lossBps - 1)));
        ev.enterVaultUnderException(m, sm, tooLow, sLow, IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);

        vm.prank(agent);
        (uint256 shares, uint256 exitBps) =
            ev.enterVaultUnderException(m, sm, e, se, IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);
        console.log("Moonwell sous derogation : ENTRE, %s parts, sortie %s bps assumee", shares, exitBps);
        assertGt(shares, 0);

        // et une seule fois
        vm.prank(agent);
        vm.expectRevert(ExitVault.ExceptionSpent.selector);
        ev.enterVaultUnderException(m, sm, e, se, IERC4626(moon.vault), AMOUNT_IN, moon.topHolder);
    }

    /* --------------------------------------------- 6. previewRedeem ment par construction : on ne le croit pas */

    function test_6_previewIsNotTheDoor() public {
        V memory moon = vaults[0];
        IERC4626 v = IERC4626(moon.vault);
        uint256 previewOut = v.previewRedeem(v.balanceOf(moon.topHolder));
        uint256 maxOut = v.maxWithdraw(moon.topHolder);
        console.log("Moonwell, plus gros deposant : previewRedeem %s wei, maxWithdraw %s wei", previewOut, maxOut);
        assertGt(previewOut, maxOut, "le standard : previewRedeem ignore les limites de retrait");
    }
}
