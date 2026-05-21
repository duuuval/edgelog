-- Edgelog: Polygon snapshot tables
-- Adds daily price bars, computed universe snapshot, and backfill progress tracking
-- to support the new 52w scanner architecture (replaces the hardcoded Finnhub universe).
--
-- These tables are admin-managed: written by the daily cron job and backfill script
-- using the service role key. The universe_snapshot is readable by authenticated users
-- for the scanner; daily_bars is internal-only (not exposed to clients).

-- Historical daily OHLC bars, one row per ticker per trading day.
-- Populated by:
--   - One-time backfill (GitHub Actions, ~260 trading days)
--   - Daily cron (one new day per run)
-- Old rows trimmed beyond 280 days to bound table size.
create table public.daily_bars (
  ticker text not null,
  date date not null,
  open numeric(12, 4) not null,
  high numeric(12, 4) not null,
  low numeric(12, 4) not null,
  close numeric(12, 4) not null,
  volume bigint not null,
  primary key (ticker, date)
);

-- Index for the 52w rolling window query (latest N days per ticker)
create index daily_bars_ticker_date_idx on public.daily_bars(ticker, date desc);

-- RLS: locked down. Only service role can read/write.
-- (No policies = no access for anon or authenticated roles.)
alter table public.daily_bars enable row level security;

-- Current snapshot of every eligible ticker. Replaced wholesale each day.
-- The 52w scanner reads from here.
create table public.universe_snapshot (
  ticker text primary key,
  exchange text,                    -- 'NASDAQ' or 'NYSE' for chart link disambiguation
  price numeric(12, 4) not null,
  high_52w numeric(12, 4) not null,
  low_52w numeric(12, 4) not null,
  pct_from_high numeric(8, 4) not null,   -- e.g. -1.23 means 1.23% below 52w high
  day_change_pct numeric(8, 4),     -- vs previous close
  avg_vol_30d bigint,               -- average daily volume over last 30 trading days
  mcap_m numeric(12, 2),            -- market cap in millions USD
  days_since_52w_break integer,     -- 0 = today, 1 = yesterday, null = not at high recently
  last_close_above_break boolean,   -- has it held above breakout level
  refreshed_at timestamptz default now() not null
);

-- Indexes for the scanner's filter shape (mcap band, price floor, near-high gate)
create index universe_mcap_idx on public.universe_snapshot(mcap_m);
create index universe_pct_from_high_idx on public.universe_snapshot(pct_from_high desc);

alter table public.universe_snapshot enable row level security;

-- Authenticated users can read the universe (scanner needs it).
-- Service role writes; no client writes allowed.
create policy "Authenticated read universe snapshot" on public.universe_snapshot
  for select using (auth.role() = 'authenticated');

-- Tracks progress of the one-time historical backfill.
-- Single-row table; the backfill script reads/updates it to resume after interruption.
create table public.backfill_progress (
  id integer primary key default 1,
  oldest_date_loaded date,          -- earliest trading day successfully loaded
  newest_date_loaded date,          -- most recent trading day loaded
  target_oldest_date date,          -- how far back we want to go (today - ~365 calendar days)
  total_days_loaded integer default 0 not null,
  last_run_at timestamptz,
  is_complete boolean default false not null,
  constraint single_row check (id = 1)
);

-- Seed the single row so the backfill script can update it instead of insert/update
insert into public.backfill_progress (id) values (1);

alter table public.backfill_progress enable row level security;
-- No policies = service role only. Backfill progress is not user-facing.
