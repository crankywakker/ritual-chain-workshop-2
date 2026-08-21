/**
 * Measure Ritual Chain's current block time.
 *
 * The contract converts human durations ("betting open for 3 minutes") into block
 * counts, so this number is the one input worth checking before a workshop.
 *
 *   npx hardhat run scripts/block-time.ts
 */
import { connectRitual, measureBlockTimeMs } from "./ritual.ts";

const { connection, publicClient } = await connectRitual();

const latest = await publicClient.getBlockNumber();
const blockTimeMs = await measureBlockTimeMs(publicClient, 200);

console.log(`Latest block:      ${latest}`);
console.log(`Avg block time:    ${blockTimeMs.toFixed(2)} ms (sampled over 200 blocks)`);
console.log("");
console.log(`Suggested BLOCK_TIME_MS for deployment: ${Math.round(blockTimeMs)}`);
console.log("");
console.log("At that rate:");
for (const seconds of [60, 180, 300, 900]) {
  console.log(`  ${String(seconds).padStart(4)}s = ${Math.floor((seconds * 1000) / blockTimeMs)} blocks`);
}

await connection.close();
