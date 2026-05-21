import { NextResponse } from "next/server";

// 52-week high scanner via FMP /stable/ endpoints (current API as of 2026)
// Free tier: 250 calls/day, /stable/biggest-gainers + /stable/batch-quote accessible

const FMP = "https://financialmodelingprep.com/stable";

async function fetchAny(url: string): Promise<{
  ok: boolean;
  status: number;
  data: any;
  text?: string;
}> {
  try {
    const r = await fetch(url, { next: { revalidate: 300 } });
    const text = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, text: e?.message || "fetch failed" };
  }
}

export async function GET() {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "FMP_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Step 1: biggest gainers
  const gainersRes = await fetchAny(`${FMP}/biggest-gainers?apikey=${key}`);

  if (!gainersRes.ok) {
    return NextResponse.json(
      {
        error: `FMP biggest-gainers returned ${gainersRes.status}`,
        detail: gainersRes.text?.slice(0, 300),
      },
      { status: 502 }
    );
  }

  const gainersList = Array.isArray(gainersRes.data) ? gainersRes.data : null;
  if (!gainersList) {
    return NextResponse.json(
      {
        error: "FMP biggest-gainers returned unexpected shape",
        detail:
          typeof gainersRes.data === "object"
            ? JSON.stringify(gainersRes.data).slice(0, 300)
            : String(gainersRes.text).slice(0, 300),
      },
      { status: 502 }
    );
  }

  if (gainersList.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Step 2: batch quote
  const symbols = gainersList
    .slice(0, 30)
    .map((g: any) => g.symbol)
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const quotesRes = await fetchAny(
    `${FMP}/batch-quote?symbols=${symbols.join(",")}&apikey=${key}`
  );

  if (!quotesRes.ok) {
    return NextResponse.json(
      {
        error: `FMP batch-quote returned ${quotesRes.status}`,
        detail: quotesRes.text?.slice(0, 300),
      },
      { status: 502 }
    );
  }

  const quotes = Array.isArray(quotesRes.data) ? quotesRes.data : null;
  if (!quotes) {
    return NextResponse.json(
      {
        error: "FMP batch-quote returned unexpected shape",
        detail: String(quotesRes.text).slice(0, 300),
      },
      { status: 502 }
    );
  }

  // Step 3: filter and shape
  const candidates: any[] = [];
  for (const q of quotes) {
    const price = Number(q?.price);
    const yearHigh = Number(q?.yearHigh);
    const marketCap = Number(q?.marketCap);
    const avgVolume = Number(q?.avgVolume);
    const volume = Number(q?.volume);

    if (!price || !yearHigh) continue;
    if (price < 10) continue;
    if (!marketCap || marketCap < 1_000_000_000) continue;
    if (!avgVolume || avgVolume < 500_000) continue;

    const pctFromHigh = ((price - yearHigh) / yearHigh) * 100;
    // Loose gate: within 2% of 52w high (above OR just below)
    if (pctFromHigh < -2) continue;

    const volRatio = volume > 0 && avgVolume > 0 ? volume / avgVolume : 0;

    candidates.push({
      ticker: q.symbol,
      meta: {
        price: `$${price.toFixed(2)}`,
        "52w high": `$${yearHigh.toFixed(2)}`,
        "vs high": `${pctFromHigh >= 0 ? "+" : ""}${pctFromHigh.toFixed(2)}%`,
        "vol vs avg": volRatio > 0 ? `${volRatio.toFixed(2)}x` : "n/a",
        mcap: `$${(marketCap / 1e9).toFixed(1)}B`,
      },
    });
  }

  candidates.sort((a, b) => {
    const av = parseFloat(a.meta["vol vs avg"]) || 0;
    const bv = parseFloat(b.meta["vol vs avg"]) || 0;
    return bv - av;
  });

  return NextResponse.json({ candidates });
}
