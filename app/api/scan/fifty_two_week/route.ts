import { NextResponse } from "next/server";

// 52-week high scanner via Finnhub free tier
// Strategy: scan a curated universe of liquid large-caps, check each for
// proximity to 52w high. Free tier: 60 calls/min — fits comfortably.

const FINNHUB = "https://finnhub.io/api/v1";

// Curated universe: ~50 liquid large/mid caps across sectors
// Edit this list to expand coverage. Keep under ~55 to respect rate limits.
const UNIVERSE = [
  // Mega-cap tech
  "NVDA", "MSFT", "AAPL", "GOOGL", "META", "AMZN", "AVGO", "TSLA", "ORCL", "CRM",
  "AMD", "ADBE", "NFLX", "INTC", "QCOM", "TXN", "INTU", "AMAT", "MU", "PANW",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "V", "MA", "AXP",
  // Healthcare
  "LLY", "UNH", "JNJ", "MRK", "ABBV", "PFE", "TMO", "DHR", "ABT", "AMGN",
  // Consumer / Industrial
  "WMT", "COST", "HD", "MCD", "NKE", "PEP", "KO", "PG", "CAT", "BA",
  // Energy / Materials
  "XOM", "CVX", "COP", "LIN", "FCX",
];

type Quote = {
  c: number; // current
  d: number; // change
  dp: number; // change percent
  h: number; // day high
  l: number; // day low
  o: number; // open
  pc: number; // prev close
};

type Metric = {
  metric?: {
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    marketCapitalization?: number;
    "10DayAverageTradingVolume"?: number;
    "3MonthAverageTradingVolume"?: number;
  };
};

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 300 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Pace calls to avoid hitting 60/min Finnhub rate limit
async function paced<T>(items: string[], worker: (s: string) => Promise<T>, batch = 8, delayMs = 1100): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += batch) {
    const slice = items.slice(i, i + batch);
    const results = await Promise.all(slice.map(worker));
    out.push(...results);
    if (i + batch < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return out;
}

export async function GET() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Per ticker: fetch quote + metrics in parallel
  const results = await paced(UNIVERSE, async (symbol) => {
    const [quote, metric] = await Promise.all([
      fetchJSON<Quote>(`${FINNHUB}/quote?symbol=${symbol}&token=${key}`),
      fetchJSON<Metric>(
        `${FINNHUB}/stock/metric?symbol=${symbol}&metric=all&token=${key}`
      ),
    ]);
    return { symbol, quote, metric };
  });

  const candidates: any[] = [];
  for (const r of results) {
    const q = r.quote;
    const m = r.metric?.metric;
    if (!q || !m) continue;

    const price = q.c;
    const high52 = m["52WeekHigh"];
    const mcapM = m.marketCapitalization;
    const avgVol =
      m["10DayAverageTradingVolume"] || m["3MonthAverageTradingVolume"];

    if (!price || !high52) continue;
    if (price < 10) continue;
    // mcap is in millions on Finnhub
    if (!mcapM || mcapM < 1000) continue;
    // avg volume is in millions of shares on Finnhub — 500K shares = 0.5
    if (!avgVol || avgVol < 0.5) continue;

    const pctFromHigh = ((price - high52) / high52) * 100;
    // Within 2% of 52w high
    if (pctFromHigh < -2) continue;

    candidates.push({
      ticker: r.symbol,
      meta: {
        price: `$${price.toFixed(2)}`,
        "52w high": `$${high52.toFixed(2)}`,
        "vs high": `${pctFromHigh >= 0 ? "+" : ""}${pctFromHigh.toFixed(2)}%`,
        "day move": `${q.dp >= 0 ? "+" : ""}${q.dp.toFixed(2)}%`,
        mcap: `$${(mcapM / 1000).toFixed(1)}B`,
        "avg vol": `${avgVol.toFixed(1)}M`,
      },
    });
  }

  // Sort by closest to / above 52w high
  candidates.sort((a, b) => {
    const ap = parseFloat(a.meta["vs high"]);
    const bp = parseFloat(b.meta["vs high"]);
    return bp - ap;
  });

  return NextResponse.json({ candidates });
}
