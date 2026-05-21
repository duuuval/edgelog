// Polygon (Massive.com) API client
// Free tier: 5 calls/min, EOD data, US equities.
// We use two endpoints:
//   - Grouped Daily: one call returns OHLC for every US equity for a given date
//   - Ticker Details: per-ticker market cap, exchange (used during snapshot refresh)
//
// The free tier rate limit (5/min = one call per 12s) is enforced at the caller
// level, not here. This module just makes typed requests.

const POLYGON_BASE = "https://api.polygon.io";

export type PolygonBar = {
  T: string;   // ticker
  o: number;   // open
  h: number;   // high
  l: number;   // low
  c: number;   // close
  v: number;   // volume
  vw?: number; // volume-weighted avg price (unused)
  t?: number;  // unix ms timestamp (unused)
  n?: number;  // trade count (unused)
};

export type GroupedDailyResponse = {
  status: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results?: PolygonBar[];
};

export type TickerDetails = {
  ticker: string;
  name?: string;
  market_cap?: number;        // in dollars (not millions)
  primary_exchange?: string;  // e.g. "XNAS" (NASDAQ), "XNYS" (NYSE)
  type?: string;              // "CS" = common stock, "ETF", etc.
  active?: boolean;
};

export type TickerDetailsResponse = {
  status: string;
  results?: TickerDetails;
};

function apiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("POLYGON_API_KEY not configured");
  return key;
}

/**
 * Grouped Daily: returns OHLC for every ticker on a given trading day.
 * Date format: 'YYYY-MM-DD'. Weekends/holidays return resultsCount=0.
 * `includeOtc=false` filters out OTC tickers (we only want NYSE/NASDAQ listings).
 */
export async function getGroupedDaily(
  date: string,
  includeOtc = false
): Promise<GroupedDailyResponse> {
  const url = `${POLYGON_BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&include_otc=${includeOtc}&apiKey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon grouped daily failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as GroupedDailyResponse;
  if (data.status !== "OK" && data.status !== "DELAYED") {
    throw new Error(`Polygon grouped daily status: ${data.status}`);
  }
  return data;
}

/**
 * Ticker Details: per-ticker metadata including market cap and exchange.
 * Used during snapshot refresh to determine mcap band membership.
 * Returns null if ticker is unknown (delisted, never existed, etc.).
 */
export async function getTickerDetails(
  ticker: string
): Promise<TickerDetails | null> {
  const url = `${POLYGON_BASE}/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon ticker details failed for ${ticker}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as TickerDetailsResponse;
  return data.results ?? null;
}

/**
 * Maps Polygon's MIC codes to the exchange names we use in the universe_snapshot.
 * Polygon returns "XNAS" / "XNYS" / "ARCX" etc; the scanner needs "NASDAQ" / "NYSE"
 * for TradingView chart link disambiguation (fixes known issue #3).
 */
export function normalizeExchange(mic: string | undefined): string | null {
  if (!mic) return null;
  if (mic === "XNAS" || mic === "XNCM" || mic === "XNGS" || mic === "XNMS") return "NASDAQ";
  if (mic === "XNYS" || mic === "ARCX" || mic === "XASE") return "NYSE";
  return null; // OTC, pink sheets, foreign — exclude from universe
}

/**
 * Sleep helper for rate-limit pacing. Free tier is 5 calls/min = 12s between calls.
 * Use 13s for safety buffer (network jitter, clock skew).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
