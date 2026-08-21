import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Local Hardhat node started with `npx hardhat node`.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Ritual Chain testnet. Requires EIP-1559 (type-2) transactions; viem sends
    // those by default.
    ritual: {
      type: "http",
      chainType: "l1",
      chainId: 1979,
      url: "https://rpc.ritualfoundation.org",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
