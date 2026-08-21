// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Canonical Ritual Chain (chain id 1979) precompile + system contract addresses.
 *
 * Source: https://docs.ritualfoundation.org (Precompile Map / System Contracts) and
 * https://github.com/ritual-foundation/ritual-dapp-skills.
 *
 * Nothing here is guessed — every address and enum value below is copied from those
 * references. Keep this the single place addresses live so the workshop has one file
 * to point at.
 */
library RitualChain {
    /// HTTP call precompile. Short-running async: the TEE executor's response is
    /// injected back into the *same* transaction (fulfilled replay).
    address internal constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;

    /// jq precompile. Fully synchronous — returns in the same call frame.
    address internal constant JQ_PRECOMPILE = 0x0000000000000000000000000000000000000803;

    /// Scheduler system contract. Only contracts may schedule; it always calls back msg.sender.
    address internal constant SCHEDULER = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;

    /// Prepaid fee escrow for precompile + scheduled execution fees.
    address internal constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;

    /// Registry of attested TEE executors.
    address internal constant TEE_SERVICE_REGISTRY = 0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F;

    /// TEEServiceRegistry capability id for HTTP_CALL.
    uint8 internal constant CAPABILITY_HTTP_CALL = 0;

    /// HTTP method codes accepted by 0x0801 (0 is invalid and rejected by the chain).
    uint8 internal constant HTTP_GET = 1;

    /// jq outputType codes. 1 = uint256.
    uint8 internal constant JQ_OUT_UINT256 = 1;
}

interface IScheduler {
    /// @dev The Scheduler calls back msg.sender. `data` bytes 4-35 are overwritten with
    ///      the real executionIndex at execution time, so the callback's first argument
    ///      must be `uint256 executionIndex` and encoded as a 0 placeholder.
    function schedule(
        bytes calldata data,
        uint32 gas,
        uint32 startBlock,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 value,
        address payer
    ) external returns (uint256 callId);

    function cancel(uint256 callId) external;

    function getCallState(uint256 callId) external view returns (uint8);

    /// Authorises `schedulerContract` to call back into / pay from the caller.
    function approveScheduler(address schedulerContract) external;
}

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;

    function balanceOf(address account) external view returns (uint256);

    function lockUntil(address account) external view returns (uint256);
}

interface ITEEServiceRegistry {
    /// Bounded random executor selection. Returns (teeAddress, found).
    function pickServiceByCapability(uint8 capability, bool checkValidity, uint256 seed, uint256 maxProbes)
        external
        view
        returns (address teeAddress, bool found);
}
