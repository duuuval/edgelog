-- Edgelog: Ticker universe
-- Master list of tradeable common-stock tickers on NYSE/NASDAQ.
-- Populated from Polygon's /v3/reference/tickers endpoint (type=CS only).
-- Used as the eligibility gate for daily_bars and universe_snapshot.
--
-- Refreshed weekly by the daily cron (light enough to fold in: ~10 Polygon calls).

create table public.ticker_universe (
  ticker text primary key,
  name text,
  exchange text,                   -- 'NASDAQ' or 'NYSE' (normalized from Polygon MIC)
  market_cap numeric(20, 2),       -- in dollars, from Polygon ticker details (may be null)
  active boolean default true not null,
  last_seen_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for the exchange + active filter used during snapshot refresh
create index ticker_universe_exchange_active_idx
  on public.ticker_universe(exchange, active);

alter table public.ticker_universe enable row level security;

-- Authenticated users can read (used by the scanner indirectly via universe_snapshot,
-- but exposing it allows future admin views without schema changes).
-- No write policies = service role only.
create policy "Authenticated read ticker universe" on public.ticker_universe
  for select using (auth.role() = 'authenticated');
