// Edgelog playbook — single source of truth
// Edit here to tune the system; UI reads from this file
//
// v2 small-cap pivot: PEAD on large-caps is essentially dead (Martineau 2022).
// The edge lives in $200M-$2B names where institutions are structurally
// excluded. Stops widened because small-cap post-earnings volatility makes
// -4% sit inside the noise band. See edgelog-strategy.md for full rationale.

export type Strategy = "PEAD" | "FIFTY_TWO_WEEK" | "CONFLUENCE";

export type GateDef = {
  key: string;
  label: string;
  hint?: string;
};

export type FactorDef = {
  key: string;
  label: string;
  hint?: string;
};

export type StrategyConfig = {
  id: Strategy;
  name: string;
  shortName: string;
  description: string;
  gates: GateDef[];
  factors: FactorDef[];
  targetPct: number;
  stopPct: number;
  timeStopDays: number;
  stopHint: string;
  targetHint: string;
};

export const STRATEGIES: Record<Strategy, StrategyConfig> = {
  PEAD: {
    id: "PEAD",
    name: "Post-Earnings Drift",
    shortName: "PEAD",
    description: "Stock reacted strongly to earnings beat/miss; drift continues 5–15 days. Edge concentrated in small/mid caps where institutions can't trade size.",
    gates: [
      { key: "g_reported_3d", label: "Reported within last 3 trading days" },
      { key: "g_beat_both", label: "EPS beat AND revenue beat (or both missed)" },
      { key: "g_reaction_5", label: "Reaction day move ≥ 5% in direction of surprise" },
      { key: "g_mcap_band", label: "Market cap between $200M and $2B" },
      { key: "g_vol_300k", label: "Avg daily volume ≥ 300K shares" },
      { key: "g_price_5", label: "Stock price ≥ $5" },
    ],
    factors: [
      { key: "f_surprise_mag", label: "Surprise magnitude", hint: "EPS beat ≥10% AND revenue beat ≥3%" },
      { key: "f_reaction_strong", label: "Reaction strength", hint: "Day-1 move ≥ 8%" },
      { key: "f_volume_3x", label: "Volume confirmation", hint: "Reaction day volume ≥ 3x 30-day avg" },
      { key: "f_gap_held", label: "Gap behavior", hint: "Gapped up and closed in top 1/3 of day's range" },
      { key: "f_range_break", label: "Range breakout", hint: "Closed above prior 1-month high" },
      { key: "f_guidance_raised", label: "Guidance raised", hint: "Company raised forward guidance" },
      { key: "f_sector_strong", label: "Sector context", hint: "Sector ETF in uptrend" },
    ],
    targetPct: 8,
    stopPct: 7,
    timeStopDays: 10,
    stopHint: "Suggested: −7% from entry (small-cap post-earnings volatility eats tighter stops)",
    targetHint: "Suggested: +8% from entry",
  },
  FIFTY_TWO_WEEK: {
    id: "FIFTY_TWO_WEEK",
    name: "52-Week High Breakout",
    shortName: "52W High",
    description: "Stock broke 52-week high after quiet base, on volume. Effect strongest in less-followed small/mid caps.",
    gates: [
      { key: "g_broke_52w", label: "Closed above 52-week high in last 3 trading days" },
      { key: "g_held_break", label: "Has NOT closed back below breakout level" },
      { key: "g_mcap_band", label: "Market cap between $200M and $2B" },
      { key: "g_vol_300k", label: "Avg daily volume ≥ 300K shares" },
      { key: "g_price_5", label: "Stock price ≥ $5" },
      { key: "g_no_earnings_5d", label: "No earnings in next 5 trading days" },
    ],
    factors: [
      { key: "f_tight_base", label: "Base quality", hint: "Traded in ≤15% range for 6+ weeks before break" },
      { key: "f_volume_break", label: "Volume on break", hint: "Breakout volume ≥ 2x 30-day avg" },
      { key: "f_base_volume_down", label: "Base volume pattern", hint: "Volume declined during base" },
      { key: "f_rsi_zone", label: "RSI healthy", hint: "RSI(14) between 55–75" },
      { key: "f_not_extended", label: "Entry not extended", hint: "Currently ≤3% above breakout level" },
      { key: "f_sector_strong", label: "Sector at highs", hint: "Sector ETF also at/near 52w highs" },
      { key: "f_market_uptrend", label: "Market uptrend", hint: "SPY above 50-day MA" },
    ],
    targetPct: 10,
    stopPct: 10,
    timeStopDays: 15,
    stopHint: "Suggested: −10% from entry OR close below breakout level (Trade Risk backtest: wider stops outperform on small-cap momentum)",
    targetHint: "Suggested: +10% from entry",
  },
  CONFLUENCE: {
    id: "CONFLUENCE",
    name: "Confluence (PEAD + 52w)",
    shortName: "Confluence",
    description: "Earnings beat caused 52-week high breakout — highest-conviction setup",
    gates: [], // Uses both PEAD and 52w gates
    factors: [], // Uses both factor sets
    targetPct: 12,
    stopPct: 8,
    timeStopDays: 12,
    stopHint: "Suggested: −8% from entry",
    targetHint: "Suggested: +12% from entry",
  },
};

// A/B/C/Skip grading from checkmark count
export function gradeFromCount(checked: number): "A" | "B" | "C" | "SKIP" {
  if (checked >= 5) return "A";
  if (checked >= 3) return "B";
  if (checked >= 2) return "C";
  return "SKIP";
}

// Position size by grade
export function sizeForGrade(grade: "A" | "B" | "C" | "SKIP"): number {
  if (grade === "A") return 15;
  if (grade === "B") return 10;
  if (grade === "C") return 5;
  return 0;
}

// Confluence upgrades one tier
export function applyConfluenceBonus(
  baseGrade: "A" | "B" | "C" | "SKIP"
): "A" | "B" | "C" | "SKIP" {
  if (baseGrade === "B") return "A";
  if (baseGrade === "C") return "B";
  return baseGrade;
}
