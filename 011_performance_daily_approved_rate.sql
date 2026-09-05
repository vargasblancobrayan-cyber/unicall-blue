alter table public.performance_daily_summary
  add column if not exists approved_rate numeric not null default 0;
