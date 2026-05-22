-- Edgelog migration 0005: add volume ratio to universe_snapshot
-- Adds today's volume and the ratio of today's volume to the 50-day average (excluding today).
-- Also switches the displayed avg volume baseline from 30 days to 50 days.

-- 1. Add new columns to universe_snapshot
alter table public.universe_snapshot
  add column if not exists vol_today bigint,
  add column if not exists avg_vol_50d bigint,
  add column if not exists vol_ratio numeric(6,2);

-- 2. Drop the old 30-day column (no longer used)
alter table public.universe_snapshot
  drop column if exists avg_vol_30d;

-- 3. Replace the refresh function
create or replace function public.refresh_universe_snapshot()
returns table (refreshed_tickers integer) as $$
declare
  refreshed integer;
begin
  truncate table public.universe_snapshot;

  insert into public.universe_snapshot (
    ticker,
    exchange,
    price,
    high_52w,
    low_52w,
    pct_from_high,
    day_change_pct,
    vol_today,
    avg_vol_50d,
    vol_ratio,
    mcap_m,
    days_since_52w_break,
    last_close_above_break,
    refreshed_at
  )
  with
    -- Most recent bar per ticker (today's close + today's volume)
    latest_bar as (
      select distinct on (ticker)
        ticker, date, close, volume
      from public.daily_bars
      order by ticker, date desc
    ),
    -- Previous bar per ticker (for day-change calculation)
    prev_bar as (
      select
        b.ticker,
        b.close as prev_close
      from public.daily_bars b
      join (
        select ticker, max(date) as second_latest
        from public.daily_bars
        where date < (select max(date) from public.daily_bars)
        group by ticker
      ) sl on sl.ticker = b.ticker and sl.second_latest = b.date
    ),
    -- 52w high/low per ticker
    range_52w as (
      select
        ticker,
        max(high) as high_52w,
        min(low) as low_52w
      from public.daily_bars
      group by ticker
    ),
    -- 50-day average volume EXCLUDING today's bar (rows 2-51 by recency)
    -- This avoids today's volume spike diluting its own baseline.
    avg_vol as (
      select
        ticker,
        avg(volume)::bigint as avg_vol_50d
      from (
        select
          ticker,
          volume,
          row_number() over (partition by ticker order by date desc) as rn
        from public.daily_bars
      ) ranked
      where rn between 2 and 51
      group by ticker
    ),
    -- Last 52w-break date
    last_break as (
      select
        b.ticker,
        max(b.date) filter (where b.close >= r.high_52w * 0.999) as last_break_date
      from public.daily_bars b
      join range_52w r on r.ticker = b.ticker
      group by b.ticker
    )
  select
    lb.ticker,
    tu.exchange,
    lb.close as price,
    r.high_52w,
    r.low_52w,
    ((lb.close - r.high_52w) / r.high_52w * 100)::numeric(8,4) as pct_from_high,
    case
      when pb.prev_close is not null and pb.prev_close > 0
      then ((lb.close - pb.prev_close) / pb.prev_close * 100)::numeric(8,4)
      else null
    end as day_change_pct,
    lb.volume as vol_today,
    av.avg_vol_50d,
    case
      when av.avg_vol_50d is not null and av.avg_vol_50d > 0
      then (lb.volume::numeric / av.avg_vol_50d)::numeric(6,2)
      else null
    end as vol_ratio,
    case when tu.market_cap is not null then (tu.market_cap / 1000000.0)::numeric(12,2) else null end as mcap_m,
    case
      when lbk.last_break_date is not null
      then (lb.date - lbk.last_break_date)::integer
      else null
    end as days_since_52w_break,
    (lbk.last_break_date is not null
      and (lb.date - lbk.last_break_date) <= 3) as last_close_above_break,
    now() as refreshed_at
  from latest_bar lb
  join public.ticker_universe tu on tu.ticker = lb.ticker
  join range_52w r on r.ticker = lb.ticker
  left join prev_bar pb on pb.ticker = lb.ticker
  left join avg_vol av on av.ticker = lb.ticker
  left join last_break lbk on lbk.ticker = lb.ticker
  where tu.active = true;

  get diagnostics refreshed = row_count;
  return query select refreshed;
end;
$$ language plpgsql security definer;

revoke all on function public.refresh_universe_snapshot() from public;
grant execute on function public.refresh_universe_snapshot() to service_role;
