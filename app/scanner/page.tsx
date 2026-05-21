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

type BriefSection = { label: string; value: string };

type Brief = {
  ticker: string;
  strategy: Strategy;
  sections: BriefSection[];
  generated_at: string;
};

export default function ScannerPage() {
  const [strategy, setStrategy] = useState<Strategy>("PEAD");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Brief modal state
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefTicker, setBriefTicker] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefData, setBriefData] = useState<Brief | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);

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

  async function loadBrief(candidate: Candidate, force = false) {
    setBriefOpen(true);
    setBriefTicker(candidate.ticker);
    setBriefErr(null);
    if (!force && briefData?.ticker === candidate.ticker) return; // already loaded
    setBriefData(null);
    setBriefLoading(true);
    try {
      // Pass scanner-card meta along so the brief has snapshot context
      const metaParam = Buffer.from(JSON.stringify(candidate.meta)).toString(
        "base64"
      );
      const res = await fetch(
        `/api/grade/${candidate.ticker}?strategy=${strategy}&meta=${encodeURIComponent(
          metaParam
        )}${force ? `&t=${Date.now()}` : ""}`
      );
      const data = await res.json();
      if (!res.ok) {
        setBriefErr(data.error || "Brief failed");
      } else {
        setBriefData(data);
      }
    } catch (e: any) {
      setBriefErr(e.message);
    } finally {
      setBriefLoading(false);
    }
  }

  function closeBrief() {
    setBriefOpen(false);
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
                      <button
                        type="button"
                        onClick={() => loadBrief(c)}
                        className="text-signal-green hover:underline"
                      >
                        AI brief →
                      </button>
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
            The scanner surfaces stocks that pass the hard gates. Tap AI brief
            for a 60-second read; tap Chart to open TradingView. Most days will
            return 0–3 candidates; if you're seeing 20+, the gates are too loose.
          </div>
        </Card>
      </div>

      {/* Brief modal */}
      {briefOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60"
          onClick={closeBrief}
        >
          <div
            className="bg-ink-950 border border-ink-700 rounded-t-lg md:rounded-lg w-full md:max-w-lg md:mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-ink-950 border-b border-ink-800 px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500">
                  AI Brief
                </div>
                <div className="font-mono font-semibold text-lg">
                  {briefTicker}
                </div>
              </div>
              <button
                type="button"
                onClick={closeBrief}
                className="text-ink-400 hover:text-ink-100 text-xl px-2"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4">
              {briefLoading && (
                <div className="text-ink-400 text-sm py-8 text-center">
                  Reading recent news…
                </div>
              )}

              {briefErr && (
                <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-3 rounded-sm">
                  {briefErr}
                </div>
              )}

              {briefData && !briefLoading && (
                <div className="space-y-4">
                  {briefData.sections.map((section, i) => (
                    <div key={i}>
                      <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
                        {section.label}
                      </div>
                      <div className="text-sm text-ink-100 leading-relaxed">
                        {section.value}
                      </div>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-ink-800 flex items-center justify-between text-xs text-ink-500">
                    <span>
                      Generated{" "}
                      {new Date(briefData.generated_at).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const candidate = results?.find(
                          (r) => r.ticker === briefTicker
                        );
                        if (candidate) loadBrief(candidate, true);
                      }}
                      className="text-ink-400 hover:text-ink-100 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
