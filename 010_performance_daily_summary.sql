create table if not exists public.performance_daily_summary (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null unique,
  total_orders numeric not null default 0,
  callbacks numeric not null default 0,
  no_answer numeric not null default 0,
  approved_sales numeric not null default 0,
  approved_rate numeric not null default 0,
  rejected numeric not null default 0,
  trash numeric not null default 0,
  average_check numeric not null default 0,
  source_file text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.performance_daily_summary enable row level security;

drop policy if exists "daily performance visible to active users" on public.performance_daily_summary;
create policy "daily performance visible to active users" on public.performance_daily_summary
for select using (auth.uid() is not null);

drop policy if exists "staff manages daily performance" on public.performance_daily_summary;
create policy "staff manages daily performance" on public.performance_daily_summary
for all using (public.is_staff()) with check (public.is_staff());
