// app/api/diagnostic/edgar-brief/route.ts
//
// DIAGNOSTIC ENDPOINT — not part of production scanner flow.
// Tests whether feeding the AI a real SEC 8-K press release (instead of
// Finnhub news summaries) produces better briefs.
//
// GET /api/diagnostic/edgar-brief?ticker=SEMR&strategy=PEAD
//
// Returns the raw 8-K text alongside the AI brief so we can:
// 1. Verify the input data is what we expect
// 2. Copy the raw text to test against Gemini Flash/Pro manually
// 3. Compare nano output here vs nano output in the current scanner

import { NextRequest, NextResponse } from "next/server";
import { buildPrompt } from "@/lib/prompts";
import { Strategy } from "@/lib/playbook";
import { fetchLatest8K } from "@/lib/edgar";

const OPENAI = "https://api.openai.com/v1/chat/completions";

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
  // Mirrors the shape of newsContext in the existing endpoint so buildPrompt
  // doesn't need to know the source changed.

  let edgarContext: string;
  if (!edgar.pressReleaseText) {
    edgarContext = `(Latest 8-K filed ${edgar.filing.filingDate} for ${edgar.companyName}, but no Exhibit 99 press release was attached. Brief should reflect this gap.)`;
  } else {
    // Cap at ~30k chars (~7-8k tokens) to stay well under nano's context window
    // and avoid runaway costs. Real 8-K press releases are typically 5-15k chars.
    const capped = edgar.pressReleaseText.slice(0, 30000);
    const truncated = edgar.pressReleaseText.length > 30000;

    edgarContext = `SOURCE: SEC EDGAR 8-K filing for ${edgar.companyName} (CIK ${edgar.cik})
FILED: ${edgar.filing.filingDate}
URL: ${edgar.pressReleaseUrl}

--- PRESS RELEASE TEXT (Exhibit 99) ---

${capped}${truncated ? "\n\n[...truncated]" : ""}`;
  }

  // ---------- 3. Reuse existing buildPrompt ----------

  const { system, user } = buildPrompt({
    ticker,
    strategy,
    metaSnapshot: { source: "diagnostic-edgar" },
    newsContext: edgarContext, // <-- swapped: 8-K text in place of Finnhub news
  });

  // ---------- 4. Call nano (same params as production endpoint) ----------

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
          rawTextLength: edgar.pressReleaseText.length,
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
    // fall through, return raw
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
      pressReleaseText: edgar.pressReleaseText, // full text — UI shows truncated, copy gets full
      pressReleaseLength: edgar.pressReleaseText.length,
    },
    brief: parsed
      ? {
          sections: parsed.sections,
          generated_at: new Date().toISOString(),
        }
      : null,
    rawAiContent: parsed ? null : rawContent, // surface if JSON parse fails
    diagnostics: {
      ai_latency_ms: aiMs,
      tokens: usage,
      edgar_context_chars: edgarContext.length,
      truncated: edgar.pressReleaseText.length > 30000,
    },
  });
}

