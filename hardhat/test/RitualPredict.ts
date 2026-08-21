/**
 * RitualPredict local tests.
 *
 * The Ritual Chain system contracts (Scheduler, RitualWallet, TEEServiceRegistry)
 * are mocked by deploying MockScheduler / MockRitualWallet / MockTEERegistry at
 * their canonical addresses using hardhat_setCode before RitualPredict is deployed.
 *
 * Coverage:
 *  - createMarket: happy path, events, validation guards
 *  - bet: happy path, BettingClosed, ZeroStake guards
 *  - onScheduledResolve: OnlyScheduler guard
 *  - getMarket: virtual Closed flip, UnknownMarket guard
 *  - getMarkets: newest-first ordering
 *  - stakesOf: yes/no stake reporting
 *  - claimRefund / claimWinnings: state guards
 *  - fundExecution: ZeroStake guard
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import { network } from "hardhat";
import { parseEther, type GetContractReturnType, type PublicClient } from "viem";

// ─────────────────────── Canonical Ritual Chain addresses ───────────────────

const SCHEDULER_ADDR    = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B" as const;
const RITUAL_WALLET_ADDR= "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as const;
const TEE_REGISTRY_ADDR = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;

// HTTP and jq precompile addresses
const HTTP_PRECOMPILE   = "0x0000000000000000000000000000000000000801" as const;
const JQ_PRECOMPILE     = "0x0000000000000000000000000000000000000803" as const;

// ────────────────────────── Enum mirrors ────────────────────────────────────

const Comparator  = { GT: 0, GTE: 1, LT: 2, LTE: 3 } as const;
const MarketState = { Open: 0, Closed: 1, Resolving: 2, Resolved: 3, Invalid: 4 } as const;
const Outcome     = { Unresolved: 0, Yes: 1, No: 2 } as const;

// ────────────────────────── Helpers ─────────────────────────────────────────

async function mineBlocks(
  client: Awaited<ReturnType<typeof network.create>>["viem"] | any,
  n: number
) {
  // hardhat_mine mines `n` blocks at once (hex-encoded count)
  await (client as any).request({
    method: "hardhat_mine",
    params: ["0x" + n.toString(16)],
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("RitualPredict", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, alice, bob] = await viem.getWalletClients();

  let predict: Awaited<ReturnType<typeof viem.deployContract<"RitualPredict">>>;

  // ── Patch system contract addresses with mock bytecode ──────────────────

  before(async () => {
    // Deploy each mock to a throwaway address, then etch its bytecode onto the
    // canonical Ritual Chain address so RitualPredict finds working code there.
    const schedulerMock    = await viem.deployContract("MockScheduler");
    const walletMock       = await viem.deployContract("MockRitualWallet");
    const registryMock     = await viem.deployContract("MockTEERegistry");

    const schedulerCode = await publicClient.getCode({ address: schedulerMock.address });
    const walletCode    = await publicClient.getCode({ address: walletMock.address });
    const registryCode  = await publicClient.getCode({ address: registryMock.address });

    // Place mock bytecode at the addresses RitualPredict hard-codes.
    await (publicClient as any).request({
      method: "hardhat_setCode",
      params: [SCHEDULER_ADDR,     schedulerCode],
    });
    await (publicClient as any).request({
      method: "hardhat_setCode",
      params: [RITUAL_WALLET_ADDR, walletCode],
    });
    await (publicClient as any).request({
      method: "hardhat_setCode",
      params: [TEE_REGISTRY_ADDR,  registryCode],
    });

    // Stub the HTTP and jq precompiles with no-op code that returns 32 zero bytes.
    // The precompiles are only exercised during actual oracle resolution, which
    // we don't test end-to-end locally (Scheduler callback is never fired).
    const noopCode = "0x60206000f3"; // PUSH1 32, PUSH1 0, RETURN  → returns 32 zero bytes
    await (publicClient as any).request({
      method: "hardhat_setCode",
      params: [HTTP_PRECOMPILE, noopCode],
    });
    await (publicClient as any).request({
      method: "hardhat_setCode",
      params: [JQ_PRECOMPILE,  noopCode],
    });

    // Deploy the contract — constructor calls approveScheduler() on SCHEDULER_ADDR,
    // which now has MockScheduler bytecode.
    predict = await viem.deployContract("RitualPredict", [200n]);
  });

  // ─────────────────────── Utility: open a fresh market ───────────────────

  async function openMarket(opts?: {
    question?: string;
    target?: bigint;
    comparator?: number;
    bettingSeconds?: bigint;
    resolveDelaySeconds?: bigint;
  }) {
    const hash = await predict.write.createMarket([
      {
        question:            opts?.question           ?? "Will price be GTE 100?",
        oracleUrl:           "http://example.com/oracle",
        jsonPath:            ".price",
        target:              opts?.target             ?? 100n,
        comparator:          opts?.comparator         ?? Comparator.GTE,
        bettingSeconds:      opts?.bettingSeconds     ?? 30n,
        resolveDelaySeconds: opts?.resolveDelaySeconds ?? 15n,
      },
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    return await predict.read.marketCount();
  }

  // ─────────────────────────── createMarket ────────────────────────────────

  describe("createMarket", async () => {
    it("increments marketCount and persists the market", async () => {
      const before = await predict.read.marketCount();
      const id = await openMarket({ question: "Market A" });
      assert.equal(id, before + 1n, "marketCount should increment by 1");

      const m = await predict.read.getMarket([id]);
      assert.equal(m.id,       id,                  "id mismatch");
      assert.equal(m.state,    MarketState.Open,     "should be Open");
      assert.equal(m.outcome,  Outcome.Unresolved,   "should be Unresolved");
      assert.equal(m.question, "Market A");
      assert.equal(m.target,   100n);
    });

    it("emits MarketCreated with correct id, creator and question", async () => {
      const id = (await predict.read.marketCount()) + 1n;
      const hash = await predict.write.createMarket([
        {
          question: "Event check",
          oracleUrl: "http://example.com/oracle",
          jsonPath: ".price",
          target: 50n,
          comparator: Comparator.GT,
          bettingSeconds: 30n,
          resolveDelaySeconds: 15n,
        },
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse the MarketCreated log manually so we can assert specific fields
      // without being constrained by emitWithArgs argument-count matching.
      const logs = await publicClient.getContractEvents({
        address: predict.address,
        abi: predict.abi,
        eventName: "MarketCreated",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.ok(logs.length > 0, "No MarketCreated event found");
      const args = logs[0].args as any;
      assert.equal(args.marketId, id, "marketId mismatch");
      assert.equal(
        args.creator.toLowerCase(),
        deployer.account.address.toLowerCase(),
        "creator mismatch"
      );
      assert.equal(args.question, "Event check", "question mismatch");
    });

    it("emits ResolutionRuleSet", async () => {
      const id = (await predict.read.marketCount()) + 1n;
      const hash = predict.write.createMarket([
        {
          question: "Rule check",
          oracleUrl: "http://myoracle.com/price",
          jsonPath: ".usd",
          target: 999n,
          comparator: Comparator.LT,
          bettingSeconds: 30n,
          resolveDelaySeconds: 15n,
        },
      ]);
      await viem.assertions.emitWithArgs(hash, predict, "ResolutionRuleSet", [
        id,
        "http://myoracle.com/price",
        ".usd",
        999n,
        Comparator.LT,
      ]);
    });

    it("reverts EmptyString on blank question", async () => {
      await assert.rejects(
        () => predict.write.createMarket([{
          question: "",
          oracleUrl: "http://example.com/oracle",
          jsonPath: ".price",
          target: 100n,
          comparator: Comparator.GTE,
          bettingSeconds: 30n,
          resolveDelaySeconds: 15n,
        }]),
        /EmptyString/
      );
    });

    it("reverts EmptyString on blank oracleUrl", async () => {
      await assert.rejects(
        () => predict.write.createMarket([{
          question: "ok",
          oracleUrl: "",
          jsonPath: ".price",
          target: 100n,
          comparator: Comparator.GTE,
          bettingSeconds: 30n,
          resolveDelaySeconds: 15n,
        }]),
        /EmptyString/
      );
    });

    it("reverts BadDuration when bettingSeconds < 30", async () => {
      await assert.rejects(
        () => predict.write.createMarket([{
          question: "short bet",
          oracleUrl: "http://example.com/oracle",
          jsonPath: ".price",
          target: 100n,
          comparator: Comparator.GTE,
          bettingSeconds: 10n, // below MIN_BETTING_SECONDS
          resolveDelaySeconds: 15n,
        }]),
        /BadDuration/
      );
    });

    it("reverts BadDuration when resolveDelaySeconds < 15", async () => {
      await assert.rejects(
        () => predict.write.createMarket([{
          question: "short resolve",
          oracleUrl: "http://example.com/oracle",
          jsonPath: ".price",
          target: 100n,
          comparator: Comparator.GTE,
          bettingSeconds: 30n,
          resolveDelaySeconds: 5n, // below MIN_RESOLVE_DELAY_SECONDS
        }]),
        /BadDuration/
      );
    });
  });

  // ──────────────────────────── bet ────────────────────────────────────────

  describe("bet", async () => {
    it("records YES stake and emits BetPlaced", async () => {
      const id = await openMarket();
      const hash = predict.write.bet([id, true], {
        value: parseEther("1"),
        account: alice.account,
      });
      await viem.assertions.emitWithArgs(hash, predict, "BetPlaced", [
        id, alice.account.address, true, parseEther("1"),
      ]);
      const m = await predict.read.getMarket([id]);
      assert.equal(m.totalYes, parseEther("1"));
    });

    it("records NO stake", async () => {
      const id = await predict.read.marketCount(); // last open market
      await predict.write.bet([id, false], {
        value: parseEther("0.5"),
        account: bob.account,
      });
      const m = await predict.read.getMarket([id]);
      assert.equal(m.totalNo, parseEther("0.5"));
    });

    it("accumulates multiple bets from the same account", async () => {
      const id = await openMarket();
      await predict.write.bet([id, true], {
        value: parseEther("1"),
        account: alice.account,
      });
      await predict.write.bet([id, true], {
        value: parseEther("2"),
        account: alice.account,
      });
      const stake = await predict.read.yesStake([id, alice.account.address]);
      assert.equal(stake, parseEther("3"));
    });

    it("reverts ZeroStake", async () => {
      const id = await predict.read.marketCount();
      await assert.rejects(
        () => predict.write.bet([id, true], { value: 0n, account: alice.account }),
        /ZeroStake/
      );
    });

    it("reverts BettingClosed after closeBlock", async () => {
      const id = await openMarket({ bettingSeconds: 30n });
      // 30 s × (1000 ms/s) / 200 ms/block = 150 blocks; overshoot to 200
      await mineBlocks(publicClient, 200);
      await assert.rejects(
        () => predict.write.bet([id, true], {
          value: parseEther("1"),
          account: alice.account,
        }),
        /BettingClosed/
      );
    });
  });

  // ──────────────────────── onScheduledResolve ────────────────────────────

  describe("onScheduledResolve", async () => {
    it("reverts OnlyScheduler when called by a non-Scheduler EOA", async () => {
      const id = await predict.read.marketCount();
      await assert.rejects(
        () => predict.write.onScheduledResolve([0n, id], { account: alice.account }),
        /OnlyScheduler/
      );
    });
  });

  // ─────────────────────────── getMarket ──────────────────────────────────

  describe("getMarket", async () => {
    it("returns Open state within betting window", async () => {
      const id = await openMarket();
      const m = await predict.read.getMarket([id]);
      assert.equal(m.state, MarketState.Open);
    });

    it("virtually flips to Closed once past closeBlock", async () => {
      const id = await openMarket({ bettingSeconds: 30n });
      await mineBlocks(publicClient, 200);
      const m = await predict.read.getMarket([id]);
      assert.equal(m.state, MarketState.Closed);
    });

    it("reverts UnknownMarket for id 0", async () => {
      await assert.rejects(() => predict.read.getMarket([0n]), /UnknownMarket/);
    });

    it("reverts UnknownMarket for id beyond marketCount", async () => {
      const count = await predict.read.marketCount();
      await assert.rejects(
        () => predict.read.getMarket([count + 9999n]),
        /UnknownMarket/
      );
    });
  });

  // ─────────────────────────── getMarkets ─────────────────────────────────

  describe("getMarkets", async () => {
    it("returns newest-first ordering", async () => {
      // Ensure at least 2 markets exist
      await openMarket({ question: "X" });
      await openMarket({ question: "Y" });
      const markets = await predict.read.getMarkets();
      const count = await predict.read.marketCount();
      assert.equal(BigInt(markets.length), count);
      assert.equal(markets[0].id, count, "first element should be highest id");
    });
  });

  // ─────────────────────────── stakesOf ───────────────────────────────────

  describe("stakesOf", async () => {
    it("reports yes and no stakes for an account", async () => {
      const id = await openMarket();
      await predict.write.bet([id, true],  { value: parseEther("3"), account: alice.account });
      await predict.write.bet([id, false], { value: parseEther("1"), account: alice.account });

      const [yes, no] = await predict.read.stakesOf([id, alice.account.address]);
      assert.equal(yes, parseEther("3"));
      assert.equal(no,  parseEther("1"));
    });

    it("returns zero for an account that never bet", async () => {
      const id = await predict.read.marketCount();
      const [yes, no] = await predict.read.stakesOf([id, bob.account.address]);
      assert.equal(yes + no, 0n);
    });
  });

  // ─────────────── claimWinnings / claimRefund guards ─────────────────────

  describe("claimWinnings", async () => {
    it("reverts NotResolved when market is still Open", async () => {
      const id = await openMarket();
      await predict.write.bet([id, true], {
        value: parseEther("1"),
        account: alice.account,
      });
      await assert.rejects(
        () => predict.write.claimWinnings([id], { account: alice.account }),
        /NotResolved/
      );
    });
  });

  describe("claimRefund", async () => {
    it("reverts NotInvalid when market is still Open", async () => {
      const id = await openMarket();
      await predict.write.bet([id, true], {
        value: parseEther("1"),
        account: alice.account,
      });
      await assert.rejects(
        () => predict.write.claimRefund([id], { account: alice.account }),
        /NotInvalid/
      );
    });
  });

  // ─────────────────────────── fundExecution ──────────────────────────────

  describe("fundExecution", async () => {
    it("reverts ZeroStake on zero value", async () => {
      await assert.rejects(
        () => predict.write.fundExecution([100n], { value: 0n }),
        /ZeroStake/
      );
    });

    it("forwards ETH to the RitualWallet mock and updates executionBalance", async () => {
      const before = await predict.read.executionBalance();
      const hash = await predict.write.fundExecution([100n], {
        value: parseEther("0.1"),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const after = await predict.read.executionBalance();
      assert.equal(after - before, parseEther("0.1"));
    });
  });
});
