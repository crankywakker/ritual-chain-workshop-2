/** Comparator enum, matching RitualPredict.Comparator. */
export const COMPARATOR = {
  gt: 0,
  gte: 1,
  lt: 2,
  lte: 3,
} as const;

/** MarketState enum, matching RitualPredict.MarketState. */
export const MARKET_STATE = ["Open", "Closed", "Resolving", "Resolved", "Invalid"] as const;

/** Outcome enum, matching RitualPredict.Outcome. */
export const OUTCOME = ["Unresolved", "YES", "NO"] as const;

/**
 * The preset workshop market: short enough to demo end-to-end in a few minutes.
 * Mirrors DEMO_MARKET in web/src/lib/presets.ts.
 */
export const DEMO_MARKET = {
  question: "Will ETH/USD be at least $4,000 when this market resolves?",
  oracleUrl: "http://localhost:3000/api/oracle/eth",
  jsonPath: ".price",
  target: 4000,
  comparator: "gte",
  bettingSeconds: 180,
  resolveDelaySeconds: 60,
} as const;
