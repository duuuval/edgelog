// Populates/refreshes ticker_universe from Polygon's /v3/reference/tickers endpoint.
// Filters to common stock (type=CS), active=true, on NYSE/NASDAQ only.
//
// Run via GitHub Actions. ~3 minutes total (4-5 paginated API calls + Supabase upserts).
//
// Marks tickers not returned by Polygon as active=false (handles delistings cleanly).

import { createClient } from "@supabase/supabase-js";

// --- Config ---
const PACE_MS = 13_000;  // 13s between Polygon calls (free tier = 5/min limit)
const POLYGON_BASE = "https://api.polygon.io";
const PAGE_LIMIT = 1000; // max per Polygon docs

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

// --- Polygon types ---
type PolygonTickerRef = {
  ticker: string;
  name?: string;
  market?: string;             // "stocks"
  locale?: string;             // "us"
  primary_exchange?: string;   // "XNAS", "XNYS", etc.
  type?: string;               // "CS", "ETF", "WARRANT", etc.
  active?: boolean;
  market_cap?: number;         // sometimes present, often null on reference endpoint
};

type PolygonTickerListResponse = {
  status: string;
  count?: number;
  results?: PolygonTickerRef[];
  next_url?: string;
};

// --- Exchange normalization ---
// Polygon returns MIC codes. We store human-readable names for TradingView URL building.
// XNAS variants = NASDAQ tiers (Global Select, Global Market, Capital Market).
function normalizeExchange(mic: string | undefined): string | null {
  if (!mic) return null;
  if (mic === "XNAS" || mic === "XNCM" || mic === "XNGS" || mic === "XNMS") return "NASDAQ";
  if (mic === "XNYS") return "NYSE";
  return null; // ARCX (NYSE Arca = ETF venue), BATS, OTC, foreign — excluded
}

// --- API ---
async function fetchTickerPage(url: string): Promise<PolygonTickerListResponse> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon tickers: ${res.status} ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as PolygonTickerListResponse;
  if (data.status !== "OK" && data.status !== "DELAYED") {
    throw new Error(`Polygon tickers status: ${data.status}`);
  }
  return data;
}

function buildInitialUrl(): string {
  // type=CS filters to common stock. active=true filters out delisted.
  // We don't filter exchange at the API level (it'd require multiple calls); we filter client-side.
  const params = new URLSearchParams({
    market: "stocks",
    type: "CS",
    active: "true",
    limit: String(PAGE_LIMIT),
    apiKey: POLYGON_API_KEY,
  });
  return `${POLYGON_BASE}/v3/reference/tickers?${params.toString()}`;
}

// Polygon's next_url is sometimes returned without the apiKey query param.
// Re-append it so the paginated call doesn't fail with 401.
function ensureApiKey(url: string): string {
  if (url.includes("apiKey=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}apiKey=${POLYGON_API_KEY}`;
}

// --- DB ---
async function upsertTickers(rows: any[]) {
  if (rows.length === 0) return;
  // Batch at 3000 (same as backfill, well under any timeout)
  for (let i = 0; i < rows.length; i += 3000) {
    const batch = rows.slice(i, i + 3000);
    const { error } = await supabase
      .from("ticker_universe")
      .upsert(batch, { onConflict: "ticker" });
    if (error) throw new Error(`upsert batch ${i}: ${error.message}`);
  }
}

async function markMissingInactive(seenTickers: Set<string>) {
  // Anything in ticker_universe currently but not in this fresh pull = delisted/excluded.
  // We don't delete (so daily_bars FK-style references stay valid); we just mark inactive.
  const { data: existing, error } = await supabase
    .from("ticker_universe")
    .select("ticker")
    .eq("active", true);
  if (error) throw new Error(`fetch existing: ${error.message}`);

  const toDeactivate = (existing ?? [])
    .map((r) => r.ticker)
    .filter((t) => !seenTickers.has(t));

  if (toDeactivate.length === 0) {
    console.log(`[ticker-universe] no tickers to deactivate`);
    return;
  }

  console.log(`[ticker-universe] marking ${toDeactivate.length} tickers inactive`);

  // Update in batches
  for (let i = 0; i < toDeactivate.length; i += 1000) {
    const batch = toDeactivate.slice(i, i + 1000);
    const { error: updateErr } = await supabase
      .from("ticker_universe")
      .update({ active: false, updated_at: new Date().toISOString() })
      .in("ticker", batch);
    if (updateErr) throw new Error(`deactivate batch ${i}: ${updateErr.message}`);
  }
}

// --- Main ---
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startedAt = Date.now();
  console.log(`[ticker-universe] starting at ${new Date().toISOString()}`);

  let url: string | undefined = buildInitialUrl();
  let pageNum = 0;
  let totalSeen = 0;
  let totalKept = 0;
  const seenTickers = new Set<string>();

  while (url) {
    pageNum++;
    console.log(`[ticker-universe] fetching page ${pageNum}`);
    const data: PolygonTickerListResponse = await fetchTickerPage(url);

    const results = data.results ?? [];
    totalSeen += results.length;

    // Filter to NYSE/NASDAQ only (excludes ARCX/ETF venues, OTC, foreign)
    const rows = results
      .map((r) => {
        const exchange = normalizeExchange(r.primary_exchange);
        if (!exchange) return null;
        return {
          ticker: r.ticker,
          name: r.name ?? null,
          exchange,
          market_cap: r.market_cap ?? null,
          active: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    totalKept += rows.length;
    rows.forEach((r) => seenTickers.add(r.ticker));

    console.log(`[ticker-universe]   page ${pageNum}: ${results.length} from API, ${rows.length} kept (NYSE/NASDAQ CS)`);

    await upsertTickers(rows);

    url = data.next_url ? ensureApiKey(data.next_url) : undefined;

    if (url) {
      await sleep(PACE_MS);
    }
  }

  console.log(`[ticker-universe] all pages fetched: ${totalSeen} total, ${totalKept} kept`);

  // Mark anything we used to know about but no longer see as inactive
  await markMissingInactive(seenTickers);

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(2);
  console.log(`[ticker-universe] COMPLETE in ${elapsedMin} minutes`);
  console.log(`[ticker-universe] active tickers: ${seenTickers.size}`);
}

main().catch((e) => {
  console.error("[ticker-universe] FATAL:", e);
  process.exit(1);
});
