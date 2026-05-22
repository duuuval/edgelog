// app/api/diagnostic/edgar-brief/route.ts
//
// DIAGNOSTIC ENDPOINT — not part of production scanner flow.
// Tests whether feeding the AI a real SEC 8-K press release produces better
// briefs than the Finnhub news summaries the production endpoint uses.
//
// GET /api/diagnostic/edgar-brief?ticker=SEMR&strategy=PEAD
//
// Returns the raw 8-K HTML alongside the AI brief so we can:
// 1. Verify the input data is what we expect (incl. which 8-K Item was picked)
// 2. Use the same HTML to test against Gemini Flash/Pro manually
// 3. Compare nano output here vs nano output in the current scanner

import { NextRequest, NextResponse } from "next/server";
import { buildPrompt } from "@/lib/prompts";
import { Strategy } from "@/lib/playbook";
import { fetchLatest8K } from "@/lib/edgar";

const OPENAI = "https://api.openai.com/v1/chat/completions";

// Cap on EDGAR HTML chars sent to nano.
// 200k chars ≈ ~50k tokens. Cleaned 8-Ks are typically 20-80k chars; outliers
// hit 150k+. Input tokens are cheap (~$0.05/M) so the binding constraint is
// nano's context window, not cost.
const EDGAR_CHAR_CAP = 200_000;

export async function GET(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const ticker = (sp.get("ticker") || "").toUpperCase().trim();
  const strategy = (sp.get("strategy") || "PEAD") as Strategy;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  // ---------- 1. Fetch the 8-K ----------

  let edgar;
  try {
    edgar = await fetchLatest8K(ticker);
  } catch (err) {
    return NextResponse.json(
      {
        error: `EDGAR fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }

  if (!edgar) {
    return NextResponse.json(
      { error: `Ticker ${ticker} not found in SEC ticker database` },
      { status: 404 }
    );
  }

  // ---------- 2. Build the edgarContext string ----------

  let edgarContext: string;
  if (!edgar.pressReleaseHtml) {
    edgarContext = `(8-K filed ${edgar.filing.filingDate} for ${edgar.companyName} (Items: ${edgar.filing.items || "n/a"}), but no recognizable press release exhibit was attached. Brief should reflect this gap.)`;
  } else {
    const capped = edgar.pressReleaseHtml.slice(0, EDGAR_CHAR_CAP);
    const truncated = edgar.pressReleaseHtml.length > EDGAR_CHAR_CAP;

    edgarContext = `SOURCE: SEC EDGAR 8-K filing for ${edgar.companyName} (CIK ${edgar.cik})
FILED: ${edgar.filing.filingDate}
8-K ITEMS: ${edgar.filing.items || "n/a"}${edgar.filing.isEarningsFiling ? " (includes Item 2.02 — Results of Operations)" : " (NOTE: no Item 2.02 — this may not be an earnings filing)"}
URL: ${edgar.pressReleaseUrl}

The content below is the press release exhibit as cleaned HTML.
Structural tags (tables, headers, lists, emphasis) are preserved.

--- PRESS RELEASE HTML ---

${capped}${truncated ? "\n\n[...truncated]" : ""}`;
  }

  // ---------- 3. Reuse existing buildPrompt ----------

  const { system, user } = buildPrompt({
    ticker,
    strategy,
    metaSnapshot: { source: "diagnostic-edgar" },
    newsContext: edgarContext,
  });

  // ---------- 4. Call nano ----------

  const t0 = Date.now();
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
  const aiMs = Date.now() - t0;

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return NextResponse.json(
      {
        error: `OpenAI call failed: ${errText.slice(0, 300)}`,
        edgar: {
          companyName: edgar.companyName,
          filingDate: edgar.filing.filingDate,
          filingUrl: edgar.filing.filingUrl,
          pressReleaseUrl: edgar.pressReleaseUrl,
          htmlLength: edgar.pressReleaseHtml.length,
          items: edgar.filing.items,
          isEarningsFiling: edgar.filing.isEarningsFiling,
        },
      },
      { status: 502 }
    );
  }

  const aiData = await aiRes.json();
  const rawContent = aiData?.choices?.[0]?.message?.content;
  const usage = aiData?.usage || null;

  let parsed: { sections: { label: string; value: string }[] } | null = null;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    // fall through
  }

  return NextResponse.json({
    ticker,
    strategy,
    edgar: {
      companyName: edgar.companyName,
      cik: edgar.cik,
      filingDate: edgar.filing.filingDate,
      filingUrl: edgar.filing.filingUrl,
      pressReleaseUrl: edgar.pressReleaseUrl,
      pressReleaseHtml: edgar.pressReleaseHtml,
      htmlLength: edgar.pressReleaseHtml.length,
      items: edgar.filing.items,
      isEarningsFiling: edgar.filing.isEarningsFiling,
    },
    brief: parsed
      ? {
          sections: parsed.sections,
          generated_at: new Date().toISOString(),
        }
      : null,
    rawAiContent: parsed ? null : rawContent,
    diagnostics: {
      ai_latency_ms: aiMs,
      tokens: usage,
      edgar_context_chars: edgarContext.length,
      truncated: edgar.pressReleaseHtml.length > EDGAR_CHAR_CAP,
      char_cap: EDGAR_CHAR_CAP,
    },
  });
}
