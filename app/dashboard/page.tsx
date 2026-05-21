import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Stat, Pill } from "@/components/ui";
import { STRATEGIES } from "@/lib/playbook";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: openTheses } = await supabase
    .from("theses")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("entered_at", { ascending: false });

  const { data: closedTrades } = await supabase
    .from("trades")
    .select("pnl_usd, pnl_pct")
    .eq("user_id", user.id);

  const totalInPositions =
    openTheses?.reduce((s, t) => s + Number(t.position_size_usd || 0), 0) || 0;
  const accountSize = Number(profile?.account_size_usd || 100);
  const buyingPower = accountSize - totalInPositions;
  const totalPnL = closedTrades?.reduce((s, t) => s + Number(t.pnl_usd || 0), 0) || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueForReview =
    openTheses?.filter((t) => {
      if (!t.time_stop_date) return false;
      return new Date(t.time_stop_date) <= today;
    }).length || 0;

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Today
          </h1>
        </div>

        {/* Account stats */}
        <Card className="p-5">
          <SectionLabel>Account</SectionLabel>
          <div className="grid grid-cols-3 gap-4">
            <Stat
              label="Buying power"
              value={`$${buyingPower.toFixed(2)}`}
              tone={buyingPower < 5 ? "warn" : "neutral"}
            />
            <Stat label="In positions" value={`$${totalInPositions.toFixed(2)}`} />
            <Stat
              label="Realized P/L"
              value={`${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`}
              tone={totalPnL >= 0 ? "positive" : "negative"}
            />
          </div>
        </Card>

        {/* Today's action */}
        <div>
          <SectionLabel>Today's action</SectionLabel>
          {dueForReview > 0 ? (
            <Card className="p-4 border-signal-amber/40 bg-signal-amber/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-signal-amber font-medium">
                    {dueForReview} position{dueForReview > 1 ? "s" : ""} at time stop
                  </div>
                  <div className="text-ink-400 text-sm mt-1">
                    Review and decide: exit or extend with reason.
                  </div>
                </div>
                <Link
                  href="/positions"
                  className="text-signal-amber hover:underline text-sm"
                >
                  Review →
                </Link>
              </div>
            </Card>
          ) : openTheses && openTheses.length > 0 ? (
            <Card className="p-4">
              <div className="text-ink-300">
                All positions within window. Check end-of-day closes against
                stops and targets.
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="text-ink-400">
                No open positions.{" "}
                <Link href="/scanner" className="text-signal-green hover:underline">
                  Run a scan
                </Link>{" "}
                or{" "}
                <Link href="/thesis/new" className="text-signal-green hover:underline">
                  start a thesis
                </Link>
                .
              </div>
            </Card>
          )}
        </div>

        {/* Open positions summary */}
        {openTheses && openTheses.length > 0 && (
          <div>
            <SectionLabel>Open positions ({openTheses.length})</SectionLabel>
            <div className="space-y-2">
              {openTheses.map((t) => {
                const strat = STRATEGIES[t.strategy as keyof typeof STRATEGIES];
                return (
                  <Link
                    key={t.id}
                    href={`/positions/${t.id}`}
                    className="block"
                  >
                    <Card className="p-4 hover:border-ink-600 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-lg">
                            {t.ticker}
                          </span>
                          {t.grade && (
                            <Pill
                              tone={
                                t.grade === "A"
                                  ? "grade-a"
                                  : t.grade === "B"
                                  ? "grade-b"
                                  : t.grade === "C"
                                  ? "grade-c"
                                  : "grade-skip"
                              }
                            >
                              {t.grade}
                            </Pill>
                          )}
                          <span className="text-ink-500 text-xs uppercase tracking-wider">
                            {strat?.shortName}
                          </span>
                        </div>
                        <span className="font-mono text-sm tabular">
                          ${Number(t.position_size_usd).toFixed(0)}
                        </span>
                      </div>
                      {t.thesis_text && (
                        <div className="text-sm text-ink-400 line-clamp-1">
                          {t.thesis_text}
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <SectionLabel>Quick</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/scanner">
              <Card className="p-4 hover:border-signal-green transition-colors">
                <div className="text-signal-green text-2xl mb-1">→</div>
                <div className="font-medium">Run scanner</div>
                <div className="text-ink-500 text-sm">Find candidates</div>
              </Card>
            </Link>
            <Link href="/thesis/new">
              <Card className="p-4 hover:border-signal-green transition-colors">
                <div className="text-signal-green text-2xl mb-1">+</div>
                <div className="font-medium">New thesis</div>
                <div className="text-ink-500 text-sm">Commit before buy</div>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
