import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Shell } from "@/components/Shell";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { STRATEGIES } from "@/lib/playbook";
import { tradingDaysBetween } from "@/lib/dates";

export default async function PositionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: theses } = await supabase
    .from("theses")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("entered_at", { ascending: false });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.25em] text-ink-500 mb-1">
            {theses?.length || 0} held
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Open Positions
          </h1>
        </div>

        {!theses || theses.length === 0 ? (
          <Card className="p-6">
            <div className="text-ink-400">
              Nothing open. Run a{" "}
              <Link href="/scanner" className="text-signal-green hover:underline">
                scan
              </Link>{" "}
              or{" "}
              <Link href="/thesis/new" className="text-signal-green hover:underline">
                start a thesis
              </Link>
              .
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {theses.map((t) => {
              const strat = STRATEGIES[t.strategy as keyof typeof STRATEGIES];
              const timeStop = t.time_stop_date ? new Date(t.time_stop_date) : null;
              const atTimeStop = timeStop ? timeStop <= today : false;
              const daysRemaining = timeStop
                ? tradingDaysBetween(today, timeStop)
                : 0;

              return (
                <Link key={t.id} href={`/positions/${t.id}`} className="block">
                  <Card
                    className={`p-4 hover:border-ink-600 transition-colors ${
                      atTimeStop ? "border-signal-amber/40" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-xl">
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
                      {atTimeStop ? (
                        <Pill tone="warn">Time stop</Pill>
                      ) : (
                        <span className="text-xs text-ink-500 font-mono tabular">
                          {daysRemaining}d left
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-ink-500 uppercase tracking-wider mb-1">
                          Entry
                        </div>
                        <div className="font-mono tabular text-ink-200">
                          ${Number(t.entry_price).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-ink-500 uppercase tracking-wider mb-1">
                          Stop
                        </div>
                        <div className="font-mono tabular text-signal-red">
                          ${Number(t.stop_price).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-ink-500 uppercase tracking-wider mb-1">
                          Target
                        </div>
                        <div className="font-mono tabular text-signal-green">
                          ${Number(t.target_price).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-ink-500 uppercase tracking-wider mb-1">
                          Size
                        </div>
                        <div className="font-mono tabular text-ink-200">
                          ${Number(t.position_size_usd).toFixed(0)}
                        </div>
                      </div>
                    </div>

                    {t.thesis_text && (
                      <div className="text-sm text-ink-400 mt-3 italic line-clamp-2">
                        "{t.thesis_text}"
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
