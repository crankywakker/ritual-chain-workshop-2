/**
 * Shared helpers for the workshop scripts: chain connection, address book, and a
 * block-time measurement taken from the live chain.
 */
import { network } from "hardhat";
import { formatEther } from "viem";

/** Canonical Ritual Chain addresses. Mirrors contracts/ritual/RitualChain.sol. */
export const RITUAL = {
  chainId: 1979,
  scheduler: "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B",
  ritualWallet: "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948",
  teeServiceRegistry: "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F",
  httpPrecompile: "0x0000000000000000000000000000000000000801",
  jqPrecompile: "0x0000000000000000000000000000000000000803",
  explorer: "https://explorer.ritualfoundation.org",
  faucet: "https://faucet.ritualfoundation.org",
} as const;

export const RITUAL_WALLET_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [{ name: "lockDuration", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lockUntil",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const TEE_REGISTRY_ABI = [
  {
    type: "function",
    name: "pickServiceByCapability",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "checkValidity", type: "bool" },
      { name: "seed", type: "uint256" },
      { name: "maxProbes", type: "uint256" },
    ],
    outputs: [
      { name: "teeAddress", type: "address" },
      { name: "found", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getIndexedServiceCountByCapability",
    stateMutability: "view",
    inputs: [{ name: "capability", type: "uint8" }],
    outputs: [{ name: "count", type: "uint256" }],
  },
] as const;

export async function connectRitual() {
  const connection = await network.create({ network: "ritual", chainType: "l1" });
  const publicClient = await connection.viem.getPublicClient();
  const [wallet] = await connection.viem.getWalletClients();

  if (wallet === undefined) {
    throw new Error(
      "No account configured. Set RITUAL_PRIVATE_KEY in hardhat/.env (see .env.example).",
    );
  }

  return { connection, publicClient, wallet, viem: connection.viem };
}

/**
 * Measures average block time from the last `sample` blocks.
 *
 * Ritual Chain reports block timestamps in **milliseconds**, not seconds — and so does
 * `block.timestamp` inside Solidity.
 */
export async function measureBlockTimeMs(
  publicClient: Awaited<ReturnType<typeof connectRitual>>["publicClient"],
  sample = 200,
): Promise<number> {
  const latest = await publicClient.getBlockNumber();
  const older = latest - BigInt(sample);

  const [newBlock, oldBlock] = await Promise.all([
    publicClient.getBlock({ blockNumber: latest }),
    publicClient.getBlock({ blockNumber: older }),
  ]);

  const deltaMs = Number(newBlock.timestamp - oldBlock.timestamp);
  return deltaMs / sample;
}

export function explorerAddress(address: string): string {
  return `${RITUAL.explorer}/address/${address}`;
}

export function explorerTx(hash: string): string {
  return `${RITUAL.explorer}/tx/${hash}`;
}

export function ritual(amount: bigint): string {
  return `${formatEther(amount)} RITUAL`;
}
