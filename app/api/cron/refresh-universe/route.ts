// Daily universe refresh cron.
// Runs every weekday at 22:30 UTC (6:30pm ET, ~30 min after market close).
//
// Steps:
//   1. Determine target trading day (yesterday in ET; Polygon's tape is ET-based)
//   2. Pull Polygon Grouped Daily for that day
//   3. Insert new bars into daily_bars (filtered to ticker_universe)
//   4. Prune daily_bars older than ~420 calendar days
//   5. Rebuild universe_snapshot via stored procedure
//
// Auth: protected by Authorization: Bearer ${CRON_SECRET} (Vercel's standard pattern).
// Timeout: hobby plan caps at 10 seconds. Designed to finish in ~5s.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getGroupedDaily } from "@/lib/polygon";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // hobby plan ceiling

// ---- Date helpers ----
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

// US market holidays for 2026 (NYSE schedule).
// Update annually. Simpler than computing observance rules.
const HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day observed
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

function isHoliday(dateStr: string): boolean {
  return HOLIDAYS_2026.has(dateStr);
}

// Get the most recent trading day on or before the given date.
// If today is Saturday, returns Friday. If today is a holiday, returns the previous business day.
function getMostRecentTradingDay(from: Date): string {
  const d = new Date(from);
  while (true) {
    if (!isWeekend(d) && !isHoliday(formatDate(d))) {
      return formatDate(d);
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
}

// Compute the current calendar date in US/Eastern, returned as a UTC-midnight Date.
// We need this because Polygon's tape is ET-based: after 4pm ET but before midnight ET,
// "yesterday in UTC" can still be "today in ET", which the free tier won't serve.
function getEasternDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year")!.value, 10);
  const month = parseInt(parts.find(p => p.type === "month")!.value, 10);
  const day = parseInt(parts.find(p => p.type === "day")!.value, 10);
  return new Date(Date.UTC(year, month - 1, day));
}

// ---- Auth ----
function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

// ---- Route ----
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  try {
    // 1. Determine target date — yesterday in ET, walked back to most recent trading day
    const now = new Date();
    const todayET = getEasternDate(now);
    const yesterdayET = new Date(todayET);
    yesterdayET.setUTCDate(yesterdayET.getUTCDate() - 1);

    const targetDate = getMostRecentTradingDay(yesterdayET);
    console.log(
      `[refresh-universe] target date: ${targetDate} (ET today: ${formatDate(todayET)}, current UTC: ${now.toISOString()})`
    );

    // Check if we already have this date in daily_bars (backfill or prior cron run).
    // If so, skip Polygon and go straight to snapshot rebuild.
    const { data: existing } = await supabase
      .from("daily_bars")
      .select("date")
      .eq("date", targetDate)
      .limit(1);

    const alreadyProcessed = (existing?.length ?? 0) > 0;

    if (alreadyProcessed) {
      console.log(`[refresh-universe] ${targetDate} already in daily_bars, skipping fetch`);
    } else {
      // 2. Fetch bars from Polygon
      const grouped = await getGroupedDaily(targetDate, false);
      const bars = grouped.results ?? [];

      if (bars.length === 0) {
        return NextResponse.json({
          status: "no-data",
          target_date: targetDate,
          note: "Polygon returned no results (market closed or data not yet available)",
        });
      }

      // 3. Filter to ticker_universe and insert
      const { data: universeRows } = await supabase
        .from("ticker_universe")
        .select("ticker")
        .eq("active", true);

      const universeSet = new Set((universeRows ?? []).map((r) => r.ticker));

      const rowsToInsert = bars
        .filter((b) => universeSet.has(b.T))
        .map((b) => ({
          ticker: b.T,
          date: targetDate,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          volume: Math.round(b.v),
        }));

      console.log(`[refresh-universe] inserting ${rowsToInsert.length} new bars`);

      // Batch insert (3K rows per batch matches what backfill used)
      for (let i = 0; i < rowsToInsert.length; i += 3000) {
        const batch = rowsToInsert.slice(i, i + 3000);
        const { error } = await supabase
          .from("daily_bars")
          .upsert(batch, { onConflict: "ticker,date", ignoreDuplicates: true });
        if (error) throw new Error(`insert batch ${i}: ${error.message}`);
      }
    }

    // 4. Prune anything older than ~420 calendar days (280 trading days × 1.5)
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - Math.round(280 * 1.5));
    const cutoffStr = formatDate(cutoff);

    const { error: pruneErr, count: prunedCount } = await supabase
      .from("daily_bars")
      .delete({ count: "exact" })
      .lt("date", cutoffStr);

    if (pruneErr) {
      console.warn(`[refresh-universe] prune failed: ${pruneErr.message}`);
    } else if (prunedCount && prunedCount > 0) {
      console.log(`[refresh-universe] pruned ${prunedCount} old rows`);
    }

    // 5. Rebuild universe_snapshot
    const { data: rebuildResult, error: rebuildErr } = await supabase.rpc(
      "refresh_universe_snapshot"
    );

    if (rebuildErr) throw new Error(`snapshot rebuild: ${rebuildErr.message}`);

    const refreshedTickers = rebuildResult?.[0]?.refreshed_tickers ?? 0;
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[refresh-universe] complete: ${refreshedTickers} tickers in snapshot, ${elapsedMs}ms total`
    );

    return NextResponse.json({
      status: "ok",
      target_date: targetDate,
      already_processed: alreadyProcessed,
      tickers_in_snapshot: refreshedTickers,
      pruned_rows: prunedCount ?? 0,
      elapsed_ms: elapsedMs,
    });
  } catch (e: any) {
    console.error("[refresh-universe] error:", e);
    return NextResponse.json(
      {
        status: "error",
        error: e.message ?? String(e),
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}    // we only care about the y/m/d, not the time of day).
    const yesterdayET = new Date(Date.UTC(etYear, etMonth - 1, etDay));
    yesterdayET.setUTCDate(yesterdayET.getUTCDate() - 1);

    const targetDate = getMostRecentTradingDay(yesterdayET);
    console.log(`[refresh-universe] target date: ${targetDate} (ET today: ${etYear}-${String(etMonth).padStart(2,"0")}-${String(etDay).padStart(2,"0")}, current UTC: ${now.toISOString()})`);
    // If today is a weekend or holiday, the most recent trading day is yesterday or earlier —
    // we may have already processed it. Check before re-fetching.
    const { data: existing } = await supabase
      .from("daily_bars")
      .select("date")
      .eq("date", targetDate)
      .limit(1);

    const alreadyProcessed = (existing?.length ?? 0) > 0;

    if (alreadyProcessed) {
      console.log(`[refresh-universe] ${targetDate} already in daily_bars`);
    } else {
      // 2. Fetch bars from Polygon
      const grouped = await getGroupedDaily(targetDate, false);
      const bars = grouped.results ?? [];

      if (bars.length === 0) {
        return NextResponse.json({
          status: "no-data",
          target_date: targetDate,
          note: "Polygon returned no results (market closed or data not yet available)",
        });
      }

      // 3. Filter to ticker_universe and insert
      const { data: universeRows } = await supabase
        .from("ticker_universe")
        .select("ticker")
        .eq("active", true);

      const universeSet = new Set((universeRows ?? []).map((r) => r.ticker));

      const rowsToInsert = bars
        .filter((b) => universeSet.has(b.T))
        .map((b) => ({
          ticker: b.T,
          date: targetDate,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          volume: Math.round(b.v),
        }));

      console.log(`[refresh-universe] inserting ${rowsToInsert.length} new bars`);

      // Batch insert (3K rows per batch matches what backfill used)
      for (let i = 0; i < rowsToInsert.length; i += 3000) {
        const batch = rowsToInsert.slice(i, i + 3000);
        const { error } = await supabase
          .from("daily_bars")
          .upsert(batch, { onConflict: "ticker,date", ignoreDuplicates: true });
        if (error) throw new Error(`insert batch ${i}: ${error.message}`);
      }
    }

    // 4. Prune anything older than 280 days
    // (280 = 260 days rolling window + 20 day buffer for safety)
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 280 * 1.5); // 280 trading days ≈ 420 calendar days
    const cutoffStr = formatDate(cutoff);

    const { error: pruneErr, count: prunedCount } = await supabase
      .from("daily_bars")
      .delete({ count: "exact" })
      .lt("date", cutoffStr);

    if (pruneErr) {
      console.warn(`[refresh-universe] prune failed: ${pruneErr.message}`);
    } else if (prunedCount && prunedCount > 0) {
      console.log(`[refresh-universe] pruned ${prunedCount} old rows`);
    }

    // 5. Rebuild universe_snapshot
    const { data: rebuildResult, error: rebuildErr } = await supabase.rpc(
      "refresh_universe_snapshot"
    );

    if (rebuildErr) throw new Error(`snapshot rebuild: ${rebuildErr.message}`);

    const refreshedTickers = rebuildResult?.[0]?.refreshed_tickers ?? 0;
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[refresh-universe] complete: ${refreshedTickers} tickers in snapshot, ${elapsedMs}ms total`
    );

    return NextResponse.json({
      status: "ok",
      target_date: targetDate,
      already_processed: alreadyProcessed,
      tickers_in_snapshot: refreshedTickers,
      pruned_rows: prunedCount ?? 0,
      elapsed_ms: elapsedMs,
    });
  } catch (e: any) {
    console.error("[refresh-universe] error:", e);
    return NextResponse.json(
      {
        status: "error",
        error: e.message ?? String(e),
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
