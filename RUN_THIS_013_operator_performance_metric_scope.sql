alter table public.operator_performance
  add column if not exists metric_scope text not null default 'day'
  check (metric_scope in ('day', 'month'));

alter table public.operator_performance
  drop constraint if exists operator_performance_operator_id_metric_date_key;

create unique index if not exists operator_performance_operator_date_scope_idx
  on public.operator_performance(operator_id, metric_date, metric_scope);
