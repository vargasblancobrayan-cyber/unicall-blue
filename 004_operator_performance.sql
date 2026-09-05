create table if not exists public.operator_performance (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  metric_date date not null default current_date,
  approved_sales numeric not null default 0,
  rejected numeric not null default 0,
  trash numeric not null default 0,
  average_check numeric not null default 0,
  list_minutes integer not null default 0,
  sales_per_hour numeric not null default 0,
  processing_file text,
  hourly_file text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operator_id, metric_date)
);

alter table public.operator_performance enable row level security;

drop policy if exists "performance own or staff select" on public.operator_performance;
create policy "performance own or staff select" on public.operator_performance
for select using (operator_id = auth.uid() or public.is_staff());

drop policy if exists "staff manages performance" on public.operator_performance;
create policy "staff manages performance" on public.operator_performance
for all using (public.is_staff()) with check (public.is_staff());
