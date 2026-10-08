// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/ExitVault.sol";

/// Combien coute le seul take() ? C'est LUI que la sonde borne, pas la sonde entiere.
contract TakeMeter {
    IPoolManager immutable pm;
    uint160 constant MIN_SQRT = 4295128739 + 1;
    error Measured(uint256 gasUsed, uint256 bought);
    constructor(IPoolManager _pm) { pm = _pm; }

    function measure(PoolKey calldata key, uint256 amountIn) external returns (uint256 g, uint256 bought) {
        try pm.unlock(abi.encode(key, amountIn)) { revert("?"); }
        catch (bytes memory r) {
            require(bytes4(r) == Measured.selector, "inattendu");
            bytes memory b = new bytes(r.length - 4);
            for (uint256 i = 0; i < b.length; i++) b[i] = r[i + 4];
            (g, bought) = abi.decode(b, (uint256, uint256));
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, uint256 amountIn) = abi.decode(data, (PoolKey, uint256));
        int256 d = pm.swap(key, SwapParams(true, -int256(amountIn), MIN_SQRT), "");
        int128 a1 = int128(d);
        uint256 bought = a1 > 0 ? uint256(uint128(a1)) : 0;
        uint256 g0 = gasleft();
        pm.take(key.currency1, address(this), bought);   // <-- LE geste borne
        revert Measured(g0 - gasleft(), bought);
    }
}

contract GasProbeTest is Test {
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant WETH = 0x4200000000000000000000000000000000000006;

    function test_gas_of_take_on_healthy_tokens() public {
        TakeMeter m = new TakeMeter(PM);
        address[4] memory toks = [
            address(uint160(0x0069df254076b8A0360ea1180b58AAF1749fe97786)),
            address(uint160(0x00a5A6e8dE490d5A9d4b5d35EdF76E6236Aa52D179)),
            address(uint160(0x0075c28c1f0302fEC6DE27DFEd1d8c5646943fAF8e)),
            address(uint160(0x0049E1B9996dbE1E1310514fa064754e293D19B405))
        ];
        uint256 worst;
        for (uint256 i = 0; i < toks.length; i++) {
            PoolKey memory k = PoolKey(WETH, toks[i], 8388608, 200,
                address(uint160(0x000469a4Bd3724DC86C9542F4694c976DA13C450c0)));
            (uint256 g,) = m.measure(k, 1e14);
            if (g > worst) worst = g;
            console.log("  take() sur un jeton sain : %s gaz", g);
        }
        console.log("");
        console.log("pire cas mesure   : %s gaz", worst);
        console.log("borne de la sonde : 400000 gaz");
        console.log("marge             : x%s", 400000 / (worst == 0 ? 1 : worst));
        assertLt(worst, 400000, "la borne doit laisser passer un jeton sain avec de la marge");
    }
}
