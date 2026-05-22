// app/diagnostic/edgar/page.tsx
//
// DIAGNOSTIC PAGE — not linked from main nav.
// Visit /diagnostic/edgar manually.

"use client";

import { useState } from "react";

type DiagnosticResponse = {
  ticker: string;
  strategy: string;
  edgar: {
    companyName: string;
    cik: string;
    filingDate: string;
    filingUrl: string;
    documentUrl: string;
    documentHtml: string;
    htmlLength: number;
    items: string;
    isEarningsFiling: boolean;
  };
  brief: {
    sections: { label: string; value: string }[];
    generated_at: string;
  } | null;
  rawAiContent: string | null;
  diagnostics: {
    ai_latency_ms: number;
    tokens: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
    edgar_context_chars: number;
    truncated: boolean;
    char_cap: number;
  };
};

export default function EdgarDiagnosticPage() {
  const [ticker, setTicker] = useState("");
  const [strategy, setStrategy] = useState<"PEAD" | "FIFTY_TWO_WEEK">("PEAD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiagnosticResponse | null>(null);
  const [showFullHtml, setShowFullHtml] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    setShowFullHtml(false);
    setCopied(false);

    try {
      const r = await fetch(
        `/api/diagnostic/edgar-brief?ticker=${encodeURIComponent(ticker.trim())}&strategy=${strategy}`
      );
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`);
      } else {
        setData(j);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyHtml() {
    if (!data?.edgar.documentHtml) return;
    try {
      await navigator.clipboard.writeText(data.edgar.documentHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — try downloading instead");
    }
  }

  function downloadHtml() {
    if (!data?.edgar.documentHtml) return;
    const blob = new Blob([data.edgar.documentHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.ticker}_8K_${data.edgar.filingDate}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-sm">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">EDGAR Brief Diagnostic</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Fetches the most recent earnings 8-K (Item 2.02) for a ticker and
          sends the primary 8-K document HTML to nano. Download the .html for
          Gemini comparison.
        </p>
      </div>

      {/* Input form */}
      <div className="rounded-lg border border-zinc-800 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs text-zinc-400">Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. SEMR"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono uppercase outline-none focus:border-zinc-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Strategy</label>
            <select
              value={strategy}
              onChange={(e) =>
                setStrategy(e.target.value as "PEAD" | "FIFTY_TWO_WEEK")
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
            >
              <option value="PEAD">PEAD</option>
              <option value="FIFTY_TWO_WEEK">52-Week High</option>
            </select>
          </div>
          <button
            onClick={run}
            disabled={loading || !ticker.trim()}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="mt-6 space-y-6">
          {/* EDGAR metadata */}
          <section className="rounded-lg border border-zinc-800 p-4">
            <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-400">
              EDGAR Source
            </h2>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Row label="Company" value={data.edgar.companyName} />
              <Row label="CIK" value={data.edgar.cik} />
              <Row label="Filed" value={data.edgar.filingDate} />
              <Row
                label="8-K Items"
                value={data.edgar.items || "n/a"}
                accent={data.edgar.isEarningsFiling ? "emerald" : "amber"}
              />
              <Row
                label="Document HTML"
                value={`${data.edgar.htmlLength.toLocaleString()} chars${
                  data.diagnostics.truncated
                    ? ` (truncated to ${data.diagnostics.char_cap.toLocaleString()} for AI)`
                    : ""
                }`}
              />
              <Row
                label="Earnings filing?"
                value={
                  data.edgar.isEarningsFiling
                    ? "Yes (Item 2.02 present)"
                    : "No — fell back to most recent 8-K"
                }
                accent={data.edgar.isEarningsFiling ? "emerald" : "amber"}
              />
            </dl>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <a
                href={data.edgar.filingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                View filing →
              </a>
              {data.edgar.documentUrl &&
                data.edgar.documentUrl !== data.edgar.filingUrl && (
                  <a
                    href={data.edgar.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    View 8-K document →
                  </a>
                )}
            </div>
          </section>

          {/* AI Brief */}
          <section className="rounded-lg border border-zinc-800 p-4">
            <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-400">
              gpt-5-nano Brief (with EDGAR document input)
            </h2>
            {data.brief ? (
              <div className="space-y-3">
                {data.brief.sections.map((s, i) => (
                  <div key={i}>
                    <div className="text-xs font-semibold text-zinc-300">
                      {s.label}
                    </div>
                    <div className="mt-0.5 text-zinc-100">{s.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div className="text-amber-400">
                  AI returned content that didn&apos;t parse as JSON. Raw output:
                </div>
                <pre className="mt-2 overflow-auto rounded bg-zinc-900 p-3 text-xs">
                  {data.rawAiContent}
                </pre>
              </div>
            )}

            <div className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
              latency {data.diagnostics.ai_latency_ms}ms
              {data.diagnostics.tokens?.total_tokens
                ? ` · ${data.diagnostics.tokens.total_tokens} tokens (${data.diagnostics.tokens.prompt_tokens} in / ${data.diagnostics.tokens.completion_tokens} out)`
                : ""}
            </div>
          </section>

          {/* HTML for Gemini comparison */}
          <section className="rounded-lg border border-zinc-800 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs uppercase tracking-wide text-zinc-400">
                Cleaned 8-K HTML
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={downloadHtml}
                  disabled={!data.edgar.documentHtml}
                  className="rounded border border-emerald-700 bg-emerald-950/50 px-3 py-1 text-xs text-emerald-300 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download .html
                </button>
                <button
                  onClick={copyHtml}
                  disabled={!data.edgar.documentHtml}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  onClick={() => setShowFullHtml((v) => !v)}
                  disabled={!data.edgar.documentHtml}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showFullHtml ? "Collapse" : "Expand"}
                </button>
              </div>
            </div>

            {data.edgar.documentHtml ? (
              <pre
                className={`overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300 ${
                  showFullHtml ? "max-h-[600px]" : "max-h-40"
                }`}
              >
                {data.edgar.documentHtml}
              </pre>
            ) : (
              <div className="text-zinc-500">
                No document HTML retrieved. Check the &quot;View filing&quot;
                link above to inspect manually.
              </div>
            )}

            <p className="mt-3 text-xs text-zinc-500">
              Download the .html and upload to the Gemini app for comparison.
              Use the constrained prompt: tell Gemini to use ONLY information
              from the attached file and answer &quot;Not disclosed in
              filing&quot; for anything not present.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
      ? "text-amber-300"
      : "text-zinc-200";
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}
