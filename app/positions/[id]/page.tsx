"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Button, Pill, Stat } from "@/components/ui";
import { STRATEGIES } from "@/lib/playbook";
import { formatDateISO } from "@/lib/dates";

type ExitReason = "TARGET" | "STOP" | "TIME" | "DISCRETIONARY";

export default function PositionDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = createClient();
  const [thesis, setThesis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState(formatDateISO(new Date()));
  const [exitReason, setExitReason] = useState<ExitReason>("TARGET");
  const [discretionaryReason, setDiscretionaryReason] = useState("");
  const [lessons, setLessons] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("theses")
        .select("*")
        .eq("id", params.id)
        .single();
      if (error || !data) {
        router.push("/positions");
        return;
      }
      setThesis(data);
      setLoading(false);
    })();
  }, [params.id]); // eslint-disable-line

  if (loading) {
    return (
      <Shell>
        <div className="p-6 text-ink-400">Loading…</div>
      </Shell>
    );
  }

  const strat = STRATEGIES[thesis.strategy as keyof typeof STRATEGIES];
  const entry = Number(thesis.entry_price);
  const stop = Number(thesis.stop_price);
  const target = Number(thesis.target_price);
  const size = Number(thesis.position_size_usd);

  async function closePosition() {
    setErr(null);
    if (!exitPrice) {
      setErr("Exit price required");
      return;
    }
    if (exitReason === "DISCRETIONARY" && !discretionaryReason.trim()) {
      setErr("Discretionary exits require a reason");
      return;
    }
    setClosing(true);

    const exit = parseFloat(exitPrice);
    const pnlPct = (exit - entry) / entry;
    const pnlUsd = pnlPct * size;
    const stopDistance = entry - stop;
    const rMult = stopDistance > 0 ? (exit - entry) / stopDistance : 0;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not signed in");
      setClosing(false);
      return;
    }

    const { error: tradeErr } = await supabase.from("trades").insert({
      thesis_id: thesis.id,
      user_id: user.id,
      exit_price: exit,
      exit_date: exitDate,
      exit_reason: exitReason,
      discretionary_reason:
        exitReason === "DISCRETIONARY" ? discretionaryReason : null,
      pnl_usd: pnlUsd,
      pnl_pct: pnlPct * 100,
      r_multiple: rMult,
      lessons_text: lessons.trim() || null,
    });

    if (tradeErr) {
      setErr(tradeErr.message);
      setClosing(false);
      return;
    }

    await supabase
      .from("theses")
      .update({ status: "closed" })
      .eq("id", thesis.id);

    setClosing(false);
    router.push("/journal");
    router.refresh();
  }

  async function deletePosition() {
    if (!confirm("Delete this thesis without recording a trade? (Use only if you never entered the position.)"))
      return;
    await supabase.from("theses").delete().eq("id", thesis.id);
    router.push("/positions");
    router.refresh();
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <button
            onClick={() => router.push("/positions")}
            className="text-ink-500 text-sm hover:text-ink-300 mb-2"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-mono font-semibold text-3xl">{thesis.ticker}</h1>
            {thesis.grade && (
              <Pill
                tone={
                  thesis.grade === "A"
                    ? "grade-a"
                    : thesis.grade === "B"
                    ? "grade-b"
                    : thesis.grade === "C"
                    ? "grade-c"
                    : "grade-skip"
                }
              >
                {thesis.grade}
              </Pill>
            )}
          </div>
          <div className="text-ink-500 text-sm">
            {strat.name} · entered{" "}
            {new Date(thesis.entered_at).toLocaleDateString()}
          </div>
        </div>

        {/* Plan */}
        <Card className="p-5">
          <SectionLabel>Plan</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Entry" value={`$${entry.toFixed(2)}`} />
            <Stat label="Size" value={`$${size.toFixed(2)}`} />
            <Stat label="Stop" value={`$${stop.toFixed(2)}`} tone="negative" />
            <Stat label="Target" value={`$${target.toFixed(2)}`} tone="positive" />
          </div>
          <div className="text-xs text-ink-500 mt-4 pt-3 border-t border-ink-800">
            Time stop:{" "}
            <span className="font-mono text-ink-300">{thesis.time_stop_date}</span>
          </div>
        </Card>

        {/* Thesis */}
        {thesis.thesis_text && (
          <Card className="p-5">
            <SectionLabel>Thesis</SectionLabel>
            <div className="italic text-ink-200">"{thesis.thesis_text}"</div>
          </Card>
        )}

        {/* Skip override */}
        {thesis.skip_override_reason && (
          <Card className="p-5 border-signal-red/40 bg-signal-red/5">
            <SectionLabel>
              <span className="text-signal-red">Skip override reason</span>
            </SectionLabel>
            <div className="text-ink-200">{thesis.skip_override_reason}</div>
          </Card>
        )}

        {/* Close action */}
        {!showClose ? (
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={deletePosition}
              className="text-signal-red border-signal-red/30"
            >
              Discard
            </Button>
            <Button onClick={() => setShowClose(true)} className="flex-1">
              Close position
            </Button>
          </div>
        ) : (
          <Card className="p-5 space-y-4">
            <SectionLabel>Close position</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Exit price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Exit date
                </label>
                <input
                  type="date"
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-ink-400 mb-2">
                Exit reason
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["TARGET", "STOP", "TIME", "DISCRETIONARY"] as ExitReason[]).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setExitReason(r)}
                      className={`p-2.5 text-sm rounded-sm border transition-colors ${
                        exitReason === r
                          ? "border-signal-green bg-signal-green/10 text-signal-green"
                          : "border-ink-700 text-ink-300 hover:border-ink-500"
                      }`}
                    >
                      {r}
                    </button>
                  )
                )}
              </div>
            </div>

            {exitReason === "DISCRETIONARY" && (
              <div>
                <label className="block text-xs text-ink-400 mb-1">
                  Why? (required for discretionary)
                </label>
                <textarea
                  rows={2}
                  value={discretionaryReason}
                  onChange={(e) => setDiscretionaryReason(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-ink-400 mb-1">
                Lessons learned (optional)
              </label>
              <textarea
                rows={3}
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="What did this trade teach you?"
              />
            </div>

            {err && (
              <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-2 rounded-sm">
                {err}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setShowClose(false)}>
                Cancel
              </Button>
              <Button onClick={closePosition} disabled={closing} className="flex-1">
                {closing ? "Logging…" : "Log trade"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
