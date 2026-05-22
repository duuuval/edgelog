// 52-week-high momentum scanner.
// Reads from universe_snapshot (refreshed daily by pg_cron at 22:45 UTC).
//
// All filtering happens in SQL — we only return rows that already match the strategy gates,
// keeping egress low and the response tight.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Strategy gates (mirrors the doc + playbook.ts)
const PRICE_FLOOR = 5;
const MIN_AVG_VOL = 300_000;
const MCAP_MIN_M = 200;       // $200M
const MCAP_MAX_M = 2_000;     // $2B
const PCT_FROM_HIGH = -3;     // within 3% of 52w high
const MAX_RESULTS = 50;

// Formatting helpers (UI consumes pre-formatted strings)
function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function fmtMcap(m: number): string {
  if (m >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  return `$${m.toFixed(0)}M`;
}

export async function GET() {
  const supabase = createClient();

  // Auth: scanner requires a logged-in user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("universe_snapshot")
    .select(
      "ticker, exchange, price, high_52w, pct_from_high, day_change_pct, avg_vol_30d, mcap_m, days_since_52w_break, last_close_above_break"
    )
    .gte("price", PRICE_FLOOR)
    .gte("avg_vol_30d", MIN_AVG_VOL)
    .gte("mcap_m", MCAP_MIN_M)
    .lte("mcap_m", MCAP_MAX_M)
    .gte("pct_from_high", PCT_FROM_HIGH)
    .order("pct_from_high", { ascending: false })
    .limit(MAX_RESULTS);

  if (error) {
    console.error("[scan/52w] supabase error:", error);
    return NextResponse.json(
      { error: "scan failed", detail: error.message },
      { status: 500 }
    );
  }

  const candidates = (data ?? []).map((row) => {
    const heldBreak = row.last_close_above_break ? " (held)" : "";
    const daysAgo =
      row.days_since_52w_break !== null && row.days_since_52w_break !== undefined
        ? `${row.days_since_52w_break}d ago${heldBreak}`
        : "—";

    return {
      ticker: row.ticker,
      exchange: row.exchange ?? null,
      meta: {
        "Price": fmtUsd(Number(row.price)),
        "Day": row.day_change_pct !== null ? fmtPct(Number(row.day_change_pct)) : "—",
        "52w High": fmtUsd(Number(row.high_52w)),
        "vs High": fmtPct(Number(row.pct_from_high)),
        "Mcap": row.mcap_m !== null ? fmtMcap(Number(row.mcap_m)) : "—",
        "Avg Vol": fmtVol(Number(row.avg_vol_30d ?? 0)),
        "Break": daysAgo,
      },
    };
  });

  return NextResponse.json({
    strategy: "fifty_two_week",
    count: candidates.length,
    candidates,
  });
}
