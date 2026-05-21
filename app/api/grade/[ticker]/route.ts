import { NextRequest, NextResponse } from "next/server";
import { buildPrompt, Brief } from "@/lib/prompts";
import { Strategy } from "@/lib/playbook";

// AI brief endpoint.
// GET /api/grade/SEMR?strategy=FIFTY_TWO_WEEK&meta=<base64-json>
//
// Pulls recent Finnhub news for the ticker, sends to gpt-5-nano with a
// strategy-specific prompt, returns 5-section brief.
//
// Cost: ~$0.0003 per call. Caching news fetches for 1 hour to avoid
// hammering Finnhub on repeat taps. LLM call is NOT cached server-side;
// add client-side caching in the scanner page if needed.

const FINNHUB = "https://finnhub.io/api/v1";
const OPENAI = "https://api.openai.com/v1/chat/completions";

type FinnhubNewsItem = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function formatNewsContext(items: FinnhubNewsItem[]): string {
  if (!items || items.length === 0) {
    return "(No news found in the last 14 days. Brief should reflect this gap.)";
  }
  // Keep top ~15 to stay under reasonable token budget
  return items
    .slice(0, 15)
    .map((n) => {
      const date = new Date(n.datetime * 1000).toISOString().slice(0, 10);
      const summary = (n.summary || "").slice(0, 400); // truncate long summaries
      return `[${date}] ${n.headline}\nSource: ${n.source}\n${summary}`;
    })
    .join("\n\n---\n\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!finnhubKey) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY not configured" },
      { status: 500 }
    );
  }
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured. Add it in Vercel env vars." },
      { status: 500 }
    );
  }

  const ticker = params.ticker.toUpperCase();
  const sp = req.nextUrl.searchParams;
  const strategy = (sp.get("strategy") || "PEAD") as Strategy;

  // Optional: scanner-card metadata passed through so the brief has context
  // about the specific reading (mcap, day move, etc.) without re-fetching.
  let metaSnapshot: Record<string, any> = {};
  const metaParam = sp.get("meta");
  if (metaParam) {
    try {
      metaSnapshot = JSON.parse(
        Buffer.from(metaParam, "base64").toString("utf-8")
      );
    } catch {
      // ignore — meta is best-effort
    }
  }

  // Pull last 14 days of news
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 14);
  const fromS = from.toISOString().slice(0, 10);
  const toS = today.toISOString().slice(0, 10);

  const news = await fetchJSON<FinnhubNewsItem[]>(
    `${FINNHUB}/company-news?symbol=${ticker}&from=${fromS}&to=${toS}&token=${finnhubKey}`
  );

  const newsContext = formatNewsContext(news || []);

  // Build prompt
  const { system, user } = buildPrompt({
    ticker,
    strategy,
    metaSnapshot,
    newsContext,
  });

  // Call OpenAI
  const aiRes = await fetch(OPENAI, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return NextResponse.json(
      { error: `OpenAI call failed: ${errText.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const aiData = await aiRes.json();
  const rawContent = aiData?.choices?.[0]?.message?.content;

  if (!rawContent) {
    return NextResponse.json(
      { error: "AI returned empty response" },
      { status: 502 }
    );
  }

  let parsed: { sections: { label: string; value: string }[] };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON", raw: rawContent.slice(0, 500) },
      { status: 502 }
    );
  }

  if (!Array.isArray(parsed.sections)) {
    return NextResponse.json(
      { error: "AI response missing sections array" },
      { status: 502 }
    );
  }

  const brief: Brief = {
    ticker,
    strategy,
    sections: parsed.sections,
    generated_at: new Date().toISOString(),
  };

  return NextResponse.json(brief);
}
