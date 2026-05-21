"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Button, Pill } from "@/components/ui";
import {
  STRATEGIES,
  Strategy,
  gradeFromCount,
  sizeForGrade,
  applyConfluenceBonus,
} from "@/lib/playbook";
import { addTradingDays, formatDateISO } from "@/lib/dates";

function NewThesisInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [strategy, setStrategy] = useState<Strategy>(
    (params.get("strategy") as Strategy) || "PEAD"
  );
  const [ticker, setTicker] = useState(params.get("ticker")?.toUpperCase() || "");
  const [gates, setGates] = useState<Record<string, boolean>>({});
  const [factors, setFactors] = useState<Record<string, boolean>>({});
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [thesisText, setThesisText] = useState("");
  const [skipOverride, setSkipOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // For CONFLUENCE we use both PEAD + 52w gates and factors
  const config = STRATEGIES[strategy];
  const isConfluence = strategy === "CONFLUENCE";
  const effectiveGates = isConfluence
    ? [...STRATEGIES.PEAD.gates, ...STRATEGIES.FIFTY_TWO_WEEK.gates.filter(
        g => !STRATEGIES.PEAD.gates.some(pg => pg.key === g.key)
      )]
    : config.gates;
  const effectiveFactors = isConfluence
    ? [...STRATEGIES.PEAD.factors, ...STRATEGIES.FIFTY_TWO_WEEK.factors]
    : config.factors;

  const allGatesPassed =
    effectiveGates.length > 0 &&
    effectiveGates.every((g) => gates[g.key] === true);

  const factorCount = Object.values(factors).filter(Boolean).length;
  const baseGrade = gradeFromCount(factorCount);
  const grade = isConfluence ? applyConfluenceBonus(baseGrade) : baseGrade;

  // Auto-populate size from grade and trade plan from entry price
  useEffect(() => {
    if (grade !== "SKIP" && !positionSize) {
      setPositionSize(sizeForGrade(grade).toString());
    }
  }, [grade]); // eslint-disable-line

  useEffect(() => {
    const entry = parseFloat(entryPrice);
    if (!isNaN(entry) && entry > 0) {
      if (!stopPrice) {
        const s = entry * (1 - config.stopPct / 100);
        setStopPrice(s.toFixed(2));
      }
      if (!targetPrice) {
        const t = entry * (1 + config.targetPct / 100);
        setTargetPrice(t.toFixed(2));
      }
    }
  }, [entryPrice]); // eslint-disable-line

  const timeStopDate = useMemo(
    () => formatDateISO(addTradingDays(new Date(), config.timeStopDays)),
    [config.timeStopDays]
  );

  function reset() {
    setGates({});
    setFactors({});
    setStopPrice("");
    setTargetPrice("");
    setPositionSize("");
  }

  function onStrategyChange(s: Strategy) {
    setStrategy(s);
    reset();
  }

  const isSkip = grade === "SKIP";
  const blockedBySkip = isSkip && !skipOverride.trim();
  const canSubmit =
    ticker.trim().length > 0 &&
    allGatesPassed &&
    !blockedBySkip &&
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
      gates_passed: gates,
      grade_factors: factors,
      grade,
      skip_override_reason: isSkip ? skipOverride : null,
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
            Commit before buy
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            New Thesis
          </h1>
        </div>

        {/* Strategy + Ticker */}
        <Card className="p-5 space-y-4">
          <div>
            <SectionLabel>Strategy</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["PEAD", "FIFTY_TWO_WEEK", "CONFLUENCE"] as Strategy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStrategyChange(s)}
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

        {/* Gates */}
        <Card className="p-5">
          <SectionLabel>
            Filter gates · all must pass
          </SectionLabel>
          <div className="space-y-3">
            {effectiveGates.map((g) => (
              <label
                key={g.key}
                className="flex items-start gap-3 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={gates[g.key] || false}
                  onChange={(e) =>
                    setGates({ ...gates, [g.key]: e.target.checked })
                  }
                />
                <span className="text-sm text-ink-100">{g.label}</span>
              </label>
            ))}
          </div>
          {!allGatesPassed && (
            <div className="mt-4 text-xs text-ink-500">
              {effectiveGates.filter((g) => !gates[g.key]).length} gate(s) not
              yet met
            </div>
          )}
          {allGatesPassed && (
            <div className="mt-4 text-xs text-signal-green">All gates passed ✓</div>
          )}
        </Card>

        {/* Grading rubric */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Grading factors · check what applies</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-ink-400 tabular">
                {factorCount}/{effectiveFactors.length}
              </span>
              <Pill
                tone={
                  grade === "A"
                    ? "grade-a"
                    : grade === "B"
                    ? "grade-b"
                    : grade === "C"
                    ? "grade-c"
                    : "grade-skip"
                }
              >
                {grade}
              </Pill>
            </div>
          </div>
          <div className="space-y-3">
            {effectiveFactors.map((f) => (
              <label
                key={f.key}
                className="flex items-start gap-3 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={factors[f.key] || false}
                  onChange={(e) =>
                    setFactors({ ...factors, [f.key]: e.target.checked })
                  }
                />
                <div>
                  <div className="text-sm text-ink-100">{f.label}</div>
                  {f.hint && (
                    <div className="text-xs text-ink-500 mt-0.5">{f.hint}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
          {isConfluence && grade !== baseGrade && (
            <div className="mt-3 text-xs text-signal-green">
              Confluence bonus applied: {baseGrade} → {grade}
            </div>
          )}
        </Card>

        {/* Skip override */}
        {isSkip && allGatesPassed && (
          <Card className="p-5 border-signal-red/40 bg-signal-red/5">
            <SectionLabel>
              <span className="text-signal-red">Skip override</span>
            </SectionLabel>
            <div className="text-sm text-ink-300 mb-3">
              This setup grades as SKIP. If you trade it anyway, document your
              reason — it'll be logged and reviewed in the journal.
            </div>
            <textarea
              rows={3}
              value={skipOverride}
              onChange={(e) => setSkipOverride(e.target.value)}
              placeholder="Why are you overriding the rubric?"
            />
          </Card>
        )}

        {/* Trade plan */}
        {allGatesPassed && (!isSkip || skipOverride.trim()) && (
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
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Position size ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={positionSize}
                  onChange={(e) => setPositionSize(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Stop price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                />
                <div className="text-[10px] text-ink-600 mt-1">
                  {config.stopHint}
                </div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Target price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                />
                <div className="text-[10px] text-ink-600 mt-1">
                  {config.targetHint}
                </div>
              </div>
            </div>
            <div className="text-xs text-ink-500 pt-2 border-t border-ink-800">
              Time stop:{" "}
              <span className="font-mono text-ink-300">
                {timeStopDate}
              </span>{" "}
              ({config.timeStopDays} trading days)
            </div>
          </Card>
        )}

        {/* Thesis text */}
        {allGatesPassed && (!isSkip || skipOverride.trim()) && (
          <Card className="p-5">
            <SectionLabel>One-line thesis · optional but valuable</SectionLabel>
            <textarea
              rows={3}
              value={thesisText}
              onChange={(e) => setThesisText(e.target.value)}
              placeholder="In a few words: why this trade? What does future-you need to remember?"
            />
          </Card>
        )}

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
