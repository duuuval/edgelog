"use client";

import { useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Button, Pill } from "@/components/ui";
import { Strategy } from "@/lib/playbook";

type Candidate = {
  ticker: string;
  meta: Record<string, any>;
};

export default function ScannerPage() {
  const [strategy, setStrategy] = useState<Strategy>("PEAD");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runScan() {
    setErr(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/scan/${strategy.toLowerCase()}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Scan failed");
      } else {
        setResults(data.candidates || []);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
            Find candidates
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Scanner
          </h1>
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <SectionLabel>Strategy</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {(["PEAD", "FIFTY_TWO_WEEK"] as Strategy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={`p-3 text-sm rounded-sm border transition-colors ${
                    strategy === s
                      ? "border-signal-green bg-signal-green/10 text-signal-green"
                      : "border-ink-700 text-ink-300 hover:border-ink-500"
                  }`}
                >
                  {s === "PEAD" ? "Post-Earnings Drift" : "52-Week High"}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={runScan} disabled={loading} className="w-full">
            {loading ? "Scanning…" : "Run scan"}
          </Button>
          {err && (
            <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-2 rounded-sm">
              {err}
              {err.includes("FINNHUB") && (
                <div className="mt-2 text-xs">
                  Set FINNHUB_API_KEY in Vercel env vars. Free tier:{" "}
                  <a
                    href="https://finnhub.io/register"
                    target="_blank"
                    className="underline"
                  >
                    finnhub.io
                  </a>
                </div>
              )}
            </div>
          )}
        </Card>

        {results && (
          <div>
            <SectionLabel>
              {results.length} candidate{results.length !== 1 ? "s" : ""}
            </SectionLabel>
            {results.length === 0 ? (
              <Card className="p-5">
                <div className="text-ink-400">
                  No candidates match the gates today. That's normal — most days
                  there's nothing worth trading.
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {results.map((c) => (
                  <Card key={c.ticker} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono font-semibold text-lg">
                        {c.ticker}
                      </span>
                      <Link
                        href={`/thesis/new?ticker=${c.ticker}&strategy=${strategy}`}
                        className="text-signal-green text-sm hover:underline"
                      >
                        Grade →
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {Object.entries(c.meta).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-ink-500 uppercase tracking-wider text-[10px]">
                            {k}
                          </div>
                          <div className="font-mono tabular text-ink-200">
                            {String(v)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <Card className="p-4 bg-ink-900/30">
          <div className="text-xs text-ink-500 leading-relaxed">
            The scanner surfaces stocks that pass the hard gates. You still
            grade each one manually against the rubric — the scanner doesn't
            decide for you. Most days will return 0–3 candidates; if you're
            seeing 20+, the gates are too loose.
          </div>
        </Card>
      </div>
    </Shell>
  );
}
