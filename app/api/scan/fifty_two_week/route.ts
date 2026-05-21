import { NextResponse } from "next/server";

// 52-week high scanner: uses FMP free tier's biggest gainers screener
// + 52w high data per ticker. Free tier: 250 calls/day.
// Alternative path if you'd rather use Finnhub: stock/metric endpoint has 52w high.
// Going FMP here since it has a direct gainers screener.

const FMP = "https://financialmodelingprep.com/api/v3";

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 300 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

type Gainer = {
  symbol: string;
  name: string;
  change: number;
  price: number;
  changesPercentage: number;
};

type Quote = {
  symbol: string;
  price: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  avgVolume: number;
  volume: number;
};

export async function GET() {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "FMP_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Get a broad list to filter — use gainers as a proxy for "moved up recently"
  const gainers = await fetchJSON<Gainer[]>(
    `${FMP}/stock_market/gainers?apikey=${key}`
  );

  if (!gainers || !Array.isArray(gainers)) {
    return NextResponse.json(
      { error: "Failed to load market data" },
      { status: 502 }
    );
  }

  // Limit symbols to check (free tier)
  const symbols = gainers.slice(0, 30).map((g) => g.symbol);
  if (symbols.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const quotes = await fetchJSON<Quote[]>(
    `${FMP}/quote/${symbols.join(",")}?apikey=${key}`
  );

  if (!quotes) {
    return NextResponse.json({ candidates: [] });
  }

  const candidates: any[] = [];
  for (const q of quotes) {
    // Gate: at or above 52w high, price >= $10, mcap >= $1B
    if (!q.yearHigh || !q.price) continue;
    if (q.price < 10) continue;
    if (q.marketCap < 1_000_000_000) continue;
    if (q.avgVolume < 500_000) continue;

    const pctFromHigh = ((q.price - q.yearHigh) / q.yearHigh) * 100;
    // At or within 1% of 52w high counts as "broke" (covers fresh breakouts)
    if (pctFromHigh < -1) continue;

    const volRatio = q.volume / q.avgVolume;

    candidates.push({
      ticker: q.symbol,
      meta: {
        "price": `$${q.price.toFixed(2)}`,
        "52w high": `$${q.yearHigh.toFixed(2)}`,
        "vs high": `${pctFromHigh >= 0 ? "+" : ""}${pctFromHigh.toFixed(2)}%`,
        "vol vs avg": `${volRatio.toFixed(2)}x`,
        "mcap": `$${(q.marketCap / 1e9).toFixed(1)}B`,
      },
    });
  }

  candidates.sort(
    (a, b) =>
      parseFloat(b.meta["vol vs avg"]) - parseFloat(a.meta["vol vs avg"])
  );

  return NextResponse.json({ candidates });
}
