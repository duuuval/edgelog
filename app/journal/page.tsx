import { createClient } from "@/lib/supabase-server";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Stat, Pill } from "@/components/ui";
import { STRATEGIES } from "@/lib/playbook";

type Row = {
  trade: any;
  thesis: any;
};

function calcStats(rows: Row[]) {
  if (rows.length === 0) return null;
  const wins = rows.filter((r) => Number(r.trade.pnl_pct) > 0);
  const losses = rows.filter((r) => Number(r.trade.pnl_pct) <= 0);
  const winRate = wins.length / rows.length;
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, r) => s + Number(r.trade.pnl_pct), 0) / wins.length
      : 0;
  const avgLoss =
    losses.length > 0
      ? losses.reduce((s, r) => s + Number(r.trade.pnl_pct), 0) / losses.length
      : 0;
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
  const totalPnL = rows.reduce((s, r) => s + Number(r.trade.pnl_usd || 0), 0);
  return { count: rows.length, winRate, avgWin, avgLoss, expectancy, totalPnL };
}

export default async function JournalPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: trades } = await supabase
    .from("trades")
    .select("*, theses!inner(*)")
    .eq("user_id", user.id)
    .order("exit_date", { ascending: false });

  const rows: Row[] =
    trades?.map((t: any) => ({ trade: t, thesis: t.theses })) || [];

  const overall = calcStats(rows);
  const byStrategy = {
    PEAD: calcStats(rows.filter((r) => r.thesis.strategy === "PEAD")),
    FIFTY_TWO_WEEK: calcStats(
      rows.filter((r) => r.thesis.strategy === "FIFTY_TWO_WEEK")
    ),
    CONFLUENCE: calcStats(
      rows.filter((r) => r.thesis.strategy === "CONFLUENCE")
    ),
  };
  const byGrade = {
    A: calcStats(rows.filter((r) => r.thesis.grade === "A")),
    B: calcStats(rows.filter((r) => r.thesis.grade === "B")),
    C: calcStats(rows.filter((r) => r.thesis.grade === "C")),
    SKIP: calcStats(rows.filter((r) => r.thesis.grade === "SKIP")),
  };

  const exitReasonCounts: Record<string, number> = {};
  rows.forEach((r) => {
    const k = r.trade.exit_reason;
    exitReasonCounts[k] = (exitReasonCounts[k] || 0) + 1;
  });

  const smallSample = rows.length < 10;

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
            {rows.length} closed trade{rows.length !== 1 ? "s" : ""}
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Journal
          </h1>
        </div>

        {smallSample && rows.length > 0 && (
          <Card className="p-3 border-signal-amber/30 bg-signal-amber/5">
            <div className="text-xs text-signal-amber">
              Small sample — stats become meaningful after ~10 trades.
            </div>
          </Card>
        )}

        {/* Overall */}
        {overall && (
          <Card className="p-5">
            <SectionLabel>Overall</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="Trades"
                value={overall.count.toString()}
              />
              <Stat
                label="Win rate"
                value={`${(overall.winRate * 100).toFixed(0)}%`}
                tone={overall.winRate >= 0.5 ? "positive" : "warn"}
              />
              <Stat
                label="Expectancy"
                value={`${overall.expectancy >= 0 ? "+" : ""}${overall.expectancy.toFixed(2)}%`}
                tone={overall.expectancy >= 0 ? "positive" : "negative"}
              />
              <Stat
                label="Total P/L"
                value={`${overall.totalPnL >= 0 ? "+" : ""}$${overall.totalPnL.toFixed(2)}`}
                tone={overall.totalPnL >= 0 ? "positive" : "negative"}
              />
              <Stat
                label="Avg winner"
                value={`+${overall.avgWin.toFixed(2)}%`}
                tone="positive"
              />
              <Stat
                label="Avg loser"
                value={`${overall.avgLoss.toFixed(2)}%`}
                tone="negative"
              />
            </div>
          </Card>
        )}

        {/* By strategy */}
        {overall && (
          <Card className="p-5">
            <SectionLabel>By strategy</SectionLabel>
            <div className="space-y-3">
              {(["PEAD", "FIFTY_TWO_WEEK", "CONFLUENCE"] as const).map((s) => {
                const stats = byStrategy[s];
                if (!stats) return null;
                return (
                  <div
                    key={s}
                    className="flex items-center justify-between py-2 border-b border-ink-800 last:border-0"
                  >
                    <div>
                      <div className="text-sm">{STRATEGIES[s].name}</div>
                      <div className="text-xs text-ink-500">
                        {stats.count} trade{stats.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <div className="text-[10px] text-ink-500 uppercase">
                          Win
                        </div>
                        <div className="font-mono tabular text-sm">
                          {(stats.winRate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ink-500 uppercase">
                          Exp
                        </div>
                        <div
                          className={`font-mono tabular text-sm ${
                            stats.expectancy >= 0
                              ? "text-signal-green"
                              : "text-signal-red"
                          }`}
                        >
                          {stats.expectancy >= 0 ? "+" : ""}
                          {stats.expectancy.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* By grade */}
        {overall && (
          <Card className="p-5">
            <SectionLabel>By grade · is your rubric calibrated?</SectionLabel>
            <div className="space-y-3">
              {(["A", "B", "C", "SKIP"] as const).map((g) => {
                const stats = byGrade[g];
                if (!stats) return null;
                return (
                  <div
                    key={g}
                    className="flex items-center justify-between py-2 border-b border-ink-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Pill
                        tone={
                          g === "A"
                            ? "grade-a"
                            : g === "B"
                            ? "grade-b"
                            : g === "C"
                            ? "grade-c"
                            : "grade-skip"
                        }
                      >
                        {g}
                      </Pill>
                      <div className="text-xs text-ink-500">
                        {stats.count} trade{stats.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <div className="text-[10px] text-ink-500 uppercase">
                          Win
                        </div>
                        <div className="font-mono tabular text-sm">
                          {(stats.winRate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ink-500 uppercase">
                          Exp
                        </div>
                        <div
                          className={`font-mono tabular text-sm ${
                            stats.expectancy >= 0
                              ? "text-signal-green"
                              : "text-signal-red"
                          }`}
                        >
                          {stats.expectancy >= 0 ? "+" : ""}
                          {stats.expectancy.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {overall.count >= 10 && (
              <div className="text-xs text-ink-500 mt-3 pt-3 border-t border-ink-800">
                If A doesn't outperform C, the rubric isn't separating signal
                from noise — time to revise.
              </div>
            )}
          </Card>
        )}

        {/* Exit reasons */}
        {overall && Object.keys(exitReasonCounts).length > 0 && (
          <Card className="p-5">
            <SectionLabel>Exit reasons</SectionLabel>
            <div className="grid grid-cols-4 gap-2">
              {["TARGET", "STOP", "TIME", "DISCRETIONARY"].map((r) => (
                <div key={r} className="text-center">
                  <div className="font-mono tabular text-lg">
                    {exitReasonCounts[r] || 0}
                  </div>
                  <div className="text-[10px] text-ink-500 uppercase tracking-wider">
                    {r}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Trade list */}
        <div>
          <SectionLabel>Closed trades</SectionLabel>
          {rows.length === 0 ? (
            <Card className="p-6">
              <div className="text-ink-400">
                No closed trades yet. Your journal fills as positions close.
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const pnlPct = Number(r.trade.pnl_pct);
                const pnlUsd = Number(r.trade.pnl_usd);
                const win = pnlPct > 0;
                return (
                  <Card key={r.trade.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold">
                          {r.thesis.ticker}
                        </span>
                        {r.thesis.grade && (
                          <Pill
                            tone={
                              r.thesis.grade === "A"
                                ? "grade-a"
                                : r.thesis.grade === "B"
                                ? "grade-b"
                                : r.thesis.grade === "C"
                                ? "grade-c"
                                : "grade-skip"
                            }
                          >
                            {r.thesis.grade}
                          </Pill>
                        )}
                        <span className="text-ink-500 text-xs uppercase tracking-wider">
                          {STRATEGIES[r.thesis.strategy as keyof typeof STRATEGIES]?.shortName}
                        </span>
                        <Pill tone="neutral">{r.trade.exit_reason}</Pill>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-mono tabular text-sm font-semibold ${
                            win ? "text-signal-green" : "text-signal-red"
                          }`}
                        >
                          {win ? "+" : ""}
                          {pnlPct.toFixed(2)}%
                        </div>
                        <div
                          className={`font-mono tabular text-xs ${
                            win ? "text-signal-green" : "text-signal-red"
                          }`}
                        >
                          {win ? "+" : ""}${pnlUsd.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-ink-500 font-mono tabular">
                      ${Number(r.thesis.entry_price).toFixed(2)} →{" "}
                      ${Number(r.trade.exit_price).toFixed(2)} ·{" "}
                      {new Date(r.trade.exit_date).toLocaleDateString()}
                    </div>
                    {r.thesis.thesis_text && (
                      <div className="text-sm text-ink-400 italic mt-2">
                        "{r.thesis.thesis_text}"
                      </div>
                    )}
                    {r.trade.lessons_text && (
                      <div className="text-sm text-ink-300 mt-2 pt-2 border-t border-ink-800">
                        <span className="text-ink-500 uppercase text-[10px] tracking-wider mr-2">
                          Lesson:
                        </span>
                        {r.trade.lessons_text}
                      </div>
                    )}
                    {r.trade.discretionary_reason && (
                      <div className="text-sm text-signal-amber mt-2 pt-2 border-t border-ink-800">
                        <span className="text-ink-500 uppercase text-[10px] tracking-wider mr-2">
                          Discretionary:
                        </span>
                        {r.trade.discretionary_reason}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
