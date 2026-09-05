alter table public.performance_daily_summary
  add column if not exists summary_scope text not null default 'day'
  check (summary_scope in ('day', 'month'));

alter table public.performance_daily_summary
  drop constraint if exists performance_daily_summary_metric_date_key;

create unique index if not exists performance_daily_summary_metric_date_scope_idx
  on public.performance_daily_summary(metric_date, summary_scope);
