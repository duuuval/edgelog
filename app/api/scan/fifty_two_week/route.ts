import { NextResponse } from "next/server";

// 52-week high scanner via Finnhub free tier
// Strategy: scan a curated universe of liquid small/mid-caps, check each for
// proximity to 52w high. Free tier: 60 calls/min — fits comfortably.
//
// v2 small-cap pivot: the 52w breakout edge is strongest in less-followed
// names where institutions can't trade size. Universe rebuilt around
// $200M-$2B band with active catalyst flow.
// See edgelog-strategy.md.

const FINNHUB = "https://finnhub.io/api/v1";

// Curated universe: ~55 liquid small/mid caps across sectors in the
// $200M-$2B target band. Edit this list to expand coverage.
// Keep under ~55 to respect rate limits (2 calls/ticker × 60/min cap).
//
// Names hovering near the $2B ceiling will get filtered out at scan time
// when current mcap is re-checked; they stay in the list so they re-enter
// the band on a pullback.
const UNIVERSE = [
  // Industrials / power / defense / infra
  "AGX", "PRIM", "MYRG", "ROCK", "MLI", "ESE", "MRCY", "KTOS", "AVAV", "POWL",
  "FIX", "AAON", "ATKR",
  // Energy / utilities / mining / materials
  "TALO", "MTDR", "SM", "CIVI", "CDE", "HL", "MP", "HBM", "ERO", "UEC", "DNN",
  // Healthcare / biotech / health-IT
  "HIMS", "EVH", "PRVA", "ADUS", "ENSG", "PGNY", "PHR", "DOCS", "HQY",
  "FOLD", "KRYS",
  // Tech / software / semis / networking
  "INTA", "BRZE", "SEMR", "BL", "ALRM", "EXTR", "CIEN", "POWI", "AMBA",
  // Consumer
  "BOOT", "BIRK", "CAKE", "BJRI", "BROS", "SG", "FIGS", "VITL", "SMPL",
  // Financials / fintech / specialty
  "AX", "PFSI", "VRTS", "BANC",
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
    // v2 gates: price ≥ $5, $200M ≤ mcap ≤ $2B, avg vol ≥ 300K shares
    if (price < 5) continue;
    // mcap is in millions on Finnhub
    if (!mcapM || mcapM < 200 || mcapM > 2000) continue;
    // avg volume is in millions of shares on Finnhub — 300K shares = 0.3
    if (!avgVol || avgVol < 0.3) continue;

    const pctFromHigh = ((price - high52) / high52) * 100;
    // Within 2% of 52w high
    if (pctFromHigh < -2) continue;

    const mcapDisplay =
      mcapM >= 1000
        ? `$${(mcapM / 1000).toFixed(1)}B`
        : `$${mcapM.toFixed(0)}M`;

    candidates.push({
      ticker: r.symbol,
      meta: {
        price: `$${price.toFixed(2)}`,
        "52w high": `$${high52.toFixed(2)}`,
        "vs high": `${pctFromHigh >= 0 ? "+" : ""}${pctFromHigh.toFixed(2)}%`,
        "day move": `${q.dp >= 0 ? "+" : ""}${q.dp.toFixed(2)}%`,
        mcap: mcapDisplay,
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
