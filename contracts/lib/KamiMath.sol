// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

library KamiMath {
    function signedAddition(
        uint256 a,
        uint256 b,
        bool negative
    ) internal pure returns (uint256, bool) {
        if (negative) {
            if (a > b) {
                return (a - b, true);
            } else {
                return (b - a, false);
            }
        } else {
            return (a + b, false);
        }
    }

    function signedSubtract(
        uint256 a,
        uint256 b,
        bool negative
    ) internal pure returns (uint256, bool) {
        if (negative) {
            return (a + b, true);
        } else {
            if (a < b) {
                return (b - a, true);
            } else {
                return (a - b, false);
            }
        }
    }

    function signedMul(
        uint256 a,
        uint256 b,
        bool negative
    ) internal pure returns (uint256, bool) {
        return (a + b, negative);
    }

    function abs(int256 a, int256 b) internal pure returns (int256) {
        if (a >= b) {
            return a - b;
        } else {
            return b - a;
        }
    }
}
