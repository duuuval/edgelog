// Edgelog playbook — single source of truth
// Edit here to tune the system; UI reads from this file

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
    description: "Stock reacted strongly to earnings beat/miss; drift continues 5–15 days",
    gates: [
      { key: "g_reported_3d", label: "Reported within last 3 trading days" },
      { key: "g_beat_both", label: "EPS beat AND revenue beat (or both missed)" },
      { key: "g_reaction_5", label: "Reaction day move ≥ 5% in direction of surprise" },
      { key: "g_mcap_1b", label: "Market cap ≥ $1B" },
      { key: "g_vol_500k", label: "Avg daily volume ≥ 500K shares" },
      { key: "g_price_10", label: "Stock price ≥ $10" },
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
    stopPct: 4,
    timeStopDays: 10,
    stopHint: "Suggested: −4% from entry (close basis)",
    targetHint: "Suggested: +8% from entry",
  },
  FIFTY_TWO_WEEK: {
    id: "FIFTY_TWO_WEEK",
    name: "52-Week High Breakout",
    shortName: "52W High",
    description: "Stock broke 52-week high after quiet base, on volume",
    gates: [
      { key: "g_broke_52w", label: "Closed above 52-week high in last 3 trading days" },
      { key: "g_held_break", label: "Has NOT closed back below breakout level" },
      { key: "g_mcap_1b", label: "Market cap ≥ $1B" },
      { key: "g_vol_500k", label: "Avg daily volume ≥ 500K shares" },
      { key: "g_price_10", label: "Stock price ≥ $10" },
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
    stopPct: 6,
    timeStopDays: 15,
    stopHint: "Suggested: close below breakout level (~5–8% typical)",
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
    stopPct: 5,
    timeStopDays: 12,
    stopHint: "Suggested: −5% from entry",
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
