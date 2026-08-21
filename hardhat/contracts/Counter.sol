// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal counter used by the workshop's example test (test/Counter.ts).
contract Counter {
    uint256 public x;

    event Increment(uint256 by);

    function inc() external {
        x += 1;
        emit Increment(1);
    }

    function incBy(uint256 amount) external {
        x += amount;
        emit Increment(amount);
    }
}
