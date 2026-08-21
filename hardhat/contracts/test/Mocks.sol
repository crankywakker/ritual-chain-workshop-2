// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Mock contracts for local testing of RitualPredict.
 *
 * These are deployed at the canonical Ritual Chain system contract addresses
 * (via hardhat_setCode) so the RitualPredict constructor and runtime calls
 * succeed without the real precompiles.
 */

// ─────────────────────────── MockScheduler ───────────────────────────────────

contract MockScheduler {
    uint256 private _nextId = 1;
    // callId → cancelled
    mapping(uint256 => bool) public cancelled;

    event Scheduled(uint256 callId);
    event Cancelled(uint256 callId);

    function approveScheduler(address) external {}

    function schedule(
        bytes calldata, /* data */
        uint32,         /* gas */
        uint32,         /* startBlock */
        uint32,         /* numCalls */
        uint32,         /* frequency */
        uint32,         /* ttl */
        uint256,        /* maxFeePerGas */
        uint256,        /* maxPriorityFeePerGas */
        uint256,        /* value */
        address         /* payer */
    ) external returns (uint256 callId) {
        callId = _nextId++;
        emit Scheduled(callId);
    }

    function cancel(uint256 callId) external {
        cancelled[callId] = true;
        emit Cancelled(callId);
    }

    function getCallState(uint256 callId) external view returns (uint8) {
        return cancelled[callId] ? 3 : 0; // 3 = CANCELLED, 0 = SCHEDULED
    }
}

// ─────────────────────────── MockRitualWallet ─────────────────────────────────

contract MockRitualWallet {
    mapping(address => uint256) private _balances;

    function deposit(uint256 /* lockDuration */) external payable {
        _balances[msg.sender] += msg.value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lockUntil(address) external pure returns (uint256) {
        return 0;
    }
}

// ─────────────────────────── MockTEERegistry ──────────────────────────────────

contract MockTEERegistry {
    address public fixedExecutor;

    constructor() {
        fixedExecutor = address(0xDEAD);
    }

    function pickServiceByCapability(
        uint8,   /* capability */
        bool,    /* checkValidity */
        uint256, /* seed */
        uint256  /* maxProbes */
    ) external view returns (address teeAddress, bool found) {
        return (fixedExecutor, true);
    }

    function getIndexedServiceCountByCapability(
        uint8 /* capability */
    ) external pure returns (uint256) {
        return 1;
    }
}
