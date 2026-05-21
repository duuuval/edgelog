// lib/prompts.ts
//
// Hardcoded prompt templates for AI briefs.
// One per strategy; level-2 context (knows the trader's specific exits + holding period).
// Tune these as you learn what's actually useful in the brief output.

import { STRATEGIES, Strategy } from "./playbook";

export type BriefSection = {
  label: string;
  value: string;
};

export type Brief = {
  ticker: string;
  strategy: Strategy;
  sections: BriefSection[];
  generated_at: string;
};

type BuildArgs = {
  ticker: string;
  strategy: Strategy;
  metaSnapshot: Record<string, any>;
  newsContext: string;
};

const BASE_RULES = `
Output exactly 5 sections, in the order specified. Each section MUST be:
- Concrete (numbers, dates, named items — not vague summary)
- Maximum 25 words
- No hedging language ("might", "could", "potentially") — say what's known or say "Unclear from available info"
- No filler ("It is worth noting that...", "Importantly...")
- No recommendation at the end — the trader decides

Return ONLY valid JSON in this exact shape, nothing else:
{
  "sections": [
    {"label": "...", "value": "..."},
    ...
  ]
}
`.trim();

export function buildPeadPrompt(args: BuildArgs): {
  system: string;
  user: string;
} {
  const s = STRATEGIES.PEAD;
  const { ticker, metaSnapshot, newsContext } = args;

  const system = `
You are an analyst writing a 60-second brief for a Post-Earnings Announcement Drift (PEAD) trade.

CONTEXT ON THE TRADE:
- Strategy: small-cap PEAD ($200M-$2B market cap band)
- Position size: $10-15
- Target: +${s.targetPct}% from entry
- Stop: -${s.stopPct}% from entry
- Time stop: ${s.timeStopDays} trading days
- Edge thesis: institutional capital is structurally excluded from this market cap band, so post-earnings drift persists where it's been arbitraged away in large-caps

YOUR JOB:
Read the company news and earnings context provided. Produce a 5-section brief covering exactly these things, in this order:

1. BEAT QUALITY — Was the EPS/revenue beat real growth, or was it driven by one-time items (land sales, tax benefits, mark-to-market gains, asset sales, deferred revenue recognition)? If unclear from news, say so.
2. GUIDANCE — Did the company raise, maintain, lower, or withhold forward guidance? Quote the specific change if available.
3. REACTION — How did the stock close relative to its day range and the immediate post-print levels? Did the move hold or fade?
4. SECTOR — What is the relevant sector ETF doing over the last 30 days, and is the broader tape supportive?
5. YELLOW FLAGS — Any of: secondary offering, executive selling, going-concern, dilution risk, guidance qualifier, prior failed reactions, weak guidance commentary, accounting concerns. State "None identified" if none.

${BASE_RULES}
  `.trim();

  const user = `
TICKER: ${ticker}
SCANNER METADATA:
${JSON.stringify(metaSnapshot, null, 2)}

RECENT NEWS / FILINGS (last 14 days):
${newsContext}

Produce the brief now.
  `.trim();

  return { system, user };
}

export function build52wPrompt(args: BuildArgs): {
  system: string;
  user: string;
} {
  const s = STRATEGIES.FIFTY_TWO_WEEK;
  const { ticker, metaSnapshot, newsContext } = args;

  const system = `
You are an analyst writing a 60-second brief for a 52-week high breakout trade.

CONTEXT ON THE TRADE:
- Strategy: small-cap 52-week breakout ($200M-$2B market cap band)
- Position size: $10-15
- Target: +${s.targetPct}% from entry
- Stop: -${s.stopPct}% from entry (or close below breakout level)
- Time stop: ${s.timeStopDays} trading days
- Edge thesis: 52-week breakouts work strongest in less-followed names where institutions can't trade size

YOUR JOB:
Read the company news and recent context provided. Produce a 5-section brief covering exactly these things, in this order:

1. BASE QUALITY — From recent context, what does the price action leading into the breakout look like? Tight base (range-bound for weeks) or wide/choppy? If you can't tell from news, say "Check chart for base quality."
2. VOLUME — Is the scanner metadata showing volume confirmation on the break (≥2x average is the threshold)? Reference the actual numbers from metadata.
3. CATALYST — Is there a recent news catalyst (last 14 days) that justifies the breakout — earnings, contract, FDA event, sector rotation, analyst upgrade? Or is it grinding higher on no news?
4. CONTEXT — What is the broader sector / market tape doing? Is this name running with sector wind or against it?
5. YELLOW FLAGS — Any of: secondary offering, insider selling, earnings within next 5 trading days (don't enter if so), prior failed breakouts, recent dilution, going-concern. State "None identified" if none.

${BASE_RULES}
  `.trim();

  const user = `
TICKER: ${ticker}
SCANNER METADATA:
${JSON.stringify(metaSnapshot, null, 2)}

RECENT NEWS / FILINGS (last 14 days):
${newsContext}

Produce the brief now.
  `.trim();

  return { system, user };
}

export function buildPrompt(args: BuildArgs) {
  if (args.strategy === "PEAD") return buildPeadPrompt(args);
  if (args.strategy === "FIFTY_TWO_WEEK") return build52wPrompt(args);
  // CONFLUENCE: use PEAD frame, slightly different exits
  return buildPeadPrompt(args);
}
