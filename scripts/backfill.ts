// One-time historical backfill for daily_bars table.
// Runs on GitHub Actions (free Ubuntu runner, 6-hour job timeout, no Vercel constraints).
// Resumable: re-running picks up from backfill_progress.oldest_date_loaded.
//
// Strategy: walk backward day by day from today, calling Polygon Grouped Daily.
// Filter to NYSE/NASDAQ common stocks. Insert bars in batches.
//
// Pacing: Polygon free tier is 5 calls/min. We use 13s between calls (5 calls/65s)
// for safety margin against network jitter and clock skew.

import { createClient } from "@supabase/supabase-js";

// --- Config ---
const TARGET_TRADING_DAYS = 260; // ~13 months, enough for true 52w + safety buffer
const PACE_MS = 13_000;          // 13s between Polygon calls (= ~4.6/min, safely under 5/min)
const POLYGON_BASE = "https://api.polygon.io";

// NASDAQ + NYSE MIC codes (Market Identifier Codes from Polygon responses).
// We exclude OTC, pink sheets, and foreign listings at the scanner level by
// filtering tickers whose primary exchange isn't in this set. But Grouped Daily
// doesn't return exchange per bar — so we filter by ticker shape and trust
// `include_otc=false` at the API level. Cross-checked later when the snapshot
// refresh joins against ticker details.

// --- Env ---
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const POLYGON_API_KEY = requireEnv("POLYGON_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SECRET_KEY = requireEnv("SUPABASE_SECRET_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Polygon ---
type PolygonBar = {
  T: string; o: number; h: number; l: number; c: number; v: number;
};
type GroupedDailyResponse = {
  status: string;
  resultsCount?: number;
  results?: PolygonBar[];
};

async function getGroupedDaily(date: string): Promise<PolygonBar[]> {
  const url = `${POLYGON_BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&include_otc=false&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon ${date}: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as GroupedDailyResponse;
  // Status "OK" = market was open. "NOT_AUTHORIZED" or empty = check key/plan.
  // resultsCount=0 typically means weekend/holiday.
  if (data.status !== "OK" && data.status !== "DELAYED") {
    if (!data.results || data.results.length === 0) {
      // Likely weekend/holiday — no error, just no data
      return [];
    }
    throw new Error(`Polygon ${date}: unexpected status ${data.status}`);
  }
  return data.results ?? [];
}

// --- Ticker filtering ---
// Grouped Daily returns ~10K tickers including warrants, units, preferreds, rights.
// We want common stock only. Polygon doesn't tag this in Grouped Daily, so we
// filter by ticker shape: skip anything with dots or special suffixes that
// indicate non-common-stock (warrants .WS, units .U, preferreds .PR/.PP, rights .R).
function looksLikeCommonStock(ticker: string): boolean {
  if (!ticker) return false;
  if (ticker.length > 5) return false; // most common stocks are 1-5 chars
  if (ticker.includes(".")) return false;
  if (ticker.includes("/")) return false;
  // Exclude obvious non-common-stock prefixes/suffixes
  if (/\d/.test(ticker)) return false; // share class variations with digits
  return /^[A-Z]+$/.test(ticker);
}

// --- Date helpers ---
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

// --- DB ops ---
async function getProgress() {
  const { data, error } = await supabase
    .from("backfill_progress")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`backfill_progress read: ${error.message}`);
  return data;
}

async function updateProgress(updates: Record<string, any>) {
  const { error } = await supabase
    .from("backfill_progress")
    .update({ ...updates, last_run_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`backfill_progress write: ${error.message}`);
}

async function insertBars(date: string, bars: PolygonBar[]) {
  if (bars.length === 0) return;
  const rows = bars.map((b) => ({
    ticker: b.T,
    date,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: Math.round(b.v),
  }));

  // Chunk the payload into batches of 3,000 to prevent Supabase timeouts
  const BATCH_SIZE = 3000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    // upsert (on conflict do nothing) — re-running for the same day is a no-op
    const { error } = await supabase
      .from("daily_bars")
      .upsert(batch, { onConflict: "ticker,date", ignoreDuplicates: true });
      
    if (error) throw new Error(`insert ${date} (batch ${i}): ${error.message}`);
  }
}

// --- Main ---
async function main() {
  const startedAt = Date.now();
  console.log(`[backfill] starting at ${new Date().toISOString()}`);

  const progress = await getProgress();
  console.log(`[backfill] current progress:`, progress);

  if (progress.is_complete) {
    console.log(`[backfill] already complete, exiting`);
    return;
  }

  // Determine starting date: resume from oldest_date_loaded if present, else start from today
  let cursor: string;
  if (progress.oldest_date_loaded) {
    cursor = addDays(progress.oldest_date_loaded, -1);
    console.log(`[backfill] resuming, next date to load: ${cursor}`);
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    cursor = formatDate(yesterday);
    console.log(`[backfill] fresh start, first date to attempt: ${cursor}`);
  }

  let daysLoaded = progress.total_days_loaded ?? 0;
  let newestLoaded: string | null = progress.newest_date_loaded ?? null;
  let oldestLoaded: string | null = progress.oldest_date_loaded ?? null;

  while (daysLoaded < TARGET_TRADING_DAYS) {
    // Skip weekends without hitting the API
    if (isWeekend(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    console.log(`[backfill] fetching ${cursor} (day ${daysLoaded + 1}/${TARGET_TRADING_DAYS})`);

    let bars: PolygonBar[];
    try {
      bars = await getGroupedDaily(cursor);
    } catch (e: any) {
      console.error(`[backfill] error fetching ${cursor}: ${e.message}`);
      // Persist progress so the next run resumes from the right place
      await updateProgress({
        oldest_date_loaded: oldestLoaded,
        newest_date_loaded: newestLoaded,
        total_days_loaded: daysLoaded,
      });
      throw e;
    }

    if (bars.length === 0) {
      // Holiday (Polygon returned no results for a weekday) — skip without counting
      console.log(`[backfill]   ${cursor}: no data (holiday?), skipping`);
      cursor = addDays(cursor, -1);
      await sleep(PACE_MS);
      continue;
    }

    const filtered = bars.filter((b) => looksLikeCommonStock(b.T));
    console.log(`[backfill]   ${cursor}: ${bars.length} total, ${filtered.length} common stock`);

    await insertBars(cursor, filtered);

    daysLoaded += 1;
    if (!newestLoaded || cursor > newestLoaded) newestLoaded = cursor;
    if (!oldestLoaded || cursor < oldestLoaded) oldestLoaded = cursor;

    // Persist progress every 10 days so a crash doesn't lose too much
    if (daysLoaded % 10 === 0) {
      await updateProgress({
        oldest_date_loaded: oldestLoaded,
        newest_date_loaded: newestLoaded,
        total_days_loaded: daysLoaded,
      });
      console.log(`[backfill] progress checkpoint: ${daysLoaded} days loaded`);
    }

    cursor = addDays(cursor, -1);
    await sleep(PACE_MS);
  }

  // Final update marking complete
  await updateProgress({
    oldest_date_loaded: oldestLoaded,
    newest_date_loaded: newestLoaded,
    target_oldest_date: oldestLoaded,
    total_days_loaded: daysLoaded,
    is_complete: true,
  });

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(`[backfill] COMPLETE: ${daysLoaded} trading days loaded in ${elapsedMin} minutes`);
  console.log(`[backfill] date range: ${oldestLoaded} to ${newestLoaded}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  console.error("[backfill] FATAL:", e);
  process.exit(1);
});
