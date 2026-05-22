"use client";

import { useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Button } from "@/components/ui";

type Candidate = {
  ticker: string;
  meta: Record<string, any>;
};

export default function ScannerPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runScan() {
    setErr(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/scan/fifty_two_week`);
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
          <div className="text-xs text-ink-500 mt-1">52-Week High momentum</div>
        </div>

        <Card className="p-5 space-y-4">
          <Button onClick={runScan} disabled={loading} className="w-full">
            {loading ? "Scanning…" : "Run scan"}
          </Button>
          {err && (
            <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-2 rounded-sm">
              {err}
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
                  No candidates match the gates today. That&apos;s normal — most
                  days there&apos;s nothing worth trading.
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
                        href={`/thesis/new?ticker=${c.ticker}&strategy=FIFTY_TWO_WEEK`}
                        className="text-signal-green text-sm hover:underline"
                      >
                        Trade →
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
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
                    <div className="flex gap-3 pt-2 border-t border-ink-800 text-xs">
                      <a
                        href={`https://www.tradingview.com/symbols/${c.ticker}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-300 hover:text-ink-100 hover:underline"
                      >
                        Chart →
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <Card className="p-4 bg-ink-900/30">
          <div className="text-xs text-ink-500 leading-relaxed">
            The scanner surfaces stocks breaking out at or near their 52-week
            high. Tap Chart to open TradingView, then Trade if the setup looks
            clean. Most days will return 0–3 candidates; if you&apos;re seeing
            20+, the gates are too loose.
          </div>
        </Card>
      </div>
    </Shell>
  );
}
