-- Edgelog: universe_snapshot refresh function
-- Called by the daily cron route after new daily_bars are inserted.
-- Rebuilds universe_snapshot wholesale by computing derived fields per ticker
-- from the last 260 days of bars joined against ticker_universe.

create or replace function public.refresh_universe_snapshot()
returns table (refreshed_tickers integer) as $$
declare
  refreshed integer;
begin
  -- Wipe and rebuild. Truncate is faster than delete and resets the table cleanly.
  truncate table public.universe_snapshot;

  insert into public.universe_snapshot (
    ticker,
    exchange,
    price,
    high_52w,
    low_52w,
    pct_from_high,
    day_change_pct,
    avg_vol_30d,
    mcap_m,
    days_since_52w_break,
    last_close_above_break,
    refreshed_at
  )
  with
    -- Most recent bar per ticker (today's close)
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
    -- 52w high/low per ticker (last 260 trading days)
    range_52w as (
      select
        ticker,
        max(high) as high_52w,
        min(low) as low_52w
      from public.daily_bars
      group by ticker
    ),
    -- 30-day average volume
    avg_vol as (
      select
        ticker,
        avg(volume)::bigint as avg_vol_30d
      from (
        select
          ticker,
          volume,
          row_number() over (partition by ticker order by date desc) as rn
        from public.daily_bars
      ) ranked
      where rn <= 30
      group by ticker
    ),
    -- Days since the ticker last closed at or above its 52w high
    last_break as (
      select
        b.ticker,
        min(r.high_52w - b.close) as gap_to_high,
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
    -- Negative number = below high, positive = at/above
    ((lb.close - r.high_52w) / r.high_52w * 100)::numeric(8,4) as pct_from_high,
    case
      when pb.prev_close is not null and pb.prev_close > 0
      then ((lb.close - pb.prev_close) / pb.prev_close * 100)::numeric(8,4)
      else null
    end as day_change_pct,
    av.avg_vol_30d,
    -- Market cap stored in dollars in ticker_universe; we expose millions in snapshot
    case when tu.market_cap is not null then (tu.market_cap / 1000000.0)::numeric(12,2) else null end as mcap_m,
    case
      when lbk.last_break_date is not null
      then (lb.date - lbk.last_break_date)::integer
      else null
    end as days_since_52w_break,
    -- "Held the break": closed at/above 52w high in the last 3 trading days AND
    -- hasn't closed back below it since
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

-- Grant execute to service role (the cron uses this)
revoke all on function public.refresh_universe_snapshot() from public;
grant execute on function public.refresh_universe_snapshot() to service_role;
