// Refreshes ticker_universe.market_cap from Finnhub /stock/profile2.
// Run weekly via GitHub Actions. ~100 min runtime for full universe (paced 1.1s/call to stay under Finnhub's 60/min limit).
//
// Resumable: re-running picks up by updating any ticker whose updated_at is older than 6 days,
// so a crash mid-run doesn't waste hours re-fetching tickers we already have.
//
// IMPORTANT: Supabase JS client caps .select() at 1000 rows by default. We paginate explicitly
// in getTickersToRefresh() to retrieve the full universe.

import { createClient } from "@supabase/supabase-js";

// --- Config ---
const PACE_MS = 1100;  // 1.1s between Finnhub calls (~55/min, safely under 60/min limit)
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const STALENESS_THRESHOLD_DAYS = 6;  // re-fetch tickers updated more than 6 days ago
const PAGE_SIZE = 1000;  // Supabase default row limit per .select() call

// --- Env ---
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const FINNHUB_API_KEY = requireEnv("FINNHUB_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SECRET_KEY = requireEnv("SUPABASE_SECRET_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Finnhub ---
type FinnhubProfile = {
  ticker?: string;
  name?: string;
  marketCapitalization?: number;  // in millions USD (Finnhub's unit)
  shareOutstanding?: number;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  // many other fields we don't use
};

async function fetchProfile(ticker: string): Promise<FinnhubProfile | null> {
  const url = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 429) {
    // Rate limited — back off hard and signal caller
    console.warn(`[fundamentals] 429 on ${ticker}, sleeping 30s`);
    await sleep(30_000);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[fundamentals] ${ticker}: ${res.status} ${body.slice(0, 100)}`);
    return null;
  }

  const data = (await res.json()) as FinnhubProfile;

  // Finnhub returns {} (empty object) for unknown tickers — check for the field we need
  if (!data || typeof data.marketCapitalization !== "number") {
    return null;
  }

  return data;
}

// --- DB ---
type TickerRow = {
  ticker: string;
  updated_at: string;
  market_cap: number | null;
};

async function getTickersToRefresh(): Promise<string[]> {
  // Pull active tickers updated more than STALENESS_THRESHOLD_DAYS ago (or never).
  // Supabase JS client caps .select() at 1000 rows by default, so we paginate.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALENESS_THRESHOLD_DAYS);

  const allRows: TickerRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ticker_universe")
      .select("ticker, updated_at, market_cap")
      .eq("active", true)
      .order("ticker", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`fetch tickers (page from ${from}): ${error.message}`);
    if (!data || data.length === 0) break;

    allRows.push(...(data as TickerRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`[fundamentals] retrieved ${allRows.length} total active tickers from DB`);

  // Filter to stale or unset market_cap
  const filtered = allRows.filter((row) => {
    if (row.market_cap === null) return true;
    const updated = new Date(row.updated_at);
    return updated < cutoff;
  });

  return filtered.map((r) => r.ticker);
}

async function updateMarketCap(ticker: string, marketCapDollars: number | null) {
  const { error } = await supabase
    .from("ticker_universe")
    .update({
      market_cap: marketCapDollars,
      updated_at: new Date().toISOString(),
    })
    .eq("ticker", ticker);
  if (error) throw new Error(`update ${ticker}: ${error.message}`);
}

// --- Main ---
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startedAt = Date.now();
  console.log(`[fundamentals] starting at ${new Date().toISOString()}`);

  const tickers = await getTickersToRefresh();
  console.log(`[fundamentals] ${tickers.length} tickers need refresh`);

  if (tickers.length === 0) {
    console.log(`[fundamentals] nothing to do, exiting`);
    return;
  }

  let succeeded = 0;
  let failed = 0;
  let notFound = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];

    if (i > 0 && i % 100 === 0) {
      const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
      console.log(`[fundamentals] progress: ${i}/${tickers.length} (${elapsedMin} min elapsed, ${succeeded} succeeded, ${failed} failed, ${notFound} not found)`);
    }

    let profile: FinnhubProfile | null;
    try {
      profile = await fetchProfile(ticker);
    } catch (e: any) {
      console.error(`[fundamentals] error on ${ticker}: ${e.message}`);
      failed++;
      await sleep(PACE_MS);
      continue;
    }

    if (!profile) {
      // Either rate-limited (handled inside fetchProfile with backoff) or unknown ticker
      notFound++;
      await sleep(PACE_MS);
      continue;
    }

    // Finnhub returns market cap in MILLIONS. Convert to dollars to match Polygon convention.
    const marketCapDollars = (profile.marketCapitalization ?? 0) * 1_000_000;

    try {
      await updateMarketCap(ticker, marketCapDollars > 0 ? marketCapDollars : null);
      succeeded++;
    } catch (e: any) {
      console.error(`[fundamentals] DB error on ${ticker}: ${e.message}`);
      failed++;
    }

    await sleep(PACE_MS);
  }

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(`[fundamentals] COMPLETE in ${elapsedMin} minutes`);
  console.log(`[fundamentals] ${succeeded} succeeded, ${failed} failed, ${notFound} not found`);
}

main().catch((e) => {
  console.error("[fundamentals] FATAL:", e);
  process.exit(1);
});
