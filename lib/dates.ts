// Light trading-day math. Doesn't handle market holidays — close enough for time stops.
// For exact compliance you'd swap in a NYSE holiday calendar later.

export function addTradingDays(start: Date, n: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export function tradingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
