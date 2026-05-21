// lib/playbook.ts
// SOURCE OF TRUTH for all strategy configs.
// v2: small-cap pivot. See edgelog-strategy.md for the why.

export type StrategyKey = "pead" | "fifty_two_week" | "confluence";

export type UniverseFilter = {
  mcapMinUsd: number;
  mcapMaxUsd: number; // NEW in v2 — institutional-blind-spot ceiling
  priceMinUsd: number;
  avgVolumeMin: number;
  requirePositiveRevenue: boolean;
  excludeRecentReverseMerger: boolean; // within last 12 months
  excludeGoingConcern: boolean;
  allowedExchanges: string[];
};

export type Gate = {
  id: string;
  label: string;
  // gates are hard requirements — fail any, skip the trade
};

export type Factor = {
  id: string;
  label: string;
  // factors are graded — count checks across the set to determine tier
};

export type ExitRules = {
  targetPct: number; // % from entry
  stopPct: number; // % from entry (negative number)
  stopAlsoBelowLevel?: "breakout" | "earnings_day_close" | null;
  timeStopTradingDays: number;
};

export type StrategyConfig = {
  key: StrategyKey;
  name: string;
  description: string;
  universe: UniverseFilter;
  gates: Gate[];
  factors: Factor[];
  exits: ExitRules;
};

// ---------------------------------------------------------------------
// Universe filter (shared across strategies in v2)
// ---------------------------------------------------------------------

export const UNIVERSE_V2: UniverseFilter = {
  mcapMinUsd: 200_000_000, // $200M floor
  mcapMaxUsd: 2_000_000_000, // $2B ceiling — institutional-blind-spot band
  priceMinUsd: 5,
  avgVolumeMin: 300_000,
  requirePositiveRevenue: true,
  excludeRecentReverseMerger: true,
  excludeGoingConcern: true,
  allowedExchanges: ["NYSE", "NASDAQ"],
};

// ---------------------------------------------------------------------
// PEAD
// ---------------------------------------------------------------------

export const PEAD: StrategyConfig = {
  key: "pead",
  name: "Post-Earnings Announcement Drift",
  description:
    "Buy 1-2 days after a strong earnings beat on a small-mid cap. Hold up to 2 weeks. Edge documented in academic research since 1968, persists on small-caps where institutions are structurally excluded.",
  universe: UNIVERSE_V2,
  gates: [
    { id: "reported_recent", label: "Reported within last 3 trading days" },
    { id: "eps_and_rev_beat", label: "EPS beat AND revenue beat" },
    { id: "reaction_5pct", label: "Reaction day move ≥ 5%" },
    { id: "passes_universe", label: "Passes universe filter" },
  ],
  factors: [
    { id: "surprise_magnitude", label: "EPS beat ≥10% AND revenue beat ≥3%" },
    { id: "reaction_strength", label: "Day-1 move ≥ 8%" },
    { id: "volume_confirmation", label: "Reaction day volume ≥ 3x 30-day avg" },
    { id: "gap_behavior", label: "Gapped up, closed in top 1/3 of day's range" },
    { id: "range_breakout", label: "Closed above prior 1-month high" },
    { id: "guidance", label: "Company raised forward guidance" },
    { id: "sector_context", label: "Sector ETF in uptrend" },
  ],
  exits: {
    targetPct: 8,
    stopPct: -7, // v2: widened from -4
    stopAlsoBelowLevel: "earnings_day_close",
    timeStopTradingDays: 10,
  },
};

// ---------------------------------------------------------------------
// 52-Week High Breakout
// ---------------------------------------------------------------------

export const FIFTY_TWO_WEEK: StrategyConfig = {
  key: "fifty_two_week",
  name: "52-Week High Momentum",
  description:
    "Buy clean breakouts above 52-week highs on small-mid caps, ideally on a tight base with volume confirmation. Hold up to 3 weeks. Trade Risk backtest (2,000 trades, 20 years) documents ~38% win rate with positive expectancy; wider stops improve results.",
  universe: UNIVERSE_V2,
  gates: [
    {
      id: "closed_above_52w",
      label: "Closed above 52-week high in last 3 trading days",
    },
    {
      id: "has_not_closed_below_breakout",
      label: "Has NOT closed back below breakout level",
    },
    {
      id: "no_earnings_within_5",
      label: "No earnings within next 5 trading days",
    },
    { id: "passes_universe", label: "Passes universe filter" },
  ],
  factors: [
    {
      id: "base_quality",
      label: "Traded in ≤15% range for 6+ weeks before break",
    },
    { id: "volume_on_break", label: "Breakout volume ≥ 2x 30-day avg" },
    {
      id: "base_volume_pattern",
      label: "Volume declined during base (accumulation)",
    },
    { id: "rsi_healthy", label: "RSI(14) between 55-75" },
    { id: "entry_not_extended", label: "Currently ≤3% above breakout" },
    { id: "sector_at_highs", label: "Sector ETF also at/near 52w highs" },
    { id: "market_uptrend", label: "SPY above 50-day MA" },
  ],
  exits: {
    targetPct: 10,
    stopPct: -10, // v2: widened from -5 to -8
    stopAlsoBelowLevel: "breakout",
    timeStopTradingDays: 15,
  },
};

// ---------------------------------------------------------------------
// Confluence — both signals fire on the same name
// ---------------------------------------------------------------------

export const CONFLUENCE: StrategyConfig = {
  key: "confluence",
  name: "Confluence (PEAD + 52w)",
  description:
    "Both strategies fire on the same name. Earnings beat caused the breakout. Highest-conviction setup; auto-grades one tier higher.",
  universe: UNIVERSE_V2,
  gates: [
    { id: "pead_gates_pass", label: "All PEAD gates pass" },
    { id: "52w_gates_pass", label: "All 52w gates pass" },
  ],
  factors: [
    // Confluence inherits factors from both — checked across the union
    ...PEAD.factors,
    ...FIFTY_TWO_WEEK.factors,
  ],
  exits: {
    targetPct: 12,
    stopPct: -8, // v2: widened from -5
    stopAlsoBelowLevel: "breakout",
    timeStopTradingDays: 12,
  },
};

// ---------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------

export type Grade = "A" | "B" | "C" | "Skip";

export function gradeFromChecks(checks: number, isConfluence = false): Grade {
  let grade: Grade;
  if (checks >= 5) grade = "A";
  else if (checks >= 3) grade = "B";
  else if (checks >= 2) grade = "C";
  else grade = "Skip";

  // Confluence upgrades one tier
  if (isConfluence && grade !== "A" && grade !== "Skip") {
    if (grade === "C") grade = "B";
    else if (grade === "B") grade = "A";
  }
  return grade;
}

export function positionSizeUsd(grade: Grade): number {
  switch (grade) {
    case "A":
      return 15;
    case "B":
      return 10;
    case "C":
      return 5;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------
// Strategy registry
// ---------------------------------------------------------------------

export const STRATEGIES: Record<StrategyKey, StrategyConfig> = {
  pead: PEAD,
  fifty_two_week: FIFTY_TWO_WEEK,
  confluence: CONFLUENCE,
};

export function getStrategy(key: StrategyKey): StrategyConfig {
  return STRATEGIES[key];
}

// ---------------------------------------------------------------------
// Helpers for computing entry/stop/target from a strategy + entry price
// ---------------------------------------------------------------------

export function computeExits(
  strategy: StrategyKey,
  entryPrice: number
): { target: number; stop: number; timeStopTradingDays: number } {
  const s = getStrategy(strategy);
  return {
    target: round(entryPrice * (1 + s.exits.targetPct / 100)),
    stop: round(entryPrice * (1 + s.exits.stopPct / 100)),
    timeStopTradingDays: s.exits.timeStopTradingDays,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
