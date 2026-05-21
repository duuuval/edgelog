-- Edgelog schema
-- Run this in Supabase SQL editor after creating project

-- Profiles (one per auth user)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  account_size_usd numeric(10, 2) default 100.00 not null,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Theses (the commitment record)
create table public.theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ticker text not null,
  strategy text not null check (strategy in ('PEAD', 'FIFTY_TWO_WEEK', 'CONFLUENCE')),
  status text not null default 'open' check (status in ('open', 'closed', 'draft')),
  gates_passed jsonb default '{}'::jsonb not null,
  grade_factors jsonb default '{}'::jsonb not null,
  grade text check (grade in ('A', 'B', 'C', 'SKIP')),
  skip_override_reason text,
  entry_price numeric(12, 4),
  stop_price numeric(12, 4),
  target_price numeric(12, 4),
  position_size_usd numeric(10, 2),
  time_stop_date date,
  thesis_text text,
  entered_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.theses enable row level security;

create policy "Users manage own theses" on public.theses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index theses_user_status_idx on public.theses(user_id, status);

-- Trades (the outcome record, one per closed thesis)
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid references public.theses on delete cascade not null unique,
  user_id uuid references auth.users on delete cascade not null,
  exit_price numeric(12, 4) not null,
  exit_date date not null,
  exit_reason text not null check (exit_reason in ('TARGET', 'STOP', 'TIME', 'DISCRETIONARY')),
  discretionary_reason text,
  pnl_usd numeric(10, 2),
  pnl_pct numeric(8, 4),
  r_multiple numeric(6, 3),
  lessons_text text,
  created_at timestamptz default now() not null
);

alter table public.trades enable row level security;

create policy "Users manage own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index trades_user_idx on public.trades(user_id);

-- Scans (audit log of scanner runs)
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  strategy text not null check (strategy in ('PEAD', 'FIFTY_TWO_WEEK')),
  scan_date date default current_date not null,
  candidates jsonb default '[]'::jsonb not null,
  created_at timestamptz default now() not null
);

alter table public.scans enable row level security;

create policy "Users manage own scans" on public.scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index scans_user_date_idx on public.scans(user_id, scan_date desc);
