/**
 * Local deploy: patches the canonical Ritual Chain system-contract addresses
 * with mock bytecode, then deploys RitualPredict.
 *
 *   npx hardhat run scripts/local-deploy.ts --network localhost
 *
 * Prints the contract address so you can paste it into web/index.html
 * (or supply it via ?address=0x… in the URL).
 */
import { network } from "hardhat";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Canonical Ritual Chain addresses (same as RitualChain.sol) ─────────────

const SCHEDULER_ADDR     = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B" as `0x${string}`;
const RITUAL_WALLET_ADDR = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as `0x${string}`;
const TEE_REGISTRY_ADDR  = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as `0x${string}`;
const HTTP_PRECOMPILE    = "0x0000000000000000000000000000000000000801" as `0x${string}`;
const JQ_PRECOMPILE      = "0x0000000000000000000000000000000000000803" as `0x${string}`;

const connection  = await network.create({ network: "localhost", chainType: "l1" });
const { viem }    = connection;
const publicClient = await viem.getPublicClient();
const [deployer]   = await viem.getWalletClients();

console.log("── Local deploy ──────────────────────────────────────────────");
console.log(`Deployer: ${deployer.account.address}`);
console.log(`Balance:  ${await publicClient.getBalance({ address: deployer.account.address })} wei`);

// ── Deploy mocks to throwaway addresses, then etch onto canonical ones ──────

console.log("\n── Patching Ritual system contracts with mocks…");

const schedulerMock = await viem.deployContract("MockScheduler");
const walletMock    = await viem.deployContract("MockRitualWallet");
const registryMock  = await viem.deployContract("MockTEERegistry");

const schedulerCode = await publicClient.getCode({ address: schedulerMock.address });
const walletCode    = await publicClient.getCode({ address: walletMock.address });
const registryCode  = await publicClient.getCode({ address: registryMock.address });

// no-op precompile: PUSH1 20, PUSH1 0, RETURN — returns 32 zero bytes
const noopCode = "0x60206000f3";

async function setCode(addr: `0x${string}`, code: string | undefined) {
  if (!code) throw new Error(`No code for ${addr}`);
  await (publicClient as any).request({ method: "hardhat_setCode", params: [addr, code] });
}

await setCode(SCHEDULER_ADDR,     schedulerCode!);
await setCode(RITUAL_WALLET_ADDR, walletCode!);
await setCode(TEE_REGISTRY_ADDR,  registryCode!);
await setCode(HTTP_PRECOMPILE,    noopCode);
await setCode(JQ_PRECOMPILE,      noopCode);

console.log("  ✓ MockScheduler    →", SCHEDULER_ADDR);
console.log("  ✓ MockRitualWallet →", RITUAL_WALLET_ADDR);
console.log("  ✓ MockTEERegistry  →", TEE_REGISTRY_ADDR);
console.log("  ✓ HTTP precompile  →", HTTP_PRECOMPILE, "(no-op)");
console.log("  ✓ jq  precompile   →", JQ_PRECOMPILE,  "(no-op)");

// ── Deploy RitualPredict ─────────────────────────────────────────────────────

console.log("\n── Deploying RitualPredict (blockTimeMs = 200)…");
const predict = await viem.deployContract("RitualPredict", [200n]);
console.log(`\n✅ RitualPredict deployed at: ${predict.address}`);

// ── Write a config file for the frontend to pick up ─────────────────────────

const here      = dirname(fileURLToPath(import.meta.url));
const configOut = resolve(here, "../../web/local-config.json");

await mkdir(dirname(configOut), { recursive: true });
await writeFile(configOut, JSON.stringify({ address: predict.address }, null, 2), "utf8");
console.log(`\nWrote address to web/local-config.json`);

console.log("\n── Next ──────────────────────────────────────────────────────");
console.log(`1. Open web/index.html in your browser`);
console.log(`2. Connect MetaMask to localhost:8545 (chainId 31337)`);
console.log(`3. Paste the address above when prompted, or use the URL:`);
console.log(`   file:///.../web/index.html?address=${predict.address}`);

await connection.close();
