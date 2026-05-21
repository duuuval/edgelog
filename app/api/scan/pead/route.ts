import { NextResponse } from "next/server";

// PEAD scanner: companies that reported in last 3 trading days,
// beat both EPS and revenue, with strong reaction.
// Uses Finnhub free tier. Free tier limits: 60 calls/min.
//
// v2: small-cap pivot. PEAD on large-caps was arbitraged away ~2006
// (Martineau 2022). Edge persists in $200M-$2B band where institutions
// can't trade size. See edgelog-strategy.md.

const FINNHUB = "https://finnhub.io/api/v1";

type EarningsRow = {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
};

type Quote = {
  c: number; // current
  d: number; // change
  dp: number; // change percent
  pc: number; // prev close
};

type Profile = {
  marketCapitalization: number;
  name: string;
};

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Earnings calendar for last 4 calendar days (covers ~3 trading days)
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 4);
  const fromS = from.toISOString().slice(0, 10);
  const toS = today.toISOString().slice(0, 10);

  const calRes = await fetchJSON<{ earningsCalendar: EarningsRow[] }>(
    `${FINNHUB}/calendar/earnings?from=${fromS}&to=${toS}&token=${key}`
  );

  if (!calRes?.earningsCalendar) {
    return NextResponse.json(
      { error: "Failed to load earnings calendar" },
      { status: 502 }
    );
  }

  // Filter: both EPS beat AND revenue beat with measurable surprise
  const beats = calRes.earningsCalendar.filter((r) => {
    if (r.epsActual === null || r.epsEstimate === null) return false;
    if (r.revenueActual === null || r.revenueEstimate === null) return false;
    const epsBeat = r.epsActual > r.epsEstimate;
    const revBeat = r.revenueActual > r.revenueEstimate;
    return epsBeat && revBeat;
  });

  // Cap to avoid hammering free tier. Small-cap universe is larger,
  // so widen slightly to catch more candidates inside the band.
  const sliced = beats.slice(0, 40);

  const candidates: any[] = [];
  for (const r of sliced) {
    const [quote, profile] = await Promise.all([
      fetchJSON<Quote>(`${FINNHUB}/quote?symbol=${r.symbol}&token=${key}`),
      fetchJSON<Profile>(
        `${FINNHUB}/stock/profile2?symbol=${r.symbol}&token=${key}`
      ),
    ]);
    if (!quote || !profile) continue;

    // v2 gates: $200M ≤ mcap ≤ $2B, price ≥ $5, reaction ≥ 5%
    const mcapM = profile.marketCapitalization; // Finnhub returns in millions
    if (mcapM < 200) continue;       // floor: $200M
    if (mcapM > 2000) continue;      // ceiling: $2B (institutional-blind-spot band)
    if (quote.c < 5) continue;       // price floor lowered to $5 for small-cap reality
    if (Math.abs(quote.dp) < 5) continue;

    const epsSurprise =
      r.epsEstimate && r.epsEstimate !== 0
        ? ((r.epsActual! - r.epsEstimate) / Math.abs(r.epsEstimate)) * 100
        : 0;
    const revSurprise =
      r.revenueEstimate && r.revenueEstimate !== 0
        ? ((r.revenueActual! - r.revenueEstimate) / Math.abs(r.revenueEstimate)) * 100
        : 0;

    const mcapDisplay =
      mcapM >= 1000
        ? `$${(mcapM / 1000).toFixed(1)}B`
        : `$${mcapM.toFixed(0)}M`;

    candidates.push({
      ticker: r.symbol,
      meta: {
        "reported": r.date,
        "price": `$${quote.c.toFixed(2)}`,
        "day move": `${quote.dp >= 0 ? "+" : ""}${quote.dp.toFixed(1)}%`,
        "mcap": mcapDisplay,
        "eps surprise": `${epsSurprise >= 0 ? "+" : ""}${epsSurprise.toFixed(0)}%`,
        "rev surprise": `${revSurprise >= 0 ? "+" : ""}${revSurprise.toFixed(1)}%`,
      },
    });
  }

  // Sort by reaction strength
  candidates.sort(
    (a, b) =>
      Math.abs(parseFloat(b.meta["day move"])) -
      Math.abs(parseFloat(a.meta["day move"]))
  );

  return NextResponse.json({ candidates });
}
