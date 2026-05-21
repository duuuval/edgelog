"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Button } from "@/components/ui";
import { STRATEGIES, Strategy } from "@/lib/playbook";
import { addTradingDays, formatDateISO } from "@/lib/dates";

function NewThesisInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [strategy, setStrategy] = useState<Strategy>(
    (params.get("strategy") as Strategy) || "PEAD"
  );
  const [ticker, setTicker] = useState(params.get("ticker")?.toUpperCase() || "");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [positionSize, setPositionSize] = useState("10");
  const [thesisText, setThesisText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const config = STRATEGIES[strategy];

  // Auto-populate stop/target from entry price
  useEffect(() => {
    const entry = parseFloat(entryPrice);
    if (!isNaN(entry) && entry > 0) {
      const s = entry * (1 - config.stopPct / 100);
      const t = entry * (1 + config.targetPct / 100);
      setStopPrice(s.toFixed(2));
      setTargetPrice(t.toFixed(2));
    }
  }, [entryPrice, strategy]); // eslint-disable-line

  const timeStopDate = useMemo(
    () => formatDateISO(addTradingDays(new Date(), config.timeStopDays)),
    [config.timeStopDays]
  );

  const canSubmit =
    ticker.trim().length > 0 &&
    !!entryPrice &&
    !!stopPrice &&
    !!targetPrice &&
    !!positionSize;

  async function submit() {
    setErr(null);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not signed in");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("theses").insert({
      user_id: user.id,
      ticker: ticker.toUpperCase().trim(),
      strategy,
      status: "open",
      gates_passed: {},
      grade_factors: {},
      grade: null,
      entry_price: parseFloat(entryPrice),
      stop_price: parseFloat(stopPrice),
      target_price: parseFloat(targetPrice),
      position_size_usd: parseFloat(positionSize),
      time_stop_date: timeStopDate,
      thesis_text: thesisText.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/positions");
    router.refresh();
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
            Quick thesis
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            New Thesis
          </h1>
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <SectionLabel>Strategy</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["PEAD", "FIFTY_TWO_WEEK", "CONFLUENCE"] as Strategy[]).map((s) => (
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
                  {STRATEGIES[s].shortName}
                </button>
              ))}
            </div>
            <div className="text-xs text-ink-500 mt-2">{config.description}</div>
          </div>

          <div>
            <SectionLabel>Ticker</SectionLabel>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="NVDA"
              className="uppercase"
              maxLength={8}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <SectionLabel>Trade plan</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Entry price
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Size ($)
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Stop ({config.stopPct}% below)
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Target ({config.targetPct}% above)
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="text-xs text-ink-500 pt-2 border-t border-ink-800">
            Time stop:{" "}
            <span className="font-mono text-ink-300">{timeStopDate}</span>{" "}
            <span className="text-ink-600">
              ({config.timeStopDays} trading days)
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel>Note · optional</SectionLabel>
          <textarea
            rows={2}
            value={thesisText}
            onChange={(e) => setThesisText(e.target.value)}
            placeholder="Why this one? (future-you will thank present-you)"
          />
        </Card>

        {err && (
          <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-3 rounded-sm">
            {err}
          </div>
        )}

        <div className="flex gap-3 pb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={submit}
            disabled={!canSubmit || saving}
            className="flex-1"
          >
            {saving ? "Saving…" : "Open position"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

export default function NewThesisPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <NewThesisInner />
    </Suspense>
  );
}
